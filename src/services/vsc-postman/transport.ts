import type {
  HttpError,
  HttpErrorCode,
  HttpResult,
  PreparedRequest,
  StreamStartInfo
} from '@/types/http'
import { translate, getCurrentLanguage } from '@/lib/i18n'

export type TransportKind = 'dev-proxy' | 'vscode' | 'fetch' | 'chrome'

export type UploadProgress = {
  loaded: number
  total: number
}

export type SendOptions = {
  signal?: AbortSignal
  requestId?: string
  /** multipart 上传进度，total 未知时为 0。 */
  onUploadProgress?: (progress: UploadProgress) => void
  /** 判定为 SSE 时回调一次（响应头已到、正文未读）。 */
  onStreamStart?: (info: StreamStartInfo) => void
  /** SSE 分片：增量解码文本与原始字节数。 */
  onStreamChunk?: (chunk: string, bytes: number) => void
}

export interface HttpTransport {
  readonly kind: TransportKind
  send(request: PreparedRequest, options?: SendOptions): Promise<HttpResult>
}

/** 空闲看门狗：有数据就重置计时，长时间无流动才中断。 */
export type IdleWatchdog = {
  touch: () => void
  stop: () => void
}

export function createIdleWatchdog(onIdle: () => void, idleMs: number): IdleWatchdog {
  let timer: ReturnType<typeof setTimeout> | null = null
  const stop = () => {
    if (!timer) return
    clearTimeout(timer)
    timer = null
  }
  const touch = () => {
    stop()
    timer = setTimeout(onIdle, idleMs)
  }
  touch()
  return { touch, stop }
}

/** 流式响应的连接 / 空闲超时错误。 */
export function streamTimeoutError(kind: 'connect' | 'idle', timeoutMs: number): HttpRequestError {
  const seconds = Math.max(1, Math.round(timeoutMs / 1000))
  return new HttpRequestError(
    'timeout',
    kind === 'connect'
      ? translate('error.stream.connectTimeout', getCurrentLanguage(), { seconds })
      : translate('error.stream.idleTimeout', getCurrentLanguage(), { seconds })
  )
}

export class HttpRequestError extends Error {
  readonly code: HttpErrorCode

  constructor(code: HttpErrorCode, message: string) {
    super(message)
    this.name = 'HttpRequestError'
    this.code = code
  }
}

export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpRequestError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof Error) {
    return {
      code: 'network',
      message: error.message || translate('error.network.fallback', getCurrentLanguage())
    }
  }
  return { code: 'network', message: translate('error.network.fallback', getCurrentLanguage()) }
}

/** 统一提供超时与外部取消信号，并归类异常；timeoutMs <= 0 表示不限。 */
export async function runWithTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<T> {
  const lang = getCurrentLanguage()
  if (externalSignal?.aborted) {
    throw new HttpRequestError('aborted', translate('error.aborted', lang))
  }

  const controller = new AbortController()
  let timedOut = false
  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true
          controller.abort()
        }, timeoutMs)
      : null
  const forwardAbort = () => controller.abort()
  externalSignal?.addEventListener('abort', forwardAbort, { once: true })

  try {
    return await task(controller.signal)
  } catch (error) {
    if (externalSignal?.aborted) {
      throw new HttpRequestError('aborted', translate('error.aborted', lang))
    }
    if (timedOut) {
      throw new HttpRequestError(
        'timeout',
        translate('error.timeout', lang, { seconds: Math.round(timeoutMs / 1000) })
      )
    }
    if (error instanceof HttpRequestError) throw error
    const message = error instanceof Error ? error.message : String(error)
    throw new HttpRequestError('network', message || translate('error.network.send', lang))
  } finally {
    if (timer) clearTimeout(timer)
    externalSignal?.removeEventListener('abort', forwardAbort)
  }
}
