'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

function fixture(options = {}) {
  let listener, closedListener, now=10000;
  const calls = [];
  const chrome = {
    runtime: {onMessage: {addListener: callback => listener=callback}},
    tabs: {onRemoved: {addListener: callback => closedListener=callback}},
    debugger: {
      async attach(target, protocol) {
        calls.push(['attach', target.tabId, protocol]);
        if (options.attachFail) throw new Error('Another debugger is already attached to this tab');
      },
      async sendCommand(target, method, args) {
        calls.push([method, target.tabId, args.type, args.x, args.y]);
        if (options.sendFail) throw new Error('Target closed');
      },
      async detach(target) {calls.push(['detach', target.tabId]);}
    }
  };
  vm.runInNewContext(script, {chrome, URL, Set, Map, Number, Date: class extends Date {static now() {return now;}}, console});
  function request(message, sender) {
    let responded;
    let done;
    const promise = new Promise(resolve => done = resolve);
    const isAsync = listener(message, sender, value => {responded=value; done(value);});
    return {isAsync, promise, get response() {return responded;}};
  }
  return {request, calls, closedListener, advance: ms => now+=ms};
}

(async () => {
  const sender = {url:'https://www.youtube.com/watch?v=test', tab:{id:15,width:1200,height:900},frameId:0};
  const valid = fixture();
  const req = valid.request({type:'YTA_SKIP_CLICK',x:200,y:250},sender);
  assert.equal(req.isAsync,true, 'async response port kept alive');
  assert.equal((await req.promise).ok,true, 'browser-level click completed');
  assert.deepEqual(valid.calls.map(c=>c[0]),[
    'attach','Input.dispatchMouseEvent','Input.dispatchMouseEvent','Input.dispatchMouseEvent','detach'
  ]);
  assert.deepEqual(valid.calls.filter(c=>c[0]==='Input.dispatchMouseEvent').map(c=>c[2]),
    ['mouseMoved','mousePressed','mouseReleased']);
  const denied = valid.request({type:'YTA_SKIP_CLICK',x:200,y:250},
    {url:'https://www.notyoutube.com/watch',tab:{id:16}});
  assert.equal(denied.isAsync,false);
  assert.equal(denied.response.code,'unauthorized-tab');
  const iframe = valid.request({type:'YTA_SKIP_CLICK',x:200,y:250},
    {...sender,frameId:2});
  assert.equal(iframe.response.code,'unauthorized-tab');
  const badPoint = valid.request({type:'YTA_SKIP_CLICK',x:20000,y:10},sender);
  assert.equal(badPoint.response.code,'invalid-coordinates');
  const repeated = valid.request({type:'YTA_SKIP_CLICK',x:200,y:250},sender);
  assert.equal(repeated.response.code,'throttled');
  valid.advance(1300);
  assert.equal((await valid.request({type:'YTA_SKIP_CLICK',x:200,y:250},sender).promise).ok,true);
  valid.closedListener(15);
  assert.equal((await valid.request({type:'YTA_SKIP_CLICK',x:200,y:250},sender).promise).ok,true,'tab cleanup clears throttle state');

  const conflict = fixture({attachFail:true});
  const failed = await conflict.request({type:'YTA_SKIP_CLICK',x:200,y:250},sender).promise;
  assert.equal(failed.ok,false);
  assert.equal(failed.code,'debugger-unavailable');
  assert.ok(failed.detail.includes('Close F12/DevTools'));
  assert.deepEqual(conflict.calls.map(c=>c[0]),['attach'], 'not detached if never attached');

  const inputError = fixture({sendFail:true});
  const error = await inputError.request({type:'YTA_SKIP_CLICK',x:200,y:250},sender).promise;
  assert.equal(error.ok,false);
  assert.equal(error.code,'input-failed');
  assert.ok(inputError.calls.some(c=>c[0]==='detach'), 'detach on send failure');

  console.log('PASS: background service worker browser click, security checks, throttling, close cleanup, debugger conflict, detach-on-failure');
})().catch(error => {console.error(error); process.exitCode=1;});
