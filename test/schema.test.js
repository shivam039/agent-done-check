import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const configSchema = JSON.parse(await readFile(path.join(root, 'schemas/config-v1.schema.json'), 'utf8'));
const reportSchema = JSON.parse(await readFile(path.join(root, 'schemas/report-v2.schema.json'), 'utf8'));
const manifestSchema = JSON.parse(await readFile(path.join(root, 'schemas/manifest-v1.schema.json'), 'utf8'));
const validateConfig = ajv.compile(configSchema);
const validateReport = ajv.compile(reportSchema);
const validateManifest = ajv.compile(manifestSchema);

function assertValid(validate, value, label) {
  assert.equal(validate(value), true, `${label}: ${ajv.errorsText(validate.errors)}`);
}

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

test('shipped command and browser configs conform to config v1 schema', async () => {
  for (const filename of ['agent-done-check.example.json', 'agent-done-check.browser.example.json']) {
    const config = JSON.parse(await readFile(path.join(root, filename), 'utf8'));
    assertValid(validateConfig, config, filename);
  }
  const invalid = { version: 2, criteria: [], checks: [] };
  assert.equal(validateConfig(invalid), false);
});

test('generated report and manifest conform; browser result shape is covered', async (t) => {
  const repository = await mkdtemp(path.join(tmpdir(), 'agent-done-check-schema-'));
  t.after(() => rm(repository, { recursive: true, force: true, maxRetries: 5 }));
  git(repository, 'init', '--quiet');
  git(repository, 'config', 'user.name', 'Agent Done Check Schema Test');
  git(repository, 'config', 'user.email', 'schema@example.invalid');
  const config = {
    version: 1,
    criteria: [{ id: 'runs', description: 'The smoke command runs.' }],
    checks: [{ id: 'smoke', command: 'node --version', criteria: ['runs'] }],
  };
  await writeFile(path.join(repository, 'agent-done-check.json'), `${JSON.stringify(config)}\n`);
  git(repository, 'add', '.');
  git(repository, 'commit', '--quiet', '-m', 'schema fixture');
  execFileSync(process.execPath, [path.join(root, 'bin/agent-done-check.js'), '--config', 'agent-done-check.json'], {
    cwd: repository,
    stdio: 'ignore',
  });

  const output = path.join(repository, '.agent-done-check');
  const report = JSON.parse(await readFile(path.join(output, 'report.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
  assertValid(validateReport, report, 'generated report');
  assertValid(validateManifest, manifest, 'generated manifest');

  const browserReport = structuredClone(report);
  browserReport.checks[0].type = 'playwright';
  browserReport.checks[0].browser = {
    browser: 'chromium',
    url: 'https://example.invalid/',
    setupTimeMs: 0,
    revisionBinding: { status: 'verified', expected: report.commit, observed: report.commit },
    diagnostics: {
      consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [],
      dropped: { consoleErrors: 0, pageErrors: 0, requestFailures: 0, httpErrors: 0 },
    },
    artifacts: [],
  };
  assertValid(validateReport, browserReport, 'browser-shaped report');
});
