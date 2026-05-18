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
# Format: international, no +, no leading 0. Example: 972500000000
# Substring match against contact.number.
# Edit freely; bot reloads within ~2 seconds.
972500000000
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
