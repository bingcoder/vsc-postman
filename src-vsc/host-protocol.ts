import type { Collection, HistoryEntry, RequestDraft, SavedRequest } from './types'

/** 宿主推送给 webview 的通知（webview 侧见 src/services/bridge/protocol.ts）。 */
export type HostNotify =
  | {
      event: 'workspace.changed'
      collections: Collection[]
      history: HistoryEntry[]
      historyLimit: number
    }
  | { event: 'openRequest'; request: SavedRequest }
  | { event: 'openHistory'; draft: RequestDraft }
  | { event: 'newRequest' }
  | { event: 'activeRequest.changed'; requestId: string | null }
  | { event: 'navigate'; path: string }
  | { event: 'settings.changed'; language: 'zh' | 'en'; historyLimit: number }
