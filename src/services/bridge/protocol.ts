import type {
  Collection,
  HistoryEntry,
  HttpError,
  HttpErrorCode,
  RequestDraft,
  StreamStartInfo
} from '@/types/http'

export const BRIDGE_REQUEST_TYPE = 'vsc-postman/request'
export const BRIDGE_RESPONSE_TYPE = 'vsc-postman/response'
/** SSE 帧：与最终 response 共用 RPC id，先到。 */
export const BRIDGE_STREAM_TYPE = 'vsc-postman/stream'
/** 宿主主动推送的通知：树视图点击、外部改动、配置变化。 */
export const BRIDGE_NOTIFY_TYPE = 'vsc-postman/notify'
export const STORAGE_NAMESPACE = 'vsc-postman'

export type BridgeMethod =
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

export type BridgeRequestMessage = {
  type: typeof BRIDGE_REQUEST_TYPE
  id: string
  method: BridgeMethod
  payload: unknown
}

export type BridgeResponseMessage =
  | { type: typeof BRIDGE_RESPONSE_TYPE; id: string; ok: true; payload: unknown }
  | {
      type: typeof BRIDGE_RESPONSE_TYPE
      id: string
      ok: false
      error: { code: HttpErrorCode; message: string }
    }

/**
 * 宿主 → webview 通知，与 src-vsc/panel-manager.ts 的 HostNotify 一一对应。
 *
 * 快照随通知下发，webview 只做镜像，不回读 globalState。
 */
export type BridgeHostNotify =
  | {
      event: 'workspace.changed'
      collections: Collection[]
      history: HistoryEntry[]
      historyLimit: number
    }
  | { event: 'openRequest'; request: RequestDraft }
  | { event: 'openHistory'; draft: RequestDraft }
  | { event: 'newRequest' }
  | { event: 'activeRequest.changed'; requestId: string | null }
  | { event: 'navigate'; path: string }
  | { event: 'settings.changed'; language: 'zh' | 'en'; historyLimit: number }

export type BridgeNotifyMessage = BridgeHostNotify & { type: typeof BRIDGE_NOTIFY_TYPE }

/** workspace.update 的参数：webview 侧改动后的完整集合、历史与上限。 */
export type BridgeWorkspaceUpdate = {
  collections: Collection[]
  history: HistoryEntry[]
  historyLimit: number
  /** 编辑器标签当前草稿 id：保存后即使 id 不变，宿主也能把标签绑定到请求。 */
  draftId?: string
}

/** 侧边栏打开编辑器标签中的请求/历史。 */
export type BridgePanelOpenRequestPayload = {
  collectionId: string
  requestId: string
}

export type BridgePanelOpenHistoryPayload = {
  entryId: string
}

/** workspace.ready 的返回：宿主是集合/历史/语言/历史上限的唯一来源。 */
export type BridgeWorkspaceSnapshot = {
  language: 'zh' | 'en'
  historyLimit: number
  collections: Collection[]
  history: HistoryEntry[]
  activeRequestId: string | null
}

export type BridgeStoragePayload = {
  key: string
  value?: string | null
}

export type BridgeStorageOpenPayload = {
  keys: string[]
}

export type BridgeResponseOpenPayload = {
  content: string
}

export type BridgeStorageResult = {
  value: string | null
}

/** multipart 字段：文件只带绝对路径，由宿主读盘组报文。 */
export type BridgeFormDataPart =
  | { kind: 'text'; name: string; value: string }
  | {
      kind: 'file'
      name: string
      filename: string
      contentType: string
      size: number
      path: string
    }

export type BridgeFormDataPayload = {
  parts: BridgeFormDataPart[]
}

export type BridgeAbortPayload = {
  id: string
}

export type BridgeFilePickResult = {
  files: { path: string; name: string; size: number }[]
}

/** 宿主推送的 SSE 帧；最终摘要仍走 response 消息。 */
export type BridgeStreamFrame =
  | { type: 'start'; info: StreamStartInfo }
  | { type: 'chunk'; text: string; bytes: number }
  | { type: 'error'; error: HttpError }

export type BridgeStreamMessage = {
  type: typeof BRIDGE_STREAM_TYPE
  id: string
  frame: BridgeStreamFrame
}
