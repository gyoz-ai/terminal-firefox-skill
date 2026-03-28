# terminal-firefox (Claude Code Skill)

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill that gives Claude a full Firefox browser in your terminal. Browse, inspect, and interact with web pages using Marionette -- all from within a Claude Code session.

Built on [Browsh](https://github.com/browsh-org/browsh), which renders Firefox as text and ANSI colors in the terminal. Works in any terminal, including tmux and over SSH.

## How it works

Browsh launches headless Firefox and renders pages in the terminal via a WebExtension. This skill adds **programmatic control** by creating a second Marionette session alongside Browsh, giving Claude full access to navigate, evaluate JS, click elements, type, extract HTML, and take screenshots.

Firefox's Marionette protocol is hardcoded to allow only 1 session. This skill includes a **one-time patch** to Firefox's `omni.ja` (internal JS modules) that removes this limit, enabling Browsh and the control script to coexist.

### What gets patched

Three files inside `/Applications/Firefox.app/Contents/Resources/omni.ja`:

| File | Change |
|------|--------|
| `server.sys.mjs` | Removes connection rejection when a session exists |
| `driver.sys.mjs` | Removes session creation limit |
| `WebDriverBiDi.sys.mjs` | Removes BiDi session creation limit |

The original `omni.ja` is backed up to `omni.ja.bak`. The patch must be re-applied after Firefox updates.

## What it does

When you invoke `/terminal-firefox`, Claude will:

1. Check prerequisites (tmux, browsh, firefox, node)
2. Patch Firefox if needed (one-time)
3. Launch Browsh in a tmux split pane (terminal rendering)
4. Control the browser via Marionette (programmatic access)

### Commands

| Command | Description |
|---------|-------------|
| `nav <url>` | Navigate to a URL |
| `eval <expr>` | Evaluate JavaScript |
| `click <selector>` | Click an element by CSS selector |
| `type <selector> <text>` | Type text into element |
| `html [selector]` | Get page HTML |
| `shot [file]` | Take a screenshot (PNG) |
| `title` | Get page title |
| `url` | Get current URL |
| `back` / `forward` | Navigate history |
| `refresh` | Refresh page |
| `windows` | List all open windows |

## Requirements

- **Firefox 57+** -- `brew install --cask firefox` (macOS) or package manager (Linux)
- **tmux** -- for split pane rendering
- **Node.js 21+** -- for the Marionette control script
- **python3** -- for the Firefox patch script

Browsh is auto-installed on first run if missing.

## Installation

```bash
mkdir -p ~/.claude/skills/terminal-firefox
cp skills/terminal-firefox/SKILL.md ~/.claude/skills/terminal-firefox/
cp skills/terminal-firefox/marionette.mjs ~/.claude/skills/terminal-firefox/
chmod +x ~/.claude/skills/terminal-firefox/marionette.mjs
```

Or symlink:

```bash
git clone https://github.com/gyoz-ai/terminal-firefox-skill.git ~/terminal-firefox-skill
ln -s ~/terminal-firefox-skill/skills/terminal-firefox ~/.claude/skills/terminal-firefox
```

## Usage

Inside tmux:

```bash
/terminal-firefox open https://example.com
/terminal-firefox search for the latest Rust release notes
```

## Architecture

```
+---------------------------+---------------------------+
|                           |                           |
|    Claude Code            |    Browsh (Firefox)       |
|    conversation           |    rendering in terminal  |
|                           |                           |
|    marionette.mjs         |    Session #1: Browsh     |
|    Session #2: control    |    (WebExtension ↔ Go)    |
|         |                 |         |                 |
|         +--- Marionette port 2828 --+                 |
|                           |                           |
+---------------------------+---------------------------+
                    tmux split pane
```

## Differences from terminal-chromium

| | terminal-chromium | terminal-firefox |
|--|---|---|
| Engine | Chromium (Carbonyl) | Firefox (Browsh) |
| Protocol | CDP (native) | Marionette (patched multi-session) |
| Rendering | Unicode half-block chars | Text + ANSI colors |
| Setup | Zero-config | One-time Firefox patch |
| Performance | 60 FPS, <1s startup | ~3s startup, moderate FPS |

Both skills can run simultaneously.

## Credits

- [Browsh](https://github.com/browsh-org/browsh) by Thomas Buckley-Houston
- [terminal-chromium-skill](https://github.com/gyoz-ai/terminal-chromium-skill) -- sister skill

## License

MIT
