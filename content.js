/* YouTube Auto-Skip v1.1.0 -- visible Skip Ad button detection and diagnostics */
(() => {
  'use strict';

  const root = document.documentElement;
  if (root.dataset.youtubeAutoSkipLoaded === 'true') return;
  root.dataset.youtubeAutoSkipLoaded = 'true';
  root.dataset.youtubeAutoSkipVersion = '1.1.0';

  const PREFIX = '[YouTube Auto-Skip]';
  const SKIP_SELECTORS = [
    '.ytp-ad-skip-button-slot button',
    '.ytp-skip-ad-button button',
    '.ytp-ad-skip-button-container button',
    'button.ytp-ad-skip-button-modern',
    'button.ytp-skip-ad-button',
    'button.ytp-ad-skip-button',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button',
    '.videoAdUiSkipButton',
    '.ytp-ad-skip-button-slot [role="button"]'
  ];
  const SKIP_LABEL = /(?:skip\s+(?:ads?|advertisements?)|überspringen|anzeige(?:n)?\s+überspringen)/iu;
  const ATTEMPT_INTERVAL_MS = 1800;

  let enabled = false;
  let initialized = false;
  let scheduled = false;
  let pending = false;
  let lastAttempt = 0;
  let lastButton = null;
  let attempts = 0;
  let observedGone = 0;
  let lastResult = 'Not initialized';
  let status = 'loading';

  function setStatus(value, detail) {
    status = value;
    root.dataset.youtubeAutoSkipStatus = value;
    if (detail) {
      lastResult = detail;
      root.dataset.youtubeAutoSkipLastResult = detail.slice(0, 350);
    }
  }
  function log(message) { console.info(`${PREFIX} ${message}`); }

  // Detect the actual visible, enabled Skip button. Do not require the
  // `ad-showing` class: YouTube does not apply it consistently to every layout.
  function visible(element) {
    if (!element || !element.isConnected) return false;
    // `visibility` and `pointer-events` are inherited, but a descendant can override
    // them (e.g. a full-player ad overlay with pointer-events:none whose Skip button
    // re-enables them), so only the button's own computed value counts.
    // clickablePoint() then confirms with elementFromPoint() that it receives clicks.
    const own = getComputedStyle(element);
    if (own.visibility === 'hidden' || own.pointerEvents === 'none') return false;
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      if (node.disabled || node.hidden || node.getAttribute('aria-disabled') === 'true') return false;
      const css = getComputedStyle(node);
      if (css.display === 'none' || Number(css.opacity) === 0) return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function clickablePoint(element) {
    const rect = element.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const right = Math.min(window.innerWidth, rect.right);
    const top = Math.max(0, rect.top);
    const bottom = Math.min(window.innerHeight, rect.bottom);
    if (right <= left || bottom <= top) return null;

    // Avoid clicking an overlay or an unrelated CTA that happens to cover the Skip button.
    for (const fx of [0.5, 0.25, 0.75]) {
      for (const fy of [0.5, 0.25, 0.75]) {
        const x = left + (right - left) * fx;
        const y = top + (bottom - top) * fy;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === element || element.contains(hit))) return {x, y};
      }
    }
    return null;
  }

  function candidate(player) {
    const seen = new Set();
    const found = [];
    for (const selector of SKIP_SELECTORS) {
      for (const element of player.querySelectorAll(selector)) {
        const control = element.closest('button, [role="button"]') || element;
        if (!seen.has(control)) {
          found.push({element: control, selector});
          seen.add(control);
        }
      }
    }
    // Handles other YouTube languages and markup variants.
    for (const element of player.querySelectorAll('button, [role="button"]')) {
      const label = `${element.getAttribute('aria-label') || ''} ${element.textContent || ''}`;
      if (SKIP_LABEL.test(label) && !seen.has(element)) {
        found.push({element, selector: 'localized-label'});
        seen.add(element);
      }
    }

    for (const item of found) {
      if (!visible(item.element)) continue;
      const point = clickablePoint(item.element);
      if (point) return {...item, ...point};
    }
    return null;
  }

  function runCheck() {
    if (!initialized) return;
    if (!enabled) { setStatus('disabled'); return; }
    if (pending) return;

    const player = document.querySelector('#movie_player, .html5-video-player');
    if (!player) { setStatus('player-not-found'); return; }
    const skip = candidate(player);
    if (!skip) {
      if (lastButton && (!lastButton.isConnected || !visible(lastButton))) {
        observedGone += 1;
        root.dataset.youtubeAutoSkipObservedGone = String(observedGone);
        setStatus('skip-button-disappeared', 'Skip button disappeared after browser click (likely skipped).');
        lastButton = null;
      } else if (status !== 'skip-button-disappeared') {
        setStatus('waiting-for-skip-button');
      }
      return;
    }

    root.dataset.youtubeAutoSkipLastSelector = skip.selector;
    if (Date.now() - lastAttempt < ATTEMPT_INTERVAL_MS) return;
    lastAttempt = Date.now();
    lastButton = skip.element;
    attempts += 1;
    root.dataset.youtubeAutoSkipClickAttempts = String(attempts);
    pending = true;
    setStatus('browser-click-pending', `Found ${skip.selector}; sending browser-level input.`);

    chrome.runtime.sendMessage({type: 'YTA_SKIP_CLICK', x: skip.x, y: skip.y}, response => {
      pending = false;
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        setStatus('extension-error', runtimeError.message || String(runtimeError));
        log(lastResult);
      } else if (response && response.ok) {
        setStatus('browser-click-dispatched', 'Browser-level click dispatched; waiting for Skip button to disappear.');
        log(`Browser-level click sent (matched ${skip.selector}).`);
      } else {
        const detail = (response && response.detail) || 'Unknown browser-click failure';
        setStatus((response && response.code) || 'click-failed', detail);
        log(detail);
      }
      setTimeout(scheduleCheck, 350);
    });
  }

  function scheduleCheck() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; runCheck(); });
  }

  chrome.storage.local.get({enabled: true}, value => {
    enabled = value.enabled !== false;
    initialized = true;
    setStatus(enabled ? 'waiting-for-skip-button' : 'disabled');
    log(`v1.1.0 active on ${location.hostname}; enabled=${enabled}.`);
    scheduleCheck();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.enabled) return;
    enabled = changes.enabled.newValue !== false;
    setStatus(enabled ? 'waiting-for-skip-button' : 'disabled');
    scheduleCheck();
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'YTA_GET_STATUS') return false;
    sendResponse({enabled, initialized, status, lastResult, attempts, observedGone,
      version: '1.1.0', selector: root.dataset.youtubeAutoSkipLastSelector || ''});
    return false;
  });

  const observer = new MutationObserver(scheduleCheck);
  observer.observe(root, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['class', 'style', 'disabled', 'aria-disabled', 'hidden', 'aria-label']
  });
  setInterval(scheduleCheck, 400);
  window.addEventListener('yt-navigate-finish', scheduleCheck);
  window.addEventListener('resize', scheduleCheck);
})();
