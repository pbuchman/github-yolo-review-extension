function setIcon(enabled) {
  const suffix = enabled ? '-active' : '';
  chrome.action.setIcon({
    path: {
      16: `icons/icon${suffix}-16.png`,
      48: `icons/icon${suffix}-48.png`,
      128: `icons/icon${suffix}-128.png`,
    },
  });
}

// Set icon on startup
chrome.storage.local.get('testsFilterEnabled', (data) => {
  setIcon(!!data.testsFilterEnabled);
});

// Update icon when state changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.testsFilterEnabled) {
    setIcon(!!changes.testsFilterEnabled.newValue);
  }
});
