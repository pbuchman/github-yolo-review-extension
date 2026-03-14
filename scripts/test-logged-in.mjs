/**
 * Reuses .test-profile (with login session) to test the extension
 * in the logged-in view. Runs checks then keeps browser open.
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const PR_URL = args[0] || 'https://github.com/pbuchman/intexuraos/pull/1161/files';
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');
import { mkdirSync } from 'fs';
try { mkdirSync(SCREENSHOTS_DIR, { recursive: true }); } catch {}
let stepNum = 0;
async function screenshot(page, name) {
  stepNum++;
  const file = path.join(SCREENSHOTS_DIR, `${stepNum}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  📸 ${file}`);
}

// Separate profile from test-local.mjs so login session is never destroyed
const userDataDir = path.join(__dirname, '..', '.logged-in-profile');

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { console.log(`  PASS: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name}`); failed++; }
}

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
    '--no-first-run',
  ],
});

const page = context.pages()[0] || await context.newPage();

// 1. Enable extension
console.log('Step 1: Enabling extension...');
const extensionId = await getExtensionId(context);
if (extensionId) {
  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
  await popupPage.waitForTimeout(500);
  const status = await popupPage.locator('#status').textContent();
  if (status === 'Disabled') {
    await popupPage.locator('.slider').click();
    await popupPage.waitForTimeout(300);
    console.log('  Enabled');
  } else {
    console.log('  Already enabled');
  }
  // Reset testsHidden to true (default)
  await popupPage.evaluate(() => chrome.storage.local.set({ testsHidden: true }));
  console.log('  Reset testsHidden=true');
  await popupPage.close();
}

// 2. Navigate to PR
console.log('\nStep 2: Navigating to PR...');
await page.goto(PR_URL);
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(8000);
console.log('  URL:', page.url());
await screenshot(page, 'page-loaded');

// 3. Check if logged in
const loggedIn = await page.evaluate(() => {
  return !!document.querySelector('meta[name="user-login"]')?.getAttribute('content');
});
console.log('  Logged in:', loggedIn);

// 4. Check diff area
console.log('\nStep 3: Checking diff area...');
const diffState = await page.evaluate(() => {
  // Classic diff entries
  const copilotEntries = document.querySelectorAll('copilot-diff-entry[data-file-path]');
  // Primer diff buttons
  const diffButtons = document.querySelectorAll('button[data-file-path]');
  // Primer diff panels
  const diffPanels = document.querySelectorAll('div[id^="diff-"][class*="Diff-module__diff"]');

  const testDiffsHidden = [];
  const nonTestDiffsVisible = [];

  // Check copilot entries
  for (const e of copilotEntries) {
    const fp = e.getAttribute('data-file-path');
    const isTest = /\.test\.tsx?$/i.test(fp);
    if (isTest) testDiffsHidden.push({ path: fp, hidden: e.style.display === 'none', type: 'copilot' });
    else nonTestDiffsVisible.push({ path: fp, visible: e.style.display !== 'none', type: 'copilot' });
  }

  // Check Primer panels via buttons
  for (const btn of diffButtons) {
    const fp = btn.getAttribute('data-file-path');
    const panel = btn.closest('div[id^="diff-"][class*="Diff-module__diff"]');
    const isTest = /\.test\.tsx?$/i.test(fp);
    if (isTest) testDiffsHidden.push({ path: fp, hidden: panel?.style.display === 'none', type: 'primer' });
    else nonTestDiffsVisible.push({ path: fp, visible: panel?.style.display !== 'none', type: 'primer' });
  }

  return {
    copilotCount: copilotEntries.length,
    primerButtonCount: diffButtons.length,
    primerPanelCount: diffPanels.length,
    testDiffsHidden,
    nonTestDiffsVisible,
  };
});

console.log('  copilot-diff-entry count:', diffState.copilotCount);
console.log('  Primer button[data-file-path] count:', diffState.primerButtonCount);
console.log('  Primer diff panels count:', diffState.primerPanelCount);

console.log('\n  Test file diffs:');
for (const d of diffState.testDiffsHidden) {
  console.log(`    [${d.hidden ? 'HIDDEN' : 'VISIBLE'}] (${d.type}) ${d.path}`);
}
const allTestDiffsHidden = diffState.testDiffsHidden.length > 0 &&
  diffState.testDiffsHidden.every(d => d.hidden);
check('Test file diffs are hidden', allTestDiffsHidden || diffState.testDiffsHidden.length === 0);

console.log('\n  Non-test file diffs:');
const hiddenNonTest = diffState.nonTestDiffsVisible.filter(d => !d.visible);
for (const d of hiddenNonTest) {
  console.log(`    [HIDDEN!] (${d.type}) ${d.path}`);
}
if (hiddenNonTest.length === 0) console.log('    All visible');
console.log(`    Total: ${diffState.nonTestDiffsVisible.length}, hidden: ${hiddenNonTest.length}`);
const allNonTestVisible = diffState.nonTestDiffsVisible.every(d => d.visible);
check('Non-test file diffs are visible', allNonTestVisible);

// Check non-test .ts tree items specifically
const hiddenNonTestTs = await page.evaluate(() => {
  const items = document.querySelectorAll('li[role="treeitem"]');
  const hidden = [];
  for (const item of items) {
    if (item.getAttribute('data-tree-entry-type') === 'directory') continue;
    const link = item.querySelector('a');
    const text = link?.getAttribute('title') || link?.textContent?.trim() || '';
    if (text.endsWith('.ts') && !/\.test\.tsx?$/i.test(text)) {
      if (item.style.display === 'none' || getComputedStyle(item).display === 'none') {
        hidden.push(text);
      }
    }
  }
  return hidden;
});
if (hiddenNonTestTs.length > 0) {
  console.log('\n  HIDDEN non-test .ts tree items:');
  for (const p of hiddenNonTestTs) console.log(`    ${p}`);
}
check('No non-test .ts files hidden in tree', hiddenNonTestTs.length === 0);

// 5. Check tree
console.log('\nStep 4: Checking file tree...');
const treeState = await page.evaluate(() => {
  const items = document.querySelectorAll('li[role="treeitem"]');
  let treeVisible = items.length > 0;
  let testTreeHidden = 0;
  let testTreeTotal = 0;
  for (const item of items) {
    if (item.getAttribute('data-tree-entry-type') === 'directory') continue;
    // Skip Primer directory nodes (they contain a child ul[role="group"])
    if (item.querySelector(':scope > ul[role="group"]')) continue;
    const link = item.querySelector('a[href*="#diff-"]');
    const text = link?.getAttribute('title') || link?.textContent?.trim() || '';
    if (/\.test\.tsx?$/i.test(text)) {
      testTreeTotal++;
      if (item.style.display === 'none') testTreeHidden++;
    }
  }
  // Check the tree container itself is visible
  const treeContainer = document.querySelector('[role="tree"]') || document.querySelector('.js-tree-finder-results');
  return {
    totalTreeItems: items.length,
    testTreeTotal,
    testTreeHidden,
    treeContainerVisible: treeContainer ? getComputedStyle(treeContainer).display !== 'none' : null,
  };
});

console.log('  Total tree items:', treeState.totalTreeItems);
console.log('  Test tree items:', treeState.testTreeHidden, '/', treeState.testTreeTotal, 'hidden');
console.log('  Tree container visible:', treeState.treeContainerVisible);
check('Tree container is visible', treeState.treeContainerVisible !== false);
check('Test files hidden in tree', treeState.testTreeHidden === treeState.testTreeTotal || treeState.testTreeTotal === 0);

// Debug: tree collapse analysis
const collapseDebug = await page.evaluate(() => {
  const dirs = document.querySelectorAll('li[role="treeitem"][data-tree-entry-type="directory"]');
  const hiddenDirs = [];
  for (const dir of dirs) {
    if (dir.style.display === 'none') {
      const label = dir.querySelector('.ActionList-item-label, a')?.textContent?.trim();
      const group = dir.querySelector('ul[role="group"]');
      const children = group?.querySelectorAll(':scope > li[role="treeitem"]') || [];
      const visibleChildren = Array.from(children).filter(c => c.style.display !== 'none');
      hiddenDirs.push({
        label,
        totalChildren: children.length,
        visibleChildren: visibleChildren.length,
        visibleNames: visibleChildren.slice(0, 3).map(c =>
          c.querySelector('.ActionList-item-label, a')?.textContent?.trim()
        ),
      });
    }
  }
  // Also check: how many non-test tree items are visible?
  const allItems = document.querySelectorAll('li[role="treeitem"]');
  let visibleNonTest = 0;
  let hiddenNonTest = 0;
  for (const item of allItems) {
    if (item.getAttribute('data-tree-entry-type') === 'directory') continue;
    const link = item.querySelector('a');
    const text = link?.getAttribute('title') || link?.textContent?.trim() || '';
    if (!/\.test\.tsx?$/i.test(text)) {
      if (item.style.display === 'none' || getComputedStyle(item).display === 'none') hiddenNonTest++;
      else visibleNonTest++;
    }
  }
  // Diff panels: how many have test files but NO button[data-file-path]?
  const allPanels = document.querySelectorAll('div[id^="diff-"][class*="Diff-module__diff"]');
  const panelInfo = [];
  for (const panel of Array.from(allPanels).slice(0, 5)) {
    const btn = panel.querySelector('button[data-file-path]');
    const headerText = panel.querySelector('[class*="DiffFileHeader"]')?.textContent?.trim()?.slice(0, 80);
    panelInfo.push({ hasButton: !!btn, path: btn?.getAttribute('data-file-path'), headerText, display: panel.style.display });
  }
  return { hiddenDirs, visibleNonTest, hiddenNonTest, totalPanels: allPanels.length, panelSamples: panelInfo };
});

console.log('\n  COLLAPSE DEBUG:');
console.log('  Hidden dirs:', collapseDebug.hiddenDirs.length);
for (const d of collapseDebug.hiddenDirs.slice(0, 5)) {
  console.log(`    "${d.label}" — ${d.totalChildren} children, ${d.visibleChildren} visible:`, d.visibleNames);
}
console.log('  Non-test tree items: visible=', collapseDebug.visibleNonTest, 'hidden=', collapseDebug.hiddenNonTest);
console.log('  Total diff panels:', collapseDebug.totalPanels);
console.log('  Panel samples:');
for (const p of collapseDebug.panelSamples) {
  console.log(`    hasButton=${p.hasButton} path=${p.path || 'N/A'} display="${p.display}" header="${p.headerText}"`);
}

await screenshot(page, 'after-filter-applied');

// 6. Check filter dropdown toggle
console.log('\nStep 5: Opening filter dropdown...');
let toggleFound = false;
try {
  // Try classic
  const classicSummary = page.locator('summary[data-target="file-filter.summary"]');
  // Try primer
  const primerBtn = page.locator('#diff-file-tree-filter button[aria-haspopup="true"]');

  if (await classicSummary.count() > 0) {
    await classicSummary.click();
    console.log('  Opened via classic summary');
  } else if (await primerBtn.count() > 0) {
    await primerBtn.click();
    console.log('  Opened via Primer button');
  }
  await page.waitForTimeout(3000);

  // Debug: what's in the dropdown?
  const dropdownDebug = await page.evaluate(() => {
    return {
      fileExtGroup: !!document.querySelector('ul[aria-label="File extensions"]'),
      fileExtGroupItems: document.querySelector('ul[aria-label="File extensions"]')?.children?.length,
      watcherSet: !!document.querySelector('[data-tests-filter-watched]'),
      btnExpanded: document.querySelector('#diff-file-tree-filter button[aria-haspopup]')?.getAttribute('aria-expanded'),
      injectedElements: document.querySelectorAll('[data-tests-filter-injected]').length,
      menuCount: document.querySelectorAll('[role="menu"]').length,
    };
  });
  console.log('  Dropdown debug:', JSON.stringify(dropdownDebug));

  const toggleInfo = await page.evaluate(() => {
    const el = document.querySelector('label[data-tests-filter-injected]') ||
      document.querySelector('li[data-tests-filter-injected]');
    if (!el) return { found: false };
    return {
      found: true,
      text: el.textContent?.trim(),
      tag: el.tagName,
    };
  });
  toggleFound = toggleInfo.found;
  console.log('  Toggle found:', toggleFound);
  if (toggleFound) console.log('  Toggle text:', toggleInfo.text);
  check('Filter toggle injected', toggleFound);
  await screenshot(page, 'dropdown-open');
} catch (e) {
  console.log('  Error:', e.message);
}

// 7. Click toggle and verify non-test .ts files stay visible
if (toggleFound) {
  console.log('\nStep 6: Clicking toggle (show tests)...');
  const toggleSelector = 'li[data-tests-filter-injected][role="menuitemcheckbox"], label[data-tests-filter-injected]';
  await page.click(toggleSelector);
  await page.waitForTimeout(1000);

  const afterToggle = await page.evaluate(() => {
    const results = { hiddenNonTestTs: [], visibleTests: 0, hiddenTests: 0 };
    // Check diffs
    for (const btn of document.querySelectorAll('button[data-file-path]')) {
      const fp = btn.getAttribute('data-file-path');
      const panel = btn.closest('div[id^="diff-"][class*="Diff-module__diff"]');
      const isHidden = panel?.style.display === 'none';
      if (/\.test\.tsx?$/i.test(fp)) {
        if (isHidden) results.hiddenTests++; else results.visibleTests++;
      } else if (fp?.endsWith('.ts') && isHidden) {
        results.hiddenNonTestTs.push(fp);
      }
    }
    // Check tree
    for (const item of document.querySelectorAll('li[role="treeitem"]')) {
      if (item.getAttribute('data-tree-entry-type') === 'directory') continue;
      const link = item.querySelector('a');
      const text = link?.getAttribute('title') || link?.textContent?.trim() || '';
      if (text.endsWith('.ts') && !/\.test\.tsx?$/i.test(text)) {
        if (item.style.display === 'none' || getComputedStyle(item).display === 'none') {
          results.hiddenNonTestTs.push('tree:' + text);
        }
      }
    }
    return results;
  });

  console.log('  After toggle: visible tests:', afterToggle.visibleTests, 'hidden tests:', afterToggle.hiddenTests);
  if (afterToggle.hiddenNonTestTs.length > 0) {
    console.log('  HIDDEN non-test .ts files:');
    for (const p of afterToggle.hiddenNonTestTs) console.log(`    ${p}`);
  }
  check('After toggle: no non-test .ts hidden', afterToggle.hiddenNonTestTs.length === 0);
  await screenshot(page, 'after-toggle-click');
}

// Summary
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
const keepOpen = process.argv.includes('--keep-open');
if (keepOpen) {
  console.log('\nBrowser stays open. Press Ctrl+C to close.');
  await new Promise(() => {});
} else {
  await context.close();
  process.exit(failed > 0 ? 1 : 0);
}

async function getExtensionId(ctx) {
  const p = await ctx.newPage();
  await p.goto('chrome://extensions/');
  await p.waitForTimeout(1000);
  const id = await p.evaluate(() => {
    const mgr = document.querySelector('extensions-manager');
    if (!mgr?.shadowRoot) return null;
    const list = mgr.shadowRoot.querySelector('extensions-item-list');
    if (!list?.shadowRoot) return null;
    for (const ext of list.shadowRoot.querySelectorAll('extensions-item')) {
      const name = ext.shadowRoot?.querySelector('#name');
      if (name?.textContent?.includes('GitHub YOLO Review')) return ext.getAttribute('id');
    }
    return null;
  });
  await p.close();
  return id;
}
