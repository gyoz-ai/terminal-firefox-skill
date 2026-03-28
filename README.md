# terminal-firefox (Claude Code Plugin)

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugin that gives Claude a full Firefox browser in your terminal. Browse, inspect, and interact with web pages using Marionette -- all from within a Claude Code session.

Built on [Browsh](https://github.com/browsh-org/browsh), which renders Firefox as text and ANSI colors in the terminal. Works in any terminal, including tmux and over SSH.

## Demo

<table>
  <tbody>
    <tr>
      <td>
        <video src="https://github.com/gyoz-ai/terminal-firefox-skill/raw/main/demo.mp4">
      </td>
    </tr>
  </tbody>
</table>

## How it works

Browsh launches headless Firefox and renders pages in the terminal via a WebExtension. This plugin adds **programmatic control** by creating a second Marionette session alongside Browsh, giving Claude full access to navigate, evaluate JS, click elements, type, extract HTML, and take screenshots.

Firefox's Marionette protocol is hardcoded to allow only 1 session. This plugin includes a **one-time patch** to Firefox's `omni.ja` (internal JS modules) that removes this limit, enabling Browsh and the control script to coexist.

### What gets patched

Three files inside Firefox's `omni.ja`:

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

### Example conversation

```
You: /terminal-firefox open https://news.ycombinator.com

Claude: [launches Browsh, patches Firefox if needed, lists page title]
  Hacker News

You: get me the top 5 story titles

Claude: [runs eval to extract titles]
  1. Show HN: I built a thing
  2. Why Rust is taking over
  ...
```

## Requirements

- **Firefox 57+** -- `brew install --cask firefox` (macOS) or package manager (Linux)
- **tmux** -- for split pane rendering
- **Node.js 21+** -- for the Marionette control script
- **python3** -- for the Firefox patch script

Browsh is auto-installed on first run if missing.

## Installation

### Option 1: Plugin Directory (recommended)

Install directly from the Claude Code plugin directory:

```
/plugins
```

Search for **terminal-firefox** and install it.

### Option 2: Install plugin from GitHub

```bash
# In any Claude Code session:
/install-plugin https://github.com/gyoz-ai/terminal-firefox-skill
```

### Option 3: Manual install

Clone and symlink the skill:

```bash
git clone https://github.com/gyoz-ai/terminal-firefox-skill.git ~/terminal-firefox-skill
ln -s ~/terminal-firefox-skill/skills/terminal-firefox ~/.claude/skills/terminal-firefox
```

Or copy directly:

```bash
mkdir -p ~/.claude/skills/terminal-firefox
curl -o ~/.claude/skills/terminal-firefox/SKILL.md \
  https://raw.githubusercontent.com/gyoz-ai/terminal-firefox-skill/main/skills/terminal-firefox/SKILL.md
curl -o ~/.claude/skills/terminal-firefox/marionette.mjs \
  https://raw.githubusercontent.com/gyoz-ai/terminal-firefox-skill/main/skills/terminal-firefox/marionette.mjs
chmod +x ~/.claude/skills/terminal-firefox/marionette.mjs
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
|    Session #2: control    |    (WebExtension + Go)    |
|         |                 |         |                 |
|         +--- Marionette port 2828 --+                 |
|                           |                           |
+---------------------------+---------------------------+
                    tmux split pane
```

## Plugin structure

```
terminal-firefox-skill/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── terminal-firefox/
│       ├── SKILL.md
│       └── marionette.mjs
├── LICENSE
└── README.md
```

## Differences from terminal-chromium

| | terminal-chromium | terminal-firefox |
|--|---|---|
| Engine | Chromium (Carbonyl) | Firefox (Browsh) |
| Protocol | CDP (native) | Marionette (patched multi-session) |
| Rendering | Unicode half-block chars | Text + ANSI colors |
| Maintenance | Carbonyl unmaintained | Browsh actively maintained |
| Setup | Zero-config | One-time Firefox patch |

Both plugins can run simultaneously.

## Credits

- [Browsh](https://github.com/browsh-org/browsh) by Thomas Buckley-Houston
- [terminal-chromium-skill](https://github.com/gyoz-ai/terminal-chromium-skill) -- sister plugin

## License

MIT
