# YouTube Auto-Skip v1.0.2

A small, open-source Manifest V3 browser extension for Windows Chrome and Edge. It clicks YouTube's **Skip Ad** button when it becomes actionable. It does **not** bypass unskippable ads or YouTube's mandatory countdown.

## Install / upgrade

1. Extract the ZIP to a permanent folder, for example `C:\Extensions\youtube-auto-skip-v1.0.2`.
2. Chrome: open `chrome://extensions`. Edge: open `edge://extensions`.
3. Enable **Developer mode**.
4. For a fresh installation, click **Load unpacked** and choose the folder containing `manifest.json`.
5. If updating an existing unpacked extension, you may instead replace its source files and click the **Reload** icon on the extension card. If using a new extraction directory, remove the old version and load the new folder.
6. On the extension's **Details** page, ensure **Site access** allows automatic access on `https://www.youtube.com` (not only **On click**).
7. Refresh existing YouTube tabs (Ctrl+R). Open a video that has a skippable ad.
8. Click the extension's toolbar icon to ensure **Enable auto-skip** is checked.

## Diagnostics

Open DevTools (F12) **on the YouTube video tab**, go to Console, and run:

```js
document.documentElement.dataset.youtubeAutoSkipLoaded
```

Expected: `"true"`. If absent, check the extension's site access and refresh YouTube.

```js
document.documentElement.dataset.youtubeAutoSkipClickCount
```

A number greater than zero means a click was attempted. Check Console messages prefixed `[YouTube Auto-Skip]` for the selected button class. If attempts are logged but ads do not skip, YouTube may be ignoring synthetic clicks or the selected element may not be the interactive control.

If the button remains visible, inspect its DOM element via F12 > Elements and compare its classes to the selectors in `content.js`. YouTube may change markup at any time.

## Limitations and privacy

- Only operates on youtube.com pages, not the YouTube mobile/TV app.
- Only clicks buttons YouTube already makes available.
- Uses `chrome.storage.local` to save the enable/disable setting.
- No analytics, network fetches, credentials, or remote services.
- No guarantee that YouTube's interface will remain compatible; browser integration must be tested against the live site.

## Test locally (requires Node.js)

```powershell
node tests/content.test.js
```

The tests use Node.js built-in modules and do not require npm dependencies. They mock YouTube's DOM and Chrome storage API; these tests are **not** a substitute for a live Chrome/Edge browser test.
