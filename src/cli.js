import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile, rm, rename, stat, realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const VERSION = require('../package.json').version;
const MAX_OUTPUT = 24_000;
const MAX_TIMEOUT = 1_800_000;
const MAX_CONFIG_BYTES = 1_048_576;
const MAX_FILE_CHECK_BYTES = 1_048_576;
const MAX_HTTP_BODY_BYTES = 1_048_576;
const MAX_VIEWPORT_PIXELS = 16_000_000;
const MAX_CRITERIA = 500;
const MAX_CHECKS = 100;
const MAX_STEPS = 500;
const BASE_ENV_KEYS = process.platform === 'win32'
  ? ['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'CI']
  : ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'CI'];
const GIT_OVERRIDE_KEYS = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS',
];
const PROTECTED_ENV_KEYS = new Set([
  'GITHUB_TOKEN', 'GH_TOKEN', 'ACTIONS_RUNTIME_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  'ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_RESULTS_URL', 'ACTIONS_CACHE_URL', 'ACTIONS_RUNTIME_URL',
  'NODE_AUTH_TOKEN', 'NPM_TOKEN',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function displayUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return '[invalid URL]';
  }
}

function portablePath(value) {
  return value.split(path.sep).join('/');
}

function markdownHref(value) {
  return portablePath(value).split('/').map((part) => part === '..' || part === '.' ? part : encodeURIComponent(part)).join('/');
}

function markdownText(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('|', '\\|')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replaceAll('`', '\\`')
    .replaceAll('*', '\\*')
    .replaceAll('_', '\\_')
    .replaceAll('\r', ' ')
    .replaceAll('\n', ' ');
}

function markdownCode(value) {
  const text = String(value).replaceAll('\r', ' ').replaceAll('\n', ' ');
  const runs = text.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(1, ...runs.map((run) => run.length + 1)));
  return `${fence}${text}${fence}`;
}

function shellFor(command) {
  return process.platform === 'win32'
    ? ['cmd.exe', ['/d', '/s', '/c', command]]
    : ['/bin/sh', ['-lc', command]];
}

function verificationEnv(config, commit) {
  const normalizeKey = (key) => process.platform === 'win32' ? key.toLowerCase() : key;
  const allowedKeys = new Set([...BASE_ENV_KEYS, ...(config.inheritEnv ?? [])]
    .filter((key) => !PROTECTED_ENV_KEYS.has(key.toUpperCase()))
    .map(normalizeKey));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowedKeys.has(process.platform === 'win32' ? key.toLowerCase() : key)));
  Object.assign(env, config.env ?? {});
  for (const key of GIT_OVERRIDE_KEYS) delete env[key];
  env.GIT_NO_REPLACE_OBJECTS = '1';
  env.AGENT_DONE_CHECK_TARGET_COMMIT = commit;
  return env;
}

function redactionValues(config) {
  const values = new Set();
  const add = (value) => {
    if (typeof value === 'string' && value.length >= 4) values.add(value);
  };
  for (const key of config.redactEnv ?? []) {
    const hostValue = process.env[key] ?? (process.platform === 'win32'
      ? Object.entries(process.env).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1]
      : undefined);
    add(hostValue);
    add(config.env?.[key]);
  }
  for (const check of config.checks ?? []) for (const step of check.steps ?? []) add(step.value);
  return [...values].sort((a, b) => b.length - a.length);
}

function redactString(value, values) {
  let text = String(value ?? '')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, '[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]');
  for (const secret of values) text = text.replaceAll(secret, '[REDACTED]');
  return text;
}

function redactResult(result, values) {
  for (const key of ['stdout', 'stderr', 'error']) {
    if (typeof result[key] === 'string') result[key] = redactString(result[key], values);
  }
  return result;
}

async function runGit(cwd, args) {
  const env = { ...process.env };
  for (const key of GIT_OVERRIDE_KEYS) delete env[key];
  env.GIT_NO_REPLACE_OBJECTS = '1';
  return run('git', args, { cwd, env });
}

async function runGitRaw(cwd, args, outputLimit) {
  const env = { ...process.env };
  for (const key of GIT_OVERRIDE_KEYS) delete env[key];
  env.GIT_NO_REPLACE_OBJECTS = '1';
  return run('git', args, { cwd, env, outputLimit, rawStdout: true });
}

function signalTree(child, signal) {
  if (process.platform === 'win32') {
    const killed = new Promise((resolve) => {
      if (!child.pid) { resolve(); return; }
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      const finish = () => {
        if (!child.killed) child.kill(signal);
        resolve();
      };
      killer.once('error', finish);
      killer.once('close', finish);
    });
    return killed;
  }
  try {
    if (child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    child.kill(signal);
  }
  return Promise.resolve();
}

async function writeAtomic(filename, content, runId) {
  const temporary = `${filename}.${runId}.tmp`;
  try {
    await writeFile(temporary, content, { flag: 'wx' });
    await rename(temporary, filename);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function hashFile(filename) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(filename)) {
    bytes += chunk.byteLength;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest('hex') };
}

async function verifyBundle(manifestPath, root) {
  const displayPath = path.relative(root, manifestPath);
  let manifest;
  try {
    const info = await stat(manifestPath);
    if (info.size > MAX_CONFIG_BYTES) throw new Error(`Manifest exceeds the ${MAX_CONFIG_BYTES}-byte limit.`);
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    return { code: 2, output: { valid: false, manifestPath: displayPath, runId: null, commit: null, artifactsChecked: 0, errors: [`Cannot read a valid manifest: ${error.message}`] } };
  }
  const invalid = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) invalid.push('Manifest must be a JSON object.');
  else {
    if (manifest.schemaVersion !== 1) invalid.push('Manifest schemaVersion must be 1.');
    if (typeof manifest.runId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(manifest.runId)) invalid.push('Manifest runId must be a UUID.');
    if (typeof manifest.commit !== 'string' || !/^[a-f0-9]{40,64}$/.test(manifest.commit)) invalid.push('Manifest commit must be a full hexadecimal Git SHA.');
    if (!manifest.config || typeof manifest.config !== 'object' || typeof manifest.config.path !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.config.sha256)) invalid.push('Manifest config must contain a path and SHA-256.');
    if (!Array.isArray(manifest.artifacts)) invalid.push('Manifest artifacts must be an array.');
  }
  if (invalid.length) return { code: 2, output: { valid: false, manifestPath: displayPath, runId: manifest?.runId ?? null, commit: manifest?.commit ?? null, artifactsChecked: 0, errors: invalid } };
  const reportArtifacts = manifest.artifacts.filter((artifact) => artifact?.role === 'json-report');
  if (reportArtifacts.length !== 1) invalid.push('Manifest must list exactly one json-report artifact.');
  const seen = new Set();
  for (const [index, artifact] of manifest.artifacts.entries()) {
    if (!artifact || typeof artifact !== 'object' || typeof artifact.role !== 'string' || typeof artifact.mediaType !== 'string'
      || typeof artifact.path !== 'string' || !artifact.path || !/^[a-f0-9]{64}$/.test(artifact.sha256)
      || !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0) {
      invalid.push(`Artifact ${index} has invalid required fields.`); continue;
    }
    if (path.isAbsolute(artifact.path) || path.win32.isAbsolute(artifact.path)) invalid.push(`Artifact ${index} path must be relative.`);
    const resolved = path.resolve(path.dirname(manifestPath), artifact.path);
    const relative = path.relative(path.dirname(manifestPath), resolved);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) invalid.push(`Artifact ${index} path escapes the manifest directory.`);
    if (seen.has(artifact.path)) invalid.push(`Artifact path is duplicated: ${artifact.path}`);
    seen.add(artifact.path);
  }
  if (invalid.length) return { code: 2, output: { valid: false, manifestPath: displayPath, runId: manifest.runId, commit: manifest.commit, artifactsChecked: 0, errors: invalid } };

  const errors = [];
  let artifactsChecked = 0;
  let realRoot;
  try { realRoot = await realpath(path.dirname(manifestPath)); }
  catch (error) { return { code: 2, output: { valid: false, manifestPath: displayPath, runId: manifest.runId, commit: manifest.commit, artifactsChecked, errors: [`Cannot resolve manifest directory: ${error.message}`] } }; }
  let report;
  for (const artifact of manifest.artifacts) {
    const file = path.resolve(path.dirname(manifestPath), artifact.path);
    try {
      const actual = await realpath(file);
      const relative = path.relative(realRoot, actual);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        errors.push(`Artifact path resolves outside the manifest directory: ${artifact.path}`); continue;
      }
      const info = await stat(actual);
      if (!info.isFile()) { errors.push(`Artifact is not a regular file: ${artifact.path}`); continue; }
      const digest = await hashFile(actual);
      artifactsChecked += 1;
      if (digest.bytes !== artifact.bytes) errors.push(`Artifact byte count does not match: ${artifact.path}`);
      if (digest.sha256 !== artifact.sha256) errors.push(`Artifact SHA-256 does not match: ${artifact.path}`);
      if (artifact.role === 'json-report') {
        if (digest.bytes > 16 * 1024 * 1024) errors.push('JSON report artifact exceeds the 16 MiB parsing limit.');
        else {
          try { report = JSON.parse(await readFile(actual, 'utf8')); }
          catch { errors.push('JSON report artifact is not valid JSON.'); }
        }
      }
    } catch (error) { errors.push(`Cannot verify artifact ${artifact.path}: ${error.message}`); }
  }
  if (!report || report.runId !== manifest.runId) errors.push('JSON report runId does not match the manifest.');
  if (!report || report.commit !== manifest.commit) errors.push('JSON report commit does not match the manifest.');
  return { code: errors.length ? 1 : 0, output: { valid: errors.length === 0, manifestPath: displayPath, runId: manifest.runId, commit: manifest.commit, artifactsChecked, errors } };
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--version' || arg === '-v') options.version = true;
    else if (arg === '--validate') options.validate = true;
    else if (arg === '--verify-bundle') options.verifyBundle = true;
    else if (['--config', '--commit', '--output', '--markdown-output', '--manifest', '--sarif-output', '--junit-output'].includes(arg)) {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Expected a value after ${arg}`);
      options[arg.slice(2)] = argv[++i];
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.validate && options.verifyBundle) throw new Error('--validate and --verify-bundle cannot be used together.');
  return options;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { timeoutMs, input, outputLimit = MAX_OUTPUT, rawStdout = false, ...spawnOptions } = options;
    const detached = process.platform !== 'win32';
    const child = spawn(command, args, { ...spawnOptions, detached, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let settled = false;
    let timer;
    const append = (current, chunk, stream) => {
      const combined = Buffer.concat([current, chunk]);
      if (combined.byteLength > outputLimit) {
        if (stream === 'stdout') stdoutTruncated = true;
        else stderrTruncated = true;
      }
      const firstByte = Math.max(0, combined.byteLength - outputLimit);
      return combined.subarray(firstByte);
    };
    const snapshot = (code, signal) => ({ code, signal, stdout: rawStdout ? stdout : stdout.toString('utf8'), stderr: stderr.toString('utf8'), stdoutTruncated, stderrTruncated });
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk, 'stdout'); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk, 'stderr'); });
    child.stdin.on('error', (error) => {
      if (error.code === 'EPIPE') return;
      if (settled) return;
      settled = true;
      clearTimeout(timer);
        signalTree(child, 'SIGTERM');
        reject(error);
    });
    child.stdin.end(input ?? '');
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (process.platform !== 'win32') signalTree(child, 'SIGTERM');
      resolve(snapshot(code, signal));
    });
    if (timeoutMs) {
      timer = setTimeout(async () => {
        settled = true;
        await signalTree(child, 'SIGTERM');
        if (process.platform !== 'win32') setTimeout(() => signalTree(child, 'SIGKILL'), 1500).unref();
        resolve(snapshot(null, 'TIMEOUT'));
      }, timeoutMs);
    }
  });
}

async function git(cwd, ...args) {
  const result = await runGit(cwd, args);
  if (result.code !== 0) throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

async function worktreeMutation(cwd, expectedCommit) {
  const head = await git(cwd, 'rev-parse', 'HEAD');
  if (head !== expectedCommit) return 'HEAD changed';
  const tracked = await runGit(cwd, ['diff', '--quiet', expectedCommit, '--']);
  if (tracked.code === 1) return 'tracked files changed';
  if (tracked.code !== 0) throw new Error(tracked.stderr.trim() || 'Could not inspect tracked-file changes.');
  const untracked = await runGit(cwd, ['ls-files', '--others', '--exclude-standard', '-z']);
  if (untracked.code !== 0) throw new Error(untracked.stderr.trim() || 'Could not inspect untracked files.');
  if (untracked.stdout.length > 0 || untracked.stdoutTruncated) return 'non-ignored untracked files were created';
  return null;
}

async function runFileCheck(repository, commit, check) {
  const parts = check.path.split(/[\\/]/);
  const file = { path: check.path, assertion: check.assertion, exists: false, bytes: null, sha256: null, matched: false };
  let prefix = '';
  let blob;
  for (const [index, part] of parts.entries()) {
    prefix = prefix ? `${prefix}/${part}` : part;
    const listing = await runGitRaw(repository, ['--literal-pathspecs', 'ls-tree', '-z', '--full-tree', commit, '--', prefix], 8192);
    if (listing.code !== 0) return { status: 'unverified', error: 'The requested file could not be inspected in the verified commit.', file };
    const records = listing.stdout.toString('utf8').split('\0').filter(Boolean);
    const record = records.find((item) => item.slice(item.indexOf('\t') + 1) === prefix);
    if (!record) return { status: 'failed', error: 'The requested file does not exist in the verified commit.', file };
    const [mode, objectType, oid] = record.slice(0, record.indexOf('\t')).split(' ');
    file.exists = true;
    if (mode === '120000') return { status: 'unverified', error: 'Symbolic links are not supported by file checks.', file };
    if (index < parts.length - 1) {
      if (objectType !== 'tree' || mode !== '040000') return { status: 'unverified', error: 'A path component is not a regular directory in the verified commit.', file };
    } else if (objectType !== 'blob' || !['100644', '100755'].includes(mode)) {
      return { status: 'unverified', error: 'The requested path is not a regular file in the verified commit.', file };
    } else blob = oid;
  }
  const size = await git(repository, 'cat-file', '-s', blob);
  file.bytes = Number(size);
  if (!Number.isSafeInteger(file.bytes) || file.bytes < 0) return { status: 'unverified', error: 'The requested file size could not be read.', file };
  if (file.bytes > MAX_FILE_CHECK_BYTES) return { status: 'unverified', error: `The requested file exceeds the ${MAX_FILE_CHECK_BYTES}-byte limit.`, file };
  const read = await runGitRaw(repository, ['cat-file', 'blob', blob], MAX_FILE_CHECK_BYTES + 1);
  if (read.code !== 0 || read.stdoutTruncated || read.stdout.byteLength > MAX_FILE_CHECK_BYTES) return { status: 'unverified', error: 'The requested file could not be read within the size limit.', file };
  const bytes = read.stdout;
  file.bytes = bytes.byteLength;
  file.sha256 = sha256(bytes);
  if (check.assertion === 'exists') file.matched = true;
  else if (check.assertion === 'sha256') file.matched = file.sha256 === check.expected;
  else {
    let contents;
    try { contents = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { return { status: 'unverified', error: 'Text assertions require valid UTF-8 content.', file }; }
    file.matched = check.assertion === 'equals' ? contents === check.expected : contents.includes(check.expected);
  }
  return { status: file.matched ? 'passed' : 'failed', error: file.matched ? undefined : 'The file did not satisfy the configured assertion.', file };
}

async function runHttpCheck(commit, check, timeoutMs) {
  const url = new URL(check.url);
  const commitHeader = (check.commitHeader ?? 'x-agent-done-check-commit').toLowerCase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const evidence = { url: displayUrl(check.url), expectedStatus: check.expectedStatus ?? 200, statusCode: null,
    commitHeader, revisionBinding: 'missing', bodyBytes: null, bodySha256: null, bodyTruncated: false, bodyContainsMatched: null };
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'error', signal: controller.signal });
    evidence.statusCode = response.status;
    const observedCommit = response.headers.get(commitHeader);
    if (observedCommit !== commit) {
      evidence.revisionBinding = observedCommit === null ? 'missing' : 'mismatch';
      await response.body?.cancel();
      return { status: 'unverified', error: 'The HTTP response did not prove it serves the requested commit.', http: evidence };
    }
    evidence.revisionBinding = 'verified';
    const reader = response.body?.getReader();
    const chunks = [];
    let bytes = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      chunks.push(Buffer.from(value));
      if (bytes > MAX_HTTP_BODY_BYTES) {
        evidence.bodyBytes = bytes;
        evidence.bodyTruncated = true;
        await reader.cancel();
        return { status: 'unverified', error: `The HTTP response exceeds the ${MAX_HTTP_BODY_BYTES}-byte limit.`, http: evidence };
      }
    }
    const body = Buffer.concat(chunks);
    evidence.bodyBytes = body.byteLength;
    evidence.bodySha256 = sha256(body);
    if (typeof check.bodyContains === 'string') {
      let content;
      try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body); }
      catch { return { status: 'unverified', error: 'The HTTP response body is not valid UTF-8 for bodyContains.', http: evidence }; }
      evidence.bodyContainsMatched = content.includes(check.bodyContains);
    }
    const matched = response.status === evidence.expectedStatus && evidence.bodyContainsMatched !== false;
    return { status: matched ? 'passed' : 'failed', error: matched ? undefined : 'The bound HTTP response did not satisfy the configured assertion.', http: evidence };
  } catch {
    return { status: 'unverified', error: controller.signal.aborted ? 'The HTTP request timed out.' : 'The HTTP request could not be completed safely.', http: evidence };
  } finally { clearTimeout(timer); }
}

function unavailableHttpResult(check) {
  return { url: displayUrl(check.url), expectedStatus: check.expectedStatus ?? 200, statusCode: null,
    commitHeader: (check.commitHeader ?? 'x-agent-done-check-commit').toLowerCase(), revisionBinding: 'missing',
    bodyBytes: null, bodySha256: null, bodyTruncated: false, bodyContainsMatched: null };
}

function sarifReport(report) {
  const findings = report.checks.filter((check) => check.status !== 'passed');
  const rules = findings.map((check) => ({ id: check.id, shortDescription: { text: 'Configured acceptance check' } }));
  const ruleIndexes = new Map(rules.map((rule, index) => [rule.id, index]));
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'Agent Done Check', version: VERSION, informationUri: 'https://github.com/shivam039/agent-done-check', rules } },
      results: findings.map((check) => ({ ruleId: check.id, ruleIndex: ruleIndexes.get(check.id), level: check.status === 'failed' ? 'error' : 'warning',
        message: { text: `Check ${check.id} ${check.status}.` },
        properties: { checkId: check.id, criteria: check.criteria, status: check.status, targetCommit: report.commit } })),
      properties: { targetCommit: report.commit, runId: report.runId },
    }],
  };
}

function xmlEscape(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function junitReport(report) {
  const failed = report.checks.filter((check) => check.status === 'failed').length;
  const skipped = report.checks.filter((check) => check.status === 'unverified').length;
  const totalMs = report.checks.reduce((sum, check) => sum + (check.durationMs ?? 0), 0);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites tests="${report.checks.length}" failures="${failed}" errors="0" skipped="${skipped}" time="${(totalMs / 1000).toFixed(3)}">`,
    `  <testsuite name="Agent Done Check" tests="${report.checks.length}" failures="${failed}" errors="0" skipped="${skipped}" time="${(totalMs / 1000).toFixed(3)}" timestamp="${xmlEscape(report.startedAt)}">`,
    '    <properties>',
    `      <property name="runId" value="${xmlEscape(report.runId)}"/>`,
    `      <property name="targetCommit" value="${xmlEscape(report.commit)}"/>`,
    '    </properties>',
  ];
  for (const check of report.checks) {
    const base = `    <testcase classname="agent-done-check" name="${xmlEscape(check.id)}" time="${((check.durationMs ?? 0) / 1000).toFixed(3)}"`;
    if (check.status === 'failed') lines.push(`${base}><failure message="check failed"/></testcase>`);
    else if (check.status === 'unverified') lines.push(`${base}><skipped message="check unverified"/></testcase>`);
    else lines.push(`${base}/>`);
  }
  lines.push('  </testsuite>', '</testsuites>', '');
  return lines.join('\n');
}

function validate(config) {
  const errors = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Config must be a JSON object.');
  if (config.version !== 1) errors.push('version: must be 1.');
  if (typeof config.timeoutMs !== 'undefined' && (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 1000 || config.timeoutMs > MAX_TIMEOUT)) {
    errors.push(`timeoutMs: must be an integer between 1000 and ${MAX_TIMEOUT}.`);
  }
  if (typeof config.env !== 'undefined') {
    if (!config.env || typeof config.env !== 'object' || Array.isArray(config.env)) errors.push('env: must be an object of string values.');
    else for (const [key, value] of Object.entries(config.env)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) errors.push(`env.${key}: invalid environment variable name.`);
      if (typeof value !== 'string') errors.push(`env.${key}: value must be a string.`);
    }
  }
  for (const field of ['inheritEnv', 'redactEnv']) {
    if (typeof config[field] === 'undefined') continue;
    if (!Array.isArray(config[field])) errors.push(`${field}: must be an array of environment variable names.`);
    else {
      if (new Set(config[field]).size !== config[field].length) errors.push(`${field}: duplicate environment variable name.`);
      for (const [index, key] of config[field].entries()) {
        if (typeof key !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) errors.push(`${field}[${index}]: invalid environment variable name.`);
        else if (field === 'inheritEnv' && PROTECTED_ENV_KEYS.has(key.toUpperCase())) errors.push(`${field}[${index}]: this runner credential/control variable cannot be inherited.`);
      }
    }
  }
  if (!Array.isArray(config.criteria) || config.criteria.length === 0) errors.push('criteria: define at least one criterion.');
  else if (config.criteria.length > MAX_CRITERIA) errors.push(`criteria: no more than ${MAX_CRITERIA} criteria are allowed.`);
  if (!Array.isArray(config.checks) || config.checks.length === 0) errors.push('checks: define at least one check.');
  else if (config.checks.length > MAX_CHECKS) errors.push(`checks: no more than ${MAX_CHECKS} checks are allowed.`);
  const criteriaIds = new Set();
  for (const [index, criterion] of (Array.isArray(config.criteria) ? config.criteria : []).entries()) {
    const at = `criteria[${index}]`;
    if (!criterion || typeof criterion !== 'object' || Array.isArray(criterion)) { errors.push(`${at}: must be an object.`); continue; }
    if (typeof criterion.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(criterion.id)) errors.push(`${at}.id: use letters, numbers, dot, underscore, or hyphen; start with a letter or number.`);
    else if (criteriaIds.has(criterion.id)) errors.push(`${at}.id: duplicate criterion id "${criterion.id}".`);
    else criteriaIds.add(criterion.id);
    if (typeof criterion.description !== 'string' || !criterion.description.trim()) errors.push(`${at}.description: must be a non-empty string.`);
  }
  const checkIds = new Set();
  for (const [index, check] of (Array.isArray(config.checks) ? config.checks : []).entries()) {
    const at = `checks[${index}]`;
    if (!check || typeof check !== 'object' || Array.isArray(check)) { errors.push(`${at}: must be an object.`); continue; }
    if (typeof check.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(check.id)) errors.push(`${at}.id: use letters, numbers, dot, underscore, or hyphen; start with a letter or number.`);
    else if (checkIds.has(check.id)) errors.push(`${at}.id: duplicate check id "${check.id}".`);
    else checkIds.add(check.id);
    const checkType = check.type ?? 'command';
    if (!['command', 'playwright', 'file', 'http'].includes(checkType)) errors.push(`${at}.type: expected "command", "playwright", "file", or "http".`);
    if (checkType === 'command' && (typeof check.command !== 'string' || !check.command.trim())) errors.push(`${at}.command: must be a non-empty string.`);
    if (checkType === 'file') {
      if (typeof check.path !== 'string' || !check.path.trim() || check.path.includes('\0') || path.isAbsolute(check.path) || path.win32.isAbsolute(check.path) || path.win32.parse(check.path).root || check.path.split(/[\\/]/).some((part) => part === '..' || part === '.' || part === '')) errors.push(`${at}.path: must be a normalized relative path inside the verified worktree.`);
      if (!['exists', 'equals', 'contains', 'sha256'].includes(check.assertion)) errors.push(`${at}.assertion: expected exists, equals, contains, or sha256.`);
      if (['equals', 'contains', 'sha256'].includes(check.assertion) && typeof check.expected !== 'string') errors.push(`${at}.expected: must be a string for ${check.assertion}.`);
      if (check.assertion === 'sha256' && typeof check.expected === 'string' && !/^[a-f0-9]{64}$/.test(check.expected)) errors.push(`${at}.expected: sha256 requires a 64-character lowercase hexadecimal digest.`);
      if (check.assertion === 'exists' && typeof check.expected !== 'undefined') errors.push(`${at}.expected: is not used with the exists assertion.`);
    }
    if (checkType === 'http') {
      let parsed;
      try { parsed = new URL(check.url); } catch { /* Report below. */ }
      if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) errors.push(`${at}.url: must be an absolute HTTP(S) URL without embedded credentials.`);
      if (typeof check.expectedStatus !== 'undefined' && (!Number.isInteger(check.expectedStatus) || check.expectedStatus < 100 || check.expectedStatus > 599)) errors.push(`${at}.expectedStatus: must be an HTTP status integer from 100 to 599.`);
      if (typeof check.commitHeader !== 'undefined' && (typeof check.commitHeader !== 'string' || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(check.commitHeader))) errors.push(`${at}.commitHeader: must be a valid HTTP header name.`);
      if (typeof check.bodyContains !== 'undefined' && typeof check.bodyContains !== 'string') errors.push(`${at}.bodyContains: must be a string.`);
      if (typeof check.command !== 'undefined' || typeof check.headers !== 'undefined' || typeof check.method !== 'undefined' || typeof check.body !== 'undefined') errors.push(`${at}: HTTP checks accept only GET requests and do not accept command, headers, method, or body fields.`);
    }
    if (checkType === 'playwright') {
      let validUrl = false;
      if (typeof check.url === 'string') {
        try {
          const url = new URL(check.url);
          validUrl = ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
        } catch { /* Report the field error below. */ }
      }
      if (!validUrl) errors.push(`${at}.url: must be a valid absolute HTTP(S) URL.`);
      if (typeof check.commitAssertion !== 'undefined') {
        if (!check.commitAssertion || typeof check.commitAssertion !== 'object' || Array.isArray(check.commitAssertion)) errors.push(`${at}.commitAssertion: must be an object.`);
        else {
          if (typeof check.commitAssertion.selector !== 'string' || !check.commitAssertion.selector.trim()) errors.push(`${at}.commitAssertion.selector: must identify a DOM element containing the verified full commit SHA.`);
          if (typeof check.commitAssertion.attribute !== 'undefined' && (typeof check.commitAssertion.attribute !== 'string' || !check.commitAssertion.attribute.trim())) errors.push(`${at}.commitAssertion.attribute: must be a non-empty DOM attribute name.`);
        }
      }
      if (!Array.isArray(check.steps) || check.steps.length === 0) errors.push(`${at}.steps: define at least one browser step.`);
      else if (check.steps.length > MAX_STEPS) errors.push(`${at}.steps: no more than ${MAX_STEPS} browser steps are allowed.`);
      else for (const [stepIndex, step] of check.steps.entries()) {
        const stepAt = `${at}.steps[${stepIndex}]`;
        const actions = ['click', 'fill', 'check', 'uncheck', 'selectOption', 'press', 'expectVisible', 'expectHidden', 'expectText', 'expectValue', 'expectUrl'];
        if (!step || typeof step !== 'object' || Array.isArray(step)) { errors.push(`${stepAt}: must be an object.`); continue; }
        if (!actions.includes(step.action)) errors.push(`${stepAt}.action: unsupported browser action.`);
        if (step.action !== 'expectUrl' && (typeof step.selector !== 'string' || !step.selector.trim())) errors.push(`${stepAt}.selector: required for this action.`);
        if (['fill', 'selectOption', 'press', 'expectText', 'expectValue', 'expectUrl'].includes(step.action) && typeof step.value !== 'string') errors.push(`${stepAt}.value: must be a string for ${step.action}.`);
        if (typeof step.exact !== 'undefined' && typeof step.exact !== 'boolean') errors.push(`${stepAt}.exact: must be boolean.`);
      }
      if (typeof check.setupCommand !== 'undefined' && (typeof check.setupCommand !== 'string' || !check.setupCommand.trim())) errors.push(`${at}.setupCommand: must be a non-empty string when provided.`);
      if (typeof check.browser !== 'undefined' && !['chromium', 'firefox', 'webkit'].includes(check.browser)) errors.push(`${at}.browser: expected chromium, firefox, or webkit.`);
      if (typeof check.waitUntil !== 'undefined' && !['load', 'domcontentloaded', 'networkidle', 'commit'].includes(check.waitUntil)) errors.push(`${at}.waitUntil: unsupported navigation wait condition.`);
      for (const flag of ['failOnPageError', 'failOnConsoleError', 'failOnRequestFailure', 'failOnHttpError', 'screenshot']) {
        if (typeof check[flag] !== 'undefined' && typeof check[flag] !== 'boolean') errors.push(`${at}.${flag}: must be boolean.`);
      }
      if (typeof check.viewport !== 'undefined' && (!check.viewport || !Number.isInteger(check.viewport.width) || !Number.isInteger(check.viewport.height) || check.viewport.width < 1 || check.viewport.height < 1 || check.viewport.width > 16384 || check.viewport.height > 16384 || check.viewport.width * check.viewport.height > MAX_VIEWPORT_PIXELS)) {
        errors.push(`${at}.viewport: dimensions must be positive integers, at most 16384 each, with a combined area no larger than ${MAX_VIEWPORT_PIXELS} pixels.`);
      }
    }
    if (typeof check.timeoutMs !== 'undefined' && (!Number.isInteger(check.timeoutMs) || check.timeoutMs < 1000 || check.timeoutMs > MAX_TIMEOUT)) {
      errors.push(`${at}.timeoutMs: must be an integer between 1000 and ${MAX_TIMEOUT}.`);
    }
    if (!Array.isArray(check.criteria) || check.criteria.length === 0) errors.push(`${at}.criteria: define at least one criterion id.`);
    else {
      if (new Set(check.criteria).size !== check.criteria.length) errors.push(`${at}.criteria: duplicate criterion reference.`);
      for (const id of check.criteria) if (typeof id !== 'string' || !criteriaIds.has(id)) errors.push(`${at}.criteria: unknown criterion id ${JSON.stringify(id)}.`);
    }
  }
  if (errors.length) throw new Error(`Invalid verification config:\n${errors.map((error) => `  - ${error}`).join('\n')}`);
}

function markdownReport(report, evidenceFiles, manifestPath) {
  const relativeEvidence = (checkId, stream) => {
    const item = evidenceFiles.find((file) => file.checkId === checkId && file.stream === stream);
    return item ? `[${stream}](${markdownHref(item.path)})` : '';
  };
  const table = (values) => values.map(markdownText).join(' | ');
  const lines = [
    '# Agent Done Check verification report', '',
    `**Result: ${report.status.toUpperCase()}**`, '',
    `- Repository: ${markdownCode(report.repository)}`,
    `- Commit: ${markdownCode(report.commit)}`,
    `- Run: ${markdownCode(report.runId)}`,
    `- Started: ${report.startedAt}`,
    `- Completed: ${report.completedAt}`,
    `- Config SHA-256: ${markdownCode(report.reproducibility.configSha256)}`,
    `- Runtime: Node ${report.reproducibility.node} on ${report.reproducibility.platform}/${report.reproducibility.arch}`, '',
    '## Acceptance criteria', '',
    '| Status | ID | Criterion | Checks |', '| --- | --- | --- | --- |',
  ];
  for (const criterion of report.criteria) lines.push(`| ${criterion.status.toUpperCase()} | ${criterion.id} | ${table([criterion.description])} | ${criterion.checks.join(', ') || 'none'} |`);
  lines.push('', '## Checks', '', '| Status | ID | Exit | Duration | Evidence |', '| --- | --- | --- | ---: | --- |');
  for (const check of report.checks) {
    const evidence = [relativeEvidence(check.id, 'stdout'), relativeEvidence(check.id, 'stderr'), relativeEvidence(check.id, 'browser-screenshot')].filter(Boolean).join(' · ') || 'none';
    lines.push(`| ${check.status.toUpperCase()} | ${check.id} | ${check.exitCode ?? check.signal ?? '—'} | ${check.durationMs ?? '—'} ms | ${evidence} |`);
    if (check.error) lines.push('', `**${check.id} error:** ${markdownText(check.error)}`);
    if (check.browser?.revisionBinding) {
      lines.push('', `Target commit binding: ${markdownText(check.browser.revisionBinding.status)}.`);
    }
    if (check.file) {
      const outcome = check.file.matched ? 'matched' : check.status === 'failed' ? 'did not match' : 'could not be verified';
      lines.push('', `File assertion: ${markdownCode(check.file.assertion)} on ${markdownCode(check.file.path)} — ${outcome}${check.file.sha256 ? `; SHA-256 ${markdownCode(check.file.sha256)}` : ''}${check.file.bytes != null ? `; ${check.file.bytes} bytes` : ''}.`);
    }
    if (check.http) lines.push('', `HTTP GET: ${markdownCode(check.http.url)} — status ${check.http.statusCode ?? 'unavailable'}; commit binding ${check.http.revisionBinding}${check.http.bodySha256 ? `; body SHA-256 ${markdownCode(check.http.bodySha256)}` : ''}${check.http.bodyBytes != null ? `; ${check.http.bodyBytes} bytes` : ''}.`);
    if (check.browser?.diagnostics) {
      const diagnostics = check.browser.diagnostics;
      const dropped = Object.values(diagnostics.dropped ?? {}).reduce((sum, count) => sum + count, 0);
      lines.push('', `Browser diagnostics: ${diagnostics.consoleErrors?.length ?? 0} console errors, ${diagnostics.pageErrors?.length ?? 0} page errors, ${diagnostics.requestFailures?.length ?? 0} failed requests, ${diagnostics.httpErrors?.length ?? 0} HTTP errors${dropped ? ` (${dropped} additional events omitted)` : ''}.`);
    }
  }
  const manifestLink = markdownHref(path.relative(path.dirname(report.markdownPath), manifestPath));
  lines.push('', '## Interpretation', '', `A passing result means the configured checks passed for the recorded commit. It establishes only what those checks actually exercise. See [manifest.json](${manifestLink}) for artifact hashes and paths.`, '');
  return lines.join('\n');
}

function usage() {
  return `agent-done-check ${VERSION}\n\nUsage:\n  agent-done-check [--config <file>] [--commit <sha>] [--output <file>] [--markdown-output <file>] [--sarif-output <file>] [--junit-output <file>]\n  agent-done-check --validate [--config <file>]\n  agent-done-check --verify-bundle [--manifest <file>]\n\nOptions:\n  --config          JSON verification contract (default: agent-done-check.json)\n  --commit          Git revision to verify (default: HEAD)\n  --output          JSON report path (default: .agent-done-check/report.json)\n  --markdown-output Markdown report path (default: sibling report.md)\n  --sarif-output    Optional SARIF 2.1.0 output path\n  --junit-output    Optional JUnit XML output path\n  --validate        Validate config and print JSON without running checks\n  --verify-bundle   Verify manifest and artifact integrity without rerunning checks\n  --manifest        Manifest path (default: .agent-done-check/manifest.json)\n  --help            Show this help\n  --version         Show version\n`;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) { console.log(usage()); return; }
  if (args.version) { console.log(VERSION); return; }

  const root = process.cwd();
  const configPath = path.resolve(root, args.config ?? 'agent-done-check.json');
  if (args.verifyBundle) {
    const result = await verifyBundle(path.resolve(root, args.manifest ?? '.agent-done-check/manifest.json'), root);
    console.log(JSON.stringify(result.output));
    if (result.code !== 0) process.exitCode = result.code;
    return;
  }
  let configContents;
  try {
    const info = await stat(configPath);
    if (info.size > MAX_CONFIG_BYTES) throw new Error(`Config ${configPath} exceeds the ${MAX_CONFIG_BYTES}-byte limit.`);
    const contents = await readFile(configPath);
    if (contents.byteLength > MAX_CONFIG_BYTES) throw new Error(`Config ${configPath} exceeds the ${MAX_CONFIG_BYTES}-byte limit.`);
    configContents = contents.toString('utf8');
  }
  catch (error) {
    if (args.validate) {
      console.log(JSON.stringify({ valid: false, configPath: path.relative(root, configPath), errors: [`Cannot read config: ${error.message}`] }));
      process.exitCode = 2;
      return;
    }
    throw new Error(`Cannot read config ${configPath}: ${error.message}`);
  }
  let config;
  try { config = JSON.parse(configContents); }
  catch (error) {
    if (args.validate) {
      console.log(JSON.stringify({ valid: false, configPath: path.relative(root, configPath), errors: [`Invalid JSON: ${error.message}`] }));
      process.exitCode = 2;
      return;
    }
    throw new Error(`Invalid JSON in ${configPath}: ${error.message}`);
  }
  if (args.validate) {
    try {
      validate(config);
      console.log(JSON.stringify({ valid: true, configPath: path.relative(root, configPath), criterionCount: config.criteria.length, checkCount: config.checks.length }));
    } catch (error) {
      const errors = error.message.startsWith('Invalid verification config:\n')
        ? error.message.split('\n').slice(1).map((line) => line.replace(/^\s*-\s*/, '')).filter(Boolean)
        : [error.message];
      console.log(JSON.stringify({ valid: false, configPath: path.relative(root, configPath), errors }));
      process.exitCode = 2;
    }
    return;
  }
  validate(config);
  const output = path.resolve(root, args.output ?? '.agent-done-check/report.json');
  const markdownOutput = path.resolve(root, args['markdown-output'] ?? path.join(path.dirname(output), 'report.md'));
  const manifestPath = path.join(path.dirname(output), 'manifest.json');
  const sarifOutput = args['sarif-output'] ? path.resolve(root, args['sarif-output']) : undefined;
  const junitOutput = args['junit-output'] ? path.resolve(root, args['junit-output']) : undefined;
  const destinations = [output, markdownOutput, manifestPath, configPath, ...(sarifOutput ? [sarifOutput] : []), ...(junitOutput ? [junitOutput] : [])];
  if (new Set(destinations).size !== destinations.length) {
    throw new Error('JSON report, Markdown report, SARIF report, JUnit report, manifest, and config must use distinct paths.');
  }
  const repository = await git(root, 'rev-parse', '--show-toplevel');
  const requested = args.commit ?? 'HEAD';
  const commit = await git(repository, 'rev-parse', '--verify', `${requested}^{commit}`);
  const repositoryName = path.basename(repository);
  const checkout = await mkdtemp(path.join(tmpdir(), 'agent-done-check-'));
  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const configSha256 = sha256(configContents);
  const secretsToRedact = redactionValues(config);
  const evidenceDirectory = path.join(path.dirname(output), 'evidence', runId);
  const results = [];

  try {
    await mkdir(evidenceDirectory, { recursive: true });
    for (const check of config.checks) {
      const checkStarted = new Date().toISOString();
      const worktree = path.join(checkout, check.id);
      const add = await runGit(repository, ['worktree', 'add', '--detach', '--quiet', worktree, commit]);
      if (add.code !== 0) {
        results.push({ id: check.id, type: check.type ?? 'command', criteria: check.criteria, status: 'unverified', error: add.stderr.trim() || 'Unable to create isolated verification worktree.', file: check.type === 'file' ? { path: check.path, assertion: check.assertion, exists: false, bytes: null, sha256: null, matched: false } : undefined, http: check.type === 'http' ? unavailableHttpResult(check) : undefined, startedAt: checkStarted });
        console.log(`UNVERIFIED ${check.id}`);
        continue;
      }
      let result;
      try {
        const timeoutMs = check.timeoutMs ?? config.timeoutMs ?? 120000;
        const deadline = Date.now() + timeoutMs;
        if (check.type === 'file') {
          result = await runFileCheck(repository, commit, check);
        } else if (check.type === 'http') {
          result = await runHttpCheck(commit, check, timeoutMs);
        } else if ((check.type ?? 'command') === 'playwright') {
          let setupResult = { code: 0, stdout: '', stderr: '' };
          let setupTimeMs = 0;
          if (check.setupCommand) {
            const setupStarted = Date.now();
            const [shell, shellArgs] = shellFor(check.setupCommand);
            setupResult = await run(shell, shellArgs, {
              cwd: worktree,
              env: verificationEnv(config, commit),
              timeoutMs: Math.max(1, deadline - Date.now()),
            });
            setupTimeMs = Date.now() - setupStarted;
          }
          if (setupResult.code !== 0) {
            result = { code: setupResult.code, signal: setupResult.signal, stdout: setupResult.stdout, stderr: setupResult.stderr, stdoutTruncated: setupResult.stdoutTruncated, stderrTruncated: setupResult.stderrTruncated, status: 'unverified', error: 'Playwright setup command did not complete successfully.' };
          } else if (check.setupCommand && await worktreeMutation(worktree, commit)) {
            result = { code: null, stdout: setupResult.stdout, stderr: setupResult.stderr, status: 'unverified', error: 'Playwright setup modified files in the verified checkout; the browser scenario was skipped.' };
          } else {
            const runner = fileURLToPath(new URL('./playwright-runner.js', import.meta.url));
            const execution = await run(process.execPath, [runner], {
              cwd: worktree,
              env: verificationEnv(config, commit),
              timeoutMs: Math.max(1, deadline - Date.now()),
              input: JSON.stringify({ check, evidenceDirectory, timeoutMs, commit, redactions: secretsToRedact }),
            });
            let browserResult;
            try { browserResult = JSON.parse(execution.stdout.trim()); }
            catch { browserResult = { status: 'unverified', error: execution.stderr.trim() || 'Playwright runner returned no result.' }; }
            result = {
              ...execution,
              status: browserResult.status,
              code: browserResult.status === 'passed' ? 0 : browserResult.status === 'failed' ? 1 : null,
              error: browserResult.error,
              browser: { browser: check.browser ?? 'chromium', url: displayUrl(check.url), setupTimeMs, revisionBinding: browserResult.revisionBinding, diagnostics: browserResult.diagnostics, artifacts: browserResult.artifacts },
              stdout: setupResult.stdout,
              stderr: [setupResult.stderr, execution.stderr].filter(Boolean).join('\n'),
            };
          }
        } else {
          const [shell, shellArgs] = shellFor(check.command);
          result = await run(shell, shellArgs, {
            cwd: worktree,
            env: verificationEnv(config, commit),
            timeoutMs,
          });
        }
        redactResult(result, secretsToRedact);
        const mutation = await worktreeMutation(worktree, commit);
        if (mutation) {
          const outcome = result.status ?? (result.code === 0 ? 'passed' : result.signal === 'TIMEOUT' ? 'unverified' : 'failed');
          result.status = outcome === 'passed' ? 'unverified' : outcome;
          result.error = [result.error, `The check ${mutation}; its result cannot be treated as proof of the requested commit.`].filter(Boolean).join(' ');
        }
        results.push({
          id: check.id,
          type: check.type ?? 'command',
          criteria: check.criteria,
          command: ['file', 'http'].includes(check.type) ? undefined : redactString(check.command ?? `Playwright ${check.browser ?? 'chromium'}: ${check.url ? displayUrl(check.url) : ''}`, secretsToRedact),
          status: result.status ?? (result.code === 0 ? 'passed' : result.signal === 'TIMEOUT' ? 'unverified' : 'failed'),
          error: result.error,
          exitCode: result.code,
          signal: result.signal,
          startedAt: checkStarted,
          durationMs: Date.now() - Date.parse(checkStarted),
          stdout: result.stdout,
          stderr: result.stderr,
          outputTruncated: { stdout: result.stdoutTruncated, stderr: result.stderrTruncated },
          browser: result.browser,
          file: result.file ?? (check.type === 'file' ? { path: check.path, assertion: check.assertion, exists: false, bytes: null, sha256: null, matched: false } : undefined),
          http: result.http,
        });
      } catch (error) {
        results.push({ id: check.id, type: check.type ?? 'command', criteria: check.criteria, command: check.command, status: 'unverified', error: redactString(error.message, secretsToRedact), file: check.type === 'file' ? { path: check.path, assertion: check.assertion, exists: false, bytes: null, sha256: null, matched: false } : undefined, http: check.type === 'http' ? unavailableHttpResult(check) : undefined, startedAt: checkStarted });
      } finally {
        await runGit(repository, ['worktree', 'remove', '--force', worktree]);
      }
      const last = results.at(-1);
      console.log(`${last.status === 'passed' ? 'PASS' : last.status === 'failed' ? 'FAIL' : 'UNVERIFIED'} ${check.id}`);
    }

    const criteria = config.criteria.map((criterion) => {
      const checks = results.filter((result) => result.criteria.includes(criterion.id));
      const status = checks.some((result) => result.status === 'failed') ? 'failed'
        : checks.length === 0 || checks.some((result) => result.status === 'unverified') ? 'unverified' : 'passed';
      return { ...criterion, status, checks: checks.map((check) => check.id) };
    });
    const status = criteria.some((item) => item.status === 'failed') ? 'failed'
      : criteria.some((item) => item.status === 'unverified') ? 'unverified' : 'passed';
    const report = {
      schemaVersion: 4,
      tool: { name: 'agent-done-check', version: VERSION },
      runId,
      status,
      repository: repositoryName,
      commit,
      startedAt,
      completedAt: new Date().toISOString(),
      reproducibility: {
        configPath: path.relative(repository, configPath),
        configSha256,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        locale: process.env.LANG ?? null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      criteria,
      checks: results,
    };
    await mkdir(path.dirname(output), { recursive: true });
    await mkdir(path.dirname(markdownOutput), { recursive: true });
    const evidenceFiles = [];
    for (const check of results) {
      for (const stream of ['stdout', 'stderr']) {
        const contents = check[stream] ?? '';
        if (!contents) continue;
        const filename = `${check.id}.${stream}.txt`;
        await writeFile(path.join(evidenceDirectory, filename), contents);
        evidenceFiles.push({
          checkId: check.id,
          stream,
          path: portablePath(path.relative(path.dirname(markdownOutput), path.join(evidenceDirectory, filename))),
          sha256: sha256(contents),
          bytes: Buffer.byteLength(contents),
          mediaType: 'text/plain; charset=utf-8',
        });
      }
    }
    for (const check of results) {
      if (!check.browser?.artifacts) continue;
      for (const artifact of check.browser.artifacts) {
        const bytes = await readFile(artifact.path);
        evidenceFiles.push({
          checkId: check.id,
          stream: artifact.role,
          path: portablePath(path.relative(path.dirname(markdownOutput), artifact.path)),
          sha256: sha256(bytes),
          bytes: bytes.byteLength,
          mediaType: artifact.mediaType,
        });
        artifact.path = portablePath(path.relative(path.dirname(output), artifact.path));
        artifact.sha256 = sha256(bytes);
        artifact.bytes = bytes.byteLength;
      }
    }
    await writeAtomic(output, `${JSON.stringify(report, null, 2)}\n`, runId);
    await writeAtomic(markdownOutput, markdownReport({ ...report, markdownPath: markdownOutput }, evidenceFiles, manifestPath), runId);
    if (sarifOutput) {
      await mkdir(path.dirname(sarifOutput), { recursive: true });
      await writeAtomic(sarifOutput, `${JSON.stringify(sarifReport(report), null, 2)}\n`, runId);
    }
    if (junitOutput) {
      await mkdir(path.dirname(junitOutput), { recursive: true });
      await writeAtomic(junitOutput, junitReport(report), runId);
    }
    const reportBytes = await readFile(output);
    const markdownBytes = await readFile(markdownOutput);
    const manifest = {
      schemaVersion: 1,
      runId,
      commit,
      config: { path: report.reproducibility.configPath, sha256: configSha256 },
      artifacts: [
        { role: 'json-report', path: portablePath(path.relative(path.dirname(output), output)), sha256: sha256(reportBytes), bytes: reportBytes.byteLength, mediaType: 'application/json' },
        { role: 'markdown-report', path: portablePath(path.relative(path.dirname(output), markdownOutput)), sha256: sha256(markdownBytes), bytes: markdownBytes.byteLength, mediaType: 'text/markdown' },
        ...(sarifOutput ? [{ role: 'sarif-report', path: portablePath(path.relative(path.dirname(output), sarifOutput)), sha256: sha256(await readFile(sarifOutput)), bytes: (await stat(sarifOutput)).size, mediaType: 'application/sarif+json' }] : []),
        ...(junitOutput ? [{ role: 'junit-report', path: portablePath(path.relative(path.dirname(output), junitOutput)), sha256: sha256(await readFile(junitOutput)), bytes: (await stat(junitOutput)).size, mediaType: 'application/xml' }] : []),
        ...evidenceFiles.map((item) => ({
          role: item.stream,
          ...item,
          path: portablePath(path.relative(path.dirname(output), path.resolve(path.dirname(markdownOutput), item.path))),
        })),
      ],
    };
    await writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, runId);
    console.log(`\n${status.toUpperCase()} ${commit.slice(0, 12)}`);
    console.log(`Report: ${path.relative(root, output)}`);
    console.log(`Summary: ${path.relative(root, markdownOutput)}`);
    console.log(`Evidence manifest: ${path.relative(root, manifestPath)}`);
    if (status !== 'passed') process.exitCode = 1;
  } finally {
    await runGit(repository, ['worktree', 'prune', '--expire', 'now']);
      await rm(checkout, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
