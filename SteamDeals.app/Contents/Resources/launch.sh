#!/bin/bash
# SteamDeals launcher — double-click to start the app.
# Starts the Vite server (installing dependencies on first launch or when
# they are broken/incomplete) and opens SteamDeals in the default browser.
# Reuses an already-running server, so clicking the icon again just opens
# a new tab.

PROJECT_DIR="${STEAMDEALS_DIR:-$HOME/Desktop/Dev/Projects/SteamDeals}"
PORT=5173
URL="http://localhost:$PORT"
LOG="$PROJECT_DIR/steamdeals-launcher.log"

# Finder launches apps with a minimal PATH; add the usual Node.js locations.
# A Homebrew node@22 keg (if present) is preferred so the app runs on a
# supported Node LTS without changing the system-wide `node`.
export PATH="/opt/homebrew/opt/node@22/bin:/usr/local/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

notify() {
  osascript -e "display notification \"$1\" with title \"SteamDeals\"" >/dev/null 2>&1
}

fail() {
  osascript -e "display dialog \"$1\" with title \"SteamDeals\" buttons {\"OK\"} default button 1 with icon caution" >/dev/null 2>&1
  exit 1
}

# Server already running? Just open the app.
if curl -s -o /dev/null --max-time 2 "$URL"; then
  open "$URL"
  exit 0
fi

[ -d "$PROJECT_DIR" ] || fail "Project folder not found: $PROJECT_DIR"
command -v node >/dev/null 2>&1 || fail "Node.js was not found. Install it from nodejs.org, then launch SteamDeals again."

cd "$PROJECT_DIR" || fail "Cannot open $PROJECT_DIR. If macOS asked about Desktop access, please allow it and try again."

: > "$LOG"
echo "=== SteamDeals launch $(date) ===" >> "$LOG"

# iCloud syncs symlinks poorly and often deletes the node_modules link
# between sessions, while the excluded node_modules.nosync folder survives.
# Recreate the link (cheap) whenever the real deps live in .nosync.
if [ -d node_modules.nosync ] && [ ! -e node_modules/.bin/vite ]; then
  rm -rf node_modules
  ln -s node_modules.nosync node_modules
  echo "Re-established node_modules -> node_modules.nosync symlink." >> "$LOG"
fi

# Install when dependencies are missing OR broken (e.g. an interrupted
# install, or iCloud/Dropbox mangling node_modules) — running the vite
# binary catches both.
if [ ! -x node_modules/.bin/vite ] || ! node_modules/.bin/vite --version >> "$LOG" 2>&1; then
  notify "Installing dependencies — this can take a few minutes…"
  # Start clean: a half-written node_modules can't be repaired in place.
  rm -rf node_modules node_modules.nosync
  installed=""
  if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund >> "$LOG" 2>&1 && installed=1
  fi
  if [ -z "$installed" ]; then
    npm install --no-audit --no-fund >> "$LOG" 2>&1 && installed=1
  fi
  # If this project lives in an iCloud/cloud-synced folder, move the freshly
  # installed modules into a .nosync sibling so the cloud stops corrupting
  # them, and symlink node_modules to it. `brctl` responds only under iCloud.
  if [ -n "$installed" ] && [ -d node_modules ] && ! [ -L node_modules ] \
     && brctl status >/dev/null 2>&1; then
    mv node_modules node_modules.nosync && ln -s node_modules.nosync node_modules
    echo "Moved node_modules to node_modules.nosync (excluded from iCloud sync)." >> "$LOG"
  fi
  if [ -z "$installed" ] || ! node_modules/.bin/vite --version >> "$LOG" 2>&1; then
    fail "Could not install dependencies (check your internet connection). Open Terminal and run:  cd \"$PROJECT_DIR\" && npm install   — details in steamdeals-launcher.log."
  fi
fi

# Start the dev server in its OWN session (setsid) so it keeps running after
# this launcher exits. The applet wrapper (see Contents/Resources) checks in
# with LaunchServices properly, so macOS does not garbage-collect the
# processes we spawn here.
nohup perl -e 'use POSIX qw(setsid); setsid(); exec @ARGV' npm run dev >> "$LOG" 2>&1 &

# Wait for Vite to report its URL (it may pick another port if 5173 is busy).
for _ in $(seq 1 120); do
  liveUrl=$(grep -o "http://localhost:[0-9]*" "$LOG" | tail -1)
  if [ -n "$liveUrl" ] && curl -s -o /dev/null --max-time 1 "$liveUrl"; then
    open "$liveUrl"
    exit 0
  fi
  sleep 0.5
done

fail "The SteamDeals server did not start in time. See steamdeals-launcher.log in the project folder."
