import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

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

async function invokeAsync(root, args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, '--config', 'agent-done-check.json', ...args], { cwd: root });
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('close', async (code) => {
      let report;
      try { report = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8')); } catch { /* No report on setup failure. */ }
      resolve({ code, stdout, stderr, report });
    });
  });
}

function invokeBundle(cwd, manifestPath) {
  try {
    const stdout = execFileSync(process.execPath, [cliPath, '--verify-bundle', '--manifest', manifestPath], { cwd, encoding: 'utf8' });
    return { code: 0, output: JSON.parse(stdout) };
  } catch (error) {
    return { code: error.status, output: JSON.parse(error.stdout.toString()) };
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
  const verified = invokeBundle(root, path.join(root, '.agent-done-check/manifest.json'));
  assert.equal(verified.code, 0, JSON.stringify(verified.output));
  assert.equal(verified.output.valid, true);
  assert.equal(verified.output.artifactsChecked, manifest.artifacts.length);
  const markdown = await readFile(path.join(root, '.agent-done-check/report.md'), 'utf8');
  assert.ok(!markdown.includes('<img'));
  assert.match(markdown, /&lt;img/);
});

test('argv command checks preserve literal arguments without invoking a shell', async (t) => {
  const root = await repository(t);
  const literal = 'value with spaces; $(touch should-not-run)';
  const config = baseConfig({
    command: [process.execPath, '-e', 'process.stdout.write(process.argv[1])', literal],
    stdoutContains: literal,
  });
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  git(root, 'add', '.'); git(root, 'commit', '--quiet', '-m', 'argv command fixture');
  const result = await invokeAsync(root);
  assert.equal(result.code, 0, result.stderr || JSON.stringify(result.report?.checks));
  const check = result.report.checks[0];
  assert.equal(check.status, 'passed');
  assert.equal(check.command, JSON.stringify([process.execPath, '-e', 'process.stdout.write(process.argv[1])', literal]).replace(literal, '[REDACTED]'));
  assert.ok(!JSON.stringify(result.report).includes(literal));
  const markdown = await readFile(path.join(root, '.agent-done-check/report.md'), 'utf8');
  assert.ok(!markdown.includes(literal));

  const validate = async () => {
    await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
    return invoke(root, ['--validate']);
  };
  config.checks[0].command = [];
  assert.equal((await validate()).code, 2);
  config.checks[0].command = ['', 'arg'];
  assert.equal((await validate()).code, 2);
  config.checks[0].command = [process.execPath, 42];
  assert.equal((await validate()).code, 2);
  config.checks[0].command = [process.execPath, 'nul\0arg'];
  assert.equal((await validate()).code, 2);
  config.checks[0].command = [process.execPath, 'x'.repeat(4097)];
  assert.equal((await validate()).code, 2);
  config.checks[0].command = [process.execPath, ...Array.from({ length: 256 }, () => 'x')];
  assert.equal((await validate()).code, 2);
  config.checks[0].command = [process.execPath, ...Array.from({ length: 20 }, () => 'x'.repeat(4096))];
  assert.equal((await validate()).code, 2);
});

test('command checks pass only on their configured expected exit code', async (t) => {
  const root = await repository(t);
  const config = {
    version: 1,
    criteria: [{ id: 'exit-codes', description: 'Configured process exit codes determine command success.' }],
    checks: [
      { id: 'default-zero', command: nodeCommand('process.exit(0)'), criteria: ['exit-codes'] },
      { id: 'expected-seven', command: nodeCommand('process.exit(7)'), expectedExitCode: 7, criteria: ['exit-codes'] },
      { id: 'expected-list-seven', command: nodeCommand('process.exit(7)'), expectedExitCodes: [3, 7], criteria: ['exit-codes'] },
      { id: 'expected-list-three', command: nodeCommand('process.exit(3)'), expectedExitCodes: [3, 7], criteria: ['exit-codes'] },
      { id: 'unexpected-seven', command: nodeCommand('process.exit(7)'), expectedExitCode: 0, criteria: ['exit-codes'] },
    ],
  };
  await commitFiles(root, { 'agent-done-check.json': JSON.stringify(config) });
  const result = await invoke(root);
  assert.equal(result.code, 1);
  const report = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  const checks = Object.fromEntries(report.checks.map((check) => [check.id, check]));
  assert.equal(checks['default-zero'].status, 'passed');
  assert.equal(checks['default-zero'].expectedExitCode, 0);
  assert.equal(checks['expected-seven'].exitCode, 7);
  assert.equal(checks['expected-seven'].expectedExitCode, 7);
  assert.equal(checks['expected-seven'].status, 'passed');
  assert.equal(checks['expected-list-seven'].status, 'passed');
  assert.equal(checks['expected-list-seven'].expectedExitCode, 3);
  assert.deepEqual(checks['expected-list-seven'].expectedExitCodes, [3, 7]);
  assert.equal(checks['expected-list-three'].status, 'passed');
  assert.equal(checks['unexpected-seven'].status, 'failed');
  assert.equal(checks['unexpected-seven'].exitCode, 7);
  config.checks[1].expectedExitCode = 256;
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  const invalidCode = await invoke(root);
  assert.equal(invalidCode.code, 2);
  assert.match(invalidCode.stderr, /expectedExitCode/);
  config.checks[1].expectedExitCode = undefined;
  for (const codes of [[], [256], [-1], [0, 0], Array.from({ length: 33 }, (_, index) => index)]) {
    config.checks[1].expectedExitCodes = codes;
    await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
    assert.equal((await invoke(root, ['--validate'])).code, 2, JSON.stringify(codes));
  }
  config.checks[1].expectedExitCodes = [0, 7];
  config.checks[1].expectedExitCode = 0;
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  assert.equal((await invoke(root, ['--validate'])).code, 2);
  delete config.checks[1].expectedExitCode;
  config.checks[1].expectedExitCodes = [0];
  config.checks[1].type = 'file';
  config.checks[1].path = 'x';
  config.checks[1].assertion = 'exists';
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  assert.equal((await invoke(root, ['--validate'])).code, 2);
});

test('selected checks preserve config order and leave omitted criteria unverified', async (t) => {
  const root = await repository(t);
  const config = {
    version: 1,
    criteria: [
      { id: 'shared', description: 'Both selected and omitted checks support this criterion.' },
      { id: 'selected-only', description: 'Only one selected check supports this criterion.' },
      { id: 'omitted-only', description: 'Only an omitted check supports this criterion.' },
    ],
    checks: [
      { id: 'first', command: nodeCommand('console.log("first")'), criteria: ['shared', 'selected-only'] },
      { id: 'second', command: nodeCommand('console.log("second")'), criteria: ['shared'] },
      { id: 'omitted', command: nodeCommand('console.log("omitted")'), criteria: ['omitted-only'] },
    ],
  };
  await commitFiles(root, { 'agent-done-check.json': JSON.stringify(config) });

  const single = await invoke(root, ['--check', 'first']);
  assert.equal(single.code, 1);
  const singleReport = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  const singleCriteria = Object.fromEntries(singleReport.criteria.map((criterion) => [criterion.id, criterion]));
  assert.equal(singleReport.status, 'unverified');
  assert.equal(singleCriteria.shared.status, 'unverified');
  assert.deepEqual(singleCriteria.shared.unrunChecks, ['second']);
  assert.equal(singleCriteria['selected-only'].status, 'passed');
  assert.deepEqual(singleCriteria['omitted-only'].unrunChecks, ['omitted']);

  const focused = await invoke(root, ['--check', 'second', '--check', 'first', '--sarif-output', 'report.sarif', '--junit-output', 'report.xml']);
  assert.equal(focused.code, 1);
  const report = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  assert.equal(report.status, 'unverified');
  assert.deepEqual(report.checkSelection, ['first', 'second']);
  assert.deepEqual(report.checks.map((check) => check.id), ['first', 'second']);
  const criteria = Object.fromEntries(report.criteria.map((criterion) => [criterion.id, criterion]));
  assert.equal(criteria.shared.status, 'passed');
  assert.equal(criteria.shared.unrunChecks, undefined);
  assert.equal(criteria['selected-only'].status, 'passed');
  assert.equal(criteria['omitted-only'].status, 'unverified');
  assert.deepEqual(criteria['omitted-only'].unrunChecks, ['omitted']);
  const markdown = await readFile(path.join(root, '.agent-done-check/report.md'), 'utf8');
  assert.match(markdown, /Check selection: `first`, `second`/);
  assert.match(markdown, /not run: omitted/);
  const sarif = JSON.parse(await readFile(path.join(root, 'report.sarif'), 'utf8'));
  assert.deepEqual(sarif.runs[0].properties.checkSelection, ['first', 'second']);
  assert.equal(sarif.runs[0].properties.status, 'unverified');
  assert.equal(sarif.runs[0].results.length, 1);
  assert.equal(sarif.runs[0].results[0].ruleId, 'omitted');
  assert.equal(sarif.runs[0].results[0].properties.notRun, true);
  const junit = await readFile(path.join(root, 'report.xml'), 'utf8');
  assert.match(junit, /name="checkSelection" value="first,second"/);
  assert.match(junit, /tests="3" failures="0" errors="0" skipped="1"/);
  assert.match(junit, /name="omitted"[^>]*><skipped message="check not run because it was omitted from selection"/);

  const unknown = await invoke(root, ['--check', 'missing']);
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /Unknown check ID: missing/);
  const duplicate = await invoke(root, ['--check', 'first', '--check', 'first']);
  assert.equal(duplicate.code, 2);
  assert.match(duplicate.stderr, /must be unique/);
  assert.equal((await invoke(root, ['--validate', '--check', 'first'])).code, 2);
  assert.equal((await invoke(root, ['--verify-bundle', '--check', 'first'])).code, 2);

  const complete = await invoke(root);
  assert.equal(complete.code, 0);
  const completeReport = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  assert.equal(completeReport.status, 'passed');
  assert.equal(completeReport.checkSelection, null);
});

test('per-check command environments override local values without expanding host inheritance', async (t) => {
  const root = await repository(t);
  const hostVariable = 'AGENT_DONE_CHECK_PER_CHECK_HOST_TEST';
  const priorHostValue = process.env[hostVariable];
  process.env[hostVariable] = 'host-only-value';
  t.after(() => {
    if (typeof priorHostValue === 'undefined') delete process.env[hostVariable];
    else process.env[hostVariable] = priorHostValue;
  });
  const config = {
    version: 1,
    env: { SHARED_VALUE: 'global-value', PRIVATE_VALUE: 'global-private-value' },
    redactEnv: ['PRIVATE_VALUE'],
    criteria: [{ id: 'environment', description: 'Each command receives its scoped environment.' }],
    checks: [
      {
        id: 'override',
        command: nodeCommand('if (process.env.SHARED_VALUE !== "local-value" || process.env.LOCAL_ONLY !== "only-here" || process.env.AGENT_DONE_CHECK_PER_CHECK_HOST_TEST !== "local-marker") process.exit(9); process.stdout.write(process.env.PRIVATE_VALUE)'),
        env: { SHARED_VALUE: 'local-value', LOCAL_ONLY: 'only-here', PRIVATE_VALUE: 'local-private-value', [hostVariable]: 'local-marker' },
        criteria: ['environment'],
      },
      {
        id: 'global-only',
        command: nodeCommand('if (process.env.SHARED_VALUE !== "global-value" || process.env.LOCAL_ONLY !== undefined || process.env.AGENT_DONE_CHECK_PER_CHECK_HOST_TEST !== undefined) process.exit(9); process.stdout.write(process.env.PRIVATE_VALUE)'),
        criteria: ['environment'],
      },
    ],
  };
  await commitFiles(root, { 'agent-done-check.json': JSON.stringify(config) });
  const result = await invoke(root);
  assert.equal(result.code, 0, result.stderr || JSON.stringify(result.report?.checks));
  const report = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  assert.ok(report.checks.every((check) => check.status === 'passed'));
  assert.equal(report.checks[0].stdout, '[REDACTED]');
  assert.equal(report.checks[1].stdout, '[REDACTED]');
  assert.doesNotMatch(JSON.stringify(report), /local-private-value|global-private-value|host-only-value/);

  for (const env of [null, [], { 'BAD-NAME': 'value' }, { VALUE: 7 }, { GIT_DIR: 'override' }, { GIT_NO_REPLACE_OBJECTS: '0' }, { AGENT_DONE_CHECK_TARGET_COMMIT: 'other' }]) {
    config.checks[0].env = env;
    await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
    const invalid = await invoke(root, ['--validate']);
    assert.equal(invalid.code, 2, JSON.stringify(env));
    assert.match(invalid.stdout, /checks\[0\]\.env/);
  }
  if (process.platform === 'win32') {
    config.checks[0].env = { VALUE: 'upper', value: 'lower' };
    await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
    const duplicateCase = await invoke(root, ['--validate']);
    assert.equal(duplicateCase.code, 2);
    assert.match(duplicateCase.stdout, /duplicate environment variable/);
  }
  config.checks[0].type = 'file';
  config.checks[0].path = 'agent-done-check.json';
  config.checks[0].assertion = 'exists';
  config.checks[0].env = { LOCAL_ONLY: 'value' };
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  const invalidType = await invoke(root, ['--validate']);
  assert.equal(invalidType.code, 2);
  assert.match(invalidType.stdout, /checks\[0\]\.env.*only for command checks/);
});

test('command output substring assertions report pass, fail, and truncated uncertainty', async (t) => {
  const root = await repository(t);
  const config = {
    version: 1,
    criteria: [{ id: 'output', description: 'Command output contains required evidence.' }],
    checks: [
      { id: 'matching', command: nodeCommand('console.log("OUT-NEEDLE"); console.error("ERR-NEEDLE")'), stdoutContains: 'OUT-NEEDLE', stderrContains: 'ERR-NEEDLE', criteria: ['output'] },
      { id: 'missing', command: nodeCommand('console.log("complete output")'), stdoutContains: 'NEVER-PRINTED', criteria: ['output'] },
      { id: 'truncated', command: nodeCommand('console.log("EARLY-NEEDLE"); console.log("x".repeat(30000))'), stdoutContains: 'EARLY-NEEDLE', criteria: ['output'] },
    ],
  };
  await commitFiles(root, { 'agent-done-check.json': JSON.stringify(config) });
  const result = await invoke(root);
  assert.equal(result.code, 1);
  const report = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  const checks = Object.fromEntries(report.checks.map((check) => [check.id, check]));
  assert.equal(checks.matching.status, 'passed');
  assert.deepEqual(checks.matching.outputAssertions, { stdoutContainsMatched: true, stderrContainsMatched: true });
  assert.equal(checks.missing.status, 'failed');
  assert.equal(checks.missing.outputAssertions.stdoutContainsMatched, false);
  assert.equal(checks.truncated.status, 'unverified');
  assert.equal(checks.truncated.outputTruncated.stdout, true);
  assert.doesNotMatch(JSON.stringify(checks.matching.outputAssertions), /OUT-NEEDLE|ERR-NEEDLE/);
  assert.doesNotMatch(JSON.stringify(checks.missing.outputAssertions), /NEVER-PRINTED/);
  assert.doesNotMatch(JSON.stringify(checks.truncated.outputAssertions), /EARLY-NEEDLE/);
  assert.doesNotMatch(JSON.stringify(report), /OUT-NEEDLE|ERR-NEEDLE|NEVER-PRINTED|EARLY-NEEDLE/);
  assert.match(checks.matching.stdout, /\[REDACTED\]/);
  const evidence = await readFile(path.join(root, '.agent-done-check/evidence', report.runId, 'matching.stdout.txt'), 'utf8');
  assert.doesNotMatch(evidence, /OUT-NEEDLE/);
  const markdown = await readFile(path.join(root, '.agent-done-check/report.md'), 'utf8');
  assert.match(markdown, /stdout substring assertion: not found in the captured, truncated output; result is unverified/);
  assert.ok(!markdown.includes('NEVER-PRINTED'));
  assert.ok(!markdown.includes('OUT-NEEDLE'));
  assert.ok(!markdown.includes('ERR-NEEDLE'));
  assert.ok(!markdown.includes('EARLY-NEEDLE'));

  config.checks[0].type = 'file';
  config.checks[0].path = 'agent-done-check.json';
  config.checks[0].assertion = 'exists';
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  const invalid = await invoke(root, ['--validate']);
  assert.equal(invalid.code, 2);
  assert.match(invalid.stdout, /stdoutContains.*only for command checks/);
  config.checks[0].type = 'command';
  delete config.checks[0].path;
  delete config.checks[0].assertion;
  config.checks[0].stdoutContains = '🐈'.repeat(4096);
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  assert.equal((await invoke(root, ['--validate'])).code, 0);
  config.checks[0].stdoutContains += '🐈';
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  const tooLongAssertion = await invoke(root, ['--validate']);
  assert.equal(tooLongAssertion.code, 2);
  assert.match(tooLongAssertion.stdout, /stdoutContains/);
});

test('command working directories stay inside the isolated worktree', async (t) => {
  const root = await repository(t);
  const outside = await mkdtemp(path.join(tmpdir(), 'agent-done-check-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const config = {
    version: 1,
    criteria: [{ id: 'working-directory', description: 'Commands run from the configured committed directory.' }],
    checks: [
      { id: 'default-root', command: nodeCommand('if (process.cwd() !== process.env.INIT_CWD) process.exit(9)'), criteria: ['working-directory'] },
      { id: 'nested', command: nodeCommand('if (!require("node:fs").existsSync("marker.txt")) process.exit(9)'), workingDirectory: 'packages/api', criteria: ['working-directory'] },
      { id: 'missing', command: nodeCommand('process.exit(0)'), workingDirectory: 'missing', criteria: ['working-directory'] },
      { id: 'file', command: nodeCommand('process.exit(0)'), workingDirectory: 'marker.txt', criteria: ['working-directory'] },
      { id: 'escape', command: nodeCommand('process.exit(0)'), workingDirectory: 'outside', criteria: ['working-directory'] },
    ],
  };
  // INIT_CWD is intentionally not inherited. The default-root command instead checks the config-relative path evidence below.
  config.checks[0].command = nodeCommand('if (!require("node:fs").existsSync("agent-done-check.json")) process.exit(9)');
  try { await symlink(outside, path.join(root, 'outside')); }
  catch (error) {
    if (process.platform === 'win32') { t.skip(`Directory symlinks unavailable: ${error.message}`); return; }
    throw error;
  }
  await commitFiles(root, {
    'agent-done-check.json': JSON.stringify(config),
    'marker.txt': 'root marker',
    'packages/api/marker.txt': 'nested marker',
  });
  const result = await invoke(root);
  assert.equal(result.code, 1);
  const report = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  const checks = Object.fromEntries(report.checks.map((check) => [check.id, check]));
  assert.equal(checks['default-root'].status, 'passed');
  assert.equal(checks.nested.status, 'passed');
  assert.equal(checks.missing.status, 'unverified');
  assert.equal(checks.file.status, 'unverified');
  assert.equal(checks.escape.status, 'unverified');
  assert.equal(checks.nested.workingDirectory, 'packages/api');
  assert.equal(checks['default-root'].workingDirectory, '.');
  assert.ok(!JSON.stringify(report).includes(outside));

  for (const workingDirectory of ['../outside', '/tmp/outside', 'packages//api']) {
    config.checks[0].workingDirectory = workingDirectory;
    await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
    const invalid = await invoke(root, ['--validate']);
    assert.equal(invalid.code, 2, workingDirectory);
    assert.match(invalid.stdout, /workingDirectory/);
  }
  config.checks[0].type = 'file';
  config.checks[0].path = 'marker.txt';
  config.checks[0].assertion = 'exists';
  delete config.checks[0].workingDirectory;
  config.checks[0].workingDirectory = 'packages/api';
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  const invalidType = await invoke(root, ['--validate']);
  assert.equal(invalidType.code, 2);
  assert.match(invalidType.stdout, /workingDirectory.*only for command checks/);
});

test('command output capture limits are per-stream, bounded, and reported', async (t) => {
  const root = await repository(t);
  const config = baseConfig({
    command: nodeCommand('process.stdout.write("A".repeat(1500)); process.stdout.write("STDOUT-END"); process.stderr.write("B".repeat(1500)); process.stderr.write("STDERR-END")'),
    maxOutputBytes: 1024,
  });
  await commitFiles(root, { 'agent-done-check.json': JSON.stringify(config) });
  const result = await invoke(root);
  assert.equal(result.code, 0, result.stderr || JSON.stringify(result.report?.checks));
  const report = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  const check = report.checks[0];
  assert.equal(check.maxOutputBytes, 1024);
  assert.equal(Buffer.byteLength(check.stdout), 1024);
  assert.equal(Buffer.byteLength(check.stderr), 1024);
  assert.equal(check.outputTruncated.stdout, true);
  assert.equal(check.outputTruncated.stderr, true);
  assert.ok(check.stdout.endsWith('STDOUT-END'));
  assert.ok(check.stderr.endsWith('STDERR-END'));

  config.maxOutputBytes = undefined;
  config.checks[0].maxOutputBytes = undefined;
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  const defaulted = await invoke(root);
  assert.equal(defaulted.code, 0);
  const defaultReport = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  assert.equal(defaultReport.checks[0].maxOutputBytes, 24000);
  assert.equal(defaultReport.checks[0].outputTruncated.stdout, false);

  for (const maxOutputBytes of [0, 1023, 1048577, 1.5, '4096']) {
    config.checks[0].maxOutputBytes = maxOutputBytes;
    await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
    const invalid = await invoke(root, ['--validate']);
    assert.equal(invalid.code, 2, String(maxOutputBytes));
    assert.match(invalid.stdout, /maxOutputBytes/);
  }
  config.checks[0].type = 'file';
  config.checks[0].path = 'agent-done-check.json';
  config.checks[0].assertion = 'exists';
  config.checks[0].maxOutputBytes = 2048;
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  const invalidType = await invoke(root, ['--validate']);
  assert.equal(invalidType.code, 2);
  assert.match(invalidType.stdout, /maxOutputBytes.*only for command checks/);
});

test('command stdin supplies bounded text and defaults to empty EOF', async (t) => {
  const root = await repository(t);
  const fixture = 'private-fixture-value-0.16-🐈';
  const config = {
    version: 1,
    criteria: [{ id: 'stdin', description: 'Command input fixtures are consumed as configured.' }],
    checks: [
      { id: 'provided', command: nodeCommand(`let input = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', (chunk) => input += chunk); process.stdin.on('end', () => { if (input !== ${JSON.stringify(fixture)}) process.exitCode = 9; else console.log('fixture-consumed'); });`), stdin: fixture, criteria: ['stdin'] },
      { id: 'eof', command: nodeCommand('process.stdin.resume(); process.stdin.on("end", () => console.log("empty-eof"))'), criteria: ['stdin'] },
    ],
  };
  await commitFiles(root, { 'agent-done-check.json': JSON.stringify(config) });
  const result = await invoke(root);
  assert.equal(result.code, 0, result.stderr || JSON.stringify(result.report?.checks));
  const report = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  assert.ok(report.checks.every((check) => check.status === 'passed'));
  assert.ok(!JSON.stringify(report).includes(fixture));
  assert.ok(!Object.hasOwn(report.checks[0], 'stdin'));
  assert.match(report.checks[0].stdout, /fixture-consumed/);
  assert.match(report.checks[1].stdout, /empty-eof/);

  config.checks[0].stdin = '🐈'.repeat(65_536);
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  assert.equal((await invoke(root, ['--validate'])).code, 0);
  for (const stdin of ['🐈'.repeat(65_537), 7, null]) {
    config.checks[0].stdin = stdin;
    await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
    const invalid = await invoke(root, ['--validate']);
    assert.equal(invalid.code, 2);
    assert.match(invalid.stdout, /stdin/);
  }
  config.checks[0].type = 'file';
  config.checks[0].path = 'agent-done-check.json';
  config.checks[0].assertion = 'exists';
  config.checks[0].stdin = 'not allowed here';
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  const invalidType = await invoke(root, ['--validate']);
  assert.equal(invalidType.code, 2);
  assert.match(invalidType.stdout, /stdin.*only for command checks/);
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
  assert.equal(report.schemaVersion, 4);
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
  assert.match(traversal.stderr, /path: must be a normalized relative path/);

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
  assert.match(report.checks[0].error, /Symbolic links are not supported/);
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
  const config = baseConfig({ command, timeoutMs: 1000, expectedExitCodes: [124] });
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
  assert.equal(result.code, 1, `${result.stderr}\n${result.stdout}\n${JSON.stringify(result.report?.checks)}`);
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
  assert.equal(result.code, 1, `${result.stderr}\n${result.stdout}\n${JSON.stringify(result.report?.checks)}`);
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


test('HTTP checks require exact commit binding and keep response content out of reports', async (t) => {
  const root = await repository(t);
  const server = createServer((request, response) => {
    if (request.url === '/redirect') { response.writeHead(302, { location: '/ok' }).end(); return; }
    if (request.url === '/missing') { response.end('unbound'); return; }
    if (request.url === '/mismatch') { response.setHeader('x-agent-done-check-commit', 'ghp_abcdefghijklmnopqrstuvwxyz123456789'); response.end('secret body'); return; }
    if (request.url === '/timeout') { const timer = setTimeout(() => response.end('late'), 3000); response.on('close', () => clearTimeout(timer)); return; }
    response.setHeader('x-agent-done-check-commit', targetCommit);
    if (request.url === '/failure') { response.writeHead(503); response.end('healthy'); return; }
    if (request.url === '/large') { response.end(Buffer.alloc(1_048_577, 97)); return; }
    if (request.url === '/binary') { response.end(Buffer.from([255, 254])); return; }
    if (request.url === '/binary-bound') { response.setHeader('x-agent-done-check-commit', targetCommit); response.end(Buffer.from([255, 254, 0])); return; }
    if (request.url === '/limit') { response.setHeader('x-agent-done-check-commit', targetCommit); response.end('1234'); return; }
    response.end('healthy response');
  });
  let targetCommit;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const config = {
    version: 1,
    timeoutMs: 5000,
    criteria: [{ id: 'http', description: 'HTTP evidence is bound to the verified revision.' }],
    checks: ['/ok', '/missing', '/mismatch', '/redirect', '/failure', '/large', '/binary', '/binary-bound', '/timeout', '/limit', '/limit-over'].map((route) => ({
      id: route.slice(1), type: 'http', url: `http://127.0.0.1:${port}${route}`,
      ...(route === '/failure' ? { expectedStatus: 200 } : route === '/ok' ? { bodyContains: 'healthy' } : {}),
      ...(route === '/binary' ? { bodyContains: 'text-only assertion' } : {}),
      ...(route === '/binary-bound' ? { bodySha256: createHash('sha256').update(Buffer.from([255, 254, 0])).digest('hex') } : {}),
      ...(route === '/limit' ? { maxBodyBytes: 4 } : route === '/limit-over' ? { maxBodyBytes: 3 } : {}),
      ...(route === '/timeout' ? { timeoutMs: 1000 } : {}), criteria: ['http'],
    })),
  };
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  git(root, 'add', '.'); git(root, 'commit', '--quiet', '-m', 'HTTP config fixture');
  targetCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const result = await invokeAsync(root, ['--commit', targetCommit]);
  assert.equal(result.code, 1, `${result.stderr}\n${result.stdout}\n${JSON.stringify(result.report?.checks)}`);
  const report = result.report;
  assert.equal(report.schemaVersion, 4);
  const checks = Object.fromEntries(report.checks.map((check) => [check.id, check]));
  assert.equal(checks.ok.status, 'passed', JSON.stringify(checks.ok));
  assert.equal(checks.ok.http.revisionBinding, 'verified');
  assert.equal(checks.missing.status, 'unverified');
  assert.equal(checks.missing.http.revisionBinding, 'missing');
  assert.equal(checks.mismatch.status, 'unverified');
  assert.equal(checks.mismatch.http.revisionBinding, 'mismatch');
  assert.equal(checks.redirect.status, 'unverified');
  assert.equal(checks.failure.status, 'failed');
  assert.equal(checks.large.status, 'unverified');
  assert.equal(checks.large.http.bodyTruncated, true);
  assert.equal(checks.binary.status, 'unverified');
  assert.equal(checks['binary-bound'].status, 'passed');
  assert.equal(checks['binary-bound'].http.bodySha256Matched, true);
  assert.equal(checks['binary-bound'].http.bodySha256, createHash('sha256').update(Buffer.from([255, 254, 0])).digest('hex'));
  assert.equal(checks.limit.status, 'passed');
  assert.equal(checks.limit.http.bodyBytes, 4);
  assert.equal(checks.limit.http.maxBodyBytes, 4);
  assert.equal(checks['limit-over'].status, 'unverified');
  assert.equal(checks['limit-over'].http.maxBodyBytes, 3);
  assert.match(checks['limit-over'].error, /3-byte limit/);
  assert.equal(checks.timeout.status, 'unverified');
  assert.match(checks.timeout.error, /timed out/);
  assert.ok(!JSON.stringify(report).includes('healthy response'));
  assert.ok(!JSON.stringify(report).includes('ghp_abcdefghijklmnopqrstuvwxyz123456789'));
  assert.ok(!JSON.stringify(report).includes('healthy'));
  assert.ok(!JSON.stringify(report).includes(createHash('sha256').update(Buffer.from('not configured')).digest('hex')));
});

test('HTTP expectedStatuses accepts any configured exact status and validates lists', async (t) => {
  const root = await repository(t);
  let targetCommit;
  const server = createServer((request, response) => {
    response.setHeader('x-agent-done-check-commit', targetCommit);
    const status = Number(request.url.slice(1));
    response.writeHead(status).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const config = {
    version: 1,
    criteria: [{ id: 'statuses', description: 'One allowed response status was returned.' }],
    checks: [201, 204, 200].map((status) => ({
      id: `status-${status}`, type: 'http', url: `http://127.0.0.1:${port}/${status}`,
      ...(status === 200 ? { expectedStatus: 201 } : { expectedStatuses: [201, 204] }), criteria: ['statuses'],
    })),
  };
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  git(root, 'add', '.'); git(root, 'commit', '--quiet', '-m', 'HTTP status list config');
  targetCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const result = await invokeAsync(root, ['--commit', targetCommit]);
  assert.equal(result.code, 1);
  const checks = Object.fromEntries(result.report.checks.map((check) => [check.id, check]));
  assert.equal(checks['status-201'].status, 'passed');
  assert.equal(checks['status-204'].status, 'passed');
  assert.equal(checks['status-201'].http.expectedStatus, 201);
  assert.deepEqual(checks['status-201'].http.expectedStatuses, [201, 204]);
  assert.equal(checks['status-200'].status, 'failed');
  assert.deepEqual(checks['status-200'].http.expectedStatuses, [201]);
  const markdown = await readFile(path.join(root, '.agent-done-check/report.md'), 'utf8');
  assert.match(markdown, /expected 201 or 204/);

  const validate = async () => {
    await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
    return invoke(root, ['--validate']);
  };
  config.checks[0].expectedStatus = 200;
  assert.equal((await validate()).code, 2);
  config.checks[0].expectedStatus = undefined;
  config.checks[0].type = 'command';
  config.checks[0].command = 'node --version';
  assert.equal((await validate()).code, 2);
  config.checks[0].type = 'http';
  delete config.checks[0].command;
  delete config.checks[0].expectedStatus;
  for (const statuses of [[], [99], [600], [200, 200], Array.from({ length: 21 }, (_, index) => 100 + index), [200.5]]) {
    config.checks[0].expectedStatuses = statuses;
    assert.equal((await validate()).code, 2, JSON.stringify(statuses));
  }
});

test('HTTP body digest assertions compare bounded raw bytes after binding and validate config', async (t) => {
  const root = await repository(t);
  let targetCommit;
  const bytes = Buffer.from([0, 255, 128, 1]);
  const expected = createHash('sha256').update(bytes).digest('hex');
  const server = createServer((request, response) => {
    if (request.url === '/unbound') { response.end(bytes); return; }
    response.setHeader('x-agent-done-check-commit', targetCommit);
    response.end(bytes);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const secretDigest = createHash('sha256').update(Buffer.from('private-config-value')).digest('hex');
  const config = {
    version: 1,
    criteria: [{ id: 'digest', description: 'HTTP body digest matches.' }],
    checks: [
      { id: 'match', type: 'http', url: `http://127.0.0.1:${port}/match`, bodySha256: expected, criteria: ['digest'] },
      { id: 'mismatch', type: 'http', url: `http://127.0.0.1:${port}/mismatch`, bodySha256: secretDigest, criteria: ['digest'] },
      { id: 'unbound', type: 'http', url: `http://127.0.0.1:${port}/unbound`, bodySha256: expected, criteria: ['digest'] },
    ],
  };
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  git(root, 'add', '.'); git(root, 'commit', '--quiet', '-m', 'HTTP digest config fixture');
  targetCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const result = await invokeAsync(root, ['--commit', targetCommit]);
  assert.equal(result.code, 1);
  const checks = Object.fromEntries(result.report.checks.map((check) => [check.id, check]));
  assert.equal(checks.match.status, 'passed');
  assert.equal(checks.match.http.bodySha256Matched, true);
  assert.equal(checks.mismatch.status, 'failed');
  assert.equal(checks.mismatch.http.bodySha256Matched, false);
  assert.equal(checks.unbound.status, 'unverified');
  assert.equal(checks.unbound.http.bodySha256Matched, null);
  assert.ok(!JSON.stringify(result.report).includes(secretDigest));
  assert.ok(!JSON.stringify(result.report).includes(bytes.toString('base64')));

  config.checks[0].bodySha256 = 'A'.repeat(64);
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  const invalid = await invokeAsync(root, ['--validate-config']);
  assert.equal(invalid.code, 2);
});

test('HTTP JSON Pointer assertions are typed, commit-bound, bounded, and private', async (t) => {
  const root = await repository(t);
  let targetCommit;
  const expectedSecret = 'private-json-response-value';
  const jsonBody = JSON.stringify(JSON.parse(`{"a/b":{"~key":{"items":[null,false],"name":${JSON.stringify(expectedSecret)}}},"__proto__":{"safe":true}}`));
  const server = createServer((request, response) => {
    if (request.url === '/unbound') { response.end(jsonBody); return; }
    response.setHeader('x-agent-done-check-commit', targetCommit);
    if (request.url === '/malformed') { response.end('{bad json'); return; }
    if (request.url === '/invalid-utf8') { response.end(Buffer.from([0xff, 0xfe])); return; }
    if (request.url === '/too-large') { response.end(Buffer.alloc(32, 65)); return; }
    response.end(jsonBody);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const expectedObject = JSON.parse(`{"name":${JSON.stringify(expectedSecret)},"items":[null,false]}`);
  const base = (id, route, assertion) => ({ id, type: 'http', url: `http://127.0.0.1:${port}${route}`, bodyJsonPointerEquals: assertion, criteria: ['json-http'] });
  const config = {
    version: 1,
    criteria: [{ id: 'json-http', description: 'The response JSON contains the expected value.' }],
    checks: [
      base('match', '/match', { pointer: '/a~1b/~0key', expected: expectedObject }),
      base('null', '/null', { pointer: '/a~1b/~0key/items/0', expected: null }),
      base('wrong-type', '/wrong-type', { pointer: '/a~1b/~0key/items/1', expected: 'false' }),
      base('missing', '/missing', { pointer: '/missing', expected: true }),
      base('prototype-key', '/prototype', { pointer: '/__proto__/safe', expected: true }),
      base('malformed', '/malformed', { pointer: '', expected: {} }),
      base('invalid-utf8', '/invalid-utf8', { pointer: '', expected: {} }),
      base('unbound', '/unbound', { pointer: '', expected: {} }),
      { ...base('too-large', '/too-large', { pointer: '', expected: {} }), maxBodyBytes: 8 },
    ],
  };
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  git(root, 'add', '.'); git(root, 'commit', '--quiet', '-m', 'HTTP JSON assertion config');
  targetCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const result = await invokeAsync(root, ['--commit', targetCommit, '--sarif-output', 'report.sarif', '--junit-output', 'report.xml']);
  assert.equal(result.code, 1);
  const checks = Object.fromEntries(result.report.checks.map((check) => [check.id, check]));
  for (const id of ['match', 'null', 'prototype-key']) assert.equal(checks[id].status, 'passed', id);
  for (const id of ['wrong-type', 'missing', 'malformed']) assert.equal(checks[id].status, 'failed', id);
  for (const id of ['invalid-utf8', 'unbound', 'too-large']) assert.equal(checks[id].status, 'unverified', id);
  assert.equal(checks.match.http.bodyJsonPointerMatched, true);
  assert.equal(checks['wrong-type'].http.bodyJsonPointerMatched, false);
  assert.equal(checks.unbound.http.bodyJsonPointerMatched, null);
  const markdown = await readFile(path.join(root, '.agent-done-check/report.md'), 'utf8');
  const sarif = await readFile(path.join(root, 'report.sarif'), 'utf8');
  const junit = await readFile(path.join(root, 'report.xml'), 'utf8');
  for (const value of [expectedSecret, '/a~1b/~0key']) {
    for (const output of [JSON.stringify(result.report), markdown, sarif, junit]) assert.ok(!output.includes(value), value);
  }

  config.checks[0].bodyJsonPointerEquals = { pointer: '/bad~2', expected: true };
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  assert.equal((await invoke(root, ['--validate'])).code, 2);
  config.checks[0].bodyJsonPointerEquals = { pointer: '', extra: 1 };
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  assert.equal((await invoke(root, ['--validate'])).code, 2);
});

test('HTTP response header assertions run only after commit binding and keep values private', async (t) => {
  const root = await repository(t);
  let targetCommit;
  const server = createServer((request, response) => {
    if (request.url === '/unbound') {
      response.setHeader('x-mode', 'wrong-observed-value');
      response.end('ok');
      return;
    }
    response.setHeader('x-agent-done-check-commit', targetCommit);
    if (request.url === '/matched') response.setHeader('X-Mode', 'expected-header-value');
    if (request.url === '/mismatch') response.setHeader('x-mode', 'wrong-observed-value');
    if (request.url === '/large-mismatch') {
      response.setHeader('x-mode', 'wrong-observed-value');
      response.end(Buffer.alloc(1_048_577, 97));
      return;
    }
    response.end('ok');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const expectedValue = 'expected-header-value';
  const observedValue = 'wrong-observed-value';
  const config = {
    version: 1,
    criteria: [{ id: 'http-headers', description: 'Bound response header assertions match.' }],
    checks: ['/matched', '/missing', '/mismatch', '/unbound', '/large-mismatch'].map((route) => ({
      id: route.slice(1), type: 'http', url: `http://127.0.0.1:${port}${route}`,
      responseHeaders: { 'X-Mode': expectedValue }, criteria: ['http-headers'],
    })),
  };
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'HTTP response header fixture');
  targetCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const result = await invokeAsync(root, ['--commit', targetCommit, '--sarif-output', 'report.sarif', '--junit-output', 'report.xml']);
  assert.equal(result.code, 1, `${result.stderr}\n${result.stdout}`);
  const report = result.report;
  const checks = Object.fromEntries(report.checks.map((check) => [check.id, check]));
  assert.equal(checks.matched.status, 'passed');
  assert.deepEqual(checks.matched.http.responseHeadersMatched, { 'x-mode': true });
  assert.equal(checks.missing.status, 'failed');
  assert.deepEqual(checks.missing.http.responseHeadersMatched, { 'x-mode': false });
  assert.equal(checks.mismatch.status, 'failed');
  assert.deepEqual(checks.mismatch.http.responseHeadersMatched, { 'x-mode': false });
  assert.equal(checks.unbound.status, 'unverified');
  assert.equal(checks.unbound.http.responseHeadersMatched, null);
  assert.equal(checks['large-mismatch'].status, 'failed');
  assert.deepEqual(checks['large-mismatch'].http.responseHeadersMatched, { 'x-mode': false });
  for (const value of [expectedValue, observedValue]) assert.ok(!JSON.stringify(report).includes(value));
  const markdown = await readFile(path.join(root, '.agent-done-check/report.md'), 'utf8');
  const sarif = await readFile(path.join(root, 'report.sarif'), 'utf8');
  const junit = await readFile(path.join(root, 'report.xml'), 'utf8');
  for (const value of [expectedValue, observedValue]) {
    assert.ok(!markdown.includes(value));
    assert.ok(!sarif.includes(value));
    assert.ok(!junit.includes(value));
  }

  const validateConfig = async () => {
    await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
    return invoke(root, ['--validate']);
  };
  config.checks[0].responseHeaders = { 'bad name': 'value' };
  assert.equal((await validateConfig()).code, 2);
  config.checks[0].responseHeaders = { 'X-Mode': 'one', 'x-mode': 'two' };
  assert.equal((await validateConfig()).code, 2);
  config.checks[0].responseHeaders = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`x-header-${index}`, 'value']));
  assert.equal((await validateConfig()).code, 2);
  config.checks[0].responseHeaders = { 'x-mode': 'x'.repeat(4097) };
  assert.equal((await validateConfig()).code, 2);
  config.checks[0].responseHeaders = { 'x-mode': 'line\nbreak' };
  assert.equal((await validateConfig()).code, 2);
  config.checks[0].type = 'command';
  config.checks[0].command = 'node --version';
  assert.equal((await validateConfig()).code, 2);
});

test('commit-bound JSON Pointer file assertions compare typed values without exposing them', async (t) => {
  const root = await repository(t);
  const expectedSecret = 'json-pointer-private-value';
  const document = JSON.parse(`{"services":[{"enabled":true,"disabled":false,"quota":null,"limits":{"burst":5,"steady":2}}],"a/b":{"~key":${JSON.stringify(expectedSecret)}},"__proto__":{"polluted":true}}`);
  const expectedRoot = JSON.parse(`{"__proto__":{"polluted":true},"a/b":{"~key":${JSON.stringify(expectedSecret)}},"services":[{"enabled":true,"disabled":false,"limits":{"steady":2,"burst":5},"quota":null}]}`);
  const config = {
    version: 1,
    criteria: [{ id: 'json-file', description: 'Committed JSON values match their pointers.' }],
    checks: [
      { id: 'root-object', type: 'file', path: 'data.json', assertion: 'jsonPointerEquals', pointer: '', expected: expectedRoot, criteria: ['json-file'] },
      { id: 'exists-null', type: 'file', path: 'data.json', assertion: 'jsonPointerExists', pointer: '/services/0/quota', criteria: ['json-file'] },
      { id: 'exists-false', type: 'file', path: 'data.json', assertion: 'jsonPointerExists', pointer: '/services/0/disabled', criteria: ['json-file'] },
      { id: 'exists-empty-pointer', type: 'file', path: 'data.json', assertion: 'jsonPointerExists', pointer: '', criteria: ['json-file'] },
      { id: 'missing-pointer', type: 'file', path: 'data.json', assertion: 'jsonPointerExists', pointer: '/services/9', criteria: ['json-file'] },
      { id: 'boolean', type: 'file', path: 'data.json', assertion: 'jsonPointerEquals', pointer: '/services/0/enabled', expected: true, criteria: ['json-file'] },
      { id: 'null', type: 'file', path: 'data.json', assertion: 'jsonPointerEquals', pointer: '/services/0/quota', expected: null, criteria: ['json-file'] },
      { id: 'object-order', type: 'file', path: 'data.json', assertion: 'jsonPointerEquals', pointer: '/services/0/limits', expected: { steady: 2, burst: 5 }, criteria: ['json-file'] },
      { id: 'escaped', type: 'file', path: 'data.json', assertion: 'jsonPointerEquals', pointer: '/a~1b/~0key', expected: expectedSecret, criteria: ['json-file'] },
      { id: 'prototype-key', type: 'file', path: 'data.json', assertion: 'jsonPointerEquals', pointer: '/__proto__/polluted', expected: true, criteria: ['json-file'] },
      { id: 'invalid-array-index', type: 'file', path: 'data.json', assertion: 'jsonPointerEquals', pointer: '/services/00/enabled', expected: true, criteria: ['json-file'] },
      { id: 'wrong-type', type: 'file', path: 'data.json', assertion: 'jsonPointerEquals', pointer: '/services/0/enabled', expected: 'true', criteria: ['json-file'] },
      { id: 'malformed', type: 'file', path: 'malformed.json', assertion: 'jsonPointerEquals', pointer: '', expected: {}, criteria: ['json-file'] },
      { id: 'invalid-utf8', type: 'file', path: 'invalid.json', assertion: 'jsonPointerEquals', pointer: '', expected: {}, criteria: ['json-file'] },
    ],
  };
  await commitFiles(root, {
    'agent-done-check.json': JSON.stringify(config),
    'data.json': JSON.stringify(document),
    'malformed.json': '{not-json',
    'invalid.json': Buffer.from([0xff, 0xfe]),
  });
  const result = await invoke(root);
  assert.equal(result.code, 1, result.stderr || JSON.stringify(result.report?.checks));
  const report = JSON.parse(await readFile(path.join(root, '.agent-done-check/report.json'), 'utf8'));
  const checks = Object.fromEntries(report.checks.map((check) => [check.id, check]));
  for (const id of ['root-object', 'exists-null', 'exists-false', 'exists-empty-pointer', 'boolean', 'null', 'object-order', 'escaped', 'prototype-key']) assert.equal(checks[id].status, 'passed', id);
  assert.equal(checks['missing-pointer'].status, 'failed');
  assert.equal(checks['invalid-array-index'].status, 'failed');
  assert.equal(checks['wrong-type'].status, 'failed');
  assert.equal(checks.malformed.status, 'failed');
  assert.equal(checks['invalid-utf8'].status, 'unverified');
  assert.equal(checks.escaped.file.matched, true);
  assert.ok(!JSON.stringify(report).includes(expectedSecret));
  const markdown = await readFile(path.join(root, '.agent-done-check/report.md'), 'utf8');
  assert.ok(!markdown.includes(expectedSecret));

  for (const pointer of ['/bad~2escape', 'no-leading-slash', '/bad~']) {
    config.checks[0].pointer = pointer;
    await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
    const invalid = await invoke(root, ['--validate']);
    assert.equal(invalid.code, 2, pointer);
    assert.match(invalid.stdout, /pointer/);
  }
  config.checks[0].pointer = '/'.repeat(4097);
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  const oversizedPointer = await invoke(root, ['--validate']);
  assert.equal(oversizedPointer.code, 2);
  assert.match(oversizedPointer.stdout, /pointer/);
  delete config.checks[0].expected;
  config.checks[0].pointer = '';
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  const missingExpected = await invoke(root, ['--validate']);
  assert.equal(missingExpected.code, 2);
  assert.match(missingExpected.stdout, /expected/);
  config.checks[0] = { id: 'exists-with-value', type: 'file', path: 'data.json', assertion: 'jsonPointerExists', pointer: '/services/0/quota', expected: null, criteria: ['json-file'] };
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  const unusedExpected = await invoke(root, ['--validate']);
  assert.equal(unusedExpected.code, 2);
  assert.match(unusedExpected.stdout, /expected/);
});

test('validation mode emits JSON offline and never runs configured checks', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-done-check-validate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = baseConfig({ command: "node -e \"require('node:fs').writeFileSync('should-not-run', 'yes')\"" });
  await writeFile(path.join(root, 'agent-done-check.json'), JSON.stringify(config));
  const invokeValidation = (filename = 'agent-done-check.json') => {
    try {
      const stdout = execFileSync(process.execPath, [cliPath, '--validate', '--config', filename], { cwd: root, encoding: 'utf8' });
      return { code: 0, output: JSON.parse(stdout) };
    } catch (error) {
      return { code: error.status, output: JSON.parse(error.stdout.toString()) };
    }
  };
  const valid = invokeValidation();
  assert.equal(valid.code, 0);
  assert.deepEqual(valid.output, { valid: true, configPath: 'agent-done-check.json', criterionCount: 1, checkCount: 1 });
  await assert.rejects(readFile(path.join(root, 'should-not-run')));
  await assert.rejects(readFile(path.join(root, '.agent-done-check/report.json')));

  config.checks[0].command = '';
  await writeFile(path.join(root, 'invalid.json'), JSON.stringify(config));
  const invalid = invokeValidation('invalid.json');
  assert.equal(invalid.code, 2);
  assert.equal(invalid.output.valid, false);
  assert.ok(invalid.output.errors.some((error) => error.includes('command')));

  await writeFile(path.join(root, 'malformed.json'), '{not json');
  const malformed = invokeValidation('malformed.json');
  assert.equal(malformed.code, 2);
  assert.match(malformed.output.errors[0], /^Invalid JSON:/);
});

test('bundle verification works offline and rejects malformed or escaping manifests', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-done-check-bundle-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runId = '123e4567-e89b-42d3-a456-426614174000';
  const commit = 'a'.repeat(40);
  const reportPath = path.join(root, 'report.json');
  const reportText = JSON.stringify({ runId, commit });
  await writeFile(reportPath, reportText);
  const artifact = { role: 'json-report', path: 'report.json', sha256: createHash('sha256').update(reportText).digest('hex'), bytes: Buffer.byteLength(reportText), mediaType: 'application/json' };
  const manifestPath = path.join(root, 'manifest.json');
  const manifest = { schemaVersion: 1, runId, commit, config: { path: 'config.json', sha256: 'b'.repeat(64) }, artifacts: [artifact] };
  await writeFile(manifestPath, JSON.stringify(manifest));
  const valid = invokeBundle(root, manifestPath);
  assert.equal(valid.code, 0, JSON.stringify(valid.output));
  assert.equal(valid.output.artifactsChecked, 1);

  await writeFile(reportPath, `${reportText} `);
  const changed = invokeBundle(root, manifestPath);
  assert.equal(changed.code, 1);
  assert.equal(changed.output.valid, false);
  assert.ok(changed.output.errors.some((error) => error.includes('SHA-256')));

  manifest.artifacts[0].path = '../outside.json';
  await writeFile(manifestPath, JSON.stringify(manifest));
  const traversal = invokeBundle(root, manifestPath);
  assert.equal(traversal.code, 2);
  assert.ok(traversal.output.errors.some((error) => error.includes('escapes')));

  if (process.platform !== 'win32') {
    const outsideDirectory = await mkdtemp(path.join(tmpdir(), 'agent-done-check-outside-'));
    t.after(() => rm(outsideDirectory, { recursive: true, force: true }));
    const outsideFile = path.join(outsideDirectory, 'report.json');
    await writeFile(outsideFile, reportText);
    await symlink(outsideFile, path.join(root, 'linked-report.json'));
    manifest.artifacts[0] = { ...artifact, path: 'linked-report.json' };
    await writeFile(manifestPath, JSON.stringify(manifest));
    const escapedLink = invokeBundle(root, manifestPath);
    assert.equal(escapedLink.code, 1);
    assert.ok(escapedLink.output.errors.some((error) => error.includes('outside')));
  }

  await writeFile(manifestPath, '{broken');
  const malformed = invokeBundle(root, manifestPath);
  assert.equal(malformed.code, 2);
  assert.equal(malformed.output.valid, false);
});

test('SARIF output maps non-passing checks, excludes captured output, and enters the manifest', async (t) => {
  const root = await repository(t);
  const config = {
    version: 1,
    criteria: [{ id: 'acceptance', description: 'Configured outcomes are reported.' }],
    checks: [
      { id: 'pass-check', command: 'node --version', criteria: ['acceptance'] },
      { id: 'fail-check', command: nodeCommand("console.log('sarif-secret-output'); process.exit(1)"), criteria: ['acceptance'] },
      { id: 'unverified-check', type: 'http', url: 'http://127.0.0.1:1/unavailable', criteria: ['acceptance'] },
    ],
  };
  await commitFiles(root, { 'agent-done-check.json': JSON.stringify(config) });
  const result = await invoke(root, ['--sarif-output', '.agent-done-check/results.sarif']);
  assert.equal(result.code, 1, result.stderr || JSON.stringify(result.report?.checks));
  const sarif = JSON.parse(await readFile(path.join(root, '.agent-done-check/results.sarif'), 'utf8'));
  assert.equal(sarif.version, '2.1.0');
  assert.equal(sarif.runs.length, 1);
  const run = sarif.runs[0];
  assert.equal(run.tool.driver.name, 'Agent Done Check');
  assert.equal(run.properties.targetCommit, result.report.commit);
  assert.deepEqual(run.results.map((item) => item.ruleId), ['fail-check', 'unverified-check']);
  assert.deepEqual(run.results.map((item) => item.level), ['error', 'warning']);
  assert.ok(!JSON.stringify(sarif).includes('sarif-secret-output'));
  assert.ok(!JSON.stringify(sarif).includes('stdout'));
  const manifest = JSON.parse(await readFile(path.join(root, '.agent-done-check/manifest.json'), 'utf8'));
  const artifact = manifest.artifacts.find((item) => item.role === 'sarif-report');
  assert.ok(artifact);
  assert.equal(artifact.sha256, createHash('sha256').update(await readFile(path.join(root, '.agent-done-check/results.sarif'))).digest('hex'));
  const verified = invokeBundle(root, path.join(root, '.agent-done-check/manifest.json'));
  assert.equal(verified.code, 0, JSON.stringify(verified.output));
});

test('JUnit XML maps every check safely and enters the manifest', async (t) => {
  const root = await repository(t);
  const config = {
    version: 1,
    criteria: [{ id: 'acceptance', description: '<private>& criterion text' }],
    checks: [
      { id: 'pass-check', command: 'node --version', criteria: ['acceptance'] },
      { id: 'fail-check', command: nodeCommand("console.log('<private>&output'); process.exit(1)"), criteria: ['acceptance'] },
      { id: 'unverified-check', type: 'http', url: 'http://127.0.0.1:1/unavailable', criteria: ['acceptance'] },
    ],
  };
  await commitFiles(root, { 'agent-done-check.json': JSON.stringify(config) });
  const result = await invoke(root, ['--junit-output', '.agent-done-check/results.xml']);
  assert.equal(result.code, 1, result.stderr || JSON.stringify(result.report?.checks));
  const xml = await readFile(path.join(root, '.agent-done-check/results.xml'), 'utf8');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<testsuites tests="3" failures="1" errors="0" skipped="1"/);
  assert.match(xml, /<property name="targetCommit" value="[a-f0-9]{40}"\/>/);
  assert.match(xml, /<testcase classname="agent-done-check" name="pass-check" time="[0-9.]+"\/>/);
  assert.match(xml, /<testcase classname="agent-done-check" name="fail-check" time="[0-9.]+"><failure message="check failed"\/><\/testcase>/);
  assert.match(xml, /<testcase classname="agent-done-check" name="unverified-check" time="[0-9.]+"><skipped message="check unverified"\/><\/testcase>/);
  assert.ok(!xml.includes('<private>'));
  assert.ok(!xml.includes('&output'));
  const manifest = JSON.parse(await readFile(path.join(root, '.agent-done-check/manifest.json'), 'utf8'));
  const artifact = manifest.artifacts.find((item) => item.role === 'junit-report');
  assert.ok(artifact);
  assert.equal(artifact.sha256, createHash('sha256').update(await readFile(path.join(root, '.agent-done-check/results.xml'))).digest('hex'));
  assert.equal(invokeBundle(root, path.join(root, '.agent-done-check/manifest.json')).code, 0);
  const collision = await invoke(root, ['--junit-output', '.agent-done-check/report.json']);
  assert.equal(collision.code, 2);
  assert.match(collision.stderr, /distinct paths/);
});
