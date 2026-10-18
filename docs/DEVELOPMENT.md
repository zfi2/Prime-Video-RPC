# Development

The extension and helper use built-in browser, Windows, and .NET APIs. There are no package dependencies.

## Build and test

Use Windows with .NET Framework 4.8 and Node 20 or newer. Node is needed for tests, not installation or normal use.

```powershell
# Build the helper and generate the extension icons.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\Build.ps1

# Build and run all tests.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\Test.ps1
```

The tests cover playback detection, privacy switches, timers, tab selection, Chrome message validation, native framing, Discord named-pipe communication, artwork fallback, and installation while the helper is in use. GitHub Actions runs the same script on Windows for pushes and pull requests, using Node 24.

An optional live check connects to Discord and clears its own presence without publishing a test title. Turn off the extension's sharing switch before running it:

```powershell
node tests\live-discord.cjs YOUR_APPLICATION_ID
```

## Configuration

The default Discord Application ID is public and ready to use. To use another application, create one named **Prime Video** in the [Discord Developer Portal](https://discord.com/developers/applications), then enter its Application ID under **Connection & setup** in the popup. No bot or secret is needed.

The public key in `extension/manifest.json` keeps the unpacked extension ID fixed at `mipnpehfphnakidmagfbbggbchfphlhn`. It is not a private signing key. If you replace it for a fork, update the installer's default ID or pass the new ID:

```powershell
./scripts/Install.ps1 -ExtensionId YOUR_EXTENSION_ID
```

The installer places `PrimeVideoRpc.exe` and its native messaging manifest in `%LOCALAPPDATA%\PrimeVideoDiscordRPC`. It registers `com.lain.prime_video_rpc` under `HKCU\Software\Google\Chrome\NativeMessagingHosts` for the configured extension only. There is no startup task. If the helper is running, installation stops before replacing files and explains how to turn sharing off.

## Code layout

| File | Purpose |
| --- | --- |
| `extension/detector.js` | Read the active Prime Video player's metadata and playback state. |
| `extension/core.js` | Validate metadata, build activities, and choose between tabs. |
| `extension/background.js` | Manage preferences, tab sessions, and the native connection. |
| `helper/` | Implement Chrome's stdio protocol and Discord's Windows IPC protocol. |

Playing tabs take priority over paused tabs. The selected playing tab remains stable while it is active. Tab reports expire after 70 seconds; the helper clears presence after 75 seconds without updates. Non-clear updates are coalesced at five-second intervals. Failed Discord connections retry after ten seconds.

If Discord rejects an activity containing artwork, the helper retries once without the image. A successful fallback remembers that image for the current connection, so heartbeats do not repeat the rejection. A new image gets a fresh attempt. If text-only presence is also rejected, the error is reported and the usual reconnect logic applies.

## Privacy and permissions

The content script runs on `https://primevideo.com/*` and `https://www.primevideo.com/*`. It reads player metadata and HTML video state. Playback sessions remain in memory; only preferences and the public Application ID are saved locally.

`storage` saves preferences, `nativeMessaging` connects to the helper, and `alarms` retries connections and expires stale sessions. The helper validates incoming presence fields and talks to Discord through named pipes. It does not open a network listener or execute commands from page data. Discord may fetch the selected artwork from Amazon's image servers.

## Limitations

The English player was checked on October 18, 2026. It can keep a dormant player beside the active one and remove title controls when they hide. The detector selects the active video and caches metadata for that video/source. Refresh Prime Video after reloading the extension.

Ads, trailers, autoplay transitions, and other regional player variants need further live testing. Some pages do not expose artwork or episode details. The popup previews selected metadata; Discord may omit artwork or render it differently. Discord may also show its own activity session duration while playback is paused.

## Protocol references

- [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [Discord RPC over IPC](https://discord.com/developers/docs/topics/rpc)
- [Discord Rich Presence](https://discord.com/developers/discord-social-sdk/development-guides/setting-rich-presence)
