import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const appUrl = 'http://127.0.0.1:8082';
const debugPort = 9224;
const outDir = new URL('../screenshots/', import.meta.url);

let nextId = 1;
const pending = new Map();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

async function waitForDebugger() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      return await fetchJson(`http://127.0.0.1:${debugPort}/json/version`);
    } catch {
      await delay(250);
    }
  }
  throw new Error('Chrome DevTools no respondio a tiempo.');
}

function send(socket, method, params = {}) {
  const id = nextId;
  nextId += 1;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

async function evaluate(socket, expression) {
  const result = await send(socket, 'Runtime.evaluate', {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function screenshot(socket, name) {
  const result = await send(socket, 'Page.captureScreenshot', {
    captureBeyondViewport: false,
    format: 'png',
    fromSurface: true,
  });
  await writeFile(new URL(`${name}.png`, outDir), Buffer.from(result.data, 'base64'));
}

async function clickText(socket, text) {
  await evaluate(
    socket,
    `
    (() => {
      const targetText = ${JSON.stringify(text)};
      const nodes = [...document.querySelectorAll('[role="button"], button, a, div, span')];
      const matches = nodes
        .map((item) => ({ item, text: (item.innerText || item.textContent || '').trim() }))
        .filter(({ text }) => text.includes(targetText))
        .sort((a, b) => a.text.length - b.text.length);
      const node = matches[0]?.item?.closest('[role="button"], button, a') || matches[0]?.item;
      if (!node) throw new Error('No se encontro: ' + targetText);
      node.click();
      return true;
    })()
  `,
  );
}

async function answerTrueFalse(socket) {
  const shouldClickTrue = await evaluate(
    socket,
    `
    (() => {
      const texts = [...document.querySelectorAll('div, span')]
        .map((node) => (node.innerText || node.textContent || '').trim())
        .filter(Boolean);
      const equation = texts.find((text) => /^\\d+\\s*[+\\-x/]\\s*\\d+\\s*=\\s*\\d+$/.test(text));
      if (!equation) throw new Error('No se encontro la ecuacion');
      const [left, right] = equation.split('=').map((part) => part.trim());
      const normalized = left.replace('x', '*');
      return Function('return ' + normalized)() === Number(right);
    })()
  `,
  );
  await clickText(socket, shouldClickTrue ? 'Verdadero' : 'Falso');
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=/private/tmp/desafio-calculo-cdp',
    `--remote-debugging-port=${debugPort}`,
    'about:blank',
  ], {
    stdio: 'ignore',
  });

  try {
    await waitForDebugger();
    const target = await fetchJson(`http://127.0.0.1:${debugPort}/json/new?about:blank`, {
      method: 'PUT',
    });
    const socket = new WebSocket(target.webSocketDebuggerUrl);

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      }
    });

    await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
    await send(socket, 'Page.enable');
    await send(socket, 'Runtime.enable');
    await send(socket, 'Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 1200,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await send(socket, 'Emulation.setUserAgentOverride', {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await send(socket, 'Page.navigate', { url: appUrl });
    await delay(3500);
    await screenshot(socket, '01-inicio');

    await clickText(socket, 'Verdadero / falso');
    await delay(350);
    await clickText(socket, 'Iniciar ronda');
    await delay(900);
    await screenshot(socket, '02-juego-verdadero-falso');

    await answerTrueFalse(socket);
    await delay(180);
    await screenshot(socket, '03-feedback');
    await delay(700);

    for (let index = 1; index < 10; index += 1) {
      await answerTrueFalse(socket);
      await delay(760);
    }
    await delay(900);
    await screenshot(socket, '04-resultado');

    await clickText(socket, 'Historial');
    await delay(2500);
    await screenshot(socket, '05-historial');
    socket.close();
  } finally {
    chrome.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
