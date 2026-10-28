(() => {
  'use strict';

  const SELECTORS = [
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button',
    '.ytp-skip-ad-button',
    'button.ytp-ad-skip-button-modern',
    '.videoAdUiSkipButton',
    'button[aria-label="Skip Ads"]',
    'button[aria-label="Skip Ad"]',
    'button[aria-label="Skip ad"]'
  ];

  let enabled = true;
  let scheduled = false;
  let lastClick = 0;

  function isClickable(element) {
    if (!element || !element.isConnected || element.disabled) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function skipIfAvailable() {
    if (!enabled || Date.now() - lastClick < 700) return;
    for (const selector of SELECTORS) {
      const button = document.querySelector(selector);
      if (isClickable(button)) {
        button.click();
        lastClick = Date.now();
        return;
      }
    }
  }

  function scheduleCheck() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      skipIfAvailable();
    });
  }

  chrome.storage.local.get({ enabled: true }, result => {
    enabled = result.enabled !== false;
    scheduleCheck();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.enabled) {
      enabled = changes.enabled.newValue !== false;
      scheduleCheck();
    }
  });

  const observer = new MutationObserver(scheduleCheck);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'disabled', 'aria-label']
  });

  // Periodic fallback for player changes that don't trigger relevant mutations.
  setInterval(skipIfAvailable, 500);
  window.addEventListener('yt-navigate-finish', scheduleCheck);
})();
