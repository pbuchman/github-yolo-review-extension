/**
 * E2E test for the GitHub Tests Filter extension.
 *
 * Requires environment variables:
 *   GITHUB_EMAIL    — GitHub login email
 *   GITHUB_PASSWORD — GitHub login password
 *   GITHUB_PR_URL   — Full URL to a PR files page (optional, defaults to a public PR)
 *
 * Usage:
 *   GITHUB_EMAIL=you@example.com GITHUB_PASSWORD=secret node scripts/test-extension.mjs
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..');

const GITHUB_EMAIL = process.env.GITHUB_EMAIL;
const GITHUB_PASSWORD = process.env.GITHUB_PASSWORD;
const PR_URL = process.env.GITHUB_PR_URL || 'https://github.com/pbuchman/github-tests-filter-extension/pull/1/files';

if (!GITHUB_EMAIL || !GITHUB_PASSWORD) {
  console.error('Error: GITHUB_EMAIL and GITHUB_PASSWORD environment variables are required.');
  process.exit(1);
}

(async () => {
  console.log('=== GitHub Tests Filter Extension — E2E Test ===\n');

  const userDataDir = path.join(__dirname, '..', '.test-profile');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
    ],
  });

  const page = context.pages()[0] || await context.newPage();

  // 1. Enable extension via popup toggle
  console.log('Step 1: Enabling extension via popup...');
  const extensionId = await getExtensionId(context);
  console.log('Extension ID:', extensionId);

  if (extensionId) {
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.waitForTimeout(500);
    await popupPage.locator('.slider').click();
    await popupPage.waitForTimeout(300);
    console.log('Extension enabled');
    await popupPage.close();
  }

  // 2. Login to GitHub
  console.log('\nStep 2: Logging in to GitHub...');
  await page.goto('https://github.com/login');
  await page.fill('#login_field', GITHUB_EMAIL);
  await page.fill('#password', GITHUB_PASSWORD);
  await page.click('[name="commit"]');
  await page.waitForURL('https://github.com/**', { timeout: 15000 });
  console.log('Logged in');

  // 3. Navigate to PR
  console.log('\nStep 3: Navigating to PR files page...');
  await page.goto(PR_URL);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  console.log('Page loaded:', page.url());

  // 4. Check that test files are hidden
  console.log('\nStep 4: Checking diff panel visibility...');
  const testDiffs = await page.evaluate(() => {
    const entries = document.querySelectorAll('copilot-diff-entry[data-file-path]');
    const results = [];
    for (const entry of entries) {
      const fp = entry.getAttribute('data-file-path');
      if (/\.test\.tsx?$/i.test(fp)) {
        results.push({ path: fp, hidden: entry.style.display === 'none' });
      }
    }
    return results;
  });

  for (const d of testDiffs) {
    console.log(`  [${d.hidden ? 'HIDDEN' : 'VISIBLE'}] ${d.path}`);
  }
  const allHidden = testDiffs.length > 0 && testDiffs.every(d => d.hidden);
  console.log(`\n${allHidden ? 'PASS' : 'FAIL'}: ${testDiffs.length} test diffs, all hidden: ${allHidden}`);

  // 5. Check non-test files visible
  console.log('\nStep 5: Checking non-test files are visible...');
  const nonTest = await page.evaluate(() => {
    const entries = document.querySelectorAll('copilot-diff-entry[data-file-path]');
    let visible = 0, total = 0;
    for (const entry of entries) {
      if (!/\.test\.tsx?$/i.test(entry.getAttribute('data-file-path'))) {
        total++;
        if (entry.style.display !== 'none') visible++;
      }
    }
    return { visible, total };
  });
  console.log(`Non-test files: ${nonTest.visible}/${nonTest.total} visible`);
  console.log(nonTest.visible === nonTest.total ? 'PASS' : 'FAIL');

  // 6. Check injected toggle exists
  console.log('\nStep 6: Checking injected toggle...');
  await page.locator('summary[data-target="file-filter.summary"]').click();
  await page.waitForTimeout(500);

  const toggle = await page.evaluate(() => {
    const cb = document.querySelector('#tests-filter-checkbox');
    if (!cb) return null;
    return { checked: cb.checked, label: cb.parentElement?.textContent?.trim() };
  });

  if (toggle) {
    console.log(`Toggle found: checked=${toggle.checked}, label="${toggle.label}"`);
    console.log('PASS');
  } else {
    console.log('FAIL: Toggle not found');
  }

  // 7. Toggle to show test files
  console.log('\nStep 7: Re-showing test files...');
  if (toggle) {
    await page.click('#tests-filter-checkbox');
    await page.waitForTimeout(500);
    const stillHidden = await page.evaluate(() => {
      let count = 0;
      for (const e of document.querySelectorAll('copilot-diff-entry[data-file-path]')) {
        if (/\.test\.tsx?$/i.test(e.getAttribute('data-file-path')) && e.style.display === 'none') count++;
      }
      return count;
    });
    console.log(`Still hidden: ${stillHidden}`);
    console.log(stillHidden === 0 ? 'PASS' : 'FAIL');
  }

  console.log('\n=== Test complete ===');
  await context.close();

  const { rmSync } = await import('fs');
  try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
})();

async function getExtensionId(context) {
  const page = await context.newPage();
  await page.goto('chrome://extensions/');
  await page.waitForTimeout(1000);

  const id = await page.evaluate(() => {
    const mgr = document.querySelector('extensions-manager');
    if (!mgr?.shadowRoot) return null;
    const list = mgr.shadowRoot.querySelector('extensions-item-list');
    if (!list?.shadowRoot) return null;
    for (const ext of list.shadowRoot.querySelectorAll('extensions-item')) {
      const name = ext.shadowRoot?.querySelector('#name');
      if (name?.textContent?.includes('GitHub Tests Filter')) {
        return ext.getAttribute('id');
      }
    }
    return null;
  });

  await page.close();
  return id;
}
