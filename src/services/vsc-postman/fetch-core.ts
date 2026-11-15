import { isTextualContentType } from '@/lib/content-type'
import { createId } from '@/lib/id'
import { translate, getCurrentLanguage } from '@/lib/i18n'
import { shouldStreamEventStream } from '@/lib/sse'
import type { HttpResult, PreparedRequest, StreamStartInfo } from '@/types/http'
import { DEFAULT_TIMEOUT_MS, IDLE_TIMEOUT_MS, MAX_RESPONSE_BYTES } from './constants'
import {
  createIdleWatchdog,
  HttpRequestError,
  streamTimeoutError,
  toHttpError,
  type IdleWatchdog,
  type SendOptions
} from './transport'

export type FetchExecutionOptions = SendOptions & {
  requestId?: string
  /** 含文件上传时不设连接总时长。 */
  upload?: boolean
}

/** 执行请求并归一化为 HttpResult；BodyInit 由调用方准备。 */
export async function executeFetch(
  request: PreparedRequest,
  body: BodyInit | undefined,
  options: FetchExecutionOptions = {}
): Promise<HttpResult> {
  const lang = getCurrentLanguage()
  const externalSignal = options.signal

  if (externalSignal?.aborted) {
    throw new HttpRequestError('aborted', translate('error.aborted', lang))
  }

  const controller = new AbortController()
  const forwardAbort = () => controller.abort()
  externalSignal?.addEventListener('abort', forwardAbort, { once: true })

  let timeoutKind: 'connect' | 'idle' | null = null
  let connectTimer: ReturnType<typeof setTimeout> | null = null
  let idle: IdleWatchdog | null = null
  let streamingResponse = false

  const clearConnectTimer = () => {
    if (!connectTimer) return
    clearTimeout(connectTimer)
    connectTimer = null
  }

  try {
    const started = Date.now()
    const connectTimeoutMs = options.upload ? 0 : DEFAULT_TIMEOUT_MS

    if (connectTimeoutMs > 0) {
      connectTimer = setTimeout(() => {
        timeoutKind = 'connect'
        controller.abort()
      }, connectTimeoutMs)
    }

    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body,
      signal: controller.signal,
      redirect: 'follow',
      // 固定 omit，不带 Cookie。
      credentials: 'omit',
      mode: 'cors'
    })

    const contentType = response.headers.get('content-type')
    const headers = headersToRecord(response.headers)

    if (shouldStreamEventStream(request.headers, contentType)) {
      // 头已到：改用空闲超时。
      streamingResponse = true
      clearConnectTimer()
      const info: StreamStartInfo = {
        status: response.status,
        statusText: response.statusText,
        headers,
        contentType,
        finalUrl: response.url
      }
      options.onStreamStart?.(info)

      idle = createIdleWatchdog(() => {
        timeoutKind = 'idle'
        controller.abort()
      }, IDLE_TIMEOUT_MS)
      const sizeBytes = await readEventStream(response, idle, options.onStreamChunk)
      idle.stop()

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers,
        // SSE 正文由上层增量展示，不塞进 bodyText。
        bodyText: null,
        bodyBase64: null,
        contentType,
        durationMs: Date.now() - started,
        sizeBytes,
        truncated: false,
        finalUrl: response.url,
        requestId: options.requestId ?? createId('res')
      }
    }

    // 非 SSE：整包读取，连接计时器继续生效。
    const { bytes, truncated } = await readBody(response, MAX_RESPONSE_BYTES)
    const { bodyText, bodyBase64 } = decodeBody(bytes, contentType)

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers,
      bodyText,
      bodyBase64,
      contentType,
      durationMs: Date.now() - started,
      sizeBytes: bytes.byteLength,
      truncated,
      finalUrl: response.url,
      requestId: options.requestId ?? createId('res')
    }
  } catch (error) {
    if (externalSignal?.aborted) {
      throw new HttpRequestError('aborted', translate('error.aborted', lang))
    }
    if (timeoutKind) {
      // 普通请求统一超时文案，事件流区分连接 / 空闲。
      if (!streamingResponse) {
        throw new HttpRequestError(
          'timeout',
          translate('error.timeout', lang, {
            seconds: Math.round(DEFAULT_TIMEOUT_MS / 1000)
          })
        )
      }
      throw streamTimeoutError(
        timeoutKind,
        timeoutKind === 'connect' ? DEFAULT_TIMEOUT_MS : IDLE_TIMEOUT_MS
      )
    }
    const httpError = toHttpError(error)
    if (httpError.code === 'network') {
      throw new HttpRequestError(
        'network',
        translate('error.fetch.transport', lang, { message: httpError.message })
      )
    }
    throw error
  } finally {
    clearConnectTimer()
    idle?.stop()
    externalSignal?.removeEventListener('abort', forwardAbort)
  }
}

/** 逐块读取 SSE 并计字节；stream 解码保证多字节字符完整。 */
async function readEventStream(
  response: Response,
  idle: IdleWatchdog,
  onChunk: SendOptions['onStreamChunk']
): Promise<number> {
  const reader = response.body?.getReader()
  if (!reader) return 0

  const decoder = new TextDecoder('utf-8')
  let size = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value || value.byteLength === 0) continue

    size += value.byteLength
    idle.touch()
    const text = decoder.decode(value, { stream: true })
    if (text) onChunk?.(text, value.byteLength)
  }

  const tail = decoder.decode()
  if (tail) onChunk?.(tail, 0)

  return size
}

async function readBody(
  response: Response,
  limit: number
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!response.body) return { bytes: new Uint8Array(), truncated: false }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let truncated = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

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

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return { bytes, truncated }
}

function decodeBody(
  bytes: Uint8Array,
  contentType: string | null
): { bodyText: string | null; bodyBase64: string | null } {
  if (bytes.byteLength === 0) return { bodyText: '', bodyBase64: null }
  if (isTextualContentType(contentType)) {
    return { bodyText: new TextDecoder('utf-8').decode(bytes), bodyBase64: null }
  }

  const detectedText = tryDecodeText(bytes)
  if (detectedText !== null) {
    return { bodyText: detectedText, bodyBase64: null }
  }

  return { bodyText: null, bodyBase64: toBase64(bytes) }
}

function tryDecodeText(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

function toBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {}
  headers.forEach((value, key) => {
    record[key] = value
  })
  return record
}
