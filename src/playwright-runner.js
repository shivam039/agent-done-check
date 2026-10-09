import { createRequire } from 'node:module';
import path from 'node:path';

const MAX_DIAGNOSTICS = 100;
const MAX_DIAGNOSTIC_TEXT = 2_000;

function boundedText(value) {
  const text = String(value ?? '');
  return text.length > MAX_DIAGNOSTIC_TEXT ? `${text.slice(0, MAX_DIAGNOSTIC_TEXT)}…[truncated]` : text;
}

function redactText(value, sensitiveUrl, redactions) {
  let sanitized = boundedText(value).replaceAll(sensitiveUrl, displayUrl(sensitiveUrl));
  sanitized = sanitized
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, '[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]');
  for (const secret of redactions) sanitized = sanitized.replaceAll(secret, '[REDACTED]');
  return sanitized.replace(/https?:\/\/[^\s"'<>]+/g, (url) => displayUrl(url));
}

function pushBounded(list, value) {
  if (list.length >= MAX_DIAGNOSTICS) return false;
  list.push(value);
  return true;
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

async function waitForText(locator, expected, timeoutMs, exact = false) {
  const end = Date.now() + timeoutMs;
  let lastText = '';
  while (Date.now() < end) {
    lastText = (await locator.innerText().catch(() => ''));
    if (exact ? lastText === expected : lastText.includes(expected)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Expected text ${JSON.stringify(expected)}; last text was ${JSON.stringify(lastText)}.`);
}

async function waitForAccessibleMatch(page, step, timeoutMs, kind) {
  const end = Date.now() + timeoutMs;
  const matchingRole = page.getByRole(step.role, { [kind]: step.value, exact: step.exact === true });
  const matchingElement = page.locator(step.selector).and(matchingRole);
  while (Date.now() < end) {
    const count = await matchingElement.count().catch(() => 0);
    if (count > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Expected selected element accessible ${kind} to match configured text.`);
}

async function waitForClass(locator, className, expected, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const present = await locator.evaluate((element, token) => element.classList.contains(token), className).catch(() => null);
    if (present === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Expected selected element class token to be ${expected ? 'present' : 'absent'}.`);
}

async function waitForValue(locator, expected, timeoutMs) {
  const end = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < end) {
    lastValue = await locator.inputValue().catch(() => undefined);
    if (lastValue === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Expected value ${JSON.stringify(expected)}; last value was ${JSON.stringify(lastValue)}.`);
}

async function waitForAttribute(locator, attribute, expected, timeoutMs, exact = false) {
  const end = Date.now() + timeoutMs;
  let lastValue = null;
  while (Date.now() < end) {
    lastValue = await locator.getAttribute(attribute).catch(() => null);
    if (lastValue !== null && (exact ? lastValue === expected : lastValue.includes(expected))) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Expected attribute ${JSON.stringify(attribute)} ${exact ? 'to equal' : 'to contain'} ${JSON.stringify(expected)}; last value was ${JSON.stringify(lastValue)}.`);
}

async function waitForAttributePresence(locator, attribute, expected, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = await locator.getAttribute(attribute).catch(() => null);
    if ((value !== null) === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Expected selected element attribute ${JSON.stringify(attribute)} to be ${expected ? 'present' : 'absent'}.`);
}

async function waitForCount(locator, expected, timeoutMs) {
  const end = Date.now() + timeoutMs;
  let lastCount = null;
  while (Date.now() < end) {
    lastCount = await locator.count().catch(() => null);
    if (lastCount === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Expected ${expected} matching elements; last count was ${lastCount}.`);
}

async function waitForTitle(page, expected, timeoutMs, exact = false) {
  const end = Date.now() + timeoutMs;
  let lastTitle = '';
  while (Date.now() < end) {
    lastTitle = await page.title().catch(() => '');
    if (exact ? lastTitle === expected : lastTitle.includes(expected)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Expected page title ${JSON.stringify(expected)}; last title was ${JSON.stringify(lastTitle)}.`);
}

async function waitForEnabled(locator, expected, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const enabled = await locator.isEnabled().catch(() => null);
    if (enabled === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Expected selected element to be ${expected ? 'enabled' : 'disabled'}.`);
}

async function waitForChecked(locator, expected, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const checked = await locator.isChecked().catch(() => null);
    if (checked === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Expected selected checkbox or radio control to be ${expected ? 'checked' : 'unchecked'}.`);
}

async function waitForFocused(locator, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const focused = await locator.evaluate((element) => element === element.ownerDocument.activeElement).catch(() => false);
    if (focused) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Expected selected element to receive focus.');
}

async function performStep(page, step, timeoutMs) {
  if (step.action === 'expectTitle') {
    await waitForTitle(page, step.value, timeoutMs, step.exact === true);
    return;
  }
  if (step.action === 'expectAccessibleName' || step.action === 'expectAccessibleDescription') {
    await waitForAccessibleMatch(page, step, timeoutMs, step.action === 'expectAccessibleName' ? 'name' : 'description');
    return;
  }
  if (step.action === 'expectClass') {
    await waitForClass(page.locator(step.selector).first(), step.className, step.present, timeoutMs);
    return;
  }
  if (step.action === 'expectEnabled' || step.action === 'expectDisabled') {
    await waitForEnabled(page.locator(step.selector).first(), step.action === 'expectEnabled', timeoutMs);
    return;
  }
  if (step.action === 'expectChecked' || step.action === 'expectUnchecked') {
    await waitForChecked(page.locator(step.selector).first(), step.action === 'expectChecked', timeoutMs);
    return;
  }
  if (step.action === 'expectFocused') {
    await waitForFocused(page.locator(step.selector).first(), timeoutMs);
    return;
  }
  if (step.action === 'expectAttributeExists' || step.action === 'expectAttributeMissing') {
    await waitForAttributePresence(page.locator(step.selector).first(), step.attribute, step.action === 'expectAttributeExists', timeoutMs);
    return;
  }
  if (step.action === 'expectUrl') {
    await page.waitForURL((url) => step.exact ? url.href === step.value : url.href.includes(step.value), { timeout: timeoutMs });
    return;
  }
  const locator = page.locator(step.selector).first();
  if (step.action === 'click') await locator.click({ timeout: timeoutMs });
  else if (step.action === 'fill') await locator.fill(step.value, { timeout: timeoutMs });
  else if (step.action === 'check') await locator.check({ timeout: timeoutMs });
  else if (step.action === 'uncheck') await locator.uncheck({ timeout: timeoutMs });
  else if (step.action === 'selectOption') await locator.selectOption(step.value, { timeout: timeoutMs });
  else if (step.action === 'press') await locator.press(step.value, { timeout: timeoutMs });
  else if (step.action === 'expectVisible') await locator.waitFor({ state: 'visible', timeout: timeoutMs });
  else if (step.action === 'expectHidden') await locator.waitFor({ state: 'hidden', timeout: timeoutMs });
  else if (step.action === 'expectText') await waitForText(locator, step.value, timeoutMs, step.exact === true);
  else if (step.action === 'expectValue') await waitForValue(locator, step.value, timeoutMs);
  else if (step.action === 'expectAttribute') await waitForAttribute(locator, step.attribute, step.value, timeoutMs, step.exact === true);
  else if (step.action === 'expectCount') await waitForCount(page.locator(step.selector), step.count, timeoutMs);
}

async function main() {
  let browser;
  let page;
  const request = JSON.parse(await new Promise((resolve, reject) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { input += chunk; });
    process.stdin.on('end', () => resolve(input));
    process.stdin.on('error', reject);
  }));
  const { check, evidenceDirectory, timeoutMs, commit, redactions = [] } = request;
  const diagnostics = {
    consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [],
    dropped: { consoleErrors: 0, pageErrors: 0, requestFailures: 0, httpErrors: 0 },
  };
  const record = (key, value) => {
    if (!pushBounded(diagnostics[key], value)) diagnostics.dropped[key] += 1;
  };
  let failure;
  let status = 'passed';
  const revisionBinding = { status: 'unverified', expected: commit, observed: null };
  let bindingError = check.commitAssertion ? null : 'No commitAssertion is configured; the browser target cannot be tied to the requested commit.';

  try {
    const localRequire = createRequire(path.join(process.cwd(), 'package.json'));
    let playwright;
    try { playwright = localRequire('playwright'); }
    catch {
      status = 'unverified';
      throw new Error('Playwright is not installed in the verified worktree. Set check.setupCommand to install project dependencies and Playwright.');
    }
    const browserType = playwright[check.browser ?? 'chromium'];
    try { browser = await browserType.launch({ headless: true }); }
    catch (error) {
      status = 'unverified';
      throw new Error(`Could not launch ${check.browser ?? 'chromium'}; install its Playwright browser in check.setupCommand. ${error.message}`);
    }
    diagnostics.browserVersion = browser.version();
    const context = await browser.newContext({ viewport: check.viewport ?? { width: 1280, height: 800 } });
    page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.on('console', (message) => {
      if (message.type() === 'error') {
        const location = message.location();
        if (location.url) location.url = displayUrl(location.url);
        record('consoleErrors', { text: redactText(message.text(), check.url, redactions), location });
      }
    });
    page.on('pageerror', (error) => record('pageErrors', { message: redactText(error.message, check.url, redactions) }));
    page.on('requestfailed', (requestEvent) => record('requestFailures', {
      url: displayUrl(requestEvent.url()), method: requestEvent.method(), error: redactText(requestEvent.failure()?.errorText ?? 'request failed', check.url, redactions),
    }));
    page.on('response', (response) => {
      if (response.status() >= 400) record('httpErrors', { url: displayUrl(response.url()), status: response.status() });
    });

    await page.goto(check.url, { waitUntil: check.waitUntil ?? 'domcontentloaded', timeout: timeoutMs });
    if (check.commitAssertion) {
      try {
        const locator = page.locator(check.commitAssertion.selector).first();
        await locator.waitFor({ state: 'attached', timeout: timeoutMs });
        const observed = check.commitAssertion.attribute
          ? await locator.getAttribute(check.commitAssertion.attribute)
          : await locator.textContent();
        const observedValue = observed?.trim() ?? null;
        revisionBinding.observed = observedValue == null ? null : redactText(observedValue, check.url, redactions);
        if (observedValue === commit) {
          revisionBinding.status = 'verified';
          bindingError = null;
        } else {
          revisionBinding.status = 'mismatch';
          bindingError = `The application reported commit ${JSON.stringify(revisionBinding.observed)} instead of the requested commit.`;
        }
      } catch (error) {
        revisionBinding.status = 'unavailable';
        bindingError = `Could not read the application commit marker: ${error.message}`;
      }
    }
    for (const step of check.steps) await performStep(page, step, timeoutMs);
    if (check.failOnPageError !== false && diagnostics.pageErrors.length) throw new Error(`Page emitted ${diagnostics.pageErrors.length} uncaught error(s).`);
    if (check.failOnConsoleError === true && diagnostics.consoleErrors.length) throw new Error(`Page emitted ${diagnostics.consoleErrors.length} console error(s).`);
    if (check.failOnRequestFailure === true && diagnostics.requestFailures.length) throw new Error(`Page had ${diagnostics.requestFailures.length} failed request(s).`);
    if (check.failOnHttpError === true && diagnostics.httpErrors.length) throw new Error(`Page received ${diagnostics.httpErrors.length} HTTP error response(s).`);
  } catch (error) {
    failure = error;
    if (revisionBinding.status === 'verified') status = 'failed';
    else {
      status = 'unverified';
      failure = new Error(`${bindingError ?? 'The browser target is not bound to the requested commit.'} Scenario result: ${error.message}`);
    }
  }

  if (!failure && revisionBinding.status !== 'verified') {
    status = 'unverified';
    failure = new Error(bindingError ?? 'The browser target is not bound to the requested commit.');
  }

  const artifacts = [];
  let screenshotFailure;
  if (page && check.screenshot !== false) {
    try {
      const filename = `${check.id}.png`;
      const filePath = path.join(evidenceDirectory, filename);
      await page.screenshot({ path: filePath, animations: 'disabled', timeout: Math.min(timeoutMs, 15000) });
      artifacts.push({ path: filePath, role: 'browser-screenshot', mediaType: 'image/png' });
    } catch (error) {
      screenshotFailure = error;
      diagnostics.screenshotError = redactText(error.message, check.url, redactions);
      if (status === 'passed') status = 'unverified';
    }
  }
  await browser?.close().catch(() => {});
  const result = {
    status,
    error: failure ? redactText(failure.message, check.url, redactions) : screenshotFailure ? redactText(screenshotFailure.message, check.url, redactions) : undefined,
    revisionBinding,
    diagnostics,
    artifacts,
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({ status: 'unverified', error: error.message, diagnostics: {}, artifacts: [] })}\n`);
});
