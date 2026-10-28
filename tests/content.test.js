'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

function fixture(options = {}) {
  let time = 10000;
  let storageListener;
  let runtimeListener;
  let periodic;
  let buttonVisible = options.visible !== false;
  let enabled = options.enabled !== false;
  let covered = Boolean(options.covered);
  let clicks = 0;
  let sent = [];
  let buttonConnected = true;
  let disabled = Boolean(options.disabled);
  let playerExists = options.playerExists !== false;
  let matchedCss = options.matchedCss !== false;
  let label = options.label || 'Überspringen';
  let timerFns = [];
  const root = { dataset: {} };
  const button = {
    isConnected: true, nodeType: 1, parentElement: null, hidden: false,
    get disabled() {return disabled;},
    getAttribute: (name) => name === 'aria-label' ? label : null,
    textContent: label,
    closest: () => button,
    contains: () => false,
    getBoundingClientRect: () => ({left: 110, right: 230, top: 100, bottom: 145, width: buttonVisible ? 120 : 0, height: buttonVisible ? 45 : 0})
  };
  Object.defineProperty(button, 'isConnected', {get() {return buttonConnected;}});
  const player = {
    querySelectorAll(selector) {
      if (!buttonVisible && options.simulateRemoval) return [];
      if (selector === '.ytp-skip-ad-button' && matchedCss) return [button];
      if (selector === 'button, [role="button"]') return [button];
      return [];
    }
  };
  const context = {
    console: {info() {}},
    location: {hostname: 'www.youtube.com'},
    document: {
      documentElement: root,
      querySelector: () => playerExists ? player : null,
      elementFromPoint: () => covered ? {other: 'overlay'} : button
    },
    window: {innerWidth: 1200, innerHeight: 800, addEventListener() {}},
    getComputedStyle: () => ({display: 'block', visibility: 'visible', pointerEvents: 'auto', opacity: '1'}),
    chrome: {
      storage: {
        local: {get: (_defaults, cb) => cb({enabled})},
        onChanged: {addListener: cb => storageListener = cb}
      },
      runtime: {
        lastError: null,
        onMessage: {addListener: cb => runtimeListener = cb},
        sendMessage: (message, cb) => {
          clicks++;
          sent.push(message);
          cb(options.errorResponse || {ok: true});
        }
      }
    },
    Date: class extends Date {static now() {return time;}},
    MutationObserver: class {observe() {}},
    requestAnimationFrame: cb => cb(),
    setInterval: cb => periodic = cb,
    setTimeout: cb => timerFns.push(cb)
  };
  vm.runInNewContext(script, context, {filename:'content.js'});
  return {
    root, sent,
    get clicks() {return clicks;},
    getStatus() {
      let result;
      runtimeListener({type:'YTA_GET_STATUS'}, null, value => {result=value;});
      return result;
    },
    advance(ms) {time += ms; periodic();},
    setDisabled(value) {disabled = value; periodic();},
    setCovered(value) {covered = value; periodic();},
    setVisible(value) {buttonVisible = value; periodic();},
    setConnected(value) {buttonConnected = value; periodic();},
    setPlayerExists(value) {playerExists = value; periodic();},
    setEnabled(value) {storageListener({enabled: {newValue:value}}, 'local');},
    runTimers() {for (const cb of timerFns.splice(0)) cb();}
  };
}

// Regression: a visible German Skip button must work even WITHOUT an ad-showing CSS class or <video> element.
const german = fixture();
assert.equal(german.clicks, 1, 'visible german button clicked without ad-showing class');
assert.equal(german.sent[0].type, 'YTA_SKIP_CLICK');
assert.equal(german.sent[0].x, 170);
assert.equal(german.root.dataset.youtubeAutoSkipStatus, 'browser-click-dispatched');
assert.equal(german.root.dataset.youtubeAutoSkipLastSelector, '.ytp-skip-ad-button');
assert.equal(german.getStatus().version, '1.1.0');
german.advance(500);
assert.equal(german.clicks, 1, 'throttled repeat attempt');
german.advance(1400);
assert.equal(german.clicks, 2, 'retry when button still visible');

german.setVisible(false);
assert.equal(german.root.dataset.youtubeAutoSkipStatus, 'skip-button-disappeared');
assert.equal(german.getStatus().observedGone, 1);

const noButton = fixture({visible:false, simulateRemoval:true});
assert.equal(noButton.clicks, 0, 'no button never clicks');
assert.equal(noButton.root.dataset.youtubeAutoSkipStatus, 'waiting-for-skip-button');

const disabledButton = fixture({disabled:true});
assert.equal(disabledButton.clicks, 0, 'disabled button never clicked');
disabledButton.setDisabled(false);
assert.equal(disabledButton.clicks, 1, 'enabled button clicked');

const coveredButton = fixture({covered:true});
assert.equal(coveredButton.clicks, 0, 'covered Skip button never clicked into other element');
coveredButton.setCovered(false);
assert.equal(coveredButton.clicks, 1, 'uncovered button clicked');

const disabledExtension = fixture({enabled:false});
assert.equal(disabledExtension.clicks, 0, 'extension initially disabled');
disabledExtension.setEnabled(true);
assert.equal(disabledExtension.clicks, 1, 'toggle on activates extension');
disabledExtension.setEnabled(false);
disabledExtension.advance(2000);
assert.equal(disabledExtension.clicks, 1, 'toggle off blocks further attempts');

const english = fixture({matchedCss:false,label:'Skip ads'});
assert.equal(english.clicks, 1, 'English label fallback matches');
assert.equal(english.root.dataset.youtubeAutoSkipLastSelector, 'localized-label');

const errors = fixture({errorResponse:{ok:false,code:'debugger-unavailable',detail:'Close DevTools'}});
assert.equal(errors.root.dataset.youtubeAutoSkipStatus, 'debugger-unavailable', 'API failures display real error');
assert.match(errors.getStatus().lastResult, /Close DevTools/);

const noPlayer = fixture({playerExists:false});
assert.equal(noPlayer.clicks, 0, 'missing player never clicked');
assert.equal(noPlayer.root.dataset.youtubeAutoSkipStatus, 'player-not-found');

console.log('PASS: content-script regression, coordinates, no ad class required, cooldown, visibility, disabled, occlusion, enabled toggle, language fallback, debugger failure, missing player');
