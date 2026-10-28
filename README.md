# YouTube Auto-Skip v1.0.3

A small, locally running Manifest V3 extension for Chrome and Microsoft Edge that attempts to skip **only skippable YouTube advertisements**.

## What changed in v1.0.3

YouTube may ignore automated `element.click()` calls because JavaScript events are not trusted user gestures. v1.0.2 logged click attempts as if they were successful, even when they were ignored. v1.0.3 fixes the diagnostic language and adds an **optional automatic video-end fallback**. When YouTube is actively showing an advertisement **and** its official Skip button is visible and enabled, the extension first calls `click()`; if the advertisement is still showing, it tries to seek the ad video to its end. YouTube may still prevent both actions in some browser/player variants. This extension does not claim universal compatibility.

The extension does not act before the Skip button becomes available and does not target unskippable ads. It does not speed up advertisements, send network requests, or collect browsing data.

## Install / upgrade

1. Extract the extension ZIP to a permanent directory, e.g. `C:\Extensions\youtube-auto-skip-v1.0.3`.
2. Open `chrome://extensions` in Google Chrome or `edge://extensions` in Microsoft Edge.
3. Enable **Developer mode**.
4. Remove the previous unpacked extension if it was loaded from a different folder.
5. Click **Load unpacked**, selecting the directory that directly contains `manifest.json`.
6. Check **Details > Site access** and ensure automatic access to `https://www.youtube.com/*`.
7. Refresh any already-open YouTube tabs and verify the popup toggle is enabled.

## Diagnostics

On a YouTube watch tab, press `F12`, select Console, and type each command manually:

```js
document.documentElement.dataset.youtubeAutoSkipVersion
// "1.0.3"

document.documentElement.dataset.youtubeAutoSkipStatus
// ready / click-attempted / seek-attempted / ad-ended / seek-unavailable / disabled

document.documentElement.dataset.youtubeAutoSkipClickAttempts
// Number of attempted synthetic clicks (not proof of success)

document.documentElement.dataset.youtubeAutoSkipSeekAttempts
// Number of video-end fallback attempts (not proof of success)
```

Messages begin with `[YouTube Auto-Skip]`. If a click is attempted but the ad remains, it is probably being ignored; if the fallback also fails, video seeking may be restricted. YouTube's page-level preload warnings are usually unrelated to this extension.

## Limitations

- Browser code cannot generate a trusted real-user click; `element.click()` creates an untrusted event.
- Some YouTube player versions may refuse video seeking, even when Skip Ad is available.
- No claims of successful live browser testing: automated tests here simulate player behavior.
- Site terms and markup may change.

## Development

This repository contains no build system or dependencies. To check JavaScript syntax and run the test cases, install Node.js and run:

```powershell
node --check content.js
node --check popup.js
node tests/content.test.js
```
