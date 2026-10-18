# Prime Video → Discord

A personal Chrome extension and Windows helper that show your Prime Video playback in Discord Rich Presence.

The extension supports **primevideo.com in English**. It shares the title, season/episode, artwork, remaining playback time, and paused state when those details are available. Every field has a toggle in the popup, along with a master sharing switch.

## Setup

The helper is already installed on this computer, and the extension is configured with Application ID `1561253975787966494`.

For a fresh installation:

1. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**. Select the `extension` folder in this project. Keep that folder in place afterward.
2. Double-click **Install.cmd**. It builds the helper using Windows' .NET Framework compiler, copies it into `%LOCALAPPDATA%\PrimeVideoDiscordRPC`, and registers it for your Windows account. It does not need administrator access, Node, Python, or a startup task.
3. Open Discord's desktop app, then open the extension popup and click **↻**. You should see **Connected to Discord**.
4. Refresh an existing Prime Video tab. Start a movie or episode, then move the pointer over the player to expose its title controls. Pin the extension in Chrome for convenient access.

If using a different Discord application, create one in the [Discord Developer Portal](https://discord.com/developers/applications) and name it **Prime Video**. Paste its numeric **Application ID** into **Connection & setup** in the popup. No bot, client secret, account token, or OAuth login is required. The app's registered name supplies Discord's activity heading.

The extension has a fixed public manifest key, so its ID stays `mipnpehfphnakidmagfbbggbchfphlhn` even if the project is moved. The installer allows only that extension to launch the helper.

## Behavior

- **Share on Discord:** Switching this off closes the helper connection and clears its activity.
- **Title, Season & episode, Cover artwork, Playback timer:** Each controls its own field. Hiding the title does not hide independently enabled artwork or episode details.
- **Show while paused:** On displays “Paused” without a running timer. Off hides the whole presence while paused.
- Playing tabs take priority over paused tabs. If several tabs are playing, the currently selected playing session stays stable.
- Seeking recalculates the timer. Buffering removes the countdown until playback resumes. Live streams have no finite countdown.
- Closing the player, ending playback, navigating away, or closing its tab clears the activity. Lost tab reports expire after 70 seconds; the helper also clears after 75 seconds without extension updates.
- Discord restarts are retried automatically. Changes can take a few seconds to appear because updates are coalesced; clearing bypasses that update throttle.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| Install the helper / host not found | Run `Install.cmd`, then click ↻. The installer is for Google Chrome on this Windows account. |
| Waiting for Discord | Open Discord desktop, Stable/PTB/Canary. Run Chrome and Discord as the same Windows user at the same privilege level. |
| Connected, but no activity in Discord | Enable Discord's activity sharing setting. Check the extension's master switch and paused-sharing setting. Discord's display can take a few seconds to update. |
| No title or episode | Move the pointer over the player to reveal the controls. The extension caches these fields for the current video while controls are hidden. |
| No artwork | Some pages do not expose a suitable cover image, and Discord may reject an image. The text presence still works. |
| Old metadata after updating extension files | Reload the extension in `chrome://extensions`, then refresh the Prime Video tab. |
| Installer cannot replace the helper | Switch sharing off in the popup first, then rerun the installer. |

Prime Video changes its markup over time. This version was checked against the English player on October 18, 2026, including its dormant first player and title controls that unmount when hidden. Ads, trailers, autoplay transitions, and other regional player variants need further live testing. The extension reads playback metadata; it does not access video segments, DRM, account cookies, or playback APIs.

## Privacy and permissions

The extension runs only on `https://primevideo.com/*` and `https://www.primevideo.com/*`. It reads visible player metadata and the HTML video element's time/state. Playback sessions live in memory; only preferences and the public Application ID are saved locally.

The helper talks to Discord through Windows named pipes. There is no listening HTTP/WebSocket server, telemetry, remote executable code, or third-party metadata service. The selected metadata is shared with Discord for your activity; artwork uses Amazon image URLs, which Discord may fetch to display the image. Hidden artwork is not requested by the popup.

Chrome permissions: `storage` saves preferences, `nativeMessaging` connects to the helper, and `alarms` retries connections and clears stale sessions. The native helper accepts only a small presence schema, validates inputs, and never executes commands supplied by a page.

## Development

```powershell
# Build the small .NET Framework helper and generate extension icons.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\Build.ps1

# Run extension tests plus real Windows named-pipe protocol tests.
# Node 20+ is needed for development tests only.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\Test.ps1

# Optional live connection check. It connects and clears its own presence;
# it does not publish a dummy title. Run before enabling the extension.
node tests\live-discord.cjs 1561253975787966494
```

`extension/detector.js` isolates Prime Video DOM reading. `core.js` builds sanitized activities and selects a playback tab. `background.js` owns the native connection and preferences. The C# helper implements Chrome's framed stdio protocol and Discord's framed IPC protocol using built-in Windows/.NET APIs. There are no package dependencies.

Protocol references: [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), [Discord RPC over IPC](https://discord.com/developers/docs/topics/rpc), and [Discord Rich Presence](https://discord.com/developers/discord-social-sdk/development-guides/setting-rich-presence).

## Remove

Switch off sharing, remove the extension from `chrome://extensions`, then run **Uninstall.cmd**. The script removes only this helper's registry entry and the two installed files. The source project remains untouched.

This is an unofficial personal project, not affiliated with Amazon or Discord.
