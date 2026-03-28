#!/usr/bin/env node
// Marionette client for terminal-firefox
// Creates a secondary Marionette session alongside Browsh and switches
// to Browsh's browsing context for full programmatic control.
// Requires patched Firefox (multi-session support via omni.ja patch).
// Usage: marionette.mjs <command> [args...]

import net from 'net';

const PORT = parseInt(process.env.MARIONETTE_PORT || '2828');
const [,, cmd, ...args] = process.argv;

function connect() {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ port: PORT, host: '127.0.0.1' });
    let buf = '';
    let msgId = 1;
    let handshakeDone = false;
    const pending = new Map();

    function parseMessages(data) {
      buf += data;
      const messages = [];
      while (buf.length > 0) {
        const colonIdx = buf.indexOf(':');
        if (colonIdx === -1) break;
        const len = parseInt(buf.slice(0, colonIdx));
        if (isNaN(len)) { buf = ''; break; }
        const start = colonIdx + 1;
        if (buf.length < start + len) break;
        const jsonStr = buf.slice(start, start + len);
        buf = buf.slice(start + len);
        try { messages.push(JSON.parse(jsonStr)); } catch {}
      }
      return messages;
    }

    sock.on('data', (data) => {
      for (const msg of parseMessages(data.toString())) {
        if (!handshakeDone) {
          handshakeDone = true;
          continue;
        }
        if (Array.isArray(msg) && msg[0] === 1) {
          const [, id, error, result] = msg;
          if (pending.has(id)) {
            const { res, rej } = pending.get(id);
            pending.delete(id);
            error ? rej(error) : res(result);
          }
        }
      }
    });

    sock.on('error', reject);

    setTimeout(() => {
      const client = {
        send(method, params = {}) {
          return new Promise((res, rej) => {
            const id = msgId++;
            pending.set(id, { res, rej });
            const msg = JSON.stringify([0, id, method, params]);
            sock.write(`${msg.length}:${msg}`);
          });
        },
        close() { sock.destroy(); }
      };
      resolve(client);
    }, 500);
  });
}

async function initSession(client) {
  // Create session #2 (Browsh holds session #1)
  await client.send('WebDriver:NewSession', {
    capabilities: { alwaysMatch: { acceptInsecureCerts: true } }
  });

  // Get all window handles and find Browsh's window
  // Our new session starts with its own blank window — we need to switch
  // to the window Browsh is using (the one with actual content)
  const handles = await client.send('WebDriver:GetWindowHandles', {});

  if (handles.length > 1) {
    // Try each handle to find one with real content (not about:blank/about:home)
    const ownHandle = await client.send('WebDriver:GetWindowHandle', {});

    for (const h of handles) {
      if (h === ownHandle) continue;
      await client.send('WebDriver:SwitchToWindow', { handle: h });
      const urlResult = await client.send('WebDriver:GetCurrentURL', {});
      const url = urlResult.value || '';
      if (url && !url.startsWith('about:')) {
        // Found Browsh's active window
        return;
      }
    }
    // If no non-about: window found, switch to first non-own handle
    for (const h of handles) {
      if (h !== ownHandle) {
        await client.send('WebDriver:SwitchToWindow', { handle: h });
        return;
      }
    }
  }
}

async function run() {
  if (!cmd || cmd === 'help') {
    console.log(`Marionette client for terminal-firefox (controls Browsh's browser)

Commands:
  nav   <url>              — navigate to URL
  eval  <expr>             — evaluate JavaScript
  click <selector>         — click element by CSS selector
  type  <selector> <text>  — type text into element
  html  [selector]         — get page HTML
  shot  [file]             — screenshot (saves PNG)
  title                    — get page title
  url                      — get current URL
  back                     — go back
  forward                  — go forward
  refresh                  — refresh page
  windows                  — list all window handles with URLs`);
    return;
  }

  const client = await connect();

  try {
    await initSession(client);

    switch (cmd) {
      case 'nav': {
        const url = args[0];
        if (!url) { console.error('Missing URL'); process.exit(1); }
        await client.send('WebDriver:Navigate', { url });
        console.log(`Navigated to: ${url}`);
        break;
      }
      case 'eval': {
        const expr = args.join(' ');
        const result = await client.send('WebDriver:ExecuteScript', {
          script: `return (function() { ${expr.startsWith('return') ? expr : `return ${expr}`} })()`,
          args: []
        });
        const val = result.value;
        console.log(typeof val === 'object' ? JSON.stringify(val, null, 2) : val);
        break;
      }
      case 'click': {
        const sel = args[0];
        if (!sel) { console.error('Missing selector'); process.exit(1); }
        const el = await client.send('WebDriver:FindElement', {
          using: 'css selector', value: sel
        });
        const elId = el.value || el[Object.keys(el)[0]];
        await client.send('WebDriver:ElementClick', { id: elId });
        console.log(`Clicked: ${sel}`);
        break;
      }
      case 'type': {
        const sel = args[0];
        const text = args.slice(1).join(' ');
        if (!sel || !text) { console.error('Usage: type <selector> <text>'); process.exit(1); }
        const el = await client.send('WebDriver:FindElement', {
          using: 'css selector', value: sel
        });
        const elId = el.value || el[Object.keys(el)[0]];
        await client.send('WebDriver:ElementClear', { id: elId });
        await client.send('WebDriver:ElementSendKeys', { id: elId, text });
        console.log(`Typed "${text}" into ${sel}`);
        break;
      }
      case 'html': {
        const sel = args[0];
        const script = sel
          ? `return document.querySelector('${sel}')?.outerHTML || 'Element not found'`
          : 'return document.documentElement.outerHTML';
        const result = await client.send('WebDriver:ExecuteScript', { script, args: [] });
        console.log(result.value);
        break;
      }
      case 'shot': {
        const file = args[0] || `/tmp/screenshot-${Date.now()}.png`;
        const result = await client.send('WebDriver:TakeScreenshot', { full: false });
        const fs = await import('fs');
        fs.writeFileSync(file, Buffer.from(result.value, 'base64'));
        console.log(`Screenshot saved: ${file}`);
        break;
      }
      case 'title': {
        const result = await client.send('WebDriver:GetTitle', {});
        console.log(result.value);
        break;
      }
      case 'url': {
        const result = await client.send('WebDriver:GetCurrentURL', {});
        console.log(result.value);
        break;
      }
      case 'back': {
        await client.send('WebDriver:Back', {});
        console.log('Navigated back');
        break;
      }
      case 'forward': {
        await client.send('WebDriver:Forward', {});
        console.log('Navigated forward');
        break;
      }
      case 'refresh': {
        await client.send('WebDriver:Refresh', {});
        console.log('Page refreshed');
        break;
      }
      case 'windows': {
        const handles = await client.send('WebDriver:GetWindowHandles', {});
        for (const h of handles) {
          await client.send('WebDriver:SwitchToWindow', { handle: h });
          const t = await client.send('WebDriver:GetTitle', {});
          const u = await client.send('WebDriver:GetCurrentURL', {});
          console.log(`${h.slice(0, 8)}  ${(u.value || '').padEnd(50)}  ${t.value || ''}`);
        }
        break;
      }
      default:
        console.error(`Unknown command: ${cmd}. Run with "help" for usage.`);
        process.exit(1);
    }
  } finally {
    client.close();
  }
}

run().catch(e => { console.error(e.message || e); process.exit(1); });
