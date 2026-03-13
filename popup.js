const toggle = document.getElementById('toggle');
const status = document.getElementById('status');

chrome.storage.local.get('testsFilterEnabled', (data) => {
  toggle.checked = !!data.testsFilterEnabled;
  updateStatus(toggle.checked);
});

toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  chrome.storage.local.set({ testsFilterEnabled: enabled });
  updateStatus(enabled);
});

function updateStatus(enabled) {
  status.textContent = enabled
    ? 'Enabled - test files hidden by default on PR pages'
    : 'Disabled';
}
