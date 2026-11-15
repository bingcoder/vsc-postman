/** 宿主侧最小类型：只覆盖集合/历史快照与历史重放所需字段，其余字段原样透传给 webview。 */

export type HttpMethod = string

export type KvRow = {
  id: string
  key: string
  value: string
  enabled: boolean
}

/** 请求草稿：宿主不解释 body 等细节，仅原样保存/回放。 */
export type RequestDraft = {
  id: string
  name?: string
  method: HttpMethod
  url: string
  [key: string]: unknown
}

export type SavedRequest = RequestDraft & {
  createdAt: number
  updatedAt: number
}

export type Collection = {
  id: string
  name: string
  requests: SavedRequest[]
  createdAt: number
  updatedAt: number
}

export type HistoryEntry = {
  id: string
  method: HttpMethod
  url: string
  status: number | null
  durationMs: number
  error?: string
  at: number
  request: RequestDraft
  requestKey?: string
}

/** zustand persist 的存储信封。 */
export type PersistedEnvelope = {
  state?: {
    collections?: unknown
    history?: unknown
    historyLimit?: unknown
    [key: string]: unknown
  }
  version?: number
  [key: string]: unknown
}
