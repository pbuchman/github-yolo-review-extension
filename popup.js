const toggle = document.getElementById('toggle');
const status = document.getElementById('status');
const patternsSection = document.getElementById('patterns-section');
const patternList = document.getElementById('pattern-list');
const newPatternInput = document.getElementById('new-pattern');
const addPatternBtn = document.getElementById('add-pattern');

const DEFAULT_PATTERNS = [
  { suffix: '.test.ts', enabled: true },
  { suffix: '.test.tsx', enabled: true },
];

let patterns = [];

chrome.storage.local.get(['testsFilterEnabled', 'testPatterns'], (data) => {
  toggle.checked = !!data.testsFilterEnabled;
  patterns = data.testPatterns || DEFAULT_PATTERNS;
  updateStatus(toggle.checked);
  updatePatternsVisibility(toggle.checked);
  renderPatterns();
});

toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  chrome.storage.local.set({ testsFilterEnabled: enabled });
  updateStatus(enabled);
  updatePatternsVisibility(enabled);
});

addPatternBtn.addEventListener('click', addPattern);
newPatternInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addPattern();
});

function addPattern() {
  let suffix = newPatternInput.value.trim();
  if (!suffix) return;
  if (!suffix.startsWith('.')) suffix = '.' + suffix;

  // Prevent duplicates (case-insensitive)
  if (patterns.some((p) => p.suffix.toLowerCase() === suffix.toLowerCase())) {
    newPatternInput.value = '';
    return;
  }

  patterns.push({ suffix, enabled: true });
  savePatterns();
  newPatternInput.value = '';
  renderPatterns();
}

function removePattern(index) {
  patterns.splice(index, 1);
  savePatterns();
  renderPatterns();
}

function togglePattern(index) {
  patterns[index].enabled = !patterns[index].enabled;
  savePatterns();
}

function savePatterns() {
  chrome.storage.local.set({ testPatterns: patterns });
}

function renderPatterns() {
  patternList.innerHTML = '';
  patterns.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'pattern-row';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = p.enabled;
    cb.addEventListener('change', () => togglePattern(i));

    const label = document.createElement('span');
    label.className = 'pattern-suffix';
    label.textContent = p.suffix;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'pattern-remove';
    removeBtn.textContent = '\u00d7';
    removeBtn.title = 'Remove pattern';
    removeBtn.addEventListener('click', () => removePattern(i));

    row.append(cb, label, removeBtn);
    patternList.appendChild(row);
  });
}

function updatePatternsVisibility(enabled) {
  patternsSection.classList.toggle('visible', enabled);
}

function updateStatus(enabled) {
  status.textContent = enabled
    ? 'Enabled - test files hidden by default on PR pages'
    : 'Disabled';
}
