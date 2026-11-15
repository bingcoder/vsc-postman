export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
export type HttpMethod = (typeof HTTP_METHODS)[number]

export const BODY_MODES = [
  { value: 'none', label: 'none' },
  { value: 'json', label: 'JSON' },
  { value: 'text', label: 'Text' },
  { value: 'x-www-form-urlencoded', label: 'Form URL-Encoded' },
  { value: 'form-data', label: 'Form-Data' }
] as const
export type BodyMode = (typeof BODY_MODES)[number]['value']

export type KvSection = 'params' | 'headers' | 'formFields'

export type KvRow = {
  id: string
  key: string
  value: string
  enabled: boolean
}

export type FormFieldKind = 'text' | 'file'

/** 持久化的文件描述（不含内容）；刷新或换运行时后句柄失效。 */
export type FileMeta = {
  name: string
  size: number
  mimeType: string
  path?: string
}

/** form-data 一行：文本字段或单个文件（多文件用重复 key 多行表示）。 */
export type FormFieldRow = {
  id: string
  key: string
  enabled: boolean
  kind: FormFieldKind
  value: string
  file: FileMeta | null
}

/** 文件句柄（仅内存）：File 或宿主路径。 */
export type FileSource = { kind: 'memory'; file: File } | { kind: 'path'; path: string }

export type PickedFile = {
  name: string
  size: number
  mimeType: string
  file?: File
  path?: string
}

export type RequestDraft = {
  id: string
  name: string
  method: HttpMethod
  url: string
  params: KvRow[]
  headers: KvRow[]
  bodyMode: BodyMode
  bodyText: string
  formFields: KvRow[]
  formData: FormFieldRow[]
}

export type PreparedFormPart =
  | { kind: 'text'; name: string; value: string }
  | {
      kind: 'file'
      name: string
      filename: string
      contentType: string
      size: number
      source: FileSource
    }

/** multipart 不带 Content-Type：boundary 由发送端生成。 */
export type PreparedBody =
  { kind: 'text'; text: string } | { kind: 'form-data'; parts: PreparedFormPart[] }

export type PreparedRequest = {
  method: HttpMethod
  url: string
  headers: Record<string, string>
  body?: PreparedBody
}

export type HttpErrorCode =
  | 'invalid-url'
  | 'timeout'
  | 'aborted'
  | 'network'
  | 'proxy-error'
  | 'unsupported'
  | 'file-missing'
  | 'permission-denied'

export type HttpError = {
  code: HttpErrorCode
  message: string
}

/** 响应头元信息（SSE 在首字节前回调）。 */
export type StreamStartInfo = {
  status: number
  statusText: string
  headers: Record<string, string>
  contentType: string | null
  finalUrl?: string
}

/** 解析后的一条 SSE 事件。 */
export type SseEventItem = {
  index: number
  id?: string
  event?: string
  data: string
  retry?: number
  /** 原始文本（含字段前缀，仅展示用） */
  raw: string
  /** 距流开始的毫秒数 */
  atMs: number
}

export type StreamPhase = 'open' | 'ended' | 'aborted'

export type StreamState = {
  phase: StreamPhase
  meta: StreamStartInfo | null
  events: SseEventItem[]
  /** 已接收原始文本（受上限截断） */
  raw: string
  /** 内容达到展示上限 */
  truncated: boolean
  /** 因上限主动断开 */
  limitReached: boolean
  /** 收到头之后的错误，事件仍可查看 */
  error?: HttpError
  durationMs: number
  sizeBytes: number
}

export type HttpResult = {
  ok: boolean
  requestId: string
  finalUrl?: string
  status: number
  statusText: string
  headers: Record<string, string>
  bodyText: string | null
  bodyBase64: string | null
  contentType: string | null
  durationMs: number
  sizeBytes: number
  truncated: boolean
}

export type ResponseState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'stream'; stream: StreamState; request?: PreparedRequest }
  | { status: 'success'; result: HttpResult; request?: PreparedRequest }
  | { status: 'error'; error: HttpError; request?: PreparedRequest }

/** 请求进行中（loading 或 SSE 未关闭）。 */
export function isResponseActive(response: ResponseState): boolean {
  if (response.status === 'loading') return true
  return response.status === 'stream' && response.stream.phase === 'open'
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
  /** 请求指纹，用于历史相邻去重；无指纹（准备阶段失败）不参与。 */
  requestKey?: string
}

export type ProxyRequestBody = {
  url: string
  method: HttpMethod
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}

export type ProxyResponseBody =
  { ok: true; response: Omit<HttpResult, 'requestId'> } | { ok: false; error: HttpError }

/** 开发代理 /stream 端点的 NDJSON 帧。 */
export type ProxyStreamFrame =
  | ({ type: 'start' } & StreamStartInfo)
  | { type: 'chunk'; text: string; bytes: number }
  | { type: 'end'; durationMs: number; sizeBytes: number; truncated: boolean }
  | { type: 'result'; response: Omit<HttpResult, 'requestId'> }
  | { type: 'error'; error: HttpError }
