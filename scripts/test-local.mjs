/**
 * Local E2E test — no login required (public repo).
 * Loads the extension, navigates to a public PR, and verifies behavior.
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..');
const PR_URL = 'https://github.com/pbuchman/intexuraos/pull/1161/files';

(async () => {
  console.log('=== GitHub Tests Filter Extension — Local E2E Test ===\n');

  const userDataDir = path.join(__dirname, '..', '.test-profile');

  // Clean profile from previous runs to ensure fresh state
  const { rmSync } = await import('fs');
  try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
    ],
  });

  const page = context.pages()[0] || await context.newPage();
  let passed = 0;
  let failed = 0;

  function check(name, condition) {
    if (condition) {
      console.log(`  PASS: ${name}`);
      passed++;
    } else {
      console.log(`  FAIL: ${name}`);
      failed++;
    }
  }

  // 1. Enable extension via popup
  console.log('Step 1: Enabling extension via popup...');
  const extensionId = await getExtensionId(context);
  console.log('  Extension ID:', extensionId);

  if (extensionId) {
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.waitForTimeout(500);

    const statusBefore = await popupPage.locator('#status').textContent();
    console.log('  Popup status (before enable):', JSON.stringify(statusBefore));
    check('Initial status is Disabled', statusBefore === 'Disabled');

    await popupPage.locator('.slider').click();
    await popupPage.waitForTimeout(300);

    const statusAfter = await popupPage.locator('#status').textContent();
    console.log('  Popup status (after enable):', JSON.stringify(statusAfter));
    check('No encoding garbage', !statusAfter.includes('\u00e2'));
    check('Status contains ASCII hyphen', statusAfter.includes(' - '));
    check('Status says Enabled', statusAfter.startsWith('Enabled'));

    await popupPage.close();
  }

  // 2. Navigate to public PR (extension already enabled)
  console.log('\nStep 2: Navigating to public PR...');
  await page.goto(PR_URL);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  console.log('  Page loaded:', page.url());

  // 4. Check diff entries
  console.log('\nStep 4: Checking diff entries...');
  const diffInfo = await page.evaluate(() => {
    const entries = document.querySelectorAll('copilot-diff-entry[data-file-path]');
    const testEntries = [];
    const nonTestEntries = [];
    for (const e of entries) {
      const fp = e.getAttribute('data-file-path');
      if (/\.test\.tsx?$/i.test(fp)) {
        testEntries.push({ path: fp, display: e.style.display });
      } else {
        nonTestEntries.push({ path: fp, display: e.style.display });
      }
    }
    return { testEntries, nonTestEntries, total: entries.length };
  });

  console.log(`  Total diff entries: ${diffInfo.total}`);
  console.log(`  Test files: ${diffInfo.testEntries.length}`);
  console.log(`  Non-test files: ${diffInfo.nonTestEntries.length}`);

  for (const e of diffInfo.testEntries) {
    console.log(`    [${e.display === 'none' ? 'HIDDEN' : 'VISIBLE'}] ${e.path}`);
  }

  const allTestsHidden = diffInfo.testEntries.length > 0 &&
    diffInfo.testEntries.every(e => e.display === 'none');
  const allNonTestsVisible = diffInfo.nonTestEntries.every(e => e.display !== 'none');

  check('Test files are hidden', allTestsHidden);
  check('Non-test files are visible', allNonTestsVisible);

  // 5. Open the file filter dropdown
  console.log('\nStep 5: Opening file filter dropdown...');
  let dropdownOpened = false;
  try {
    const summary = page.locator('summary[data-target="file-filter.summary"]');
    if (await summary.count() > 0) {
      await summary.click();
      await page.waitForTimeout(1000);
      dropdownOpened = true;
      console.log('  Dropdown opened');
    } else {
      console.log('  WARN: summary[data-target="file-filter.summary"] not found');
    }
  } catch (e) {
    console.log('  Error opening dropdown:', e.message);
  }

  // Debug: dump dropdown HTML regardless of pass/fail
  console.log('\nStep 5b: Dumping dropdown state...');
  const dropdownDebug = await page.evaluate(() => {
    const container =
      document.querySelector('.js-file-filter-form fieldset') ||
      document.querySelector('file-filter fieldset') ||
      document.querySelector('.js-file-filter-form') ||
      document.querySelector('file-filter details[open]');
    const watched = document.querySelector('[data-tests-filter-watched]');
    return {
      containerTag: container?.tagName,
      containerChildCount: container?.children?.length,
      containerHTML: container?.innerHTML?.slice(0, 2000) || 'NOT FOUND',
      watcherSet: !!watched,
      extensionCheckboxCount: container?.querySelectorAll('input.js-diff-file-type-option')?.length ?? 0,
    };
  });
  console.log('  Container:', dropdownDebug.containerTag, '| children:', dropdownDebug.containerChildCount);
  console.log('  Watcher set:', dropdownDebug.watcherSet);
  console.log('  Extension checkboxes:', dropdownDebug.extensionCheckboxCount);
  console.log('  HTML:\n', dropdownDebug.containerHTML);

  // 6. Check injected toggle exists
  console.log('\nStep 6: Checking injected toggle...');
  const toggleInfo = await page.evaluate(() => {
    const label = document.querySelector('label[data-tests-filter-injected]');
    if (!label) return { found: false };
    const cb = label.querySelector('.tests-filter-checkbox');
    return {
      found: true,
      text: label.textContent?.trim(),
      ariaChecked: label.getAttribute('aria-checked'),
      hasCheckbox: !!cb,
      checkboxChecked: cb?.checked,
      hasSvgIcon: !!label.querySelector('svg'),
      hasCountSpan: !!label.querySelector('.tests-filter-count'),
    };
  });

  if (toggleInfo.found) {
    console.log('  Toggle found:', JSON.stringify(toggleInfo, null, 4));
    check('Toggle text contains "Tests"', toggleInfo.text?.includes('Tests'));
    check('Toggle text contains ".test.ts"', toggleInfo.text?.includes('.test.ts'));
    check('Toggle has checkbox', toggleInfo.hasCheckbox);
    check('Toggle has count span', toggleInfo.hasCountSpan);
  } else {
    console.log('  Toggle NOT found');
    // Dump dropdown state for debugging
    const debugInfo = await page.evaluate(() => {
      const selectors = {
        'file-filter': document.querySelectorAll('file-filter').length,
        'file-filter details': document.querySelectorAll('file-filter details').length,
        'file-filter details[open]': document.querySelectorAll('file-filter details[open]').length,
        '.js-file-filter-form': document.querySelectorAll('.js-file-filter-form').length,
        '.js-file-filter-form fieldset': document.querySelectorAll('.js-file-filter-form fieldset').length,
        'input.js-diff-file-type-option': document.querySelectorAll('input.js-diff-file-type-option').length,
        '[role="menuitemcheckbox"]': document.querySelectorAll('[role="menuitemcheckbox"]').length,
        'summary[data-target="file-filter.summary"]': document.querySelectorAll('summary[data-target="file-filter.summary"]').length,
        '[data-tests-filter-watched]': document.querySelectorAll('[data-tests-filter-watched]').length,
      };
      // Get dropdown inner HTML snippet
      const container =
        document.querySelector('.js-file-filter-form fieldset') ||
        document.querySelector('file-filter fieldset') ||
        document.querySelector('.js-file-filter-form') ||
        document.querySelector('file-filter details[open]');
      return {
        selectors,
        containerFound: !!container,
        containerHTML: container?.innerHTML?.slice(0, 1500) || 'NO CONTAINER',
      };
    });
    console.log('  DEBUG selectors:', JSON.stringify(debugInfo.selectors, null, 4));
    console.log('  Container found:', debugInfo.containerFound);
    console.log('  Container HTML:', debugInfo.containerHTML.slice(0, 800));
    check('Toggle injected into dropdown', false);
  }

  // 7. Click toggle to show test files (if found)
  if (toggleInfo.found) {
    console.log('\nStep 7: Clicking toggle to show test files...');
    await page.click('[data-tests-filter-injected][role="menuitemcheckbox"]');
    await page.waitForTimeout(500);

    const afterToggle = await page.evaluate(() => {
      let hiddenCount = 0;
      for (const e of document.querySelectorAll('copilot-diff-entry[data-file-path]')) {
        if (/\.test\.tsx?$/i.test(e.getAttribute('data-file-path')) && e.style.display === 'none') {
          hiddenCount++;
        }
      }
      return { hiddenCount };
    });

    console.log(`  Test files still hidden: ${afterToggle.hiddenCount}`);
    check('After toggle click, test files visible', afterToggle.hiddenCount === 0);
  }

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  await context.close();
  try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}

  process.exit(failed > 0 ? 1 : 0);
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
