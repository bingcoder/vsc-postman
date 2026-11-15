import { createId } from '@/lib/id'
import { translate, getCurrentLanguage } from '@/lib/i18n'
import { callHost } from '@/services/bridge/vscode'
import type { BridgeFormDataPart } from '@/services/bridge/protocol'
import type { HttpResult, PreparedRequest } from '@/types/http'
import { DEFAULT_TIMEOUT_MS, IDLE_TIMEOUT_MS, PROXY_TIMEOUT_SLACK_MS } from './constants'
import {
  createIdleWatchdog,
  HttpRequestError,
  streamTimeoutError,
  type HttpTransport,
  type IdleWatchdog,
  type SendOptions
} from './transport'

export class VscodeTransport implements HttpTransport {
  readonly kind = 'vscode' as const

  async send(request: PreparedRequest, options: SendOptions = {}): Promise<HttpResult> {
    const requestId = options.requestId ?? createId('res')

    if (request.body?.kind === 'form-data') {
      return this.sendFormData(request, options, requestId)
    }

    return this.sendHttp(request, options, requestId)
  }

  /** 普通请求与 SSE 共用一条 RPC：事件流先推 start/chunk，最后回摘要。 */
  private async sendHttp(
    request: PreparedRequest,
    options: SendOptions,
    requestId: string
  ): Promise<HttpResult> {
    const lang = getCurrentLanguage()
    const externalSignal = options.signal
    if (externalSignal?.aborted) {
      throw new HttpRequestError('aborted', translate('error.aborted', lang))
    }

    const controller = new AbortController()
    let timeoutKind: 'connect' | 'idle' | null = null
    let idle: IdleWatchdog | null = null
    let firstFrame = false

    const forwardAbort = () => controller.abort()
    externalSignal?.addEventListener('abort', forwardAbort, { once: true })

    // 兜底超时，避免宿主异常时 Promise 挂起。
    const connectTimer = setTimeout(() => {
      timeoutKind = 'connect'
      controller.abort()
    }, DEFAULT_TIMEOUT_MS + PROXY_TIMEOUT_SLACK_MS)

    idle = createIdleWatchdog(() => {
      timeoutKind = 'idle'
      controller.abort()
    }, IDLE_TIMEOUT_MS + PROXY_TIMEOUT_SLACK_MS)

    // 取消时通知宿主中断上游。
    const handleAbort = () => {
      void callHost('http.abort', { id: requestId }, { timeoutMs: 5_000 }).catch(() => undefined)
    }
    controller.signal.addEventListener('abort', handleAbort, { once: true })

    const touch = () => {
      if (!firstFrame) {
        firstFrame = true
        clearTimeout(connectTimer)
      }
      idle?.touch()
    }

    try {
      const result = await callHost<Omit<HttpResult, 'requestId'>>(
        'http.request',
        {
          url: request.url,
          method: request.method,
          headers: request.headers,
          body: request.body?.kind === 'text' ? request.body.text : undefined,
          requestId,
          timeoutMs: DEFAULT_TIMEOUT_MS
        },
        {
          signal: controller.signal,
          timeoutMs: 0,
          onStreamFrame: (frame) => {
            if (frame.type === 'start') {
              touch()
              options.onStreamStart?.(frame.info)
              return
            }
            if (frame.type === 'chunk') {
              touch()
              options.onStreamChunk?.(frame.text, frame.bytes)
            }
            // error 帧随后以 ok:false 的 response 回复。
          }
        }
      )

      return { ...result, requestId }
    } catch (error) {
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
      throw error instanceof HttpRequestError
        ? error
        : new HttpRequestError(
            'network',
            error instanceof Error ? error.message : translate('error.network.send', lang)
          )
    } finally {
      clearTimeout(connectTimer)
      idle?.stop()
      externalSignal?.removeEventListener('abort', forwardAbort)
      controller.signal.removeEventListener('abort', handleAbort)
    }
  }

  /** multipart 只传路径，宿主读盘流式组报文。 */
  private async sendFormData(
    request: PreparedRequest,
    options: SendOptions,
    requestId: string
  ): Promise<HttpResult> {
    const body = request.body
    if (!body || body.kind !== 'form-data') {
      throw new HttpRequestError('unsupported', 'Not a form-data request')
    }

    const lang = getCurrentLanguage()
    const parts: BridgeFormDataPart[] = body.parts.map((part) => {
      if (part.kind === 'text') return part
      if (part.source.kind !== 'path') {
        throw new HttpRequestError(
          'unsupported',
          translate('error.upload.memoryUnsupported', lang, { name: part.filename })
        )
      }
      return {
        kind: 'file',
        name: part.name,
        filename: part.filename,
        contentType: part.contentType,
        size: part.size,
        path: part.source.path
      }
    })

    // 取消时通知宿主中断上游。
    const handleAbort = () => {
      void callHost('http.abort', { id: requestId }, { timeoutMs: 5_000 }).catch(() => undefined)
    }
    options.signal?.addEventListener('abort', handleAbort, { once: true })

    try {
      const result = await callHost<Omit<HttpResult, 'requestId'>>(
        'http.request',
        {
          url: request.url,
          method: request.method,
          headers: request.headers,
          requestId,
          formData: { parts },
          // 0 表示不设总时长。
          timeoutMs: 0
        },
        { signal: options.signal, timeoutMs: 0 }
      )

      return { ...result, requestId }
    } finally {
      options.signal?.removeEventListener('abort', handleAbort)
    }
  }
}
