---
name: terminal-firefox
description: Terminal-native Firefox browser with CDP remote debugging via Browsh. Renders real web pages in the terminal using text and color. Use for browsing, debugging, testing, and inspecting web pages. Based on browsh (https://github.com/browsh-org/browsh).
---

# Terminal Firefox

A full Firefox browser that renders in your terminal via Browsh. Uses CDP (Chrome DevTools Protocol, supported by Firefox 86+) for programmatic control.

## How it works

- **Browsh** renders Firefox in the terminal by capturing headless Firefox output via a WebExtension
- Firefox is launched with `--remote-debugging-port=PORT` to expose a CDP endpoint at `http://127.0.0.1:PORT`
- Browsh connects to the same Firefox instance via `--firefox.use-existing` for terminal rendering
- The `cdp.mjs` script connects to the CDP endpoint to control the browser
- Multiple instances can run on different ports (9333, 9334, 9335, ...)

## Launch browser (when /terminal-firefox is invoked)

When this skill is invoked, run through these prerequisite checks first, then launch.

### Step 1: Check prerequisites

Run all checks in a single bash command:

```bash
echo "=== Prerequisite Check ===" && \
echo -n "tmux: " && (command -v tmux >/dev/null 2>&1 && echo "OK" || echo "MISSING") && \
echo -n "browsh: " && (command -v browsh >/dev/null 2>&1 && echo "OK ($(browsh --version 2>/dev/null))" || (test -x "$HOME/.local/share/terminal-firefox/browsh" && echo "OK (local)" || echo "MISSING")) && \
echo -n "firefox: " && (command -v firefox >/dev/null 2>&1 && echo "OK" || (test -x "/Applications/Firefox.app/Contents/MacOS/firefox" && echo "OK (macOS app)" || echo "MISSING")) && \
echo -n "node: " && (node -v 2>/dev/null || echo "MISSING") && \
echo -n "tmux session: " && ([ -n "$TMUX" ] && echo "OK" || echo "NOT IN TMUX")
```

**If tmux is MISSING**: Tell the user to install it (`brew install tmux` on macOS, `apt install tmux` on Linux). Stop here.

**If firefox is MISSING**: Tell the user to install Firefox:
- macOS: `brew install --cask firefox` or download from https://www.mozilla.org/firefox/
- Linux: `sudo apt install firefox` or `sudo dnf install firefox`

Firefox 57+ is required. Stop here.

**If browsh is MISSING**: Install it automatically by running:

```bash
ARCH=$(uname -m); OS=$(uname -s)
case "$OS" in Darwin) P_OS="darwin";; Linux) P_OS="linux";; esac
case "$ARCH" in arm64|aarch64) P_ARCH="arm64";; x86_64|amd64) P_ARCH="amd64";; esac
INSTALL_DIR="$HOME/.local/share/terminal-firefox"
mkdir -p "$INSTALL_DIR"

if [ "$P_OS" = "darwin" ]; then
  curl -fSL "https://github.com/browsh-org/browsh/releases/download/v1.8.2/browsh_1.8.2_${P_OS}_${P_ARCH}.tar.gz" -o /tmp/browsh.tar.gz
  tar -xzf /tmp/browsh.tar.gz -C "$INSTALL_DIR"
  rm /tmp/browsh.tar.gz
else
  curl -fSL "https://github.com/browsh-org/browsh/releases/download/v1.8.2/browsh_1.8.2_${P_OS}_${P_ARCH}" -o "$INSTALL_DIR/browsh"
fi

chmod +x "$INSTALL_DIR/browsh"
echo "$INSTALL_DIR/browsh installed"
```

Then add to PATH if needed:
```bash
if ! echo "$PATH" | grep -q "terminal-firefox"; then
  echo 'export PATH="$HOME/.local/share/terminal-firefox:$PATH"' >> ~/.zshrc
  export PATH="$HOME/.local/share/terminal-firefox:$PATH"
fi
```

**If NOT IN TMUX**: Tell the user: "The browser needs tmux to open in a split pane. Run `/exit`, then `tmux new-session "claude --resume"` to relaunch inside tmux." Stop here.

**If all OK**: Continue to Step 2.

### Step 2: Ensure tmux config

Check if tmux settings are already configured. Only apply what's missing:

```bash
TMUX_CONF="$HOME/.tmux.conf"
NEEDS_SETUP=0

if [ -f "$TMUX_CONF" ]; then
  grep -q "set -g mouse on" "$TMUX_CONF" || NEEDS_SETUP=1
  grep -q "allow-passthrough" "$TMUX_CONF" || NEEDS_SETUP=1
  grep -q "extended-keys" "$TMUX_CONF" || NEEDS_SETUP=1
else
  NEEDS_SETUP=1
fi

if [ "$NEEDS_SETUP" -eq 1 ]; then
  touch "$TMUX_CONF"
  grep -q "set -g mouse on" "$TMUX_CONF" || echo -e "\n# terminal-firefox settings\nset -g mouse on" >> "$TMUX_CONF"
  grep -q "allow-passthrough" "$TMUX_CONF" || echo "set -g allow-passthrough all" >> "$TMUX_CONF"
  grep -q "extended-keys" "$TMUX_CONF" || echo "set -g extended-keys on" >> "$TMUX_CONF"
  tmux set -g mouse on 2>/dev/null
  tmux set -g allow-passthrough all 2>/dev/null
  tmux set -g extended-keys on 2>/dev/null
  echo "tmux config applied"
else
  echo "tmux config already set, skipping"
fi
```

### Step 3: Check for existing Firefox CDP instance

Before launching a new browser, check if Firefox is already running with an active CDP port:

```bash
# Scan ports 9333-9340 for an active CDP endpoint
EXISTING_PORT=""
for p in $(seq 9333 9340); do
  if curl -s "http://127.0.0.1:$p/json/version" >/dev/null 2>&1; then
    EXISTING_PORT=$p
    break
  fi
done

if [ -n "$EXISTING_PORT" ]; then
  echo "EXISTING_INSTANCE_FOUND on port $EXISTING_PORT"
  CDP_PORT=$EXISTING_PORT ~/.claude/skills/terminal-firefox/cdp.mjs list
else
  echo "NO_EXISTING_INSTANCE"
fi
```

**If EXISTING_INSTANCE_FOUND**: Skip launching a new browser. Use the existing CDP port for all subsequent commands. Continue to Step 5 (Use CDP).

**If NO_EXISTING_INSTANCE**: Continue to Step 4 to launch a new browser.

### Step 4: Launch browser

This is a two-step launch: first Firefox with CDP, then Browsh connected to it.

```bash
# Find available CDP port
PORT=9333
while curl -s "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; do
  ((PORT++))
done

# Determine Firefox path
if command -v firefox >/dev/null 2>&1; then
  FIREFOX_BIN="firefox"
elif [ -x "/Applications/Firefox.app/Contents/MacOS/firefox" ]; then
  FIREFOX_BIN="/Applications/Firefox.app/Contents/MacOS/firefox"
else
  echo "Firefox not found"; exit 1
fi

# Determine Browsh path
if command -v browsh >/dev/null 2>&1; then
  BROWSH_BIN="browsh"
else
  BROWSH_BIN="$HOME/.local/share/terminal-firefox/browsh"
fi

URL="${1:-https://google.com}"

# Step 1: Launch Firefox headless with both Marionette (for Browsh) and CDP (for us)
$FIREFOX_BIN --headless --marionette --remote-debugging-port=$PORT "$URL" &
FIREFOX_PID=$!
echo "Firefox PID=$FIREFOX_PID CDP_PORT=$PORT"

# Wait for CDP to be ready
for i in $(seq 1 15); do
  if curl -s "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
    echo "CDP ready on port $PORT"
    break
  fi
  sleep 1
done

# Step 2: Launch Browsh in tmux split pane, connecting to existing Firefox
PANE_ID=$(tmux split-window -h -p 50 -P -F '#{pane_id}' \
  "$BROWSH_BIN --firefox.use-existing --startup-url '$URL'")
sleep 3

# Verify CDP connection
curl -s "http://127.0.0.1:$PORT/json/version" | head -3
```

### Step 5: Use CDP

After launch, use the CDP commands below to interact with the browser programmatically.

## CDP Commands

All commands use the CDP script at `~/.claude/skills/terminal-firefox/cdp.mjs`.

Set `CDP_PORT=<port>` before every command. The `<target>` is a targetId prefix from `list`.

```bash
# List open pages
CDP_PORT=9333 ~/.claude/skills/terminal-firefox/cdp.mjs list

# Navigate
CDP_PORT=9333 ~/.claude/skills/terminal-firefox/cdp.mjs nav <target> <url>

# Click element by CSS selector
CDP_PORT=9333 ~/.claude/skills/terminal-firefox/cdp.mjs click <target> <selector>

# Click at coordinates
CDP_PORT=9333 ~/.claude/skills/terminal-firefox/cdp.mjs clickxy <target> <x> <y>

# Type text
CDP_PORT=9333 ~/.claude/skills/terminal-firefox/cdp.mjs type <target> <text>

# Evaluate JavaScript
CDP_PORT=9333 ~/.claude/skills/terminal-firefox/cdp.mjs eval <target> <expr>

# Get page HTML
CDP_PORT=9333 ~/.claude/skills/terminal-firefox/cdp.mjs html <target> [selector]

# Screenshot
CDP_PORT=9333 ~/.claude/skills/terminal-firefox/cdp.mjs shot <target> [file]

# Open new tab
CDP_PORT=9333 ~/.claude/skills/terminal-firefox/cdp.mjs open [url]

# Raw CDP command
CDP_PORT=9333 ~/.claude/skills/terminal-firefox/cdp.mjs evalraw <target> <method> [json]
```

## Typical workflow

```bash
# 1. List tabs to get target ID
CDP_PORT=9333 ~/.claude/skills/terminal-firefox/cdp.mjs list

# 2. Interact
CDP_PORT=9333 ~/.claude/skills/terminal-firefox/cdp.mjs eval <target> "document.title"
CDP_PORT=9333 ~/.claude/skills/terminal-firefox/cdp.mjs click <target> "a.nav-link"
CDP_PORT=9333 ~/.claude/skills/terminal-firefox/cdp.mjs nav <target> "https://other-site.com"

# 3. Get page content
CDP_PORT=9333 ~/.claude/skills/terminal-firefox/cdp.mjs eval <target> "document.body.innerText.slice(0, 3000)"
```

## Close

```bash
# Close the browser pane and Firefox process
tmux kill-pane -t "$PANE_ID" 2>/dev/null
kill $FIREFOX_PID 2>/dev/null
```

## Notes

- Browsh renders Firefox output as text and ANSI colors in the terminal
- Firefox 57+ is required (for WebExtension support)
- Uses CDP port range 9333-9340 (avoids conflicts with terminal-chromium on 9222-9230)
- Some CDP commands (like `snap` for accessibility tree) may not be supported by Firefox's CDP implementation
- Firefox's CDP support covers: Page, Runtime, DOM, Input, Network, and Page.captureScreenshot
- Works over SSH
- Source: https://github.com/browsh-org/browsh
