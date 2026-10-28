/* YouTube Auto-Skip v1.0.3: click first, seek fallback for ignored synthetic clicks */
(() => {
  'use strict';

  const root = document.documentElement;
  if (root.dataset.youtubeAutoSkipLoaded === 'true') return;
  root.dataset.youtubeAutoSkipLoaded = 'true';
  root.dataset.youtubeAutoSkipVersion = '1.0.3';

  const PREFIX = '[YouTube Auto-Skip]';
  const SKIP_SELECTORS = [
    '.ytp-ad-skip-button-slot button',
    '.ytp-skip-ad-button button',
    '.ytp-ad-skip-button-container button',
    'button.ytp-skip-ad-button',
    'button.ytp-ad-skip-button-modern',
    'button.ytp-ad-skip-button',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button',
    '.videoAdUiSkipButton'
  ];
  const LABEL = /(?:^|\b)(?:skip\s+ads?|skip\s+advertisements?|überspringen|anzeige(?:n)?\s+überspringen)(?:\b|$)/iu;
  const FALLBACK_AFTER_MS = 350;
  const SEEK_RETRY_MS = 1600;
  const MAX_SEEKS_PER_AD = 2;

  let enabled = false;
  let initialized = false;
  let scheduled = false;
  let ad = null;
  let clickAttempts = 0;
  let seekAttempts = 0;

  function log(message) { console.info(`${PREFIX} ${message}`); }
  function state(value) { root.dataset.youtubeAutoSkipStatus = value; }

  function isVisibleAndEnabled(element) {
    if (!element || !element.isConnected || element.disabled ||
        element.getAttribute('aria-disabled') === 'true') return false;
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      const css = getComputedStyle(node);
      if (css.display === 'none' || css.visibility === 'hidden' ||
          css.pointerEvents === 'none') return false;
      if (node.disabled || node.getAttribute('aria-disabled') === 'true') return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function skipControl(player) {
    for (const selector of SKIP_SELECTORS) {
      for (const element of player.querySelectorAll(selector)) {
        if (isVisibleAndEnabled(element)) return {element, selector};
      }
    }
    for (const element of player.querySelectorAll('button, [role="button"]')) {
      const text = (element.getAttribute('aria-label') || element.textContent || '').trim();
      if (LABEL.test(text) && isVisibleAndEnabled(element)) {
        return {element, selector: 'localized-label'};
      }
    }
    return null;
  }

  function check() {
    if (!initialized || !enabled) return;
    const player = document.querySelector('#movie_player, .html5-video-player');
    if (!player) return;
    const adShowing = player.classList.contains('ad-showing') ||
                      player.classList.contains('ad-interrupting');
    if (!adShowing) {
      if (ad && ad.clickAt) { state('ad-ended'); log('Ad finished after skip attempt.'); }
      ad = null;
      return;
    }

    const video = player.querySelector('video.html5-main-video, video');
    if (!video) return;
    const src = video.currentSrc || video.src || '';
    const now = Date.now();
    // Each new ad (including the next ad in a pod) gets its own attempt budget.
    if (!ad || ad.video !== video || ad.src !== src ||
        (ad.lastTime > 4 && video.currentTime < 1 && ad.seekCount > 0)) {
      ad = {video, src, clickAt: 0, seekAt: 0, seekCount: 0, lastTime: 0};
    }
    ad.lastTime = video.currentTime;

    const skip = skipControl(player);
    if (!skip) return; // Never touch an ad before YouTube enables Skip Ad.

    if (!ad.clickAt) {
      ad.clickAt = now;
      clickAttempts += 1;
      root.dataset.youtubeAutoSkipClickAttempts = String(clickAttempts);
      root.dataset.youtubeAutoSkipLastSelector = skip.selector;
      try {
        skip.element.click();
        state('click-attempted');
        log(`Click attempted (${skip.selector}); checking if YouTube accepted it.`);
      } catch (error) {
        state('click-failed');
        log(`Click attempt failed: ${String(error)}`);
      }
      setTimeout(check, FALLBACK_AFTER_MS + 30);
      return;
    }

    if (now - ad.clickAt < FALLBACK_AFTER_MS) return;
    if (ad.seekCount >= MAX_SEEKS_PER_AD ||
        (ad.seekAt && now - ad.seekAt < SEEK_RETRY_MS)) return;

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0 ||
        video.currentTime >= duration - 0.15) {
      state('seek-unavailable');
      return;
    }

    // The click can be ignored when YouTube checks event.isTrusted.
    // Seeking is attempted only for an ad with an already-active Skip button.
    ad.seekCount += 1;
    ad.seekAt = now;
    seekAttempts += 1;
    root.dataset.youtubeAutoSkipSeekAttempts = String(seekAttempts);
    try {
      video.currentTime = Math.max(video.currentTime, duration - 0.06);
      state('seek-attempted');
      log(`Skip click not accepted. Tried ending skippable ad video (attempt ${ad.seekCount}).`);
    } catch (error) {
      state('seek-failed');
      log(`Video-end fallback failed: ${String(error)}`);
    }
  }

  function scheduleCheck() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; check(); });
  }

  chrome.storage.local.get({enabled: true}, result => {
    enabled = result.enabled !== false;
    initialized = true;
    state(enabled ? 'ready' : 'disabled');
    log(`v1.0.3 loaded (${enabled ? 'enabled' : 'disabled'}) on ${location.hostname}.`);
    scheduleCheck();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.enabled) return;
    enabled = changes.enabled.newValue !== false;
    if (!enabled) ad = null;
    state(enabled ? 'ready' : 'disabled');
    log(enabled ? 'enabled' : 'disabled');
    scheduleCheck();
  });

  const observer = new MutationObserver(scheduleCheck);
  observer.observe(root, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['class', 'style', 'disabled', 'aria-label', 'aria-disabled']
  });
  setInterval(check, 300);
  window.addEventListener('yt-navigate-finish', scheduleCheck);
})();
