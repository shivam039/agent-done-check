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
const reportV2Schema = JSON.parse(await readFile(path.join(root, 'schemas/report-v2.schema.json'), 'utf8'));
const reportV3Schema = JSON.parse(await readFile(path.join(root, 'schemas/report-v3.schema.json'), 'utf8'));
const reportSchema = JSON.parse(await readFile(path.join(root, 'schemas/report-v4.schema.json'), 'utf8'));
const manifestSchema = JSON.parse(await readFile(path.join(root, 'schemas/manifest-v1.schema.json'), 'utf8'));
const validateConfig = ajv.compile(configSchema);
const validateReportV2 = ajv.compile(reportV2Schema);
const validateReportV3 = ajv.compile(reportV3Schema);
const validateReport = ajv.compile(reportSchema);
const validateManifest = ajv.compile(manifestSchema);

function assertValid(validate, value, label) {
  assert.equal(validate(value), true, `${label}: ${ajv.errorsText(validate.errors)}`);
}

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

test('shipped command, browser, file, and HTTP configs conform to config v1 schema', async () => {
  for (const filename of ['agent-done-check.example.json', 'agent-done-check.browser.example.json', 'agent-done-check.file.example.json', 'agent-done-check.http.example.json']) {
    const config = JSON.parse(await readFile(path.join(root, filename), 'utf8'));
    assertValid(validateConfig, config, filename);
  }
  const jsonPointerConfig = {
    version: 1,
    criteria: [{ id: 'json', description: 'The committed JSON value matches.' }],
    checks: [{ id: 'json-value', type: 'file', path: 'data.json', assertion: 'jsonPointerEquals', pointer: '/a~1b/~0key', expected: { ok: true }, criteria: ['json'] }],
  };
  const argvConfig = { version: 1, criteria: [{ id: 'argv', description: 'An executable receives exact arguments.' }], checks: [{ id: 'argv', command: ['node', '-e', 'process.exit(0)', 'a b'], criteria: ['argv'] }] };
  assertValid(validateConfig, argvConfig, 'argv command config');
  argvConfig.checks[0].expectedExitCodes = [0, 7];
  assertValid(validateConfig, argvConfig, 'multiple expected command exit codes');
  argvConfig.checks[0].expectedExitCode = 0;
  assert.equal(validateConfig(argvConfig), false);
  delete argvConfig.checks[0].expectedExitCode;
  argvConfig.checks[0].expectedExitCodes = [0, 0];
  assert.equal(validateConfig(argvConfig), false);
  delete argvConfig.checks[0].expectedExitCodes;
  argvConfig.checks[0].command = [];
  assert.equal(validateConfig(argvConfig), false);
  argvConfig.checks[0].command = ['node', 'x'.repeat(4097)];
  assert.equal(validateConfig(argvConfig), false);
    const httpConfig = JSON.parse(await readFile(path.join(root, 'agent-done-check.http.example.json'), 'utf8'));
  assertValid(validateConfig, httpConfig, 'HTTP body limit config');
  httpConfig.checks[0].expectedStatuses = [200, 204];
  delete httpConfig.checks[0].expectedStatus;
  assertValid(validateConfig, httpConfig, 'multiple HTTP expected statuses');
  httpConfig.checks[0].expectedStatus = 200;
  assert.equal(validateConfig(httpConfig), false);
  delete httpConfig.checks[0].expectedStatus;
  httpConfig.checks[0].type = 'command';
  httpConfig.checks[0].command = 'node --version';
  assert.equal(validateConfig(httpConfig), false);
  httpConfig.checks[0].type = 'http';
  delete httpConfig.checks[0].command;
  delete httpConfig.checks[0].expectedStatus;
  httpConfig.checks[0].expectedStatuses = [200, 200];
  assert.equal(validateConfig(httpConfig), false);
  httpConfig.checks[0].expectedStatuses = [200];
  httpConfig.checks[0].maxBodyBytes = 1;
  assertValid(validateConfig, httpConfig, 'minimum HTTP body limit');
  httpConfig.checks[0].maxBodyBytes = 1048576;
  assertValid(validateConfig, httpConfig, 'maximum HTTP body limit');
  httpConfig.checks[0].maxBodyBytes = 0;
  assert.equal(validateConfig(httpConfig), false);
  httpConfig.checks[0].maxBodyBytes = 1.5;
  assert.equal(validateConfig(httpConfig), false);
  httpConfig.checks[0].maxBodyBytes = 1048577;
  assert.equal(validateConfig(httpConfig), false);
  assertValid(validateConfig, jsonPointerConfig, 'JSON Pointer file config');
  jsonPointerConfig.checks[0] = { id: 'pointer-exists', type: 'file', path: 'data.json', assertion: 'jsonPointerExists', pointer: '/a~1b', criteria: ['json'] };
  assertValid(validateConfig, jsonPointerConfig, 'JSON Pointer existence config');
  jsonPointerConfig.checks[0].expected = null;
  assert.equal(validateConfig(jsonPointerConfig), false);
  delete jsonPointerConfig.checks[0].expected;
  jsonPointerConfig.checks[0] = { id: 'pointer-exists', type: 'file', path: 'data.json', assertion: 'jsonPointerExists', pointer: '/a~1b', criteria: ['json'] };
  assertValid(validateConfig, jsonPointerConfig, 'JSON Pointer existence config');
  jsonPointerConfig.checks[0].expected = null;
  assert.equal(validateConfig(jsonPointerConfig), false);
  delete jsonPointerConfig.checks[0].expected;
  const httpJsonConfig = { version: 1, criteria: [{ id: 'http', description: 'HTTP JSON assertion.' }], checks: [{ id: 'json', type: 'http', url: 'https://example.invalid/data', bodyJsonPointerEquals: { pointer: '/items/0', expected: null }, criteria: ['http'] }] };
  assertValid(validateConfig, httpJsonConfig, 'HTTP JSON Pointer config');
  httpJsonConfig.checks[0].bodyJsonPointerEquals.pointer = '/bad~2';
  assert.equal(validateConfig(httpJsonConfig), false);
  httpJsonConfig.checks[0].bodyJsonPointerEquals.pointer = '';
  httpJsonConfig.checks[0].bodyJsonPointerEquals.extra = true;
  assert.equal(validateConfig(httpJsonConfig), false);
    jsonPointerConfig.checks[0].pointer = '/bad~2escape';
  assert.equal(validateConfig(jsonPointerConfig), false);
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
    criteria: [
      { id: 'runs', description: 'The smoke command runs.' },
      { id: 'file', description: 'The committed file contains the expected marker.' },
    ],
    checks: [
      { id: 'smoke', command: 'node --version', criteria: ['runs'] },
      { id: 'file-marker', type: 'file', path: 'fixture.txt', assertion: 'contains', expected: 'schema fixture', criteria: ['file'] },
    ],
  };
  await writeFile(path.join(repository, 'agent-done-check.json'), `${JSON.stringify(config)}\n`);
  await writeFile(path.join(repository, 'fixture.txt'), 'schema fixture\n');
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
  assertValid(validateReportV3, { ...report, schemaVersion: 3 }, 'backward-compatible report v3 fixture');
  assertValid(validateReportV2, { ...report, schemaVersion: 2, checks: report.checks.filter((check) => check.type !== 'file'), criteria: [report.criteria[0]] }, 'backward-compatible report v2 fixture');

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


test('HTTP report schema describes nullable match results while staying backward compatible', () => {
  const originalHttp = {
    url: 'https://example.invalid/health', expectedStatus: 200, statusCode: 200,
    commitHeader: 'x-agent-done-check-commit', revisionBinding: 'verified',
    bodyBytes: 0, bodySha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    bodyTruncated: false, bodyContainsMatched: null,
    bodyJsonPointerExistsMatched: null, bodyEqualsMatched: null,
  };
  const report = {
    schemaVersion: 4, tool: { name: 'agent-done-check', version: '0.21.0' }, runId: '00000000-0000-4000-8000-000000000000',
    status: 'passed', repository: 'https://example.invalid/repo', commit: 'a'.repeat(40),
    startedAt: '2026-09-27T00:00:00.000Z', completedAt: '2026-09-27T00:00:01.000Z',
    reproducibility: { configPath: 'config.json', configSha256: 'a'.repeat(64), node: 'v22.0.0', platform: 'linux', arch: 'x64', locale: 'en', timezone: 'UTC' },
    criteria: [], checks: [{ id: 'http-check', type: 'http', criteria: [], status: 'passed', startedAt: '2026-09-27T00:00:00.000Z', http: originalHttp }],
  };
  assertValid(validateReport, report, 'older v4 HTTP report');
  report.checks[0].outputAssertions = { stdoutEqualsMatched: null, stderrEqualsMatched: true };
  assertValid(validateReport, report, 'v4 report with exact command output assertion evidence');
  report.checks[0].outputAssertions = { stdoutEqualsMatched: false, stderrEqualsMatched: false };
  assertValid(validateReport, report, 'v4 report with failed exact output assertions');
  delete report.checks[0].outputAssertions;
  report.checks[0].http.responseHeadersMatched = null;
  report.checks[0].http.responseHeadersPresent = null;
  report.checks[0].http.contentTypeMatched = null;
  report.checks[0].http.contentType = null;
  report.checks[0].http.bodySha256Matched = null;
  assertValid(validateReport, report, 'HTTP report without assertions');
  report.checks[0].http.expectedStatuses = [200, 204];
  report.checks[0].http.expectedStatus = 200;
  report.checks[0].http.responseHeadersMatched = { 'x-mode': true };
  report.checks[0].http.responseHeadersPresent = { 'content-type': true };
  report.checks[0].http.contentTypeMatched = true;
  report.checks[0].http.contentType = 'application/json';
  report.checks[0].http.bodySha256Matched = true;
  report.checks[0].http.bodyJsonPointerMatched = true;
  report.checks[0].http.bodyJsonPointerExistsMatched = true;
  report.checks[0].http.bodyEqualsMatched = true;
  assertValid(validateReport, report, 'HTTP report with matching assertions');
  report.checks[0].http.responseHeadersMatched = { 'x-mode': false };
  report.checks[0].http.bodySha256Matched = false;
  report.checks[0].http.bodyJsonPointerMatched = false;
  report.checks[0].http.bodyJsonPointerExistsMatched = false;
  report.checks[0].http.bodyEqualsMatched = false;
  assertValid(validateReport, report, 'HTTP report with failed assertions');
  report.checks[0].http.responseHeadersMatched = { 'bad name': true };
  assert.equal(validateReport(report), false);
});
