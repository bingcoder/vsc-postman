import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const repoRoot = process.cwd()
const extensionPath = path.join(repoRoot, 'dist-extension')
const browserCandidates = [
  process.env.BROWSER_PATH,
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function firstExisting(paths) {
  for (const candidate of paths) {
    if (
      await fs
        .stat(candidate)
        .then(() => true)
        .catch(() => false)
    )
      return candidate
  }
  throw new Error('No Chromium browser found')
}

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const chunks = []

    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      if (url.pathname === '/echo') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            method: req.method,
            url: req.url,
            headers: req.headers,
            body
          })
        )
        return
      }

      if (url.pathname === '/sse') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache'
        })
        res.write('data: one\n\n')
        setTimeout(() => res.write('data: two\n\n'), 80)
        setTimeout(() => {
          res.write('data: three\n\n')
          res.end()
        }, 160)
        return
      }

      if (url.pathname === '/slow') {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'text/plain' })
          res.end('slow response')
        }, 5000)
        return
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('not found')
    })
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

async function getJson(url, init) {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  return response.json()
}

async function waitFor(check, timeoutMs, label) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const result = await check().catch(() => null)
    if (result) return result
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function connect(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  let messageId = 0
  const pending = new Map()
  const events = []

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const handler = pending.get(message.id)
      if (handler) {
        pending.delete(message.id)
        handler(message)
      }
      return
    }
    events.push(message)
  })

  const send = (method, params = {}) => {
    const id = ++messageId
    ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => {
      pending.set(id, (message) => {
        if (message.error) reject(new Error(JSON.stringify(message.error)))
        else resolve(message.result)
      })
    })
  }

  await send('Runtime.enable')
  return { ws, send, events }
}

async function evaluateJson(send, expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  }
  return JSON.parse(result.result?.value)
}

const server = await startServer()
const serverPort = server.address().port
const testExtension = await fs.mkdtemp(path.join(os.tmpdir(), 'vsc-postman-test-ext-'))
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'vsc-postman-test-profile-'))
let browser
let pageWs
let workerWs

try {
  await fs.cp(extensionPath, testExtension, { recursive: true })
  const manifestPath = path.join(testExtension, 'manifest.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  // 测试期收窄 host_permissions。
  manifest.host_permissions = ['http://127.0.0.1/*']
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  const appPagePath = 'app.html'

  const browserPath = await firstExisting(browserCandidates)
  const cdpPort = 9240
  browser = spawn(
    browserPath,
    [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--remote-allow-origins=*',
      `--user-data-dir=${profile}`,
      `--load-extension=${testExtension}`,
      `--remote-debugging-port=${cdpPort}`,
      'about:blank'
    ],
    { stdio: 'ignore' }
  )

  await waitFor(
    async () => (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).ok,
    15_000,
    'DevTools endpoint'
  )

  const extension = await waitFor(
    async () => {
      const targets = await getJson(`http://127.0.0.1:${cdpPort}/json/list`)
      const workers = targets.filter(
        (target) =>
          target.type === 'service_worker' &&
          target.url.startsWith('chrome-extension://') &&
          target.url.endsWith('/background.js')
      )

      for (const worker of workers) {
        const connection = await connect(worker.webSocketDebuggerUrl)
        try {
          const info = await evaluateJson(
            connection.send,
            `JSON.stringify({ id: chrome.runtime.id, name: chrome.runtime.getManifest().name })`
          )
          if (info.name === 'vsc-postman') return { ...info, workerUrl: worker.webSocketDebuggerUrl }
        } finally {
          connection.ws.close()
        }
      }
      return null
    },
    20_000,
    'vsc-postman extension worker'
  )

  const page = await getJson(
    `http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(`chrome-extension://${extension.id}/${appPagePath}`)}`,
    { method: 'PUT' }
  )
  const pageConnection = await connect(page.webSocketDebuggerUrl)
  pageWs = pageConnection.ws
  const workerConnection = await connect(extension.workerUrl)
  workerWs = workerConnection.ws

  const expression = `(async () => {
    const SERVER = 'http://127.0.0.1:${serverPort}';
    function run(request, abortAfterMs) {
      return new Promise((resolve, reject) => {
        const requestId = 'smoke-' + Math.random().toString(36).slice(2);
        const port = chrome.runtime.connect({ name: 'vsc-postman:http' });
        let start = null;
        const chunks = [];
        const timer = setTimeout(() => {
          port.disconnect();
          reject(new Error('request timeout: ' + request.url));
        }, 10000);

        port.onMessage.addListener((message) => {
          if (message.requestId && message.requestId !== requestId) return;
          if (message.type === 'start') start = message.info;
          else if (message.type === 'chunk') chunks.push(message.text);
          else if (message.type === 'result') {
            clearTimeout(timer);
            port.disconnect();
            resolve({ result: message.result, start, chunks: chunks.join('') });
          } else if (message.type === 'error') {
            clearTimeout(timer);
            port.disconnect();
            resolve({ error: message.error, start, chunks: chunks.join('') });
          }
        });

        port.postMessage({ type: 'request', requestId, request });
        if (abortAfterMs) {
          setTimeout(() => port.postMessage({ type: 'abort', requestId }), abortAfterMs);
        }
      });
    }

    const get = await run({ method: 'GET', url: SERVER + '/echo', headers: {} });
    const post = await run({
      method: 'POST',
      url: SERVER + '/echo',
      headers: { 'Content-Type': 'application/json' },
      body: { kind: 'text', text: '{"hello":"world"}' }
    });
    const form = await run({
      method: 'POST',
      url: SERVER + '/echo',
      headers: {},
      body: {
        kind: 'form-data',
        parts: [
          { kind: 'text', name: 'name', value: 'Ada' },
          { kind: 'text', name: 'role', value: 'engineer' }
        ]
      }
    });
    const sse = await run({
      method: 'GET',
      url: SERVER + '/sse',
      headers: { Accept: 'text/event-stream' }
    });
    const abort = await run({ method: 'GET', url: SERVER + '/slow', headers: {} }, 250);

    return JSON.stringify({
      permissions: await chrome.permissions.getAll(),
      get,
      post,
      form,
      sse,
      abort
    });
  })()`

  const results = await evaluateJson(pageConnection.send, expression)
  const getBody = JSON.parse(results.get.result.bodyText)
  const postBody = JSON.parse(results.post.result.bodyText)
  const formBody = JSON.parse(results.form.result.bodyText)

  await sleep(2000)
  const ui = await evaluateJson(
    pageConnection.send,
    `(async () => {
      const input = document.querySelector('input[aria-label="请求 URL"]');
      if (!input) return JSON.stringify({ ok: false, reason: 'url input missing' });
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'http://127.0.0.1:${serverPort}/echo');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));

      const button = document.querySelector('button[aria-label="发送请求"]');
      if (!button) return JSON.stringify({ ok: false, reason: 'send button missing' });
      button.click();

      for (let index = 0; index < 60; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const text = document.body.innerText;
        if (text.includes('"method"')) return JSON.stringify({ ok: true, text: text.slice(-500) });
      }
      return JSON.stringify({ ok: false, reason: 'response not rendered', text: document.body.innerText.slice(-500) });
    })()`
  )

  // 页面不再在发送前申请权限；站点访问被收回后由 Service Worker 的 contains() 拒绝。
  // 因此把 SW 里的 contains 改成恒 false，模拟用户在扩展详情页把站点访问改成了“点击时”。
  const permissionUi = await (async () => {
    const patched = await evaluateJson(
      workerConnection.send,
      `(() => {
        const original = chrome.permissions.contains;
        try {
          chrome.permissions.contains = async () => false;
        } catch (error) {
          return JSON.stringify({ patched: false, skipped: true, error: String(error) });
        }
        if (chrome.permissions.contains === original) {
          return JSON.stringify({ patched: false, skipped: true });
        }
        globalThis.__originalPermissionsContains = original;
        return JSON.stringify({ patched: true });
      })()`
    )

    if (!patched.patched) return patched

    try {
      return await evaluateJson(
        pageConnection.send,
        `(async () => {
          const input = document.querySelector('input[aria-label="请求 URL"]');
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, 'http://127.0.0.1:${serverPort}/echo');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 200));

          const button = document.querySelector('button[aria-label="发送请求"]');
          if (!button) return JSON.stringify({ patched: true, ok: false, reason: 'send button missing' });
          button.click();

          for (let index = 0; index < 40; index += 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            const text = document.body.innerText;
            if (text.includes('重新发送')) {
              return JSON.stringify({ patched: true, ok: true, text: text.slice(-300) });
            }
          }
          return JSON.stringify({ patched: true, ok: false, text: document.body.innerText.slice(-300) });
        })()`
      )
    } finally {
      await evaluateJson(
        workerConnection.send,
        `(() => {
          if (globalThis.__originalPermissionsContains) {
            chrome.permissions.contains = globalThis.__originalPermissionsContains;
            delete globalThis.__originalPermissionsContains;
          }
          return JSON.stringify({ restored: true });
        })()`
      ).catch(() => undefined)
    }
  })()

  const checks = {
    uiFetch: ui.ok,
    permissionUi: permissionUi.patched ? permissionUi.ok : true,
    noCookieHeader: !('cookie' in getBody.headers),
    getStatus: results.get.result.status === 200 && getBody.method === 'GET',
    postBody: postBody.body === '{"hello":"world"}',
    formData:
      formBody.headers['content-type']?.startsWith('multipart/form-data;') &&
      formBody.body.includes('name="name"') &&
      formBody.body.includes('Ada') &&
      formBody.body.includes('role'),
    sse:
      results.sse.start?.contentType?.includes('text/event-stream') &&
      results.sse.chunks.includes('data: one') &&
      results.sse.chunks.includes('data: three'),
    abort: results.abort.error?.code === 'aborted',
    noCorsHeaders: !('access-control-allow-origin' in getBody.headers)
  }

  console.log(JSON.stringify({ checks, ui, permissionUi, results }, null, 2))
  if (Object.values(checks).some((value) => !value)) process.exitCode = 1
} finally {
  workerWs?.close()
  pageWs?.close()
  browser?.kill('SIGKILL')
  server.close()
  await sleep(1000)
  await fs.rm(testExtension, { recursive: true, force: true })
  await fs.rm(profile, { recursive: true, force: true })
}
