'use strict';

const toggle = document.getElementById('enabled');
const status = document.getElementById('status');

function updateStatus(enabled) {
  status.textContent = enabled ? 'Auto-skip is enabled' : 'Auto-skip is disabled';
}

chrome.storage.local.get({ enabled: true }, result => {
  toggle.checked = result.enabled !== false;
  updateStatus(toggle.checked);
});

toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  chrome.storage.local.set({ enabled }, () => updateStatus(enabled));
});
