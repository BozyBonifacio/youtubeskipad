'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

function setup({adShowing = true, buttonClass = 'ytp-skip-ad-button', label = 'Überspringen', disabled = false, visible = true, enabled = true, matchCss = true} = {}) {
  let clickCount = 0;
  let interval;
  let listener;
  let now = 10000;
  const html = { dataset: {} };
  const player = {
    classList: {contains: (name) => name === 'ad-showing' && adShowing},
    querySelectorAll: (selector) => {
      if (selector === 'button, [role="button"]') return [button];
      if (matchCss && selector === '.' + buttonClass) return [button];
      return [];
    }
  };
  const button = {
    isConnected: true,
    disabled,
    parentElement: null,
    getAttribute: (attribute) => attribute === 'aria-label' ? label : null,
    innerText: label,
    getBoundingClientRect: () => ({width: visible ? 120 : 0, height: visible ? 32 : 0}),
    click() {clickCount += 1;}
  };
  const storage = {enabled};
  const context = {
    console: {info: () => {}},
    location: {hostname: 'www.youtube.com'},
    document: {
      documentElement: html,
      querySelector: (selector) => selector === '#movie_player, .html5-video-player' ? player : null,
    },
    getComputedStyle: () => ({display:'block', visibility:'visible', pointerEvents:'auto'}),
    chrome: {
      storage: {
        local: {get: (_, cb) => cb(storage)},
        onChanged: {addListener: (cb) => {listener = cb;}}
      }
    },
    MutationObserver: class {observe() {}},
    requestAnimationFrame: (cb) => cb(),
    setInterval: (cb) => { interval = cb; },
    window: {addEventListener() {}},
    Date: class extends Date {static now() {return now;}}
  };
  vm.runInNewContext(code, context);
  return {
    button,
    html,
    get clicks() {return clickCount;},
    tick(ms) { now += ms; interval(); },
    setEnabled(value) {listener({enabled: {newValue: value}}, 'local');},
    setLabel(value) {button.innerText = value; button.getAttribute = attr => attr === 'aria-label' ? value : null;}
  };
}

const german = setup();
assert.equal(german.clicks, 1, 'German Skip button should be clicked immediately');
german.tick(500);
assert.equal(german.clicks, 1, 'Click attempts are throttled');
german.tick(600);
assert.equal(german.clicks, 2, 'May retry after the cooldown');
assert.equal(german.html.dataset.youtubeAutoSkipLoaded, 'true');
assert.equal(german.html.dataset.youtubeAutoSkipClickCount, '2');

const translated = setup({buttonClass: 'unknown-button', matchCss: false});
assert.equal(translated.clicks, 1, 'Localized label fallback should work during an ad');
const notAnAd = setup({adShowing: false, buttonClass: 'unknown-button', matchCss: false});
assert.equal(notAnAd.clicks, 0, 'Localized-label fallback must not click outside ads');
const hidden = setup({visible: false});
assert.equal(hidden.clicks, 0, 'Hidden buttons must not be clicked');
const disabled = setup({disabled: true});
assert.equal(disabled.clicks, 0, 'Disabled buttons must not be clicked');
const toggled = setup({enabled: false});
assert.equal(toggled.clicks, 0, 'Disabled extension must not click');
toggled.setEnabled(true);
assert.equal(toggled.clicks, 1, 'Enabling extension must trigger a check');
toggled.setEnabled(false);
toggled.tick(1500);
assert.equal(toggled.clicks, 1, 'Disabling extension must prevent clicks');
console.log('PASS: 7 content-script scenarios (selectors, German label, ad gating, visibility, disabled button, cooldown, toggle)');
