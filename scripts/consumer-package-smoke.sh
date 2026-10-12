#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temp_root="$(mktemp -d)"
trap 'rm -rf "$temp_root"' EXIT

pack_json="$temp_root/pack.json"
npm pack --ignore-scripts --json --pack-destination "$temp_root" --prefix "$repo_root" > "$pack_json"
tarball_name="$(node -p "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8'))[0].filename" "$pack_json")"
tarball_path="$temp_root/$tarball_name"
consumer="$temp_root/clean consumer"
mkdir -p "$consumer"

cd "$consumer"
npm init --yes >/dev/null
npm install --ignore-scripts --no-audit --no-fund "$tarball_path"

cli="./node_modules/.bin/agent-done-check"
version_output="$("$cli" --version)"
expected_version="$(node -p "require('./node_modules/agent-done-check/package.json').version")"
[[ "$version_output" == "$expected_version" ]]
"$cli" --help >/dev/null
for required_file in \
  LICENSE README.md CHANGELOG.md ROADMAP.md \
  agent-done-check.example.json agent-done-check.browser.example.json \
  agent-done-check.file.example.json agent-done-check.http.example.json \
  bin/agent-done-check.js \
  docs/PRD-1.0.0-readiness.md \
  docs/compatibility.md docs/contracts.md docs/v1-readiness-checklist.md \
  schemas/config-v1.schema.json schemas/report-v4.schema.json schemas/manifest-v1.schema.json; do
  test -f "node_modules/agent-done-check/$required_file"
done
node --input-type=module -e '
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
const root = "node_modules/agent-done-check";
const pkg = JSON.parse(await readFile(`${root}/package.json`, "utf8"));
for (const path of pkg.files.filter((entry) => entry.startsWith("docs/PRD-"))) {
  await access(`${root}/${path}`);
}
'

cat > agent-done-check.json <<'JSON'
{
  "version": 1,
  "criteria": [{ "id": "runtime", "description": "Node.js is available." }],
  "checks": [{ "id": "node-version", "command": ["node", "--version"], "criteria": ["runtime"] }]
}
JSON

git init --quiet
git add package.json package-lock.json agent-done-check.json
git -c user.name="Consumer Smoke Test" -c user.email="consumer-smoke@example.invalid" commit --quiet -m "Create clean consumer fixture"

"$cli" --validate --config agent-done-check.json >/dev/null
"$cli" --config agent-done-check.json --output .agent-done-check/smoke-report.json --markdown-output .agent-done-check/smoke-report.md
node --input-type=module -e '
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const report = JSON.parse(await readFile(".agent-done-check/smoke-report.json", "utf8"));
assert.equal(report.schemaVersion, 4);
assert.equal(report.status, "passed");
assert.equal(report.commit, execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim());
assert.equal(report.checks.length, 1);
assert.equal(report.checks[0].status, "passed");
'

printf 'Clean consumer package smoke test passed (%s).\n' "$version_output"
