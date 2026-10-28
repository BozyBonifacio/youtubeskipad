'use strict';
const toggle = document.getElementById('enabled');
const statusEl = document.getElementById('status');
const detailsEl = document.getElementById('details');
const statsEl = document.getElementById('stats');

const labels = {
  'waiting-for-skip-button': 'Waiting for Skip Ad',
  'browser-click-pending': 'Sending browser click...',
  'browser-click-dispatched': 'Browser click sent',
  'skip-button-disappeared': 'Skip button disappeared',
  'player-not-found': 'YouTube player not found',
  'debugger-unavailable': 'Close F12 / DevTools to enable skipping',
  'throttled': 'Retry pending',
  'input-failed': 'Browser input failed',
  'extension-error': 'Extension message failed',
  'disabled': 'Auto-skip disabled'
};

chrome.storage.local.get({enabled: true}, value => {
  toggle.checked = value.enabled !== false;
});
toggle.addEventListener('change', () => {
  chrome.storage.local.set({enabled: toggle.checked});
});

async function update() {
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    const host = tab && tab.url ? new URL(tab.url).hostname : '';
    if (!tab || !['www.youtube.com', 'youtube.com'].includes(host)) {
      statusEl.textContent = 'Open a YouTube tab';
      detailsEl.textContent = 'The status applies to the active browser tab.';
      statsEl.textContent = '';
      return;
    }
    const data = await chrome.tabs.sendMessage(tab.id, {type: 'YTA_GET_STATUS'});
    if (!data) throw new Error('No status received');
    statusEl.textContent = labels[data.status] || data.status;
    detailsEl.textContent = data.lastResult || '';
    statsEl.textContent = `Click attempts: ${data.attempts}  ·  Buttons disappeared: ${data.observedGone}`;
  } catch (_) {
    statusEl.textContent = 'Refresh your YouTube tab';
    detailsEl.textContent = 'The content script did not respond. Make sure extension site access is allowed.';
    statsEl.textContent = '';
  }
}
update();
setInterval(update, 1000);
