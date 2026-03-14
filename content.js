(function () {
  'use strict';

  /** Default test-file suffixes (matches original hardcoded behavior). */
  const DEFAULT_PATTERNS = [
    { suffix: '.test.ts', enabled: true },
    { suffix: '.test.tsx', enabled: true },
  ];

  /** Active suffix patterns loaded from storage. */
  let activePatterns = [];

  /** Compiled regex from enabled patterns, or null if none enabled. */
  let testRegex = null;

  /**
   * Build a RegExp that matches file paths ending with any enabled suffix.
   * Returns null if no patterns are enabled.
   */
  function buildTestRegex(patterns) {
    const enabled = patterns.filter((p) => p.enabled);
    if (enabled.length === 0) return null;
    const escaped = enabled.map((p) =>
      p.suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    return new RegExp('(' + escaped.join('|') + ')$', 'i');
  }

  /** Build a human-readable label like "Tests (.test.ts, .test.tsx)" from enabled patterns. */
  function buildPatternLabel() {
    const enabled = activePatterns.filter((p) => p.enabled);
    if (enabled.length === 0) return 'Tests (none)';
    return 'Tests (' + enabled.map((p) => p.suffix).join(', ') + ')';
  }

  /** Attribute used to mark DOM elements injected by this extension. */
  const INJECTED_ATTR = 'data-tests-filter-injected';

  /** Whether test files are currently hidden. */
  let testsHidden = true;

  /** Whether the extension is globally enabled (from popup toggle). */
  let extensionEnabled = false;

  /** MutationObserver instance watching for dynamic DOM changes. */
  let observer = null;

  // ─── File detection ───────────────────────────────────────────

  function isTestFile(filePath) {
    return testRegex ? testRegex.test(filePath) : false;
  }

  /**
   * Extract a file path from a tree item <li> element.
   * GitHub stores the full path in the link title or as nested text.
   */
  function getFilePathFromTreeItem(li) {
    const link = li.querySelector('a[href*="#diff-"]');
    if (link) {
      return link.getAttribute('title') || link.textContent.trim();
    }
    const labels = li.querySelectorAll('.ActionList-item-label');
    for (const label of labels) {
      const text = label.textContent.trim();
      if (isTestFile(text)) return text;
    }
    return null;
  }

  /**
   * Count test files in the current PR by scanning diff entries,
   * falling back to file tree items if no diff entries exist yet.
   */
  function countTestFiles() {
    let count = 0;
    const diffEntries = document.querySelectorAll(
      'copilot-diff-entry[data-file-path]'
    );
    for (const entry of diffEntries) {
      if (isTestFile(entry.getAttribute('data-file-path'))) count++;
    }
    if (count > 0) return count;

    const treeItems = document.querySelectorAll('li[role="treeitem"]');
    for (const item of treeItems) {
      const path = getFilePathFromTreeItem(item);
      if (path && isTestFile(path)) count++;
    }
    return count;
  }

  // ─── Filtering ────────────────────────────────────────────────

  function applyFilter() {
    if (!extensionEnabled) return;
    const hide = testsHidden;

    // Diff panels: <copilot-diff-entry data-file-path="..."> (classic view)
    for (const entry of document.querySelectorAll(
      'copilot-diff-entry[data-file-path]'
    )) {
      if (isTestFile(entry.getAttribute('data-file-path'))) {
        entry.style.display = hide ? 'none' : '';
      }
    }

    // Fallback diff divs not wrapped in copilot-diff-entry (classic view)
    for (const div of document.querySelectorAll(
      'div.js-file[data-tagsearch-path]'
    )) {
      if (div.closest('copilot-diff-entry')) continue;
      if (isTestFile(div.getAttribute('data-tagsearch-path'))) {
        div.style.display = hide ? 'none' : '';
      }
    }

    // Primer diff panels: map tree items to diff panels via #diff-HASH links
    for (const item of document.querySelectorAll('li[role="treeitem"]')) {
      if (item.getAttribute('data-tree-entry-type') === 'directory') continue;
      const link = item.querySelector('a[href*="#diff-"]');
      if (!link) continue;
      const path = link.getAttribute('title') || link.textContent.trim();
      if (!isTestFile(path)) continue;
      const hash = link.getAttribute('href')?.split('#diff-')[1];
      if (!hash) continue;
      const panel = document.getElementById('diff-' + hash);
      if (panel) panel.style.display = hide ? 'none' : '';
    }

    // File tree items
    for (const item of document.querySelectorAll('li[role="treeitem"]')) {
      if (item.getAttribute('data-tree-entry-type') === 'directory') continue;
      // Primer directories contain a child ul[role="group"]
      if (item.querySelector(':scope > ul[role="group"]')) continue;
      const path = getFilePathFromTreeItem(item);
      if (path && isTestFile(path)) {
        item.style.display = hide ? 'none' : '';
      }
    }

    collapseEmptyDirectories();
    syncAllCheckboxes();
  }

  /**
   * Hide directory tree items whose visible children have all been filtered out.
   * Processes bottom-up (deepest directories first) so parent visibility
   * is computed after all children are resolved.
   */
  function collapseEmptyDirectories() {
    // Match directories: items with a child group list (works for both classic and Primer views)
    const dirs = Array.from(
      document.querySelectorAll('li[role="treeitem"]')
    ).filter((li) =>
      li.getAttribute('data-tree-entry-type') === 'directory' ||
      li.querySelector(':scope > ul[role="group"]')
    );

    dirs.sort((a, b) => {
      return (
        parseInt(b.getAttribute('aria-level') || '0', 10) -
        parseInt(a.getAttribute('aria-level') || '0', 10)
      );
    });

    for (const dir of dirs) {
      const group = dir.querySelector('ul[role="group"]');
      if (!group) continue;

      const children = group.querySelectorAll(':scope > li[role="treeitem"]');
      const allHidden =
        children.length > 0 &&
        Array.from(children).every((c) => c.style.display === 'none');

      dir.style.display = allHidden ? 'none' : '';
    }
  }

  /** Restore all elements hidden by this extension. */
  function removeFilter() {
    for (const entry of document.querySelectorAll(
      'copilot-diff-entry[data-file-path]'
    )) {
      if (isTestFile(entry.getAttribute('data-file-path'))) {
        entry.style.display = '';
      }
    }

    for (const div of document.querySelectorAll(
      'div.js-file[data-tagsearch-path]'
    )) {
      if (div.closest('copilot-diff-entry')) continue;
      if (isTestFile(div.getAttribute('data-tagsearch-path'))) {
        div.style.display = '';
      }
    }

    // Primer diff panels: restore via tree-to-diff mapping
    for (const treeItem of document.querySelectorAll('li[role="treeitem"]')) {
      if (treeItem.getAttribute('data-tree-entry-type') === 'directory') continue;
      const link = treeItem.querySelector('a[href*="#diff-"]');
      if (!link) continue;
      const fp = link.getAttribute('title') || link.textContent.trim();
      if (!isTestFile(fp)) continue;
      const hash = link.getAttribute('href')?.split('#diff-')[1];
      if (!hash) continue;
      const panel = document.getElementById('diff-' + hash);
      if (panel) panel.style.display = '';
    }

    for (const item of document.querySelectorAll('li[role="treeitem"]')) {
      const isDir = item.getAttribute('data-tree-entry-type') === 'directory' ||
        item.querySelector(':scope > ul[role="group"]');
      if (isDir) {
        if (item.style.display === 'none') item.style.display = '';
        continue;
      }
      const path = getFilePathFromTreeItem(item);
      if (path && isTestFile(path)) {
        item.style.display = '';
      }
    }
  }

  // ─── Shared checkbox handler ──────────────────────────────────

  function onTestsCheckboxChange(checked) {
    testsHidden = !checked;
    chrome.storage.local.set({ testsHidden: testsHidden });
    applyFilter();
  }

  /** Keep all injected checkboxes in sync with current state. */
  function syncAllCheckboxes() {
    for (const cb of document.querySelectorAll('.tests-filter-checkbox')) {
      cb.checked = !testsHidden;
      const label = cb.closest('label');
      if (label) {
        label.setAttribute('aria-checked', String(!testsHidden));
        const icon = label.querySelector('svg');
        if (icon) icon.style.visibility = testsHidden ? 'hidden' : 'visible';
      }
    }
    for (const span of document.querySelectorAll('.tests-filter-count')) {
      span.textContent = countTestFiles();
    }
  }

  // ─── Document-level capture handler for injected toggles ──────
  // Registered on `document` in the capture phase so it fires BEFORE
  // React 18's capture-phase handler on its root container.
  document.addEventListener('click', (e) => {
    const item = e.target.closest(`[${INJECTED_ATTR}]`);
    if (!item) return;
    // Skip non-interactive elements (e.g. separator)
    const cb = item.querySelector('.tests-filter-checkbox');
    if (!cb) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    const newChecked = !cb.checked;
    cb.checked = newChecked;
    item.setAttribute('aria-checked', String(newChecked));
    const svg = item.querySelector('svg');
    if (svg) svg.style.visibility = newChecked ? 'visible' : 'hidden';
    onTestsCheckboxChange(newChecked);
  }, true);

  // ─── UI injection: Diffbar dropdown ───────────────────────────

  /**
   * Inject a "Tests (.test.ts, .test.tsx)" toggle row into GitHub's native file-filter
   * dropdown. Supports two GitHub layouts:
   *   - Classic: <file-filter> with <details>/<summary> and .js-file-filter-form
   *   - Primer React: <button aria-haspopup> with <ul role="menu"> portal
   */
  function injectDiffbarToggle() {
    if (document.querySelector(`[${INJECTED_ATTR}]`)) return;

    const count = countTestFiles();
    if (count === 0) return;

    // Primer React layout: ul[aria-label="File extensions"] rendered as portal
    const primerGroup = document.querySelector('ul[aria-label="File extensions"]');
    if (primerGroup) {
      injectPrimerToggle(primerGroup, count);
      return;
    }

    // Classic layout: .js-file-filter-form fieldset
    const classicContainer =
      document.querySelector('.js-file-filter-form fieldset') ||
      document.querySelector('file-filter fieldset') ||
      document.querySelector('.js-file-filter-form') ||
      document.querySelector('file-filter details[open]');
    if (classicContainer) {
      injectClassicToggle(classicContainer, count);
    }
  }

  /** Inject into Primer React ActionList (logged-in / optimized view). */
  function injectPrimerToggle(group, count) {
    const lastItem = group.lastElementChild;
    if (!lastItem) return;

    // Clone the last native item to match its exact styling
    const item = lastItem.cloneNode(true);
    item.setAttribute(INJECTED_ATTR, '');
    item.setAttribute('aria-checked', String(!testsHidden));

    // Strip ALL data-* attributes so GitHub's own React handlers
    // don't treat this as a native file-type toggle
    for (const attr of Array.from(item.attributes)) {
      if (attr.name.startsWith('data-') && attr.name !== INJECTED_ATTR) {
        item.removeAttribute(attr.name);
      }
    }
    item.removeAttribute('value');
    item.removeAttribute('name');
    // Also strip from all descendants
    for (const child of item.querySelectorAll('*')) {
      for (const attr of Array.from(child.attributes)) {
        if (attr.name.startsWith('data-')) child.removeAttribute(attr.name);
      }
      child.removeAttribute('value');
      child.removeAttribute('name');
    }

    // Update label text: find spans, replace extension name and count
    const spans = item.querySelectorAll('span');
    for (const span of spans) {
      const text = span.textContent?.trim();
      if (text && /^\.\w+$/.test(text)) {
        span.textContent = buildPatternLabel();
      }
      if (text && /^\(?\d+\)?$/.test(text)) {
        span.textContent = String(count);
        span.classList.add('tests-filter-count');
      }
    }

    // Update checkmark visibility
    const svg = item.querySelector('svg');
    if (svg) svg.style.visibility = testsHidden ? 'hidden' : 'visible';

    // Hidden checkbox for syncAllCheckboxes
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'tests-filter-checkbox';
    cb.checked = !testsHidden;
    cb.style.display = 'none';
    item.prepend(cb);

    // Separator
    const sep = document.createElement('li');
    sep.setAttribute(INJECTED_ATTR, '');
    sep.setAttribute('role', 'separator');
    sep.style.cssText = 'list-style:none; border-top:1px solid var(--borderColor-default,#d1d9e0); margin:4px 8px;';

    group.append(sep, item);
  }

  /** Inject into classic GitHub SelectMenu (non-logged-in view). */
  function injectClassicToggle(container, count) {
    const extInputs = container.querySelectorAll('input.js-diff-file-type-option');
    const lastExtLabel = extInputs.length > 0
      ? extInputs[extInputs.length - 1].closest('label') || extInputs[extInputs.length - 1].parentElement
      : null;
    if (!lastExtLabel) return;

    const sep = document.createElement('div');
    sep.setAttribute(INJECTED_ATTR, '');
    sep.style.cssText = 'border-top: 1px solid var(--borderColor-default, #d1d9e0); margin: 4px 0;';

    const label = document.createElement('label');
    label.className = lastExtLabel.className || 'SelectMenu-item';
    label.setAttribute('role', 'menuitemcheckbox');
    label.setAttribute('aria-checked', String(!testsHidden));
    label.setAttribute(INJECTED_ATTR, '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'tests-filter-checkbox mr-2';
    checkbox.checked = !testsHidden;
    checkbox.addEventListener('change', (e) => onTestsCheckboxChange(e.target.checked));

    const countSpan = document.createElement('span');
    countSpan.className = 'tests-filter-count text-small color-fg-muted float-right';
    countSpan.textContent = count;

    label.append(checkbox, ' ' + buildPatternLabel() + ' ', countSpan);
    lastExtLabel.after(sep, label);
  }

  // ─── Lifecycle ────────────────────────────────────────────────

  function init() {
    if (!extensionEnabled) return;
    injectDiffbarToggle();
    watchFilterDropdown();
    applyFilter();
  }

  function cleanup() {
    document.querySelectorAll(`[${INJECTED_ATTR}]`).forEach((el) => el.remove());
    removeFilter();
  }

  /**
   * Watch the file-filter <details> element for open/close.
   * When the dropdown opens, attempt to inject our toggle row.
   *
   * GitHub's structure: <file-filter> contains <details> contains <summary>.
   * The form content inside <details> is lazy-loaded when opened,
   * so we must listen for the toggle event and retry with a delay.
   */
  function watchFilterDropdown() {
    // Pattern A: classic GitHub (<file-filter> with <details>/<summary>)
    const summary = document.querySelector('summary[data-target="file-filter.summary"]');
    const details = summary?.closest('details') ||
      document.querySelector('file-filter details');
    if (details && !details.hasAttribute('data-tests-filter-watched')) {
      details.setAttribute('data-tests-filter-watched', '');
      details.addEventListener('toggle', () => {
        if (details.open && extensionEnabled) {
          injectDiffbarToggle();
          setTimeout(injectDiffbarToggle, 150);
          setTimeout(injectDiffbarToggle, 500);
        }
      });
      return;
    }

    // Pattern B: Primer React (<button aria-haspopup> in #diff-file-tree-filter)
    const filterBtn = document.querySelector('#diff-file-tree-filter button[aria-haspopup="true"]');
    if (filterBtn && !filterBtn.hasAttribute('data-tests-filter-watched')) {
      filterBtn.setAttribute('data-tests-filter-watched', '');
      const btnObserver = new MutationObserver(() => {
        if (filterBtn.getAttribute('aria-expanded') === 'true' && extensionEnabled) {
          // Primer renders dropdown async — retry with delays
          injectDiffbarToggle();
          setTimeout(injectDiffbarToggle, 300);
          setTimeout(injectDiffbarToggle, 1000);
          setTimeout(injectDiffbarToggle, 2000);
        }
      });
      btnObserver.observe(filterBtn, { attributes: true, attributeFilter: ['aria-expanded'] });
      return;
    }
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      if (!extensionEnabled) return;
      let reapply = false;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (
            node.tagName === 'COPILOT-DIFF-ENTRY' ||
            node.querySelector?.('copilot-diff-entry') ||
            node.querySelector?.('button[data-file-path]')
          ) {
            reapply = true;
          }
          if (
            node.classList?.contains('SelectMenu') ||
            node.matches?.('.js-file-filter-form') ||
            node.querySelector?.('.js-file-filter-form')
          ) {
            injectDiffbarToggle();
          }
          if (
            node.matches?.('ul[aria-label="File extensions"]') ||
            node.querySelector?.('ul[aria-label="File extensions"]')
          ) {
            injectDiffbarToggle();
          }
          if (
            node.matches?.('file-filter') ||
            node.querySelector?.('file-filter') ||
            node.querySelector?.('summary[data-target="file-filter.summary"]') ||
            node.querySelector?.('#diff-file-tree-filter')
          ) {
            watchFilterDropdown();
          }
        }
      }
      if (reapply) applyFilter();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function stopObserver() {
    observer?.disconnect();
    observer = null;
  }

  // ─── Storage change listener ──────────────────────────────────

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.testsFilterEnabled) {
      extensionEnabled = !!changes.testsFilterEnabled.newValue;
      if (extensionEnabled) {
        init();
        startObserver();
      } else {
        cleanup();
        stopObserver();
      }
    }
    if (changes.testsHidden && extensionEnabled) {
      testsHidden = !!changes.testsHidden.newValue;
      applyFilter();
    }
    if (changes.testPatterns) {
      activePatterns = changes.testPatterns.newValue || DEFAULT_PATTERNS;
      testRegex = buildTestRegex(activePatterns);
      if (extensionEnabled) {
        cleanup();
        init();
      }
    }
  });

  // GitHub uses Turbo for SPA navigation — re-initialize when the page changes.
  for (const event of ['turbo:load', 'pjax:end']) {
    document.addEventListener(event, () => {
      if (extensionEnabled) setTimeout(init, 500);
    });
  }

  // ─── Startup ──────────────────────────────────────────────────

  chrome.storage.local.get(['testsFilterEnabled', 'testsHidden', 'testPatterns'], (data) => {
    extensionEnabled = !!data.testsFilterEnabled;
    testsHidden = data.testsHidden !== undefined ? data.testsHidden : true;
    activePatterns = data.testPatterns || DEFAULT_PATTERNS;
    testRegex = buildTestRegex(activePatterns);

    if (!extensionEnabled) return;
    if (document.readyState === 'complete') {
      init();
    } else {
      window.addEventListener('load', init);
    }
    startObserver();
  });
})();
