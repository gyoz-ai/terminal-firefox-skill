# terminal-firefox (Claude Code Skill)

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill that gives Claude a full Firefox browser in your terminal. Browse, inspect, and interact with web pages using CDP (Chrome DevTools Protocol) -- all from within a Claude Code session.

Built on [Browsh](https://github.com/browsh-org/browsh), which renders Firefox as text and ANSI colors in the terminal. Works in any terminal, including tmux and over SSH.

## What it does

When you invoke `/terminal-firefox`, Claude will:

1. Launch Firefox headless with CDP enabled
2. Launch Browsh in a tmux split pane connected to Firefox for terminal rendering
3. Navigate to any URL you specify
4. Interact with pages programmatically via CDP (click, type, evaluate JS, get page content)

### CDP Commands

Once the browser is running, Claude uses these commands to control it:

| Command | Description |
|---------|-------------|
| `list` | List open tabs |
| `nav <target> <url>` | Navigate to a URL |
| `eval <target> <expr>` | Evaluate JavaScript |
| `click <target> <selector>` | Click an element by CSS selector |
| `clickxy <target> <x> <y>` | Click at coordinates |
| `type <target> <text>` | Type text |
| `html <target> [selector]` | Get page HTML |
| `shot <target> [file]` | Take a screenshot (PNG) |
| `open [url]` | Open a new tab |
| `evalraw <target> <method> [json]` | Send raw CDP command |

### Example conversation

```
You: /terminal-firefox open https://news.ycombinator.com

Claude: [launches Firefox + Browsh, lists tabs]
  A1B2C3D4  Hacker News  https://news.ycombinator.com/

You: get me the top 5 story titles

Claude: [runs eval to extract titles]
  1. Show HN: I built a thing
  2. Why Rust is taking over
  ...
```

## Requirements

- **Firefox 57+** -- installed via `brew install --cask firefox` (macOS) or your package manager (Linux)
- **tmux** -- for split pane rendering
- **Node.js 21+** -- for the CDP control script

Browsh is auto-installed on first run if missing.

## Installation

```bash
# Copy skill files
mkdir -p ~/.claude/skills/terminal-firefox
cp skills/terminal-firefox/SKILL.md ~/.claude/skills/terminal-firefox/
cp skills/terminal-firefox/cdp.mjs ~/.claude/skills/terminal-firefox/
chmod +x ~/.claude/skills/terminal-firefox/cdp.mjs
```

Or symlink to stay updated:

```bash
git clone https://github.com/gyoz-ai/terminal-firefox-skill.git ~/terminal-firefox-skill
ln -s ~/terminal-firefox-skill/skills/terminal-firefox ~/.claude/skills/terminal-firefox
```

## Usage

Start a Claude Code session inside tmux, then:

```bash
# Open a page
/terminal-firefox open https://example.com

# Or just invoke it and tell Claude what to browse
/terminal-firefox go to the Rust documentation
```

Claude handles the browser launch, CDP interaction, and pane management automatically.

## How it works

```
+---------------------------+---------------------------+
|                           |                           |
|    Claude Code            |    Browsh (Firefox)       |
|    conversation           |    rendering in terminal  |
|                           |                           |
|    Uses cdp.mjs to        |    Connects to Firefox    |
|    send CDP commands  --> |    via --firefox.use-      |
|    (port 9333+)           |    existing                |
|                           |                           |
+---------------------------+---------------------------+
                    tmux split pane

  Firefox runs headless with both:
  - --marionette (port 2828, for Browsh)
  - --remote-debugging-port (port 9333+, for CDP control)
```

## Differences from terminal-chromium

| | terminal-chromium | terminal-firefox |
|--|---|---|
| Engine | Chromium (via Carbonyl) | Firefox (via Browsh) |
| Rendering | Unicode half-block chars | Text + ANSI colors |
| CDP port range | 9222-9230 | 9333-9340 |
| Performance | 60 FPS, <1s startup | Slower startup (~5s), moderate FPS |
| CDP support | Full (native Chromium) | Partial (Firefox's CDP subset) |

Both skills can run simultaneously since they use different port ranges.

## Notes

- Firefox 57+ required for Browsh's WebExtension
- Uses CDP port range 9333-9340 (no conflicts with terminal-chromium)
- Some advanced CDP commands (accessibility tree) may not be supported by Firefox's CDP
- Works over SSH
- Heavy JS sites may be slow -- simpler pages work best

## Credits

- [Browsh](https://github.com/browsh-org/browsh) by Thomas Buckley-Houston -- terminal Firefox renderer
- [terminal-chromium-skill](https://github.com/gyoz-ai/terminal-chromium-skill) -- sister skill for Chromium

## License

MIT
