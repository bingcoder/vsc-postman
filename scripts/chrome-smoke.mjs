import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const browserCandidates = [
  process.env.BROWSER_PATH,
  process.env.CHROME_PATH,
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean)

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

const browserPath = await firstExisting(browserCandidates)
const extensionPath = path.resolve(process.cwd(), 'dist-chrome')
const chromeManifest = JSON.parse(
  await fs.readFile(path.join(extensionPath, 'manifest.json'), 'utf8')
)
const appPagePath = 'app.html'
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'vsc-postman-browser-'))
const port = Number(process.env.CDP_PORT || 9229)
const screenshotPath = path.join(os.tmpdir(), 'vsc-postman-app-page.png')

const browser = spawn(
  browserPath,
  [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    `--user-data-dir=${profile}`,
    `--load-extension=${extensionPath}`,
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    'about:blank'
  ],
  { stdio: 'ignore' }
)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(check, timeoutMs, label) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const result = await check().catch(() => null)
    if (result) return result
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function getJson(url, init) {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  return response.json()
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
    if (message.method === 'Runtime.exceptionThrown' || message.method === 'Log.entryAdded') {
      events.push(message)
    }
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

async function evalJson(send, expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed')
  }
  return result.result?.value
}

let ws
try {
  await waitFor(
    async () => (await fetch(`http://127.0.0.1:${port}/json/version`)).ok,
    15_000,
    'DevTools endpoint'
  )

  const extension = await waitFor(
    async () => {
      const targets = await getJson(`http://127.0.0.1:${port}/json/list`)
      const workers = targets.filter(
        (target) =>
          target.type === 'service_worker' &&
          target.url.startsWith('chrome-extension://') &&
          target.url.endsWith('/background.js')
      )

      for (const worker of workers) {
        const connection = await connect(worker.webSocketDebuggerUrl)
        try {
          const manifest = JSON.parse(
            await evalJson(
              connection.send,
              `JSON.stringify({ id: chrome.runtime.id, name: chrome.runtime.getManifest().name, version: chrome.runtime.getManifest().version })`
            )
          )
          if (manifest.name === 'vsc-postman') {
            return { ...manifest, workerUrl: worker.url }
          }
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
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(`chrome-extension://${extension.id}/${appPagePath}`)}`,
    { method: 'PUT' }
  )

  const connection = await connect(page.webSocketDebuggerUrl)
  ws = connection.ws
  await connection.send('Log.enable').catch(() => undefined)
  await connection.send('Page.enable').catch(() => undefined)
  await connection.send('Page.navigate', {
    url: `chrome-extension://${extension.id}/${appPagePath}`
  })
  await sleep(4000)

  const simple = await evalJson(
    connection.send,
    `JSON.stringify({
      title: document.title,
      href: location.href,
      rootChildren: document.querySelector('#root')?.children.length ?? 0,
      bodyText: document.body.innerText.slice(0, 500)
    })`
  )

  const details = await evalJson(
    connection.send,
    `(async () => JSON.stringify({
      chromeId: chrome.runtime?.id,
      manifestName: chrome.runtime?.getManifest?.().name,
      hasAction: Boolean(chrome.action),
      permissions: await chrome.permissions.getAll(),
      inputs: document.querySelectorAll('input').length,
      buttons: [...document.querySelectorAll('button')].slice(0, 8).map((button) => button.innerText.trim()).filter(Boolean)
    }))()`
  )

  const screenshot = await connection.send('Page.captureScreenshot', { format: 'png' })
  await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'))

  console.log(
    JSON.stringify(
      {
        browser: browserPath,
        extension,
        simple: JSON.parse(simple),
        details: JSON.parse(details),
        errors: connection.events.map((event) => ({
          method: event.method,
          text:
            event.params?.exceptionDetails?.text ??
            event.params?.entry?.text ??
            event.params?.entry?.source
        })),
        screenshotPath
      },
      null,
      2
    )
  )
} finally {
  ws?.close()
  browser.kill('SIGKILL')
  await sleep(1000)
  await fs.rm(profile, { recursive: true, force: true })
}
