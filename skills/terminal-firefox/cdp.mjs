#!/usr/bin/env node
// CDP (Chrome DevTools Protocol) client for terminal-firefox
// Firefox supports CDP via --remote-debugging-port
// Usage: CDP_PORT=9333 cdp.mjs <command> [target] [args...]

import http from 'http';

const PORT = process.env.CDP_PORT || '9333';
const BASE = `http://127.0.0.1:${PORT}`;

const [,, cmd, ...args] = process.argv;

function fetch_(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function getTargets() {
  return fetch_(`${BASE}/json`);
}

async function findTarget(prefix) {
  const targets = await getTargets();
  const t = targets.find(t => t.id.startsWith(prefix) || t.title.toLowerCase().includes(prefix.toLowerCase()));
  if (!t) { console.error(`Target not found: ${prefix}`); process.exit(1); }
  return t;
}

function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 1;
    let closing = false;
    const pending = new Map();

    ws.onopen = () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const msgId = id++;
          pending.set(msgId, { res, rej });
          ws.send(JSON.stringify({ id: msgId, method, params }));
        });
      },
      close() { closing = true; ws.close(); }
    });
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(msg.error) : res(msg.result);
      }
    };
    ws.onerror = (e) => { if (!closing) { console.error('WebSocket error:', e.message || 'connection failed'); process.exit(1); } };
  });
}

async function run() {
  if (!cmd || cmd === 'help') {
    console.log(`Commands:
  list                         — list open pages
  nav   <target> <url>         — navigate to URL
  click <target> <selector>    — click element
  clickxy <target> <x> <y>     — click at coordinates
  type  <target> <text>        — type text (focuses active element)
  eval  <target> <expr>        — evaluate JavaScript
  html  <target> [selector]    — get page HTML
  shot  <target> [file]        — screenshot (saves PNG)
  open  [url]                  — open new tab
  evalraw <target> <method> [json] — raw CDP command`);
    return;
  }

  if (cmd === 'list') {
    const targets = await getTargets();
    for (const t of targets.filter(t => t.type === 'page')) {
      console.log(`${t.id.slice(0, 8)}  ${t.title.padEnd(50)}  ${t.url}`);
    }
    return;
  }

  if (cmd === 'open') {
    const url = args[0] || 'about:blank';
    await fetch_(`${BASE}/json/new?${url}`);
    console.log(`Opened: ${url}`);
    return;
  }

  const targetPrefix = args[0];
  if (!targetPrefix) { console.error('Missing target ID (use "list" to find targets)'); process.exit(1); }
  const target = await findTarget(targetPrefix);
  const client = await cdp(target.webSocketDebuggerUrl);

  try {
    switch (cmd) {
      case 'nav': {
        const url = args[1];
        if (!url) { console.error('Missing URL'); process.exit(1); }
        await client.send('Page.navigate', { url });
        console.log(`Navigated to: ${url}`);
        break;
      }
      case 'click': {
        const sel = args[1];
        if (!sel) { console.error('Missing selector'); process.exit(1); }
        const doc = await client.send('DOM.getDocument');
        const node = await client.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: sel });
        if (!node.nodeId) { console.error(`Element not found: ${sel}`); process.exit(1); }
        const box = await client.send('DOM.getBoxModel', { nodeId: node.nodeId });
        const [x1, y1, x2, y2, x3, y3, x4, y4] = box.model.content;
        const x = (x1 + x3) / 2, y = (y1 + y3) / 2;
        await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        console.log(`Clicked: ${sel} at (${x}, ${y})`);
        break;
      }
      case 'clickxy': {
        const x = parseFloat(args[1]), y = parseFloat(args[2]);
        await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        console.log(`Clicked at (${x}, ${y})`);
        break;
      }
      case 'type': {
        const text = args.slice(1).join(' ');
        for (const char of text) {
          await client.send('Input.dispatchKeyEvent', { type: 'keyDown', text: char });
          await client.send('Input.dispatchKeyEvent', { type: 'keyUp' });
        }
        console.log(`Typed: ${text}`);
        break;
      }
      case 'eval': {
        const expr = args.slice(1).join(' ');
        const result = await client.send('Runtime.evaluate', { expression: expr, returnByValue: true });
        if (result.exceptionDetails) {
          console.error(result.exceptionDetails.text || result.exceptionDetails.exception?.description);
          process.exit(1);
        }
        const val = result.result.value;
        console.log(typeof val === 'object' ? JSON.stringify(val, null, 2) : val);
        break;
      }
      case 'html': {
        const sel = args[1];
        let expr = 'document.documentElement.outerHTML';
        if (sel) expr = `document.querySelector('${sel}')?.outerHTML || 'Element not found'`;
        const result = await client.send('Runtime.evaluate', { expression: expr, returnByValue: true });
        console.log(result.result.value);
        break;
      }
      case 'shot': {
        const file = args[1] || `/tmp/screenshot-${Date.now()}.png`;
        const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
        const fs = await import('fs');
        fs.writeFileSync(file, Buffer.from(data, 'base64'));
        console.log(`Screenshot saved: ${file}`);
        break;
      }
      case 'evalraw': {
        const method = args[1];
        const params = args[2] ? JSON.parse(args[2]) : {};
        const result = await client.send(method, params);
        console.log(JSON.stringify(result, null, 2));
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
