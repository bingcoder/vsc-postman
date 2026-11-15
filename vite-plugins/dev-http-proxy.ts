import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import type { Plugin } from 'vite'
import { isTextualContentType } from '../src/lib/content-type'
import { shouldStreamEventStream } from '../src/lib/sse'
import {
  DEFAULT_TIMEOUT_MS,
  DEV_PROXY_PATH,
  IDLE_TIMEOUT_MS,
  MAX_REQUEST_BYTES,
  MAX_RESPONSE_BYTES,
  RAW_UPLOAD_SUFFIX,
  STREAM_SUFFIX
} from '../src/services/vsc-postman/constants'
import { HTTP_METHODS } from '../src/types/http'
import type {
  HttpErrorCode,
  HttpMethod,
  HttpResult,
  ProxyRequestBody,
  ProxyResponseBody,
  ProxyStreamFrame
} from '../src/types/http'

const HOP_BY_HOP_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'accept-encoding',
  'keep-alive',
  'te',
  'trailer',
  'upgrade'
])

/** raw 透传保留 content-type / content-length，其余剔除浏览器自附加的头。 */
const RAW_STRIP_HEADERS = new Set([
  'host',
  'connection',
  'transfer-encoding',
  'accept-encoding',
  'keep-alive',
  'te',
  'trailer',
  'upgrade',
  'origin',
  'referer',
  'cookie',
  'content-encoding',
  // undici 不支持 Expect，转发会直接失败。
  'expect'
])

/** 开发环境 HTTP 代理：转发任意目标以规避 CORS，仅限本地调试。 */
export function devHttpProxyPlugin(): Plugin {
  return {
    name: 'vsc-postman:dev-http-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(DEV_PROXY_PATH, (request, response) => {
        const path = (request.url ?? '/').split('?')[0]
        if (path === RAW_UPLOAD_SUFFIX) {
          void handleRawUpload(request, response)
          return
        }
        if (path === STREAM_SUFFIX) {
          void handleStreamRequest(request, response)
          return
        }
        void handleProxyRequest(request, response)
      })
    }
  }
}

async function handleProxyRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  if (request.method !== 'POST') {
    sendJson(response, 405, {
      ok: false,
      error: { code: 'proxy-error', message: '开发代理仅接受 POST 请求' }
    })
    return
  }

  let payload: ProxyRequestBody
  try {
    const rawBody = await readRequestBody(request)
    payload = validatePayload(JSON.parse(rawBody) as unknown)
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: 'proxy-error',
        message: error instanceof Error ? error.message : '代理请求参数不合法'
      }
    })
    return
  }

  const timeoutMs = payload.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const startedAt = Date.now()
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const handleClientClose = () => {
    if (!response.writableEnded) controller.abort()
  }
  response.on('close', handleClientClose)

  try {
    const upstream = await fetch(payload.url, {
      method: payload.method,
      headers: payload.headers,
      body: payload.method === 'GET' || payload.method === 'HEAD' ? undefined : payload.body,
      redirect: 'follow',
      signal: controller.signal
    })

    await sendUpstreamResult(upstream, startedAt, response)
  } catch (error) {
    if (response.writableEnded || response.destroyed) return
    const code: HttpErrorCode = timedOut
      ? 'timeout'
      : controller.signal.aborted
        ? 'aborted'
        : 'network'
    sendJson(response, 200, {
      ok: false,
      error: { code, message: describeUpstreamError(error, timeoutMs) }
    })
  } finally {
    clearTimeout(timer)
    response.removeListener('close', handleClientClose)
  }
}

/** multipart 原始字节透传：不缓冲请求体，直接流式转发。 */
async function handleRawUpload(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== 'POST') {
    sendJson(response, 405, {
      ok: false,
      error: { code: 'proxy-error', message: '开发代理仅接受 POST 请求' }
    })
    return
  }

  let target: string
  let method: HttpMethod
  try {
    const incoming = new URL(request.url ?? RAW_UPLOAD_SUFFIX, 'http://localhost')
    const rawTarget = (incoming.searchParams.get('url') ?? '').trim()
    if (!rawTarget) throw new Error('缺少目标 URL')

    const parsed = new URL(rawTarget)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('仅支持 http/https 协议')
    }
    target = parsed.toString()

    const upperMethod = (incoming.searchParams.get('method') ?? 'POST').toUpperCase()
    method = (HTTP_METHODS as readonly string[]).includes(upperMethod)
      ? (upperMethod as HttpMethod)
      : 'POST'
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: 'proxy-error',
        message: error instanceof Error ? error.message : '代理请求参数不合法'
      }
    })
    return
  }

  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(request.headers)) {
    if (typeof value !== 'string') continue
    const lowerKey = key.toLowerCase()
    if (RAW_STRIP_HEADERS.has(lowerKey) || lowerKey.startsWith('sec-')) continue
    headers[key] = value
  }

  const startedAt = Date.now()
  const controller = new AbortController()
  let clientClosed = false
  let idleTimedOut = false
  let lastActivity = Date.now()

  const touch = () => {
    lastActivity = Date.now()
  }
  const idleTimer = setInterval(() => {
    if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
      idleTimedOut = true
      controller.abort()
    }
  }, 1000)
  const handleClientClose = () => {
    if (response.writableEnded) return
    clientClosed = true
    controller.abort()
  }
  response.on('close', handleClientClose)

  try {
    const body =
      method === 'GET' || method === 'HEAD'
        ? undefined
        : (Readable.toWeb(
            Readable.from(iterateRequestBody(request, touch))
          ) as unknown as RequestInit['body'])

    const upstream = await fetch(target, {
      method,
      headers,
      body,
      redirect: 'manual',
      signal: controller.signal,
      duplex: 'half'
    })

    await sendUpstreamResult(upstream, startedAt, response, touch)
  } catch (error) {
    if (response.writableEnded || response.destroyed) return
    const code: HttpErrorCode = idleTimedOut
      ? 'timeout'
      : clientClosed || controller.signal.aborted
        ? 'aborted'
        : 'network'
    sendJson(response, 200, {
      ok: false,
      error: { code, message: describeUpstreamError(error, IDLE_TIMEOUT_MS) }
    })
  } finally {
    clearInterval(idleTimer)
    response.removeListener('close', handleClientClose)
  }
}

/** 逐块读取请求体并刷新空闲计时。 */
async function* iterateRequestBody(
  request: IncomingMessage,
  touch: () => void
): AsyncGenerator<Buffer> {
  for await (const chunk of request) {
    touch()
    yield chunk as Buffer
  }
}

/** 流式端点（NDJSON）：SSE 逐帧下发，普通响应回一帧 result。 */
async function handleStreamRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  if (request.method !== 'POST') {
    sendJson(response, 405, {
      ok: false,
      error: { code: 'proxy-error', message: '开发代理仅接受 POST 请求' }
    })
    return
  }

  let payload: ProxyRequestBody
  try {
    const rawBody = await readRequestBody(request)
    payload = validatePayload(JSON.parse(rawBody) as unknown)
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: 'proxy-error',
        message: error instanceof Error ? error.message : '代理请求参数不合法'
      }
    })
    return
  }

  const startedAt = Date.now()
  const connectTimeoutMs = payload.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  let connectTimedOut = false
  let idleTimedOut = false
  let clientClosed = false
  let streamStarted = false
  let lastActivity = Date.now()
  let idleTimer: ReturnType<typeof setInterval> | null = null

  response.statusCode = 200
  response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store, no-transform')
  // 提示 nginx 等反向代理不要缓冲。
  response.setHeader('X-Accel-Buffering', 'no')

  const connectTimer = setTimeout(() => {
    connectTimedOut = true
    controller.abort()
  }, connectTimeoutMs)

  const touch = () => {
    lastActivity = Date.now()
  }
  const armIdleTimer = () => {
    idleTimer = setInterval(() => {
      if (Date.now() - lastActivity <= IDLE_TIMEOUT_MS) return
      idleTimedOut = true
      controller.abort()
    }, 1000)
  }
  const handleClientClose = () => {
    if (response.writableEnded) return
    clientClosed = true
    controller.abort()
  }
  response.on('close', handleClientClose)

  const writeFrame = (frame: ProxyStreamFrame) => {
    if (response.writableEnded || response.destroyed) return
    response.write(`${JSON.stringify(frame)}\n`)
  }

  try {
    const upstream = await fetch(payload.url, {
      method: payload.method,
      headers: payload.headers,
      body: payload.method === 'GET' || payload.method === 'HEAD' ? undefined : payload.body,
      redirect: 'follow',
      signal: controller.signal
    })

    const contentType = upstream.headers.get('content-type')

    if (!shouldStreamEventStream(payload.headers ?? {}, contentType)) {
      // 非事件流：整包读取。
      const result = await buildUpstreamResult(upstream, startedAt)
      writeFrame({ type: 'result', response: result })
      endStream(response)
      return
    }

    clearTimeout(connectTimer)
    streamStarted = true

    writeFrame({
      type: 'start',
      status: upstream.status,
      statusText: upstream.statusText,
      headers: collectHeaders(upstream.headers),
      contentType,
      finalUrl: upstream.url
    })

    armIdleTimer()
    const sizeBytes = await pumpEventStream(upstream, touch, (text, bytes) => {
      writeFrame({ type: 'chunk', text, bytes })
    })

    writeFrame({
      type: 'end',
      durationMs: Date.now() - startedAt,
      sizeBytes,
      truncated: false
    })
    endStream(response)
  } catch (error) {
    const message = describeStreamError(error, {
      connectTimedOut,
      idleTimedOut,
      connectTimeoutMs
    })

    if (!streamStarted) {
      if (response.writableEnded || response.destroyed) return
      const code: HttpErrorCode = connectTimedOut
        ? 'timeout'
        : clientClosed || controller.signal.aborted
          ? 'aborted'
          : 'network'
      sendJson(response, 200, { ok: false, error: { code, message } })
      return
    }

    const code: HttpErrorCode = idleTimedOut || connectTimedOut ? 'timeout' : 'network'
    writeFrame({ type: 'error', error: { code, message } })
    endStream(response)
  } finally {
    clearTimeout(connectTimer)
    if (idleTimer) clearInterval(idleTimer)
    response.removeListener('close', handleClientClose)
  }
}

function describeStreamError(
  error: unknown,
  context: { connectTimedOut: boolean; idleTimedOut: boolean; connectTimeoutMs: number }
): string {
  if (context.idleTimedOut) {
    return `流式响应空闲超时（${Math.round(IDLE_TIMEOUT_MS / 1000)}s），已停止接收`
  }
  if (context.connectTimedOut) {
    return `等待响应超时（${Math.round(context.connectTimeoutMs / 1000)}s）`
  }
  return describeUpstreamError(error, context.connectTimeoutMs)
}

function endStream(response: ServerResponse): void {
  if (response.writableEnded || response.destroyed) return
  response.end()
}

/** 逐块读取上游 SSE 并计字节，同时刷新空闲计时。 */
async function pumpEventStream(
  upstream: Response,
  onActivity: () => void,
  onChunk: (text: string, bytes: number) => void
): Promise<number> {
  const reader = upstream.body?.getReader()
  if (!reader) return 0

  const decoder = new TextDecoder('utf-8')
  let size = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value || value.byteLength === 0) continue

    size += value.byteLength
    onActivity()
    const text = decoder.decode(value, { stream: true })
    if (text) onChunk(text, value.byteLength)
  }

  const tail = decoder.decode()
  if (tail) onChunk(tail, 0)

  return size
}

/** 把上游响应包成 envelope。 */
async function sendUpstreamResult(
  upstream: Response,
  startedAt: number,
  response: ServerResponse,
  onChunk?: () => void
): Promise<void> {
  const result = await buildUpstreamResult(upstream, startedAt, onChunk)
  sendJson(response, 200, { ok: true, response: result })
}

/** 读取完整正文并构造 HttpResult（requestId 由客户端补齐）。 */
async function buildUpstreamResult(
  upstream: Response,
  startedAt: number,
  onChunk?: () => void
): Promise<Omit<HttpResult, 'requestId'>> {
  const { buffer, truncated } = await readResponseBody(upstream, MAX_RESPONSE_BYTES, onChunk)
  const contentType = upstream.headers.get('content-type')
  const { bodyText, bodyBase64 } = encodeBody(buffer, contentType)

  return {
    ok: upstream.ok,
    status: upstream.status,
    statusText: upstream.statusText,
    headers: collectHeaders(upstream.headers),
    bodyText,
    bodyBase64,
    contentType,
    durationMs: Date.now() - startedAt,
    sizeBytes: buffer.byteLength,
    truncated,
    finalUrl: upstream.url
  }
}

function validatePayload(input: unknown): ProxyRequestBody {
  if (!input || typeof input !== 'object') {
    throw new Error('请求体必须是 JSON 对象')
  }

  const record = input as Record<string, unknown>
  const rawUrl = typeof record.url === 'string' ? record.url.trim() : ''
  if (!rawUrl) throw new Error('缺少目标 URL')

  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    throw new Error('目标 URL 格式不正确')
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('仅支持 http/https 协议')
  }

  const upperMethod = typeof record.method === 'string' ? record.method.toUpperCase() : 'GET'
  const method = (HTTP_METHODS as readonly string[]).includes(upperMethod)
    ? (upperMethod as HttpMethod)
    : 'GET'

  const headers: Record<string, string> = {}
  if (record.headers && typeof record.headers === 'object') {
    for (const [key, value] of Object.entries(record.headers as Record<string, unknown>)) {
      if (typeof value !== 'string') continue
      const lowerKey = key.toLowerCase()
      if (HOP_BY_HOP_HEADERS.has(lowerKey) || lowerKey.startsWith('sec-')) continue
      headers[key] = value
    }
  }

  const timeoutCandidate =
    typeof record.timeoutMs === 'number' && Number.isFinite(record.timeoutMs)
      ? record.timeoutMs
      : DEFAULT_TIMEOUT_MS

  return {
    url: parsedUrl.toString(),
    method,
    headers,
    body: typeof record.body === 'string' ? record.body : undefined,
    timeoutMs: Math.min(Math.max(timeoutCandidate, 1000), 120_000)
  }
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false

    request.on('data', (chunk: Buffer) => {
      if (settled) return
      size += chunk.length
      if (size > MAX_REQUEST_BYTES) {
        settled = true
        reject(new Error(`请求体超过 ${Math.round(MAX_REQUEST_BYTES / 1024 / 1024)}MB 限制`))
        return
      }
      chunks.push(chunk)
    })

    request.on('end', () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks).toString('utf8'))
    })

    request.on('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
  })
}

async function readResponseBody(
  upstream: Response,
  limit: number,
  onChunk?: () => void
): Promise<{ buffer: Buffer; truncated: boolean }> {
  if (!upstream.body) return { buffer: Buffer.alloc(0), truncated: false }

  const reader = upstream.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let truncated = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    onChunk?.()

    const remaining = limit - size
    if (value.byteLength > remaining) {
      if (remaining > 0) {
        chunks.push(value.subarray(0, remaining))
        size += remaining
      }
      truncated = true
      await reader.cancel().catch(() => undefined)
      break
    }

    chunks.push(value)
    size += value.byteLength
  }

  return {
    buffer: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
    truncated
  }
}

function encodeBody(
  buffer: Buffer,
  contentType: string | null
): { bodyText: string | null; bodyBase64: string | null } {
  if (buffer.byteLength === 0) return { bodyText: '', bodyBase64: null }

  if (isTextualContentType(contentType)) {
    return { bodyText: buffer.toString('utf8'), bodyBase64: null }
  }

  const decoded = tryDecodeUtf8(buffer)
  if (decoded !== null) return { bodyText: decoded, bodyBase64: null }

  return { bodyText: null, bodyBase64: buffer.toString('base64') }
}

function tryDecodeUtf8(buffer: Buffer): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return null
  }
}

function collectHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  const headerBag = headers as Headers & { getSetCookie?: () => string[] }
  const cookies = typeof headerBag.getSetCookie === 'function' ? headerBag.getSetCookie() : []

  headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'set-cookie') result[key] = value
  })
  if (cookies.length > 0) result['set-cookie'] = cookies.join('\n')

  return result
}

function describeUpstreamError(error: unknown, timeoutMs: number): string {
  const candidate = error as {
    name?: string
    message?: string
    cause?: { code?: string }
  }

  if (candidate.name === 'TimeoutError' || candidate.name === 'AbortError') {
    return `请求超时（${Math.round(timeoutMs / 1000)}s）`
  }

  const causeCode = candidate.cause?.code
  if (causeCode === 'ENOTFOUND') return '域名解析失败（ENOTFOUND）'
  if (causeCode === 'ECONNREFUSED') return '连接被拒绝（ECONNREFUSED）'
  if (causeCode === 'ECONNRESET') return '连接被重置（ECONNRESET）'
  if (causeCode === 'CERT_HAS_EXPIRED' || causeCode === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
    return `TLS 证书校验失败（${causeCode}）`
  }

  return causeCode ? `请求失败（${causeCode}）` : candidate.message || '请求失败'
}

function sendJson(response: ServerResponse, statusCode: number, body: ProxyResponseBody): void {
  if (response.writableEnded || response.destroyed) return
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}
