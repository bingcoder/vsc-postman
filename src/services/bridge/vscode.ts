import { createId } from '@/lib/id'
import { translate, getCurrentLanguage } from '@/lib/i18n'
import { HttpRequestError } from '@/services/vsc-postman/transport'
import {
  BRIDGE_NOTIFY_TYPE,
  BRIDGE_REQUEST_TYPE,
  BRIDGE_RESPONSE_TYPE,
  BRIDGE_STREAM_TYPE,
  type BridgeFilePickResult,
  type BridgeHostNotify,
  type BridgeMethod,
  type BridgePanelOpenHistoryPayload,
  type BridgePanelOpenRequestPayload,
  type BridgeRequestMessage,
  type BridgeResponseMessage,
  type BridgeStreamFrame,
  type BridgeStreamMessage,
  type BridgeWorkspaceSnapshot
} from './protocol'

type PendingCall = {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
  /** SSE 帧回调。 */
  onStreamFrame?: (frame: BridgeStreamFrame) => void
}

type CallOptions = {
  signal?: AbortSignal
  /** 0 表示不设超时。 */
  timeoutMs?: number
  onStreamFrame?: (frame: BridgeStreamFrame) => void
}

const DEFAULT_BRIDGE_TIMEOUT_MS = 60_000
const pending = new Map<string, PendingCall>()
const notifyListeners = new Set<(notify: BridgeHostNotify) => void>()
let bridgeApi: VsCodeApi | null = null
let listenerInstalled = false

function getBridgeApi(): VsCodeApi {
  if (bridgeApi) return bridgeApi

  const acquire = (globalThis as { acquireVsCodeApi?: () => VsCodeApi }).acquireVsCodeApi
  if (typeof acquire !== 'function') {
    throw new HttpRequestError(
      'unsupported',
      translate('error.unsupported.webview', getCurrentLanguage())
    )
  }

  bridgeApi = acquire()
  return bridgeApi
}

function installListener(): void {
  if (listenerInstalled) return
  listenerInstalled = true

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    const message = event.data as { type?: string } | null
    if (!message || typeof message.type !== 'string') return

    if (message.type === BRIDGE_NOTIFY_TYPE) {
      const notify = message as unknown as BridgeHostNotify
      for (const listener of notifyListeners) listener(notify)
      return
    }

    if (message.type === BRIDGE_STREAM_TYPE) {
      const stream = message as BridgeStreamMessage
      pending.get(stream.id)?.onStreamFrame?.(stream.frame)
      return
    }
    if (message.type !== BRIDGE_RESPONSE_TYPE) return

    const response = message as BridgeResponseMessage
    const call = pending.get(response.id)
    if (!call) return

    if (response.ok) {
      call.resolve(response.payload)
    } else {
      call.reject(new HttpRequestError(response.error.code, response.error.message))
    }
  })
}

/** 订阅宿主通知；返回取消订阅函数。 */
export function onHostNotify(listener: (notify: BridgeHostNotify) => void): () => void {
  installListener()
  notifyListeners.add(listener)
  return () => notifyListeners.delete(listener)
}

/** 通过 acquireVsCodeApi 与扩展宿主通信（协议见 protocol.ts）。 */
export function callHost<T>(
  method: BridgeMethod,
  payload: unknown,
  options: CallOptions = {}
): Promise<T> {
  const api = getBridgeApi()
  installListener()

  const id = createId('rpc')
  const timeoutMs = options.timeoutMs ?? DEFAULT_BRIDGE_TIMEOUT_MS
  const externalSignal = options.signal

  return new Promise<T>((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      pending.delete(id)
      if (timer) clearTimeout(timer)
      externalSignal?.removeEventListener('abort', handleAbort)
    }

    const finish = (run: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      run()
    }

    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            finish(() =>
              reject(
                new HttpRequestError(
                  'timeout',
                  translate('error.timeout.bridge', getCurrentLanguage())
                )
              )
            )
          }, timeoutMs)
        : null

    const handleAbort = () => {
      finish(() =>
        reject(new HttpRequestError('aborted', translate('error.aborted', getCurrentLanguage())))
      )
    }

    if (externalSignal) {
      if (externalSignal.aborted) {
        handleAbort()
        return
      }
      externalSignal.addEventListener('abort', handleAbort, { once: true })
    }

    pending.set(id, {
      resolve: (value) => finish(() => resolve(value as T)),
      reject: (error) => finish(() => reject(error)),
      ...(options.onStreamFrame ? { onStreamFrame: options.onStreamFrame } : {})
    })

    const message: BridgeRequestMessage = {
      type: BRIDGE_REQUEST_TYPE,
      id,
      method,
      payload
    }

    try {
      api.postMessage(message)
    } catch (error) {
      finish(() => reject(error))
    }
  })
}

/** 调用宿主文件选择框，返回绝对路径。 */
export async function pickFilesViaHost(): Promise<BridgeFilePickResult['files']> {
  const result = await callHost<BridgeFilePickResult>('file.pick', { canSelectMany: true })
  return result?.files ?? []
}

/** 读出宿主侧的语言与历史上限（仅在 VS Code Webview 可用）。 */
export async function announceWorkspaceReady(): Promise<BridgeWorkspaceSnapshot> {
  return callHost<BridgeWorkspaceSnapshot>('workspace.ready', {})
}

/** 侧边栏：请求编辑器标签打开已保存的请求。 */
export async function openPanelRequest(collectionId: string, requestId: string): Promise<void> {
  await callHost<void>('panel.openRequest', {
    collectionId,
    requestId
  } satisfies BridgePanelOpenRequestPayload)
}

/** 侧边栏：请求编辑器标签重放历史请求。 */
export async function openPanelHistory(entryId: string): Promise<void> {
  await callHost<void>('panel.openHistory', { entryId } satisfies BridgePanelOpenHistoryPayload)
}

/** 侧边栏：请求编辑器标签新建草稿。 */
export async function openPanelNewRequest(): Promise<void> {
  await callHost<void>('panel.newRequest', {})
}

/** 侧边栏：请求编辑器标签打开设置页。 */
export async function openPanelSettings(): Promise<void> {
  await callHost<void>('panel.openSettings', {})
}

/** 侧边栏：仅聚焦最后一个编辑器标签。 */
export async function focusPanel(): Promise<void> {
  await callHost<void>('panel.focus', {})
}

/** 侧边栏：在宿主复制请求并打开新标签。 */
export async function duplicatePanelRequest(
  collectionId: string,
  requestId: string
): Promise<void> {
  await callHost<void>('panel.duplicateRequest', {
    collectionId,
    requestId
  } satisfies BridgePanelOpenRequestPayload)
}
