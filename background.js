/* YouTube Auto-Skip v1.1.0 -- browser-level click via Chrome Debugger Protocol */
'use strict';

const busyTabs = new Set();
const lastAttemptAt = new Map();
const MIN_INTERVAL_MS = 1200;

function isYoutubeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' &&
      (url.hostname === 'youtube.com' || url.hostname === 'www.youtube.com');
  } catch {
    return false;
  }
}

async function browserClick(tabId, x, y) {
  const target = {tabId};
  let attached = false;
  try {
    await chrome.debugger.attach(target, '1.3');
    attached = true;
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved', x, y, modifiers: 0
    });
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1
    });
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1
    });
    return {ok: true, detail: 'Browser-level mouse input dispatched (not yet confirmed skipped).'};
  } catch (error) {
    const detail = String(error && error.message ? error.message : error);
    const conflictingDebugger = /debugger|devtools|already attached|another extension/i.test(detail);
    return {
      ok: false,
      code: conflictingDebugger ? 'debugger-unavailable' : 'input-failed',
      detail: conflictingDebugger
        ? `Cannot attach while DevTools or another debugger is attached: ${detail}. Close F12/DevTools and retry.`
        : `Browser-level click failed: ${detail}`
    };
  } finally {
    if (attached) {
      try { await chrome.debugger.detach(target); } catch (_) { /* Tab could be closing. */ }
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'YTA_SKIP_CLICK') return false;
  const tab = sender.tab;
  if (!tab || !Number.isInteger(tab.id) ||
      !isYoutubeUrl(sender.url || tab.url) ||
      (typeof sender.frameId === 'number' && sender.frameId !== 0)) {
    sendResponse({ok: false, code: 'unauthorized-tab', detail: 'Only a top-level YouTube tab can request a click.'});
    return false;
  }

  // Don't bound by tab.width/height: those are screen pixels, while x/y are CSS pixels
  // from getBoundingClientRect(). Below 100% page zoom a right-edge Skip button lies
  // past tab.width and would be wrongly rejected.
  const {x, y} = message;
  if (!Number.isFinite(x) || !Number.isFinite(y) ||
      x < 0 || y < 0 || x > 10000 || y > 10000) {
    sendResponse({ok: false, code: 'invalid-coordinates', detail: 'Rejected out-of-bounds click.'});
    return false;
  }

  const now = Date.now();
  const previous = lastAttemptAt.get(tab.id) || 0;
  if (busyTabs.has(tab.id) || now - previous < MIN_INTERVAL_MS) {
    sendResponse({ok: false, code: 'throttled', detail: 'A recent click is already in progress.'});
    return false;
  }

  busyTabs.add(tab.id);
  lastAttemptAt.set(tab.id, now);
  (async () => {
    let result;
    try {
      result = await browserClick(tab.id, x, y);
    } catch (error) {
      result = {ok: false, code: 'unexpected-error', detail: String(error)};
    } finally {
      busyTabs.delete(tab.id);
    }
    sendResponse(result);
  })();
  return true; // Keep the message port alive across the async Debugger API calls.
});

chrome.tabs.onRemoved.addListener(tabId => {
  busyTabs.delete(tabId);
  lastAttemptAt.delete(tabId);
});
