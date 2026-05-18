# WhatsApp Deleter — Laptop Background Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing pm2 + shell-script setup with a native macOS `launchd` LaunchAgent so the WhatsApp deleter bot starts on login, restarts on crash, and reads its block-list from a hot-reloaded file.

**Architecture:** Single Node.js process (`index.js`) invoked by a `launchd` LaunchAgent via a small nvm-sourcing `bin/run` wrapper. Targets live in `~/.config/whatsapp-deleter/targets.txt`, watched via `fs.watchFile`. In-memory failure counter triggers a macOS notification after 3 consecutive WA disconnect/auth events without intervening recovery.

**Tech Stack:** Node.js 22 (via nvm), whatsapp-web.js, puppeteer, macOS `launchd`, `osascript` for notifications.

**Working directory:** `~/Source/whatsapp-deleter` (already cloned during brainstorming).

**Spec:** `docs/superpowers/specs/2026-05-17-laptop-background-service-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `index.js` | Modify | Bot logic + file-watched targets + failure-monitor counter + notification |
| `bin/run` | Create | Shell wrapper: source nvm, exec node. Decouples plist from nvm version. |
| `com.avihil.whatsapp-deleter.plist` | Create | LaunchAgent definition (source of truth, version-controlled) |
| `package.json` | Modify | Drop pm2 dependency and pm2 scripts |
| `start`, `stop`, `nixpacks.toml` | Delete | Replaced by launchd |
| `README.md` | Rewrite | Install/operate instructions for the launchd setup |
| `~/.config/whatsapp-deleter/targets.txt` | Create (user-local) | Block-list, hot-reloaded |
| `~/Library/Logs/whatsapp-deleter/` | Create (user-local) | launchd stdout/stderr destination |
| `~/Library/LaunchAgents/com.avihil.whatsapp-deleter.plist` | Install (user-local) | Active plist copy managed by launchd |

---

### Task 1: Rewrite `index.js` with file-watched targets and failure monitor

**Files:**
- Modify: `~/Source/whatsapp-deleter/index.js` (full rewrite)

- [ ] **Step 1: Replace the file with the new contents**

Write the following to `~/Source/whatsapp-deleter/index.js` (overwrite). This is the full final file — do not patch the old one.

```javascript
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');

console.log('--- System Starting Up ---');

const TARGETS_FILE = path.join(os.homedir(), '.config', 'whatsapp-deleter', 'targets.txt');
let targets = new Set();

function loadTargets() {
    try {
        const raw = fs.readFileSync(TARGETS_FILE, 'utf8');
        targets = new Set(
            raw.split('\n')
               .map(l => l.replace(/#.*/, '').trim())
               .filter(Boolean)
        );
        console.log(`[Targets] Loaded ${targets.size} number(s) from ${TARGETS_FILE}`);
    } catch (err) {
        console.error(`[Targets] Failed to load: ${err.message}`);
        targets = new Set();
    }
}
loadTargets();
fs.watchFile(TARGETS_FILE, { interval: 2000 }, loadTargets);

const FAILURE_THRESHOLD = 3;
let consecutiveFailures = 0;
let notifiedForCurrentStreak = false;

function notify(title, message) {
    const t = title.replace(/"/g, '\\"');
    const m = message.replace(/"/g, '\\"');
    exec(`osascript -e 'display notification "${m}" with title "${t}"'`);
}

function recordFailure(reason) {
    consecutiveFailures++;
    console.error(`[Health] Failure #${consecutiveFailures}: ${reason}`);
    if (consecutiveFailures >= FAILURE_THRESHOLD && !notifiedForCurrentStreak) {
        notify('WhatsApp Deleter', `${consecutiveFailures} consecutive failures: ${reason}`);
        notifiedForCurrentStreak = true;
    }
}

function recordHealthy() {
    if (consecutiveFailures > 0) {
        console.log(`[Health] Recovered after ${consecutiveFailures} failure(s).`);
    }
    consecutiveFailures = 0;
    notifiedForCurrentStreak = false;
}

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './sessions',
        clientId: 'vibe-shield-final'
    }),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-js/main/dist/wppconnect-wa.js',
    },
    puppeteer: {
        headless: true,
        protocolTimeout: 60000,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
    }
});

client.on('qr', (qr) => {
    console.log('SCAN THIS QR CODE: ', 'https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(qr));
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ READY: Bot is fully connected!');
    recordHealthy();
});

client.on('loading_screen', (percent, message) => {
    console.log('LOADING SCREEN:', percent, message);
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED: Session saved successfully.');
});

client.on('auth_failure', (msg) => {
    console.error('AUTHENTICATION FAILURE:', msg);
    recordFailure(`auth_failure: ${msg}`);
});

client.on('disconnected', (reason) => {
    console.log('DISCONNECTED:', reason);
    recordFailure(`disconnected: ${reason}`);
});

client.on('message', async (msg) => {
    if (!msg.from.endsWith('@g.us')) return;

    try {
        const contact = await msg.getContact();
        const senderNumber = contact.number;
        if (!senderNumber) return;

        console.log(`[Msg] Group: ${msg.from} | Sender: ${senderNumber} | notifyName: ${msg._data.notifyName}`);

        const isTarget = [...targets].some((num) => senderNumber.includes(num));
        if (isTarget) {
            await msg.delete(false);
            console.log(`✅ SUCCESS: Message from ${senderNumber} deleted.`);
        }
    } catch (err) {
        console.error('❌ Error processing message:', err.message);
    }
});

const shutdown = async (signal) => {
    console.log(`[${new Date().toISOString()}] Received ${signal}. Closing browser...`);
    try {
        await client.destroy();
        console.log('Browser closed. Exiting process.');
        process.exit(0);
    } catch (err) {
        process.exit(1);
    }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.initialize();
```

- [ ] **Step 2: Syntax-check the file**

Run:
```bash
cd ~/Source/whatsapp-deleter && node --check index.js
```
Expected: exit code 0, no output.

- [ ] **Step 3: Commit**

```bash
cd ~/Source/whatsapp-deleter
git add index.js
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
refactor(index): file-watched targets and failure monitor

Replace TARGET_NUMBERS env var with hot-reloaded targets file.
Add in-memory failure counter that fires a macOS notification
after 3 consecutive disconnect/auth events without recovery.
Drop the per-DM "Not a group message" log to keep log file small.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Create `bin/run` wrapper

**Files:**
- Create: `~/Source/whatsapp-deleter/bin/run`

- [ ] **Step 1: Make the bin directory**

Run:
```bash
mkdir -p ~/Source/whatsapp-deleter/bin
```

- [ ] **Step 2: Write the launcher script**

Write to `~/Source/whatsapp-deleter/bin/run`:
```bash
#!/bin/bash
set -euo pipefail
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
source "$NVM_DIR/nvm.sh"
nvm use 22 >/dev/null
cd "$(dirname "$0")/.."
exec node index.js
```

- [ ] **Step 3: Make it executable**

Run:
```bash
chmod +x ~/Source/whatsapp-deleter/bin/run
```

- [ ] **Step 4: Verify it parses**

Run:
```bash
bash -n ~/Source/whatsapp-deleter/bin/run
```
Expected: exit code 0, no output.

- [ ] **Step 5: Commit**

```bash
cd ~/Source/whatsapp-deleter
git add bin/run
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(bin): add nvm-sourcing launcher for launchd

Decouples the plist from a specific nvm node version path.
Launches index.js with whichever node v22 is active in nvm.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Create the LaunchAgent plist (source of truth)

**Files:**
- Create: `~/Source/whatsapp-deleter/com.avihil.whatsapp-deleter.plist`

- [ ] **Step 1: Write the plist**

Write to `~/Source/whatsapp-deleter/com.avihil.whatsapp-deleter.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.avihil.whatsapp-deleter</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/hillelk/Source/whatsapp-deleter/bin/run</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/hillelk/Source/whatsapp-deleter</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
        <key>Crashed</key>
        <true/>
    </dict>
    <key>ThrottleInterval</key>
    <integer>30</integer>
    <key>StandardOutPath</key>
    <string>/Users/hillelk/Library/Logs/whatsapp-deleter/out.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/hillelk/Library/Logs/whatsapp-deleter/err.log</string>
</dict>
</plist>
```

- [ ] **Step 2: Lint with plutil**

Run:
```bash
plutil -lint ~/Source/whatsapp-deleter/com.avihil.whatsapp-deleter.plist
```
Expected output: `…com.avihil.whatsapp-deleter.plist: OK`

- [ ] **Step 3: Commit**

```bash
cd ~/Source/whatsapp-deleter
git add com.avihil.whatsapp-deleter.plist
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(launchd): add LaunchAgent plist as source of truth

KeepAlive on crash/non-zero exit, ThrottleInterval=30s to
prevent crashloops, stdout/stderr to ~/Library/Logs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Update `package.json`

**Files:**
- Modify: `~/Source/whatsapp-deleter/package.json`

- [ ] **Step 1: Replace the file**

Write to `~/Source/whatsapp-deleter/package.json`:
```json
{
    "name": "vibe-shield-bot",
    "version": "1.0.0",
    "main": "index.js",
    "dependencies": {
      "whatsapp-web.js": "^1.23.0",
      "qrcode-terminal": "^0.12.0",
      "puppeteer": "^22.0.0"
    },
    "scripts": {
      "start": "./bin/run",
      "logs": "tail -f ~/Library/Logs/whatsapp-deleter/out.log"
    }
  }
```

- [ ] **Step 2: Refresh node_modules and lockfile**

Run:
```bash
cd ~/Source/whatsapp-deleter && npm install
```
Expected: completes without errors. `pm2` removed from `node_modules/`.

- [ ] **Step 3: Commit**

```bash
cd ~/Source/whatsapp-deleter
git add package.json package-lock.json
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
chore(package): drop pm2, point start at bin/run

launchd replaces pm2 as the supervisor. Keep a "logs" alias
for convenience.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Delete obsolete files

**Files:**
- Delete: `~/Source/whatsapp-deleter/start`
- Delete: `~/Source/whatsapp-deleter/stop`
- Delete: `~/Source/whatsapp-deleter/nixpacks.toml`

- [ ] **Step 1: Remove the files**

Run:
```bash
cd ~/Source/whatsapp-deleter
git rm start stop nixpacks.toml
```
Expected: three lines, each starting with `rm '…'`.

- [ ] **Step 2: Commit**

```bash
cd ~/Source/whatsapp-deleter
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
chore: remove pm2/nixpacks artifacts

start/stop scripts and Railway nixpacks descriptor are
replaced by launchd + bin/run.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Rewrite `README.md`

**Files:**
- Modify: `~/Source/whatsapp-deleter/README.md` (full rewrite)

- [ ] **Step 1: Replace the file**

Write to `~/Source/whatsapp-deleter/README.md`:
````markdown
# whatsapp-deleter (launchd edition)

Auto-deletes (delete-for-me) WhatsApp group messages from configured phone numbers. Runs as a macOS LaunchAgent — starts at login, restarts on crash.

## Install (one-time)

```bash
git clone https://github.com/avihil1/whatsapp-deleter.git ~/Source/whatsapp-deleter
cd ~/Source/whatsapp-deleter
npm install

# user-local config & log dirs
mkdir -p ~/.config/whatsapp-deleter ~/Library/Logs/whatsapp-deleter

# seed the block-list (international, no +, no leading 0)
cat > ~/.config/whatsapp-deleter/targets.txt <<'EOF'
# Phone numbers to delete-for-me, one per line.
# Format: international, no +, no leading 0. Example: 972523905680
# Substring match against contact.number.
# Edit freely; bot reloads within ~2 seconds.
972523905680
EOF

# first run — interactive, to scan the QR
./bin/run
# scan QR with WhatsApp on your phone, wait for "READY", then Ctrl-C

# install the LaunchAgent
cp com.avihil.whatsapp-deleter.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.avihil.whatsapp-deleter.plist
```

Verify it's running:
```bash
launchctl print gui/$(id -u)/com.avihil.whatsapp-deleter | head -20
tail -f ~/Library/Logs/whatsapp-deleter/out.log
```

## Daily use

| Action | Command |
|---|---|
| Edit blocked numbers | `vim ~/.config/whatsapp-deleter/targets.txt` (auto-picks up in ~2s) |
| Restart bot | `launchctl kickstart -k gui/$(id -u)/com.avihil.whatsapp-deleter` |
| Tail logs | `npm run logs` or `tail -f ~/Library/Logs/whatsapp-deleter/out.log` |
| Stop / disable | `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.avihil.whatsapp-deleter.plist` |
| Re-enable | `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.avihil.whatsapp-deleter.plist` |

## Uninstall

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.avihil.whatsapp-deleter.plist
rm ~/Library/LaunchAgents/com.avihil.whatsapp-deleter.plist
```

## Sleep behavior

macOS suspends user processes on sleep. To keep the bot running while the lid is closed on power:

```bash
sudo pmset -c sleep 0 disablesleep 1
```

Bot will still pause when the Mac sleeps on battery — by design.

## Notifications

After 3 consecutive WhatsApp disconnect / auth-failure events without an intervening reconnect, a macOS notification fires once. Silent on self-heal. Counter is in-memory only.
````

- [ ] **Step 2: Commit**

```bash
cd ~/Source/whatsapp-deleter
git add README.md
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
docs(readme): rewrite for launchd setup

Cover install, daily operations, uninstall, sleep behavior,
notification semantics.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Create user-local config and log directories

**Files:**
- Create: `~/.config/whatsapp-deleter/targets.txt`
- Create: `~/Library/Logs/whatsapp-deleter/` (empty dir)

- [ ] **Step 1: Make the dirs**

Run:
```bash
mkdir -p ~/.config/whatsapp-deleter ~/Library/Logs/whatsapp-deleter
```

- [ ] **Step 2: Write the seed targets file**

Write to `~/.config/whatsapp-deleter/targets.txt`:
```
# Phone numbers to delete-for-me, one per line.
# Format: international, no +, no leading 0. Example: 972523905680
# Substring match against contact.number.
# Edit freely; bot reloads within ~2 seconds.
972523905680
```

- [ ] **Step 3: Verify**

Run:
```bash
ls -la ~/.config/whatsapp-deleter/ ~/Library/Logs/whatsapp-deleter/
cat ~/.config/whatsapp-deleter/targets.txt
```
Expected: `targets.txt` exists; log dir exists (empty).

No commit — these are user-local files outside the repo.

---

### Task 8: First-run QR scan

**Files:** none — interactive verification.

- [ ] **Step 1: Run the bot interactively**

Run:
```bash
cd ~/Source/whatsapp-deleter && ./bin/run
```

- [ ] **Step 2: Scan the QR**

Expected output includes a line like:
```
SCAN THIS QR CODE:  https://api.qrserver.com/v1/create-qr-code/?data=...
```
Open the URL in a browser, scan with WhatsApp → Settings → Linked Devices → Link a Device.

- [ ] **Step 3: Wait for READY**

Expected output within ~30s:
```
LOADING SCREEN: 100 …
AUTHENTICATED: Session saved successfully.
✅ READY: Bot is fully connected!
[Targets] Loaded 1 number(s) from /Users/hillelk/.config/whatsapp-deleter/targets.txt
```
(The `Loaded N number(s)` line will have appeared earlier on startup — what matters is `READY`.)

- [ ] **Step 4: Stop the bot**

Press `Ctrl-C`. Expected:
```
Received SIGINT. Closing browser...
Browser closed. Exiting process.
```

- [ ] **Step 5: Verify session was persisted**

Run:
```bash
ls ~/Source/whatsapp-deleter/sessions/
```
Expected: a directory named `session-vibe-shield-final` (or similar) containing puppeteer profile data.

---

### Task 9: Install the LaunchAgent

**Files:**
- Install: `~/Library/LaunchAgents/com.avihil.whatsapp-deleter.plist`

- [ ] **Step 1: Copy plist into LaunchAgents**

Run:
```bash
cp ~/Source/whatsapp-deleter/com.avihil.whatsapp-deleter.plist ~/Library/LaunchAgents/
```

- [ ] **Step 2: Bootstrap into launchd**

Run:
```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.avihil.whatsapp-deleter.plist
```
Expected: no output, exit code 0. (If you see `Bootstrap failed: 5: Input/output error`, the label is already loaded — `bootout` first then retry.)

- [ ] **Step 3: Verify launchd sees it**

Run:
```bash
launchctl print gui/$(id -u)/com.avihil.whatsapp-deleter | head -30
```
Expected fields: `state = running`, `pid = <some number>`, `program = /Users/hillelk/Source/whatsapp-deleter/bin/run`.

- [ ] **Step 4: Tail logs to confirm a clean start**

Run:
```bash
tail -f ~/Library/Logs/whatsapp-deleter/out.log
```
Expected within ~30s:
```
--- System Starting Up ---
[Targets] Loaded 1 number(s) from /Users/hillelk/.config/whatsapp-deleter/targets.txt
LOADING SCREEN: …
AUTHENTICATED: Session saved successfully.
✅ READY: Bot is fully connected!
```
Ctrl-C to stop tailing. The bot keeps running.

- [ ] **Step 5: Sanity-check failure→restart**

Find the bot PID and kill it:
```bash
PID=$(launchctl print gui/$(id -u)/com.avihil.whatsapp-deleter | awk '/pid =/ {print $3}')
echo "killing PID $PID"
kill -9 "$PID"
sleep 35  # ThrottleInterval is 30s
launchctl print gui/$(id -u)/com.avihil.whatsapp-deleter | awk '/pid =|state =/'
```
Expected: a NEW pid; `state = running`. Confirms KeepAlive works.

---

### Task 10: Push the repo

**Files:** none — git remote update.

- [ ] **Step 1: Confirm history**

Run:
```bash
cd ~/Source/whatsapp-deleter && git log --oneline -10
```
Expected: top of the log shows the 6 commits from Tasks 1–6 plus the earlier spec commit.

- [ ] **Step 2: Push (optional, ask user first)**

This repo is `avihil1/whatsapp-deleter` — not the user's own. Do not push without asking the user whether they have write access or whether they want to fork first. If pushing is not desired, leave commits local.

---

## Self-Review

**Spec coverage check:**

- File-watched targets list → Task 1 ✓
- Failure counter + notification → Task 1 ✓
- `bin/run` nvm wrapper → Task 2 ✓
- LaunchAgent plist → Task 3 ✓ (committed) and Task 9 ✓ (installed)
- pm2 / start / stop / nixpacks removal → Tasks 4 + 5 ✓
- README rewrite → Task 6 ✓
- User config + log dirs → Task 7 ✓
- First-run QR scan → Task 8 ✓
- launchd install + smoke verify → Task 9 ✓

No spec section is unimplemented.

**Placeholder scan:** No TODO/TBD/"similar to" found. All code blocks are complete.

**Type/naming consistency:** Function names (`loadTargets`, `recordFailure`, `recordHealthy`, `notify`), constants (`TARGETS_FILE`, `FAILURE_THRESHOLD`), and the plist label (`com.avihil.whatsapp-deleter`) are consistent across every task that references them.

**Limitations carried from spec:** Failure counter is in-memory (acknowledged in spec). No automated tests — manual smoke verification only (matches scope; this is a personal tool with ~120 LOC).
