# WhatsApp Deleter — Laptop Background Service

**Date:** 2026-05-17
**Status:** Approved for implementation

## Goal

Run the WhatsApp-deleter bot continuously on the user's MacBook with zero manual intervention: starts at login, restarts on crash, survives reboots, runs while the lid is closed on power. Replace the existing pm2/shell-script setup with a native macOS `launchd` LaunchAgent.

## Non-goals

- 24/7 uptime independent of the laptop (laptop sleeps on battery; bot pauses then).
- Cloud/remote deployment (Pi, VPS, Fly.io).
- Group-admin "delete for everyone" — bot only does `delete-for-me`.
- Per-group rules, time windows, regex/text filters.

## Constraints

- macOS host (Darwin 25.x), single user `hillelk`.
- Node.js managed by nvm at `~/.nvm/versions/node/v22.15.0/bin/node`. Must not pin to a specific nvm version path in the plist.
- Power: user has run `sudo pmset -c sleep 0 disablesleep 1` so the Mac stays awake on power. Bot pauses on battery sleep (acceptable).
- Notifications: macOS `display notification`; fire only on **repeated** failures, not on self-healed events.

## Architecture

Single Node.js process (existing `index.js`, modified) invoked by a `launchd` LaunchAgent. launchd handles RunAtLoad + KeepAlive (auto-restart on crash) + ThrottleInterval (prevent crashloop). The bot:

1. Reads the target phone-number list from a file (`~/.config/whatsapp-deleter/targets.txt`) at startup and re-reads on file change (`fs.watchFile`, 2s polling).
2. Listens to group messages; if sender's number contains any target substring, calls `msg.delete(false)` (delete-for-me).
3. Maintains a `consecutiveFailures` counter incremented on `disconnected` / `auth_failure` events and reset on `ready`. Fires a macOS notification once when the counter crosses a threshold (3); silent on recovery.

No pm2, no Docker, no shell wrappers beyond a small nvm-sourcing launcher.

## Components

| Path | Purpose |
|---|---|
| `~/Source/whatsapp-deleter/index.js` | Bot logic. Modified: file-watched targets; health-monitor counter. |
| `~/Source/whatsapp-deleter/bin/run` | Shell launcher: `source nvm.sh`, `nvm use 22`, `exec node index.js`. Decouples plist from nvm version. |
| `~/Source/whatsapp-deleter/com.avihil.whatsapp-deleter.plist` | Source-of-truth plist, version-controlled. Copied to `~/Library/LaunchAgents/` on install. |
| `~/Library/LaunchAgents/com.avihil.whatsapp-deleter.plist` | Active plist managed by launchd. |
| `~/.config/whatsapp-deleter/targets.txt` | Per-user config: one phone number per line, `#` comments. Pre-seeded with `972500000000`. |
| `~/Library/Logs/whatsapp-deleter/out.log` | stdout (deletion successes, target reloads, health transitions). |
| `~/Library/Logs/whatsapp-deleter/err.log` | stderr (puppeteer crashes, auth failures). |
| `~/Source/whatsapp-deleter/sessions/` | whatsapp-web.js session (existing; preserved across restarts). |

### Removed

- `start`, `stop` shell scripts.
- `nixpacks.toml` (Railway/nixpacks deploy descriptor — irrelevant on laptop).
- `pm2` dependency in `package.json` and all pm2 npm scripts.

## Detailed changes

### `index.js`

- Add `fs`, `os`, `path`, `child_process.exec` imports.
- Add `TARGETS_FILE` constant and `loadTargets()` function that reads the file, strips `#` comments, trims, and replaces `targets: Set<string>`.
- Call `loadTargets()` at startup and register `fs.watchFile(TARGETS_FILE, { interval: 2000 }, loadTargets)`.
- Add `FAILURE_THRESHOLD = 3`, module-level `consecutiveFailures`, `notifiedForCurrentStreak`.
- Add `notify(title, message)` that shells out to `osascript -e 'display notification ...'` with quote escaping.
- Add `recordFailure(reason)` and `recordHealthy()`.
- Wire `recordHealthy()` into `client.on('ready')`.
- Wire `recordFailure(...)` into `auth_failure` and `disconnected` handlers.
- Replace env-var target parsing inside the message handler with `[...targets].some(num => senderNumber.includes(num))`.
- Remove the noisy `[Msg] Not a group message:` log line (fires per DM, bloats log file).

### `package.json`

- Remove `pm2` from dependencies.
- Replace pm2 scripts with `start: "./bin/run"` and `logs: "tail -f ~/Library/Logs/whatsapp-deleter/out.log"`.

### `bin/run` (new, chmod 755)

```sh
#!/bin/bash
set -euo pipefail
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm use 22 >/dev/null
cd "$(dirname "$0")/.."
exec node index.js
```

### `com.avihil.whatsapp-deleter.plist` (new)

Label: `com.avihil.whatsapp-deleter`.
ProgramArguments: `/Users/hillelk/Source/whatsapp-deleter/bin/run`.
WorkingDirectory: `/Users/hillelk/Source/whatsapp-deleter`.
RunAtLoad: true. KeepAlive: `{SuccessfulExit: false, Crashed: true}`. ThrottleInterval: 30s.
StandardOutPath / StandardErrorPath: `~/Library/Logs/whatsapp-deleter/{out,err}.log`.

### `~/.config/whatsapp-deleter/targets.txt` (new)

Pre-seeded with `972500000000` and a header comment explaining format (international, no `+`, no leading 0; substring-matched against `contact.number`).

### `README.md`

Rewrite to cover: clone, `npm install`, first run via `./bin/run` (to scan QR), copy plist + `launchctl bootstrap`, edit targets, view logs, uninstall (`launchctl bootout` + `rm`).

## Install steps (one-time)

1. `git clone … ~/Source/whatsapp-deleter` (already done as part of brainstorming).
2. `cd ~/Source/whatsapp-deleter && npm install`.
3. `mkdir -p ~/.config/whatsapp-deleter ~/Library/Logs/whatsapp-deleter` and write `targets.txt`.
4. Run `./bin/run` interactively once. Scan QR. Confirm `READY`. Ctrl-C.
5. `cp com.avihil.whatsapp-deleter.plist ~/Library/LaunchAgents/`.
6. `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.avihil.whatsapp-deleter.plist`.
7. Verify with `launchctl print gui/$(id -u)/com.avihil.whatsapp-deleter | head -20` and `tail -f ~/Library/Logs/whatsapp-deleter/out.log`.

## Operations

| Action | Command |
|---|---|
| Edit blocked numbers | `vim ~/.config/whatsapp-deleter/targets.txt` (auto-picks up in 2s) |
| Restart bot | `launchctl kickstart -k gui/$(id -u)/com.avihil.whatsapp-deleter` |
| Tail logs | `tail -f ~/Library/Logs/whatsapp-deleter/out.log` |
| Stop / disable | `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.avihil.whatsapp-deleter.plist` |
| Uninstall | `bootout` then `rm ~/Library/LaunchAgents/com.avihil.whatsapp-deleter.plist` |

## Failure modes

| Mode | Response |
|---|---|
| Process crash | launchd restarts (KeepAlive.Crashed). ThrottleInterval=30s prevents tight loop. |
| WA Web session drop | `disconnected` event increments counter. Bot exits or reconnects per whatsapp-web.js behavior; launchd restarts if exit. After 3 consecutive failures without recovery, macOS notification fires. |
| `auth_failure` (session invalid, needs new QR) | Counter increments; notification at threshold; user runs `./bin/run` interactively to rescan. |
| Laptop sleeps on battery | Process suspended; resumes on wake. Session persisted on disk; usually reconnects without re-scan. |
| `targets.txt` missing or unreadable | Bot logs warning, treats list as empty, deletes nothing. |
| Empty `targets.txt` | Bot runs normally, deletes nothing. |
| nvm node v22 uninstalled | `bin/run` fails; launchd retries; after threshold, notification. Fix: `nvm install 22` or edit `bin/run`. |

## Limitations

- **Failure counter is in-memory, not persisted.** A hard puppeteer crash exits the process; launchd restarts; counter resets to 0. So the notification reliably fires only during a single process lifetime where the WA client emits multiple `disconnected` / `auth_failure` events without an intervening `ready` (typical flaky-reconnect scenario). For hard-crash loops, the user notices by absence of deletions; launchd keeps cycling. Acceptable for a personal tool; persistent-state option deferred.
- Neither `disconnected` nor `auth_failure` triggers `process.exit`. Matches existing behavior. If whatsapp-web.js fails to self-recover after a disconnect, the bot becomes idle until manually kicked (`launchctl kickstart -k …`). Revisit if seen in practice.

## Open considerations (not blocking)

- The upstream repo is `avihil1/whatsapp-deleter` (not the user's). If the user wants their changes versioned in their own GitHub, they can fork later. Not required for the launchd setup itself.
- No log rotation. `out.log` grows ~1 line per group message seen. Acceptable for personal use; `newsyslog` config can be added later if it becomes a problem.
- No CPU/memory limits. whatsapp-web.js + puppeteer typically ~300–500MB RAM; if it leaks, launchd will restart on OOM kill.
