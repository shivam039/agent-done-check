import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(packageRoot, 'bin', 'agent-done-check.js');

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

async function repository(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-done-check-audit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Agent Done Check Audit');
  git(root, 'config', 'user.email', 'audit@example.invalid');
  return root;
}

function baseConfig(check) {
  return {
    version: 1,
    timeoutMs: 5000,
    criteria: [{ id: 'behavior', description: 'Configured behavior is verified.' }],
    checks: [{ id: 'behavior-check', criteria: ['behavior'], ...check }],
  };
}

function nodeCommand(source) {
  if (process.platform !== 'win32') {
    const encoded = Buffer.from(source).toString('base64');
    return `node -e "eval(Buffer.from('${encoded}', 'base64').toString())"`;
  }
  // Avoid nested quotes: cmd.exe rewrites quoted -e arguments before Node receives them.
  const bytes = [...Buffer.from(source)].join(',');
  return `node -e eval(Buffer.from([${bytes}]).toString())`;
}

async function commitFiles(root, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'fixture');
}

async function invoke(root, args = []) {
  try {
    const stdout = execFileSync(process.execPath, [cliPath, '--config', 'agent-done-check.json', ...args], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
    });
    return { code: 0, stdout };
  } catch (error) {
    const stdout = error.stdout?.toString() ?? '';
    const stderr = error.stderr?.toString() ?? '';
    let report;
    try { report = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8')); }
    catch { /* Config and setup failures do not always produce a report. */ }
    return { code: error.status ?? 2, stdout, stderr, report };
  }
}

test('command report, evidence files, and manifest hashes agree', async (t) => {
  const root = await repository(t);
  const config = baseConfig({ command: nodeCommand('console.log("evidence-ok")') });
  config.criteria[0].description = '<img src=x onerror=alert(1)> | behavior';
  await commitFiles(root, {
    'agent-done-check.json': JSON.stringify(config),
  });

  const result = await invoke(root);
  assert.equal(result.code, 0, result.stderr || JSON.stringify(result.report?.checks) || result.stdout);
  const report = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(root, '.agent-done-check/manifest.json'), 'utf8'));
  assert.equal(report.status, 'passed');
  assert.equal(report.checks[0].stdout.trim(), 'evidence-ok');
  assert.equal(manifest.runId, report.runId);
  assert.ok(manifest.artifacts.some((artifact) => artifact.role === 'markdown-report'));
  const stdoutArtifact = manifest.artifacts.find((artifact) => artifact.role === 'stdout');
  assert.ok(stdoutArtifact);
  const stdoutBytes = await readFile(path.join(root, '.agent-done-check', stdoutArtifact.path));
  assert.equal(stdoutArtifact.sha256, createHash('sha256').update(stdoutBytes).digest('hex'));
  const markdown = await readFile(path.join(root, '.agent-done-check/report.md'), 'utf8');
  assert.ok(!markdown.includes('<img'));
  assert.match(markdown, /&lt;img/);
});

test('file checks verify exact committed bytes with bounded redacted evidence', async (t) => {
  const root = await repository(t);
  const content = 'release=0.6\n';
  const digest = createHash('sha256').update(content).digest('hex');
  const config = {
    version: 1,
    timeoutMs: 5000,
    criteria: [{ id: 'file-state', description: 'Committed file assertions match.' }],
    checks: [
      { id: 'exists', type: 'file', path: 'src/release.txt', assertion: 'exists', criteria: ['file-state'] },
      { id: 'equals', type: 'file', path: 'src/release.txt', assertion: 'equals', expected: content, criteria: ['file-state'] },
      { id: 'contains', type: 'file', path: 'src/release.txt', assertion: 'contains', expected: 'release=0.6', criteria: ['file-state'] },
      { id: 'sha256', type: 'file', path: 'src/release.txt', assertion: 'sha256', expected: digest, criteria: ['file-state'] },
    ],
  };
  await commitFiles(root, {
    'agent-done-check.json': JSON.stringify(config),
    'src/release.txt': content,
  });
  const targetCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  await writeFile(path.join(root, 'src/release.txt'), 'release=changed\n');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'change file after target commit');

  const result = await invoke(root, ['--commit', targetCommit]);
  assert.equal(result.code, 0, result.stderr || JSON.stringify(result.report?.checks) || result.stdout);
  const report = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  assert.equal(report.schemaVersion, 3);
  assert.equal(report.commit, targetCommit);
  for (const check of report.checks) {
    assert.equal(check.status, 'passed', JSON.stringify(check));
    assert.equal(check.file.sha256, digest);
    assert.equal(check.file.bytes, Buffer.byteLength(content));
    assert.equal(check.file.matched, true);
  }
  assert.ok(!JSON.stringify(report).includes(content));
});

test('file checks report missing files as failed and traversal as invalid config', async (t) => {
  const root = await repository(t);
  const config = baseConfig({ type: 'file', path: 'missing.txt', assertion: 'exists' });
  await commitFiles(root, { 'agent-done-check.json': JSON.stringify(config) });
  const missing = await invoke(root);
  assert.equal(missing.code, 1, JSON.stringify(missing.report?.checks));
  const report = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  assert.equal(report.checks[0].status, 'failed');
  assert.equal(report.checks[0].file.exists, false);
  assert.equal(report.checks[0].file.matched, false);

  config.checks[0].path = '../outside.txt';
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  git(root, 'add', 'agent-done-check.json');
  git(root, 'commit', '--quiet', '-m', 'invalid traversal config');
  const traversal = await invoke(root);
  assert.equal(traversal.code, 2);
  assert.match(traversal.stderr, /path: must be a non-empty relative path/);

  for (const invalidPath of ['/outside.txt', 'C:\\outside.txt', 'bad\0path']) {
    config.checks[0].path = invalidPath;
    await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
    git(root, 'add', 'agent-done-check.json');
    git(root, 'commit', '--quiet', '-m', 'reject unsafe file path');
    const invalid = await invoke(root);
    assert.equal(invalid.code, 2, `path should be rejected: ${JSON.stringify(invalidPath)}`);
  }
});

test('file checks mark directories as unverified', async (t) => {
  const root = await repository(t);
  const config = baseConfig({ type: 'file', path: 'directory', assertion: 'exists' });
  await commitFiles(root, {
    'agent-done-check.json': JSON.stringify(config),
    'directory/entry.txt': 'nested file',
    'unreadable.txt': 'restricted file',
  });
  const directoryResult = await invoke(root);
  assert.equal(directoryResult.code, 1);
  const directoryReport = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  assert.equal(directoryReport.checks[0].status, 'unverified');
  assert.match(directoryReport.checks[0].error, /not a regular file/);
});

test('file checks leave expected values and file contents out of output and reject oversized or invalid UTF-8 files', async (t) => {
  const root = await repository(t);
  const expected = 'a-sensitive-value-that-must-not-be-reported';
  const config = baseConfig({ type: 'file', path: 'private.txt', assertion: 'contains', expected });
  await commitFiles(root, {
    'agent-done-check.json': JSON.stringify(config),
    'private.txt': `${expected}\n`,
    'invalid-utf8.bin': Buffer.from([0xff, 0xfe]),
    'oversized.txt': 'x'.repeat(1_048_577),
  });
  const result = await invoke(root);
  assert.equal(result.code, 0, JSON.stringify(result.report?.checks));
  const report = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  assert.ok(!JSON.stringify(report).includes(expected));
  assert.ok(!JSON.stringify(report).includes(`${expected}\n`));

  config.checks[0] = { ...config.checks[0], id: 'invalid-utf8', path: 'invalid-utf8.bin', assertion: 'equals', expected: 'text' };
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  git(root, 'add', 'agent-done-check.json');
  git(root, 'commit', '--quiet', '-m', 'verify invalid UTF-8 behavior');
  const invalidUtf8 = await invoke(root);
  assert.equal(invalidUtf8.code, 1);
  const invalidReport = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  assert.equal(invalidReport.checks[0].status, 'unverified');
  assert.match(invalidReport.checks[0].error, /valid UTF-8/);

  config.checks[0] = { ...config.checks[0], id: 'oversized', path: 'oversized.txt' };
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  git(root, 'add', 'agent-done-check.json');
  git(root, 'commit', '--quiet', '-m', 'verify oversized file behavior');
  const oversized = await invoke(root);
  assert.equal(oversized.code, 1);
  const oversizedReport = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  assert.equal(oversizedReport.checks[0].status, 'unverified');
  assert.match(oversizedReport.checks[0].error, /exceeds the 1048576-byte limit/);
});

test('file checks reject symlinks resolving outside the verified worktree', async (t) => {
  const root = await repository(t);
  const outside = `${root}-outside.txt`;
  await writeFile(outside, 'outside-secret');
  t.after(() => rm(outside, { force: true }));
  try { await symlink(outside, path.join(root, 'escape.txt')); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('Symlinks are unavailable in this environment.'); return; }
    throw error;
  }
  await commitFiles(root, {
    'agent-done-check.json': JSON.stringify(baseConfig({ type: 'file', path: 'escape.txt', assertion: 'exists' })),
  });
  const trackedSymlink = await lstat(path.join(root, 'escape.txt'));
  if (!trackedSymlink.isSymbolicLink() && process.platform === 'win32') { t.skip('Git checkout does not preserve symlinks in this environment.'); return; }
  const result = await invoke(root);
  assert.equal(result.code, 1, JSON.stringify(result.report?.checks));
  const report = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  assert.equal(report.checks[0].status, 'unverified');
  assert.match(report.checks[0].error, /outside the verified worktree/);
  assert.ok(!JSON.stringify(report).includes('outside-secret'));
});

test('checks receive only baseline and explicitly allowed host environment; marked values are redacted', async (t) => {
  const root = await repository(t);
  const hostKey = 'AGENT_DONE_CHECK_PRIVATE_TEST_VALUE';
  const previous = process.env[hostKey];
  process.env[hostKey] = 'host-secret-test-value';
  t.after(() => {
    if (previous === undefined) delete process.env[hostKey];
    else process.env[hostKey] = previous;
  });
  const config = baseConfig({
    command: nodeCommand('console.log(JSON.stringify({ host: process.env.AGENT_DONE_CHECK_PRIVATE_TEST_VALUE ?? null, configured: process.env.CONFIGURED_TEST_VALUE, bearer: "Bearer syntheticbearertoken123456", github: "ghp_123456789012345678901234" }))'),
  });
  config.env = { CONFIGURED_TEST_VALUE: 'configured-secret-test-value' };
  config.redactEnv = [hostKey, 'CONFIGURED_TEST_VALUE'];
  await commitFiles(root, { 'agent-done-check.json': JSON.stringify(config) });

  const result = await invoke(root);
  assert.equal(result.code, 0, result.stderr || JSON.stringify(result.report?.checks) || result.stdout);
  const report = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  assert.deepEqual(JSON.parse(report.checks[0].stdout), {
    host: null,
    configured: '[REDACTED]',
    bearer: 'Bearer [REDACTED]',
    github: '[REDACTED]',
  });
  assert.ok(!JSON.stringify(report).includes('host-secret-test-value'));
  assert.ok(!JSON.stringify(report).includes('configured-secret-test-value'));
});

test('invalid inherited environment configuration is rejected before checks run', async (t) => {
  const root = await repository(t);
  const config = baseConfig({ command: nodeCommand('process.exit(9)') });
  config.inheritEnv = 'TOKEN';
  await commitFiles(root, { 'agent-done-check.json': JSON.stringify(config) });
  const result = await invoke(root);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /inheritEnv: must be an array/);
});

test('runner credentials cannot be added to the inherited environment allowlist', async (t) => {
  const root = await repository(t);
  const config = baseConfig({ command: nodeCommand('process.exit(9)') });
  config.inheritEnv = ['ACTIONS_RUNTIME_TOKEN'];
  await commitFiles(root, { 'agent-done-check.json': JSON.stringify(config) });
  const result = await invoke(root);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /runner credential\/control variable cannot be inherited/);
});

test('invalid browser URL is rejected before a worktree is created', async (t) => {
  const root = await repository(t);
  await commitFiles(root, {
    'agent-done-check.json': JSON.stringify(baseConfig({ type: 'playwright', url: 'http://', steps: [{ action: 'expectUrl', value: '/' }] })),
  });
  const result = await invoke(root);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /checks\[0\]\.url/);
});

test('Playwright setup runs once and browser screenshot and diagnostics are bound into evidence', async (t) => {
  const root = await repository(t);
  const fakePlaywright = `
const fs = require('node:fs');
module.exports = {
  chromium: {
    launch: async () => ({
      version: () => 'fake-chromium-1',
      close: async () => {},
      newContext: async () => ({
        newPage: async () => {
          const handlers = {};
          return {
            setDefaultTimeout: () => {},
            on: (event, handler) => { handlers[event] = handler; },
            goto: async (url) => {
              if (fs.readFileSync(process.env.SETUP_MARKER, 'utf8') !== 'x') throw new Error('setup did not run exactly once');
              handlers.response({ status: () => 401, url: () => url });
              handlers.console({ type: () => 'error', location: () => ({ url }), text: () => 'failed to submit replace-with-test-credential' });
            },
            waitForURL: async () => {},
            locator: () => ({ first() { return this; }, fill: async () => {}, waitFor: async () => {}, innerText: async () => 'Dashboard', textContent: async () => '', getAttribute: async () => process.env.AGENT_DONE_CHECK_TARGET_COMMIT }),
            screenshot: async ({ path }) => fs.writeFileSync(path, 'fake-png'),
          };
        },
      }),
    }),
  },
};
`;
  const config = baseConfig({
    type: 'playwright',
    url: 'https://user:password@staging.example.test/dashboard?token=do-not-report#secret',
    commitAssertion: { selector: 'meta[name=commit-sha]', attribute: 'content' },
    setupCommand: nodeCommand('require("node:fs").appendFileSync(process.env.SETUP_MARKER, "x")'),
    steps: [
      { action: 'fill', selector: '[name=password]', value: 'replace-with-test-credential' },
      { action: 'expectUrl', value: '/dashboard' },
    ],
    failOnHttpError: false,
  });
  config.criteria.push({ id: 'unbound', description: 'An unbound URL cannot pass as commit evidence.' });
  config.checks.push({
    id: 'unbound-browser',
    type: 'playwright',
    url: 'https://staging.example.test/dashboard',
    steps: [{ action: 'expectUrl', value: '/dashboard' }],
    screenshot: false,
    criteria: ['unbound'],
  });
  config.env = { SETUP_MARKER: path.join(root, 'setup.count') };
  await commitFiles(root, {
    'agent-done-check.json': JSON.stringify(config),
    'package.json': JSON.stringify({ name: 'fixture', version: '1.0.0' }),
    'node_modules/playwright/package.json': JSON.stringify({ name: 'playwright', version: '0.0.0', main: 'index.js' }),
    'node_modules/playwright/index.js': fakePlaywright,
  });

  const result = await invoke(root);
  assert.equal(result.code, 1, result.stderr || JSON.stringify(result.report?.checks) || result.stdout);
  const report = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(root, '.agent-done-check/manifest.json'), 'utf8'));
  const check = report.checks[0];
  assert.equal(report.status, 'unverified');
  assert.equal(check.browser.diagnostics.browserVersion, 'fake-chromium-1');
  assert.equal(check.browser.diagnostics.httpErrors.length, 1);
  assert.equal(check.browser.revisionBinding.status, 'verified');
  assert.equal(check.browser.diagnostics.consoleErrors[0].text, 'failed to submit [REDACTED]');
  assert.equal(check.browser.url, 'https://staging.example.test/dashboard');
  assert.ok(!JSON.stringify(report).includes('do-not-report'));
  assert.ok(!JSON.stringify(report).includes('password'));
  assert.equal(check.browser.artifacts[0].role, 'browser-screenshot');
  assert.ok(manifest.artifacts.some((artifact) => artifact.role === 'browser-screenshot' && artifact.sha256));
  assert.equal(report.checks[1].status, 'unverified');
  assert.equal(report.checks[1].browser.revisionBinding.status, 'unverified');
  assert.match(await readFile(path.join(root, '.agent-done-check/report.md'), 'utf8'), /browser-screenshot/);
});

test('timeout terminates descendant processes and marks the criterion unverified', async (t) => {
  const root = await repository(t);
  const marker = path.join(root, 'late-child.marker');
  const script = `const { spawn } = require('node:child_process'); spawn(process.execPath, ['-e', 'setTimeout(() => require("node:fs").writeFileSync(process.env.MARKER, "late"), 1800)']); setTimeout(() => {}, 10000);`;
  const command = nodeCommand(script);
  const config = baseConfig({ command, timeoutMs: 1000 });
  config.env = { MARKER: marker };
  await commitFiles(root, { 'agent-done-check.json': JSON.stringify(config) });

  const result = await invoke(root);
  assert.equal(result.code, 1, result.stderr || JSON.stringify(result.report?.checks) || result.stdout);
  const report = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  assert.equal(report.status, 'unverified');
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
});

test('completed commands do not leave detached descendants running', async (t) => {
  const root = await repository(t);
  const marker = path.join(root, 'orphan.marker');
  const child = `spawn(process.execPath, ['-e', 'setTimeout(() => require("node:fs").writeFileSync(process.env.MARKER, "late"), 1600)'], { stdio: "ignore" }).unref();`;
  const config = baseConfig({ command: nodeCommand(`const { spawn } = require("node:child_process"); ${child}`) });
  config.env = { MARKER: marker };
  await commitFiles(root, { 'agent-done-check.json': JSON.stringify(config) });

  const result = await invoke(root);
  assert.equal(result.code, 0, result.stderr || JSON.stringify(result.report?.checks) || result.stdout);
  await new Promise((resolve) => setTimeout(resolve, 1900));
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
});

test('a failed check takes precedence over another unverified check for one criterion', async (t) => {
  const root = await repository(t);
  const config = baseConfig({ command: nodeCommand('process.exit(7)') });
  config.checks.push({ id: 'slow-check', command: nodeCommand('setTimeout(() => {}, 30000)'), timeoutMs: 1000, criteria: ['behavior'] });
  await commitFiles(root, { 'agent-done-check.json': JSON.stringify(config) });

  const result = await invoke(root);
  assert.equal(result.code, 1);
  const report = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  assert.equal(report.checks[0].status, 'failed');
  assert.equal(report.checks[1].status, 'unverified');
  assert.equal(report.criteria[0].status, 'failed');
  assert.equal(report.status, 'failed');
});

test('checks get fresh worktrees and source-changing checks cannot pass', async (t) => {
  const root = await repository(t);
  const config = baseConfig({ command: nodeCommand('require("node:fs").writeFileSync("source.txt", "changed")') });
  config.criteria.push({ id: 'fresh-source', description: 'Each check starts from the same commit.' });
  config.checks.push({
    id: 'source-isolation',
    command: nodeCommand('if (require("node:fs").readFileSync("source.txt", "utf8") !== "original") process.exit(9)'),
    criteria: ['fresh-source'],
  });
  await commitFiles(root, { 'agent-done-check.json': JSON.stringify(config), 'source.txt': 'original' });

  const result = await invoke(root);
  assert.equal(result.code, 1);
  const report = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  assert.equal(report.checks[0].status, 'unverified');
  assert.match(report.checks[0].error, /tracked files changed/);
  assert.equal(report.checks[1].status, 'passed');
  assert.equal(report.criteria[1].status, 'passed');
});

test('captured output limit is enforced in bytes and reports truncation', async (t) => {
  const root = await repository(t);
  const command = nodeCommand('process.stdout.write("💥".repeat(20000))');
  await commitFiles(root, { 'agent-done-check.json': JSON.stringify(baseConfig({ command })) });

  const result = await invoke(root);
  assert.equal(result.code, 0, result.stderr || JSON.stringify(result.report?.checks) || result.stdout);
  const report = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  assert.equal(report.checks[0].outputTruncated.stdout, true);
  assert.ok(Buffer.byteLength(report.checks[0].stdout, 'utf8') <= 24_000);
});
