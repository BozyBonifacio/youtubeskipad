/* YouTube Auto-Skip v1.0.2 (Manifest V3 content script) */
(() => {
  'use strict';

  // Do not initialize twice if a page reuses its existing document.
  if (document.documentElement.dataset.youtubeAutoSkipLoaded === 'true') return;
  document.documentElement.dataset.youtubeAutoSkipLoaded = 'true';

  const PREFIX = '[YouTube Auto-Skip]';
  const SELECTORS = [
    '.ytp-ad-skip-button-slot button',
    '.ytp-skip-ad-button button',
    '.ytp-ad-skip-button-container button',
    '.ytp-skip-ad-button-modern',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-slot [role="button"]',
    '.videoAdUiSkipButton',
    '[class*="skip-ad-button"] button',
    'button[class*="skip-ad"]',
    '[role="button"][class*="skip-ad"]'
  ];

  // Fallback for localized buttons, only while the player is showing an ad.
  const SKIP_LABEL = /^(?:skip\s+(?:ad|ads|advertisement|advertisements)(?:\s+now)?|überspringen|anzeige(?:n)?\s+überspringen|passer\s+(?:l.annonce|les\s+annonces)|omitir\s+anuncio(?:s)?|saltar\s+anuncio(?:s)?|pular\s+anúncio(?:s)?|salta\s+annuncio|annuncio\s+salta)$/iu;
  const ATTEMPT_COOLDOWN_MS = 1000;
  const attemptTimes = new WeakMap();
  let enabled = true;
  let scheduled = false;
  let clickCount = 0;

  console.info(`${PREFIX} v1.0.2 loaded on ${location.hostname}`);

  function visibleAndEnabled(el) {
    if (!el || !el.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true') {
      return false;
    }
    const computed = getComputedStyle(el);
    if (
      computed.display === 'none' ||
      computed.visibility === 'hidden' ||
      computed.pointerEvents === 'none'
    ) return false;
    const box = el.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return false;

    // YouTube occasionally leaves an invisible skip control in the DOM.
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  }

  function getSkipButton(player) {
    // Search the YouTube player only, not the rest of the page.
    for (const selector of SELECTORS) {
      for (const candidate of player.querySelectorAll(selector)) {
        if (visibleAndEnabled(candidate)) return { element: candidate, selector };
      }
    }

    // Some YouTube variants replace CSS classes but keep button labels.
    if (player.classList.contains('ad-showing')) {
      for (const candidate of player.querySelectorAll('button, [role="button"]')) {
        const label = (
          candidate.getAttribute('aria-label') ||
          candidate.innerText ||
          candidate.textContent || ''
        ).replace(/\s+/g, ' ').trim();
        if (SKIP_LABEL.test(label) && visibleAndEnabled(candidate)) {
          return { element: candidate, selector: 'localized-label' };
        }
      }
    }
    return null;
  }

  function checkForSkipButton() {
    if (!enabled) return;
    const player = document.querySelector('#movie_player, .html5-video-player');
    if (!player) return;
    const found = getSkipButton(player);
    if (!found) return;

    const now = Date.now();
    if (now - (attemptTimes.get(found.element) || 0) < ATTEMPT_COOLDOWN_MS) return;
    attemptTimes.set(found.element, now);

    // DOM click triggers the same handler that normally handles this control.
    found.element.click();
    clickCount += 1;
    document.documentElement.dataset.youtubeAutoSkipClickCount = String(clickCount);
    document.documentElement.dataset.youtubeAutoSkipLastSelector = found.selector;
    console.info(`${PREFIX} clicked Skip Ad (matched ${found.selector})`);
  }

  function scheduleCheck() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      checkForSkipButton();
    });
  }

  chrome.storage.local.get({ enabled: true }, result => {
    enabled = result.enabled !== false;
    scheduleCheck();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.enabled) return;
    enabled = changes.enabled.newValue !== false;
    console.info(`${PREFIX} ${enabled ? 'enabled' : 'disabled'}`);
    scheduleCheck();
  });

  const observer = new MutationObserver(scheduleCheck);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'disabled', 'aria-label', 'aria-disabled']
  });

  // This catches skip buttons that become actionable without a DOM mutation.
  setInterval(checkForSkipButton, 350);
  window.addEventListener('yt-navigate-finish', scheduleCheck);
})();
