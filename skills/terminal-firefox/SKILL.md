---
name: terminal-firefox
description: Terminal-native Firefox browser with Marionette remote control via Browsh. Renders real web pages in the terminal using text and color. Requires a one-time Firefox patch to allow multiple Marionette sessions (Browsh + control script). Use for browsing, debugging, testing, and inspecting web pages.
---

# Terminal Firefox

A full Firefox browser that renders in your terminal via Browsh. Uses Firefox's Marionette protocol for programmatic control — navigate, evaluate JS, click, type, extract HTML, and take screenshots.

## How it works

- **Browsh** renders Firefox in the terminal via a WebExtension that captures headless Firefox output
- Browsh holds **Marionette session #1** for its internal communication with Firefox
- The `marionette.mjs` script creates **session #2** and switches to Browsh's browser window for control
- Firefox is patched (one-time) to allow multiple concurrent Marionette sessions (default is hardcoded to 1)

## Launch browser (when /terminal-firefox is invoked)

### Step 1: Check prerequisites

```bash
echo "=== Prerequisite Check ===" && \
echo -n "tmux: " && (command -v tmux >/dev/null 2>&1 && echo "OK" || echo "MISSING") && \
echo -n "browsh: " && (command -v browsh >/dev/null 2>&1 && echo "OK ($(browsh --version 2>/dev/null))" || (test -x "$HOME/.local/share/terminal-firefox/browsh" && echo "OK (local)" || echo "MISSING")) && \
echo -n "firefox: " && (command -v firefox >/dev/null 2>&1 && echo "OK" || (test -x "/Applications/Firefox.app/Contents/MacOS/firefox" && echo "OK (macOS app)" || echo "MISSING")) && \
echo -n "node: " && (node -v 2>/dev/null || echo "MISSING") && \
echo -n "tmux session: " && ([ -n "$TMUX" ] && echo "OK" || echo "NOT IN TMUX") && \
echo -n "firefox patch: " && (python3 -c "
import zipfile, sys
with zipfile.ZipFile('/Applications/Firefox.app/Contents/Resources/omni.ja' if sys.platform=='darwin' else '/usr/lib/firefox/omni.ja','r') as z:
    c=z.read('chrome/remote/content/marionette/server.sys.mjs').decode()
    print('OK' if 'if (false)' in c else 'NEEDS_PATCH')
" 2>/dev/null || echo "NEEDS_PATCH")
```

**If tmux is MISSING**: Tell the user to install it (`brew install tmux` on macOS, `apt install tmux` on Linux). Stop here.

**If firefox is MISSING**: Tell the user to install Firefox:
- macOS: `brew install --cask firefox` or download from https://www.mozilla.org/firefox/
- Linux: `sudo apt install firefox` or `sudo dnf install firefox`

Firefox 57+ is required. Stop here.

**If browsh is MISSING**: Install it automatically:

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

**If NOT IN TMUX**: Tell the user: "The browser needs tmux to open in a split pane. Run `/exit`, then `tmux new-session "claude --resume"` to relaunch inside tmux." Stop here.

**If firefox patch is NEEDS_PATCH**: Continue to Step 2 to patch Firefox.

**If all OK**: Skip to Step 3.

### Step 2: Patch Firefox for multi-session Marionette

Firefox hardcodes a limit of 1 Marionette session. Browsh takes that session for terminal rendering.
We patch 3 files inside Firefox's `omni.ja` (a ZIP archive of internal JS modules) to allow multiple
concurrent sessions. This lets our `marionette.mjs` control script create session #2 alongside Browsh.

**Files patched:**
- `chrome/remote/content/marionette/server.sys.mjs` — connection rejection when session exists
- `chrome/remote/content/marionette/driver.sys.mjs` — session creation limit
- `chrome/remote/content/webdriver-bidi/WebDriverBiDi.sys.mjs` — BiDi session creation limit

**This patch must be re-applied after Firefox updates.**

```bash
python3 << 'PATCH_SCRIPT'
import zipfile, os, sys, shutil, tempfile

if sys.platform == 'darwin':
    omni_path = '/Applications/Firefox.app/Contents/Resources/omni.ja'
else:
    omni_path = '/usr/lib/firefox/omni.ja'

backup_path = omni_path + '.bak'

# Backup original if no backup exists
if not os.path.exists(backup_path):
    shutil.copy2(omni_path, backup_path)
    print(f"Backed up original to {backup_path}")

# Patches: replace session limit checks with `if (false)`
patches = {
    'chrome/remote/content/marionette/server.sys.mjs': (
        'if (hasActiveSession) {',
        'if (false) {'
    ),
    'chrome/remote/content/marionette/driver.sys.mjs': (
        'if (this.currentSession) {\n    throw new lazy.error.SessionNotCreatedError(\n      "Maximum number of active sessions"',
        'if (false) {\n    throw new lazy.error.SessionNotCreatedError(\n      "Maximum number of active sessions"'
    ),
    'chrome/remote/content/webdriver-bidi/WebDriverBiDi.sys.mjs': (
        'if (this.#session) {\n      throw new lazy.error.SessionNotCreatedError(\n        "Maximum number of active sessions"',
        'if (false) {\n      throw new lazy.error.SessionNotCreatedError(\n        "Maximum number of active sessions"'
    ),
}

# Extract all files
tmp_dir = tempfile.mkdtemp(prefix='firefox-patch-')
with zipfile.ZipFile(omni_path, 'r') as zin:
    zin.extractall(tmp_dir)

# Apply patches
patched = 0
for filepath, (old, new) in patches.items():
    full_path = os.path.join(tmp_dir, filepath)
    if os.path.exists(full_path):
        with open(full_path, 'r') as f:
            content = f.read()
        if old in content:
            content = content.replace(old, new)
            with open(full_path, 'w') as f:
                f.write(content)
            patched += 1
            print(f"Patched: {filepath}")
        elif new.split('{')[0] in content:
            print(f"Already patched: {filepath}")
            patched += 1
        else:
            print(f"WARNING: patch target not found in {filepath}")

# Rebuild omni.ja with stored compression (required by Firefox)
if patched > 0:
    new_omni = omni_path + '.new'
    with zipfile.ZipFile(new_omni, 'w', compression=zipfile.ZIP_STORED) as zout:
        for root, dirs, files in os.walk(tmp_dir):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, tmp_dir)
                zout.write(file_path, arcname)
    os.replace(new_omni, omni_path)
    print(f"Rebuilt {omni_path} with {patched} patches applied")

# Clear startup caches
for cache_dir in [
    os.path.expanduser('~/Library/Application Support/browsh/firefox_profile/startupCache'),
    os.path.expanduser('~/Library/Caches/Firefox'),
]:
    if os.path.exists(cache_dir):
        shutil.rmtree(cache_dir, ignore_errors=True)
        print(f"Cleared cache: {cache_dir}")

# Cleanup
shutil.rmtree(tmp_dir, ignore_errors=True)
print("Firefox patched for multi-session Marionette support")
PATCH_SCRIPT
```

### Step 3: Ensure tmux config

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

### Step 4: Check for existing Browsh instance

```bash
if nc -z 127.0.0.1 2828 2>/dev/null && nc -z 127.0.0.1 3334 2>/dev/null; then
  echo "EXISTING_INSTANCE_FOUND"
  ~/.claude/skills/terminal-firefox/marionette.mjs title
else
  echo "NO_EXISTING_INSTANCE"
fi
```

**If EXISTING_INSTANCE_FOUND**: Skip to Step 6 (Use Marionette).

### Step 5: Launch browser

```bash
# Determine Browsh path
if command -v browsh >/dev/null 2>&1; then
  BROWSH_BIN="browsh"
else
  BROWSH_BIN="$HOME/.local/share/terminal-firefox/browsh"
fi

URL="${1:-https://google.com}"

# Launch Browsh in a tmux split pane
PANE_ID=$(tmux split-window -h -p 50 -P -F '#{pane_id}' \
  "$BROWSH_BIN --startup-url '$URL'")
echo "PANE_ID=$PANE_ID"

# Wait for Browsh + Firefox to be ready
for i in $(seq 1 20); do
  if nc -z 127.0.0.1 2828 2>/dev/null; then
    echo "Marionette ready"
    break
  fi
  sleep 1
done
sleep 2
```

### Step 6: Use Marionette

After launch, use the Marionette commands below to interact with the browser.
The script auto-creates session #2 and switches to Browsh's browser window.

## Marionette Commands

All commands use the script at `~/.claude/skills/terminal-firefox/marionette.mjs`.

```bash
# Navigate to URL (updates Browsh's terminal view)
~/.claude/skills/terminal-firefox/marionette.mjs nav <url>

# Evaluate JavaScript
~/.claude/skills/terminal-firefox/marionette.mjs eval <expression>

# Click element by CSS selector
~/.claude/skills/terminal-firefox/marionette.mjs click <selector>

# Type text into element
~/.claude/skills/terminal-firefox/marionette.mjs type <selector> <text>

# Get page HTML
~/.claude/skills/terminal-firefox/marionette.mjs html [selector]

# Screenshot (PNG)
~/.claude/skills/terminal-firefox/marionette.mjs shot [file]

# Get page title
~/.claude/skills/terminal-firefox/marionette.mjs title

# Get current URL
~/.claude/skills/terminal-firefox/marionette.mjs url

# Navigation
~/.claude/skills/terminal-firefox/marionette.mjs back
~/.claude/skills/terminal-firefox/marionette.mjs forward
~/.claude/skills/terminal-firefox/marionette.mjs refresh

# List all windows
~/.claude/skills/terminal-firefox/marionette.mjs windows
```

## Typical workflow

```bash
# 1. Navigate
~/.claude/skills/terminal-firefox/marionette.mjs nav "https://en.wikipedia.org"

# 2. Get info
~/.claude/skills/terminal-firefox/marionette.mjs title
~/.claude/skills/terminal-firefox/marionette.mjs eval "document.body.innerText.slice(0, 3000)"

# 3. Interact
~/.claude/skills/terminal-firefox/marionette.mjs click "a.nav-link"
~/.claude/skills/terminal-firefox/marionette.mjs type "input[name=search]" "hello world"

# 4. Screenshot
~/.claude/skills/terminal-firefox/marionette.mjs shot /tmp/firefox-screenshot.png
```

## Close

```bash
tmux kill-pane -t "$PANE_ID" 2>/dev/null
```

## Notes

- Browsh renders Firefox as text + ANSI colors in the terminal
- Firefox 57+ required (WebExtension support)
- Marionette on port 2828 — both Browsh (session #1) and our script (session #2) share it
- Firefox must be patched for multi-session support (Step 2) — re-apply after Firefox updates
- Original `omni.ja` is backed up to `omni.ja.bak` before patching
- To restore Firefox to original: `cp omni.ja.bak omni.ja` in Firefox's Resources directory
- Works over SSH
- Source: https://github.com/browsh-org/browsh
