'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
function fixture(opts = {}) {
  let now = 10_000;
  let listener;
  let periodic;
  const timers = [];
  const events = [];
  let clicks = 0;
  let showing = opts.showing !== false;
  let buttonVisible = opts.visible !== false;
  let disabled = opts.disabled === true;
  let src = 'ad1';
  let time = 5;
  const duration = opts.duration === undefined ? 30 : opts.duration;
  let seekCount = 0;
  const video = {
    isConnected: true,
    get currentSrc() { return src; },
    get currentTime() { return time; },
    set currentTime(value) { time = value; seekCount++; },
    duration,
  };
  const button = {
    nodeType: 1, isConnected: true, parentElement: null,
    get disabled() { return disabled; },
    getAttribute: key => key === 'aria-label' ? 'Überspringen' : null,
    textContent: 'Überspringen',
    getBoundingClientRect: () => ({width: buttonVisible ? 124 : 0, height: 35}),
    click() {
      clicks += 1;
      if (opts.clickWorks) showing = false;
    },
  };
  const player = {
    classList: {contains: name => (name === 'ad-showing' && showing)},
    querySelector: selector => selector === 'video.html5-main-video, video' ? video : null,
    querySelectorAll: selector => {
      if (selector === 'button, [role="button"]') return [button];
      if (opts.matchCss !== false && selector === '.ytp-skip-ad-button') return [button];
      return [];
    }
  };
  const root = {dataset: {}};
  const context = {
    console: {info: message => events.push(message)},
    location: {hostname: 'www.youtube.com'},
    document: {documentElement: root, querySelector: () => player},
    chrome: {storage: {local: {get: (_defaults, cb) => cb({enabled: opts.enabled !== false})}, onChanged: {addListener: cb => {listener = cb;}}}},
    getComputedStyle: () => ({display: 'block', visibility: 'visible', pointerEvents: 'auto'}),
    MutationObserver: class {observe() {}},
    requestAnimationFrame: fn => fn(),
    setInterval: cb => {periodic = cb;},
    setTimeout: (cb, ms) => {timers.push({time: now + ms, cb});},
    Date: class extends Date {static now() {return now;}},
    window: {addEventListener() {}},
  };
  vm.runInNewContext(script, context);
  return {
    root, events,
    get clicks() {return clicks;},
    get seeks() {return seekCount;},
    get videoTime() {return time;},
    setShowing(value) {showing = value; periodic();},
    setVisible(value) {buttonVisible = value; periodic();},
    setDisabled(value) {disabled = value; periodic();},
    newAd() {src = 'ad2'; time = 4; periodic();},
    enabled(value) {listener({enabled: {newValue: value}}, 'local');},
    advance(ms) {
      const target = now + ms;
      while (timers.some(timer => timer.time <= target)) {
        timers.sort((a,b)=>a.time-b.time);
        const timer = timers.shift();
        now = timer.time;
        timer.cb();
      }
      now = target;
      periodic();
    }
  };
}

const basic = fixture();
assert.equal(basic.clicks, 1, 'first action is click attempt');
assert.equal(basic.seeks, 0, 'no immediate seek');
assert.equal(basic.root.dataset.youtubeAutoSkipVersion, '1.0.3');
basic.advance(349);
assert.equal(basic.seeks, 0, 'wait for trusted click');
basic.advance(35);
assert.equal(basic.seeks, 1, 'falls back to seek for ignored click');
assert.ok(basic.videoTime > 29.9, 'video seeks near duration');
assert.equal(basic.root.dataset.youtubeAutoSkipStatus, 'seek-attempted');
basic.advance(1800);
assert.equal(basic.seeks, 1, 'does not repeat when video is already at end');

const successful = fixture({clickWorks: true});
assert.equal(successful.clicks, 1);
successful.advance(450);
assert.equal(successful.seeks, 0, 'never seek when click ended the ad');
assert.equal(successful.root.dataset.youtubeAutoSkipStatus, 'ad-ended');

const notAd = fixture({showing: false});
assert.equal(notAd.clicks, 0, 'never act on normal video');
assert.equal(notAd.seeks, 0);

const invisible = fixture({visible: false});
assert.equal(invisible.clicks, 0, 'never act on hidden controls');

const isDisabled = fixture({disabled: true});
assert.equal(isDisabled.clicks, 0, 'never act on disabled controls');

const turnedOff = fixture({enabled: false});
assert.equal(turnedOff.clicks, 0, 'toggle controls behavior');
turnedOff.enabled(true);
assert.equal(turnedOff.clicks, 1, 'turning on starts detection');
turnedOff.enabled(false);
turnedOff.advance(500);
assert.equal(turnedOff.seeks, 0, 'turning off prevents fallback');

const unavailableDuration = fixture({duration: Infinity});
unavailableDuration.advance(400);
assert.equal(unavailableDuration.seeks, 0, 'cannot seek unknown duration');
assert.equal(unavailableDuration.root.dataset.youtubeAutoSkipStatus, 'seek-unavailable');

const newPod = fixture();
newPod.advance(400);
newPod.newAd();
assert.equal(newPod.clicks, 2, 'new ad src resets attempt budget');

const localized = fixture({matchCss: false});
assert.equal(localized.clicks, 1, 'localized fallback finds German Skip');
assert.equal(localized.root.dataset.youtubeAutoSkipLastSelector, 'localized-label');

console.log('PASS: 9 scenarios (click, fallback, successful click, no ad, hidden, disabled, toggle, unknown duration, ad pod, localized)');
