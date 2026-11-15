import { createId } from '@/lib/id'
import { translate, getCurrentLanguage } from '@/lib/i18n'
import type {
  HttpResult,
  PreparedRequest,
  ProxyRequestBody,
  ProxyResponseBody,
  ProxyStreamFrame,
  StreamStartInfo
} from '@/types/http'
import { buildBrowserFormData } from './browser-form-data'
import {
  DEFAULT_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
  PROXY_TIMEOUT_SLACK_MS,
  RAW_UPLOAD_SUFFIX,
  STREAM_SUFFIX
} from './constants'
import {
  createIdleWatchdog,
  HttpRequestError,
  runWithTimeout,
  streamTimeoutError,
  toHttpError,
  type HttpTransport,
  type IdleWatchdog,
  type SendOptions
} from './transport'

/** 代理无 /stream 端点时用于回退。 */
class StreamEndpointUnavailable extends Error {}

export class DevProxyTransport implements HttpTransport {
  readonly kind = 'dev-proxy' as const
  private readonly endpoint: string

  constructor(endpoint: string) {
    this.endpoint = endpoint.replace(/\/+$/, '')
  }

  async send(request: PreparedRequest, options: SendOptions = {}): Promise<HttpResult> {
    if (request.body?.kind === 'form-data') {
      return this.sendFormData(request, options)
    }

    try {
      return await this.sendStreaming(request, options)
    } catch (error) {
      if (error instanceof StreamEndpointUnavailable) {
        return this.sendBuffered(request, options)
      }
      throw error
    }
  }

  /** 流式端点：SSE 边收边回调，普通响应回一帧结果。 */
  private async sendStreaming(request: PreparedRequest, options: SendOptions): Promise<HttpResult> {
    const lang = getCurrentLanguage()
    const started = Date.now()
    const externalSignal = options.signal
    if (externalSignal?.aborted) {
      throw new HttpRequestError('aborted', translate('error.aborted', lang))
    }

    const controller = new AbortController()
    const forwardAbort = () => controller.abort()
    externalSignal?.addEventListener('abort', forwardAbort, { once: true })

    let timeoutKind: 'connect' | 'idle' | null = null
    let idle: IdleWatchdog | null = null
    const connectTimer = setTimeout(() => {
      timeoutKind = 'connect'
      controller.abort()
    }, DEFAULT_TIMEOUT_MS + PROXY_TIMEOUT_SLACK_MS)

    const payload = {
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: request.body?.kind === 'text' ? request.body.text : undefined
    } satisfies ProxyRequestBody

    const unparseable = () =>
      new HttpRequestError(
        'proxy-error',
        translate('error.proxy.unparseable', lang, { status: 200 })
      )

    try {
      const response = await fetch(`${this.endpoint}${STREAM_SUFFIX}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
        body: JSON.stringify(payload),
        signal: controller.signal
      })

      // 无 /stream：请求未发出，可安全回退。
      if (response.status === 404 || response.status === 405) {
        throw new StreamEndpointUnavailable()
      }

      if (response.status !== 200) {
        const parsed: unknown = await response.json().catch(() => null)
        if (parsed && typeof parsed === 'object' && (parsed as ProxyResponseBody).ok === false) {
          const { error } = parsed as Extract<ProxyResponseBody, { ok: false }>
          throw new HttpRequestError(error.code, error.message)
        }
        throw new HttpRequestError(
          'proxy-error',
          translate('error.proxy.unparseable', lang, { status: response.status })
        )
      }

      if (!response.body) throw unparseable()

      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')

      let meta: StreamStartInfo | null = null
      let receivedBytes = 0
      let result: HttpResult | null = null
      let streamError: HttpRequestError | null = null
      let connectTimerCleared = false

      idle = createIdleWatchdog(() => {
        timeoutKind = 'idle'
        controller.abort()
      }, IDLE_TIMEOUT_MS + PROXY_TIMEOUT_SLACK_MS)

      const handleFrame = (frame: ProxyStreamFrame) => {
        // 首帧到达即视为连接成功，转交给空闲超时。
        if (!connectTimerCleared) {
          clearTimeout(connectTimer)
          connectTimerCleared = true
        }
        idle?.touch()

        switch (frame.type) {
          case 'start': {
            if (meta) return
            meta = {
              status: frame.status,
              statusText: frame.statusText,
              headers: frame.headers,
              contentType: frame.contentType,
              finalUrl: frame.finalUrl
            }
            options.onStreamStart?.(meta)
            return
          }
          case 'chunk': {
            if (!meta) return
            receivedBytes += frame.bytes
            options.onStreamChunk?.(frame.text, frame.bytes)
            return
          }
          case 'end': {
            const ok = meta ? meta.status >= 200 && meta.status < 300 : false
            result = {
              ok,
              status: meta?.status ?? 0,
              statusText: meta?.statusText ?? '',
              headers: meta?.headers ?? {},
              bodyText: null,
              bodyBase64: null,
              contentType: meta?.contentType ?? null,
              durationMs: frame.durationMs || Date.now() - started,
              sizeBytes: frame.sizeBytes || receivedBytes,
              truncated: frame.truncated,
              ...(meta?.finalUrl ? { finalUrl: meta.finalUrl } : {}),
              requestId: options.requestId ?? createId('res')
            }
            return
          }
          case 'result': {
            result = {
              ...frame.response,
              requestId: options.requestId ?? createId('res')
            }
            return
          }
          case 'error': {
            streamError = new HttpRequestError(frame.error.code, frame.error.message)
            return
          }
        }
      }

      let pending = ''
      let readError: unknown = null

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (!value) continue
          pending += decoder.decode(value, { stream: true })
          pending = drainFrames(pending, handleFrame, unparseable)
        }
        pending += decoder.decode()
        if (pending.trim()) drainFrames(`${pending}\n`, handleFrame, unparseable)
      } catch (error) {
        readError = error
      }

      if (streamError) throw streamError
      if (readError) throw readError
      if (!result) throw unparseable()
      return result
    } catch (error) {
      if (error instanceof StreamEndpointUnavailable) throw error
      if (externalSignal?.aborted) {
        throw new HttpRequestError('aborted', translate('error.aborted', lang))
      }
      if (timeoutKind) {
        throw streamTimeoutError(
          timeoutKind,
          timeoutKind === 'connect'
            ? DEFAULT_TIMEOUT_MS + PROXY_TIMEOUT_SLACK_MS
            : IDLE_TIMEOUT_MS + PROXY_TIMEOUT_SLACK_MS
        )
      }
      const httpError = toHttpError(error)
      if (httpError.code === 'network') {
        throw new HttpRequestError(
          'proxy-error',
          translate('error.proxy.unreachable', lang, { endpoint: this.endpoint })
        )
      }
      throw error
    } finally {
      clearTimeout(connectTimer)
      idle?.stop()
      externalSignal?.removeEventListener('abort', forwardAbort)
    }
  }

  /** 一次性端点：SSE 退化为收完后展示。 */
  private async sendBuffered(request: PreparedRequest, options: SendOptions): Promise<HttpResult> {
    const lang = getCurrentLanguage()
    const started = Date.now()
    const payload = {
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: request.body?.kind === 'text' ? request.body.text : undefined
    } satisfies ProxyRequestBody

    let envelope: ProxyResponseBody
    try {
      envelope = await runWithTimeout(
        async (signal) => {
          const response = await fetch(this.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal
          })
          const parsed: unknown = await response.json().catch(() => null)
          if (!parsed || typeof parsed !== 'object') {
            throw new HttpRequestError(
              'proxy-error',
              translate('error.proxy.unparseable', lang, { status: response.status })
            )
          }
          return parsed as ProxyResponseBody
        },
        DEFAULT_TIMEOUT_MS + PROXY_TIMEOUT_SLACK_MS,
        options.signal
      )
    } catch (error) {
      const httpError = toHttpError(error)
      if (httpError.code === 'network') {
        throw new HttpRequestError(
          'proxy-error',
          translate('error.proxy.unreachable', lang, { endpoint: this.endpoint })
        )
      }
      throw error
    }

    if (!envelope.ok) {
      throw new HttpRequestError(envelope.error.code, envelope.error.message)
    }

    return {
      ...envelope.response,
      requestId: options.requestId ?? createId('res'),
      durationMs: envelope.response.durationMs || Date.now() - started
    }
  }

  /** multipart 走 raw 端点逐字节转发；用 XHR 以获取上传进度。 */
  private sendFormData(request: PreparedRequest, options: SendOptions): Promise<HttpResult> {
    const body = request.body
    if (!body || body.kind !== 'form-data') {
      return Promise.reject(new HttpRequestError('unsupported', 'Not a form-data request'))
    }

    const lang = getCurrentLanguage()
    let form: FormData
    try {
      form = buildBrowserFormData(body.parts)
    } catch (error) {
      return Promise.reject(error)
    }

    const started = Date.now()
    const query = new URLSearchParams({ url: request.url, method: request.method })
    const endpoint = `${this.endpoint}${RAW_UPLOAD_SUFFIX}?${query.toString()}`

    return new Promise<HttpResult>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      let settled = false

      const cleanup = () => {
        options.signal?.removeEventListener('abort', handleAbort)
      }
      const finish = (run: () => void) => {
        if (settled) return
        settled = true
        cleanup()
        run()
      }
      const handleAbort = () => {
        xhr.abort()
      }

      if (options.signal?.aborted) {
        reject(new HttpRequestError('aborted', translate('error.aborted', lang)))
        return
      }

      xhr.open('POST', endpoint, true)
      // 不设总时长。
      xhr.timeout = 0

      for (const [name, value] of Object.entries(request.headers)) {
        try {
          xhr.setRequestHeader(name, value)
        } catch {
          // 浏览器禁止设置的头忽略
        }
      }

      xhr.upload.addEventListener('progress', (event) => {
        options.onUploadProgress?.({
          loaded: event.loaded,
          total: event.lengthComputable ? event.total : 0
        })
      })

      xhr.onload = () => {
        let envelope: ProxyResponseBody | null = null
        try {
          const parsed: unknown = JSON.parse(xhr.responseText)
          envelope = parsed && typeof parsed === 'object' ? (parsed as ProxyResponseBody) : null
        } catch {
          envelope = null
        }

        if (!envelope) {
          finish(() =>
            reject(
              new HttpRequestError(
                'proxy-error',
                translate('error.proxy.unparseable', lang, { status: xhr.status })
              )
            )
          )
          return
        }

        if (!envelope.ok) {
          finish(() => reject(new HttpRequestError(envelope.error.code, envelope.error.message)))
          return
        }

        finish(() =>
          resolve({
            ...envelope.response,
            requestId: options.requestId ?? createId('res'),
            durationMs: envelope.response.durationMs || Date.now() - started
          })
        )
      }

      xhr.onerror = () => {
        finish(() =>
          reject(
            new HttpRequestError(
              'proxy-error',
              translate('error.proxy.unreachable', lang, { endpoint: this.endpoint })
            )
          )
        )
      }

      xhr.onabort = () => {
        finish(() => reject(new HttpRequestError('aborted', translate('error.aborted', lang))))
      }

      options.signal?.addEventListener('abort', handleAbort, { once: true })

      try {
        xhr.send(form)
      } catch (error) {
        finish(() =>
          reject(
            new HttpRequestError(
              'proxy-error',
              error instanceof Error ? error.message : translate('error.network.send', lang)
            )
          )
        )
      }
    })
  }
}

/** 切出完整 NDJSON 行并逐帧处理，返回剩余半行。 */
function drainFrames(
  buffer: string,
  onFrame: (frame: ProxyStreamFrame) => void,
  unparseable: () => HttpRequestError
): string {
  let rest = buffer
  let index = rest.indexOf('\n')

  while (index >= 0) {
    const line = rest.slice(0, index).replace(/\r$/, '').trim()
    rest = rest.slice(index + 1)

    if (line) {
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        throw unparseable()
      }
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof (parsed as { type?: unknown }).type !== 'string'
      ) {
        throw unparseable()
      }
      onFrame(parsed as ProxyStreamFrame)
    }

    index = rest.indexOf('\n')
  }

  return rest
}
