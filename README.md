# YouTube Auto-Skip v1.1.0

A Windows Chrome / Microsoft Edge Manifest V3 extension that automatically clicks YouTube's **visible, enabled Skip Ad** control (including German "Überspringen"). It does not block ads or act before the Skip button is available.

## Why this release is different

- v1.0.3 checked for YouTube's CSS `ad-showing`/`ad-interrupting` class **before** looking for the visible Skip Ad button, causing false negatives on some YouTube layouts. v1.1.0 detects the player button directly, checks visibility and screen position, and does not rely on those classes.
- YouTube may reject JavaScript `element.click()` because it is not a trusted user input event. This version requests Chrome's **debugger permission**, briefly attaches a debugger to the active YouTube tab, sends a browser-level mouse press/release at the visible Skip Ad button, then immediately detaches.
- The popup shows status and possible errors **without DevTools**, because Chrome does not allow a DevTools debugger and an extension debugger attached to the same tab simultaneously.

## Security and privacy

`debugger` is a powerful Chrome permission. It can be used to inspect/debug a browser tab. Review `background.js` before installing: this extension intentionally allows click messages only from a top-level youtube.com tab, limits click coordinates, and runs only three `Input.dispatchMouseEvent` commands, followed by `chrome.debugger.detach`. No network endpoints, analytics, or trackers are included. No YouTube account/API key is needed. The browser may briefly show an infobar while debugging is attached.

## Installation on Chrome or Edge

1. Extract `youtube-auto-skip-v1.1.0-extension.zip` to a permanent folder.
2. In Chrome open `chrome://extensions` (in Edge use `edge://extensions`).
3. Enable Developer mode and **remove the older YouTube Auto-Skip** extension.
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Review/accept the requested `debugger` permission (if your browser shows a warning).
6. Ensure the extension's Site access is allowed for youtube.com. Refresh the YouTube tab (`Ctrl+R`).
7. **Close DevTools (`F12`) before testing**. Having DevTools open can prevent `chrome.debugger.attach` from succeeding.
8. Click the extension icon to see the status panel. No DevTools needed.

## Status meanings

| Status | Meaning |
| --- | --- |
| Waiting for Skip Ad | Script is active, but no clickable Skip control was found yet. |
| Sending browser click | A button was detected, and the extension is asking Chrome to click it. |
| Browser click sent | Chrome accepted mouse-input commands; this is *not* proof YouTube skipped. |
| Skip button disappeared | The previously detected Skip button disappeared. Often indicates skipping, but can also occur naturally. |
| Close F12 / DevTools | Chrome's debugger is already in use by DevTools or another extension. |
| Input failed | The Debugger API was refused or the tab changed during the click. |

Debugging values (only if necessary, AFTER testing with DevTools closed):

```js
document.documentElement.dataset.youtubeAutoSkipStatus
document.documentElement.dataset.youtubeAutoSkipLastResult
document.documentElement.dataset.youtubeAutoSkipClickAttempts
document.documentElement.dataset.youtubeAutoSkipLastSelector
```

## Source code and tests

The GitHub source package includes:

- `manifest.json`, `content.js`, `background.js`, `popup.html`, `popup.js`
- `tests/content.test.js`, `tests/background.test.js`, `.github/workflows/test.yml`
- `README.md`, `LICENSE`, `.gitignore`

Requirements: Node.js 18+ for running local tests. No runtime dependencies or build step.

```sh
node --check content.js
node --check background.js
node --check popup.js
node tests/content.test.js
node tests/background.test.js
```

## Limitations

- The browser may deny debugger access (enterprise policy, extensions, or DevTools open).
- YouTube can change its HTML or ignore browser-automated actions in some player variants.
- No live YouTube advertisement testing was possible during packaging (external and local browser navigation were restricted in the test environment). Syntax and automated mocks are not a substitute for an actual browser test.
- This tool is intended only for already-skippable ads.
