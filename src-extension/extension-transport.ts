import {
  HTTP_PORT_NAME,
  isServerMessage,
  type ClientMessage,
  type WireFormPart,
  type WirePreparedRequest
} from './protocol'
import { createId } from '@/lib/id'
import { getCurrentLanguage, translate } from '@/lib/i18n'
import { buildBrowserFormData } from '@/services/vsc-postman/browser-form-data'
import { executeFetch } from '@/services/vsc-postman/fetch-core'
import type { HttpResult, PreparedRequest } from '@/types/http'
import {
  HttpRequestError,
  type HttpTransport,
  type SendOptions
} from '@/services/vsc-postman/transport'

type PendingRequest = {
  options: SendOptions
  resolve: (result: HttpResult) => void
  reject: (error: unknown) => void
  removeAbort: () => void
  heartbeat: ReturnType<typeof setInterval>
}

/** 普通请求交给 Service Worker；带文件的 multipart 因 Port 无法传 File，改由页面直接 fetch。 */
export class ExtensionTransport implements HttpTransport {
  readonly kind = 'extension' as const

  private port: chrome.runtime.Port | null = null
  private readonly pending = new Map<string, PendingRequest>()

  async send(request: PreparedRequest, options: SendOptions = {}): Promise<HttpResult> {
    const lang = getCurrentLanguage()

    if (options.signal?.aborted) {
      throw new HttpRequestError('aborted', translate('error.aborted', lang))
    }

    // 页面本身有 host 权限，直接 fetch。
    const formParts = request.body?.kind === 'form-data' ? request.body.parts : null
    if (formParts?.some((part) => part.kind === 'file')) {
      return executeFetch(request, buildBrowserFormData(formParts), {
        ...options,
        requestId: options.requestId ?? createId('req'),
        upload: true
      })
    }

    const wireRequest = toWireRequest(request)
    const requestId = options.requestId ?? createId('req')
    this.connect(lang)

    return new Promise<HttpResult>((resolve, reject) => {
      const onAbort = () => {
        this.safePost({ type: 'abort', requestId })
        this.finish(requestId, new HttpRequestError('aborted', translate('error.aborted', lang)))
      }

      // 心跳，避免 Service Worker 因空闲被回收。
      const heartbeat = setInterval(() => this.safePost({ type: 'ping' }), 20_000)
      const removeAbort = () => options.signal?.removeEventListener('abort', onAbort)

      this.pending.set(requestId, { options, resolve, reject, removeAbort, heartbeat })
      options.signal?.addEventListener('abort', onAbort, { once: true })

      const posted = this.safePost({ type: 'request', requestId, request: wireRequest })
      if (!posted) {
        this.finish(
          requestId,
          new HttpRequestError('network', translate('error.extension.disconnected', lang))
        )
      }
    })
  }

  private connect(lang: ReturnType<typeof getCurrentLanguage>): chrome.runtime.Port {
    if (this.port) return this.port

    const port = chrome.runtime.connect({ name: HTTP_PORT_NAME })
    port.onMessage.addListener((message) => this.handleMessage(message))
    port.onDisconnect.addListener(() => this.handleDisconnect(port, lang))
    this.port = port
    return port
  }

  private handleMessage(message: unknown): void {
    if (!isServerMessage(message)) return
    if (message.type === 'pong') return

    const pending = this.pending.get(message.requestId)
    if (!pending) return

    switch (message.type) {
      case 'start':
        try {
          pending.options.onStreamStart?.(message.info)
        } catch {
          // 忽略回调异常
        }
        break
      case 'chunk':
        try {
          pending.options.onStreamChunk?.(message.text, message.bytes)
        } catch {
          // 忽略回调异常
        }
        break
      case 'result':
        this.finish(message.requestId, undefined, {
          ...message.result,
          requestId: message.requestId
        })
        break
      case 'error':
        this.finish(
          message.requestId,
          new HttpRequestError(message.error.code, message.error.message)
        )
        break
    }
  }

  private handleDisconnect(
    disconnectedPort: chrome.runtime.Port,
    lang: ReturnType<typeof getCurrentLanguage>
  ): void {
    // 旧 Port 的回调可能晚于新 Port，需确认身份。
    if (this.port !== disconnectedPort) return

    this.port = null
    this.failAllPending(
      new HttpRequestError('network', translate('error.extension.disconnected', lang))
    )
  }

  private failAllPending(error: HttpRequestError): void {
    for (const requestId of [...this.pending.keys()]) {
      this.finish(requestId, error)
    }
  }

  private finish(requestId: string, error?: unknown, result?: HttpResult): void {
    const pending = this.pending.get(requestId)
    if (!pending) return

    this.pending.delete(requestId)
    clearInterval(pending.heartbeat)
    pending.removeAbort()

    if (error) pending.reject(error)
    else if (result) pending.resolve(result)
  }

  private safePost(message: ClientMessage): boolean {
    if (!this.port) return false
    try {
      this.port.postMessage(message)
      return true
    } catch {
      this.port = null
      this.failAllPending(
        new HttpRequestError(
          'network',
          translate('error.extension.disconnected', getCurrentLanguage())
        )
      )
      return false
    }
  }
}

function toWireRequest(request: PreparedRequest): WirePreparedRequest {
  const base = {
    method: request.method,
    url: request.url,
    headers: request.headers
  }

  if (!request.body) return base
  if (request.body.kind === 'text') {
    return { ...base, body: { kind: 'text', text: request.body.text } }
  }

  const parts: WireFormPart[] = request.body.parts.map((part) => {
    if (part.kind === 'file') {
      // 带文件的请求已在 send() 分流，这里是不变量保护。
      throw new HttpRequestError('unsupported', 'File parts must be sent from the extension page')
    }
    return { kind: 'text', name: part.name, value: part.value }
  })

  return { ...base, body: { kind: 'form-data', parts } }
}
