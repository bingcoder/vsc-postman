import { randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import * as vscode from 'vscode'
import { createMultipartStream, type MultipartPart } from './multipart'

/** 与 src/services/bridge/protocol.ts 对应的 RPC 消息 */
export type BridgeRequestMessage = {
  type: 'vsc-postman/request'
  id: string
  method:
    | 'http.request'
    | 'http.abort'
    | 'file.pick'
    | 'storage.get'
    | 'storage.set'
    | 'storage.remove'
    | 'storage.open'
    | 'response.open'
    | 'workspace.ready'
    | 'workspace.update'
    | 'workspace.activeRequest'
    | 'panel.openRequest'
    | 'panel.openHistory'
    | 'panel.newRequest'
    | 'panel.openSettings'
    | 'panel.focus'
    | 'panel.duplicateRequest'
  payload: unknown
}

export type AbortPayload = { id: string }

export type HttpPayload = {
  url: string
  method: string
  headers?: Record<string, string>
  /** 文本请求体 */
  body?: string
  /** multipart 字段；存在时走流式上传，忽略 body */
  formData?: { parts: MultipartPart[] }
  requestId?: string
  timeoutMs?: number
}

/** 推送给 webview 的 SSE 帧；最终结果仍走 response。 */
export type BridgeStreamFrame =
  | {
      type: 'start'
      info: {
        status: number
        statusText: string
        headers: Record<string, string>
        contentType: string | null
        finalUrl?: string
      }
    }
  | { type: 'chunk'; text: string; bytes: number }

/** 响应体 / 请求体上限，与开发代理一致 */
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024
const MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024
/** 无数据流动时的中断阈值 */
const IDLE_TIMEOUT_MS = 120_000
/** 分片合并后再 postMessage，减少消息数 */
const STREAM_FLUSH_INTERVAL_MS = 50
const STREAM_FLUSH_THRESHOLD = 64 * 1024

/** 进行中的请求，按 requestId 中断 */
const activeRequests = new Map<string, AbortController>()

export function abortRequest(id: string): void {
  activeRequests.get(id)?.abort()
  activeRequests.delete(id)
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string' && code) return code
  }
  return 'network'
}

export { errorCode }

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code })
}

/** 用 Node fetch 转发请求（结构见 docs/architecture.md） */
export async function forwardRequest(
  payload: HttpPayload,
  postFrame: (frame: BridgeStreamFrame) => void
) {
  if (payload.formData) return forwardFormData(payload)
  return forwardHttp(payload, postFrame)
}

/** 文本请求体整包传入；SSE 边读边推帧，否则一次性读取并回复。 */
async function forwardHttp(payload: HttpPayload, postFrame: (frame: BridgeStreamFrame) => void) {
  const started = Date.now()
  const { url, method, headers = {}, body, timeoutMs = 30_000, requestId } = payload

  if (body && Buffer.byteLength(body, 'utf8') > MAX_REQUEST_BODY_BYTES) {
    throw new Error(vscode.l10n.t('Request body exceeds the 10 MB limit'))
  }

  const controller = new AbortController()
  const connectTimeoutMs = Math.min(Math.max(timeoutMs, 1000), 120_000)
  let timedOut = false
  let idleTimedOut = false
  let idleTimer: ReturnType<typeof setTimeout> | null = null

  if (requestId) activeRequests.set(requestId, controller)

  const connectTimer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, connectTimeoutMs)

  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      idleTimedOut = true
      controller.abort()
    }, IDLE_TIMEOUT_MS)
  }
  const clearIdle = () => {
    if (!idleTimer) return
    clearTimeout(idleTimer)
    idleTimer = null
  }

  let flush: (() => void) | null = null

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
      redirect: 'follow',
      signal: controller.signal
    })

    const contentType = response.headers.get('content-type')

    if (!shouldStreamEventStream(headers, contentType)) {
      // 非事件流：整包读取。
      return await readResponseResult(response, started)
    }

    // 事件流：改用空闲超时。
    clearTimeout(connectTimer)
    postFrame({
      type: 'start',
      info: {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers),
        contentType,
        finalUrl: response.url
      }
    })

    let pendingText = ''
    let pendingBytes = 0
    let flushTimer: ReturnType<typeof setTimeout> | null = null

    const flushNow = () => {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      if (!pendingText) return
      postFrame({ type: 'chunk', text: pendingText, bytes: pendingBytes })
      pendingText = ''
      pendingBytes = 0
    }
    flush = flushNow

    const scheduleFlush = () => {
      if (flushTimer) return
      flushTimer = setTimeout(() => {
        flushTimer = null
        flushNow()
      }, STREAM_FLUSH_INTERVAL_MS)
    }

    const reader = response.body?.getReader()
    let sizeBytes = 0

    if (reader) {
      const decoder = new TextDecoder('utf-8')
      armIdle()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value || value.byteLength === 0) continue

        sizeBytes += value.byteLength
        armIdle()
        pendingText += decoder.decode(value, { stream: true })
        pendingBytes += value.byteLength

        // 小块合并后统一发送。
        if (pendingText.length >= STREAM_FLUSH_THRESHOLD) flushNow()
        else scheduleFlush()
      }

      pendingText += decoder.decode()
      flushNow()
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers),
      contentType,
      bodyText: null,
      bodyBase64: null,
      durationMs: Date.now() - started,
      sizeBytes,
      truncated: false,
      finalUrl: response.url
    }
  } catch (error) {
    // 尽量送达已收到的分片
    flush?.()

    if (controller.signal.aborted) {
      if (idleTimedOut) {
        throw codedError(
          'timeout',
          vscode.l10n.t(
            'Stream idle for {0}s; stopped receiving',
            Math.round(IDLE_TIMEOUT_MS / 1000)
          )
        )
      }
      if (timedOut) {
        throw codedError(
          'timeout',
          vscode.l10n.t('Request timed out ({0}s)', Math.round(connectTimeoutMs / 1000))
        )
      }
      throw codedError('aborted', vscode.l10n.t('Request cancelled'))
    }

    throw error
  } finally {
    clearTimeout(connectTimer)
    clearIdle()
    if (requestId) activeRequests.delete(requestId)
  }
}

/** 上游是否声明 text/event-stream。 */
function isEventStreamContentType(contentType: string | null): boolean {
  if (!contentType) return false
  return /^\s*text\/event-stream\s*(?:;|$)/i.test(contentType)
}

/** 客户端是否要求 SSE。 */
function acceptsEventStream(headers: Record<string, string>): boolean {
  return Object.entries(headers).some(
    ([key, value]) => key.toLowerCase() === 'accept' && /text\/event-stream/i.test(value ?? '')
  )
}

/** 与 src/lib/sse.ts 判定保持一致（服务端可能把事件流错标为 text/plain）。 */
function shouldStreamEventStream(
  headers: Record<string, string>,
  contentType: string | null
): boolean {
  if (isEventStreamContentType(contentType)) return true
  const textual = !contentType || /text\/|json|xml|javascript|urlencoded/i.test(contentType)
  return textual && acceptsEventStream(headers)
}

/** multipart 流式上传：宿主读盘边转发，仅以空闲超时中断。 */
async function forwardFormData(payload: HttpPayload) {
  const started = Date.now()
  const { url, method, headers = {}, formData, requestId } = payload
  const parts = formData?.parts ?? []
  if (!url) throw new Error(vscode.l10n.t('Missing target URL'))

  const boundary = `----vscPostmanBoundary${randomBytes(12).toString('hex')}`
  const controller = new AbortController()
  let lastActivity = Date.now()
  const idleTimer = setInterval(() => {
    if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) controller.abort()
  }, 1000)
  if (requestId) activeRequests.set(requestId, controller)

  try {
    const { stream, contentLength } = await createMultipartStream(parts, boundary, () => {
      lastActivity = Date.now()
    })

    // Content-Type / Content-Length 在此生成，丢弃用户手写的同名头。
    const requestHeaders: Record<string, string> = {}
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase()
      if (
        lowerKey === 'content-type' ||
        lowerKey === 'content-length' ||
        lowerKey === 'host' ||
        lowerKey === 'connection' ||
        lowerKey === 'transfer-encoding'
      ) {
        continue
      }
      requestHeaders[key] = value
    }
    requestHeaders['content-type'] = `multipart/form-data; boundary=${boundary}`
    requestHeaders['content-length'] = String(contentLength)

    lastActivity = Date.now()
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: Readable.toWeb(stream) as unknown as RequestInit['body'],
      duplex: 'half',
      // 流式 body 无法在 307/308 后重放，直接交还重定向响应。
      redirect: 'manual',
      signal: controller.signal
    })

    // 请求体已发完，不再按空闲计时。
    clearInterval(idleTimer)

    return await readResponseResult(response, started)
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') {
      throw new Error(vscode.l10n.t('Uploaded file not found; please pick it again'))
    }
    throw error
  } finally {
    clearInterval(idleTimer)
    if (requestId) activeRequests.delete(requestId)
  }
}

function readResponseResult(response: Response, started: number) {
  return response.arrayBuffer().then((arrayBuffer) => {
    const buffer = Buffer.from(arrayBuffer)
    const contentType = response.headers.get('content-type')
    const textual = !contentType || /text\/|json|xml|javascript|urlencoded/i.test(contentType)
    const truncated = buffer.byteLength > MAX_RESPONSE_BYTES
    const sliced = truncated ? buffer.subarray(0, MAX_RESPONSE_BYTES) : buffer

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers),
      contentType,
      bodyText: textual ? sliced.toString('utf8') : null,
      bodyBase64: textual ? null : sliced.toString('base64'),
      durationMs: Date.now() - started,
      sizeBytes: buffer.byteLength,
      truncated,
      finalUrl: response.url
    }
  })
}
