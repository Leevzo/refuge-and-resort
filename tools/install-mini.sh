#!/bin/bash
# One-time, on the Mac mini: gets the site, and sets the rates to rebuild every night at 4:15.
#   bash <(curl -fsSL https://raw.githubusercontent.com/Leevzo/refuge-and-resort/main/tools/install-mini.sh)
set -euo pipefail
DIR="$HOME/Code/refuge-and-resort"
LABEL="com.refugeandresort.rates"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

command -v git >/dev/null || { echo "Git is missing. Run: xcode-select --install   then run this again."; exit 1; }
command -v node >/dev/null || { echo "Node is missing (needed for the safety tests). Install it from nodejs.org, then run this again."; exit 1; }
command -v gh >/dev/null || { echo "GitHub CLI is missing. Install it from cli.github.com, then run this again."; exit 1; }
gh auth status >/dev/null 2>&1 || gh auth login --web --git-protocol https
gh auth setup-git

if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --quiet; else mkdir -p "$(dirname "$DIR")"; gh repo clone Leevzo/refuge-and-resort "$DIR"; fi
chmod +x "$DIR/tools/nightly.sh"
mkdir -p "$DIR/logs" "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$DIR/tools/nightly.sh</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>4</integer><key>Minute</key><integer>15</integer></dict>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>StandardOutPath</key><string>$DIR/logs/nightly.log</string>
  <key>StandardErrorPath</key><string>$DIR/logs/nightly.log</string>
</dict></plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Running it once now..."
launchctl kickstart "gui/$(id -u)/$LABEL"
sleep 20
tail -5 "$DIR/logs/nightly.log" || true
echo "Done. It runs every night at 4:15. Log: $DIR/logs/nightly.log"
