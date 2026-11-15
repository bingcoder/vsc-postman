import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createId } from '@/lib/id'
import { clampHistoryLimit, historyDayKey, requestFingerprint } from '@/lib/history'
import { translate, getCurrentLanguage } from '@/lib/i18n'
import { SseParser } from '@/lib/sse'
import { getHttpTransport } from '@/services/vsc-postman'
import {
  DEFAULT_HISTORY_LIMIT,
  MAX_STREAM_DISPLAY_BYTES,
  MAX_STREAM_EVENTS,
  STORAGE_KEY,
  STREAM_FLUSH_INTERVAL_MS
} from '@/services/vsc-postman/constants'
import {
  getFileSource,
  removeFileSource,
  setFileSource
} from '@/services/vsc-postman/file-registry'
import { prepareRequest } from '@/services/vsc-postman/prepare-request'
import { toHttpError, type UploadProgress } from '@/services/vsc-postman/transport'
import { getStorageAdapter } from '@/services/storage'
import { announceWorkspaceReady, callHost, onHostNotify } from '@/services/bridge/vscode'
import { armStorage, disarmStorage, withStorageMuted } from '@/services/storage/mute'
import { detectRuntime } from '@/lib/runtime'
import { useAppStore } from '@/stores/app-store'
import { isStorageMuted } from '@/services/storage/mute'
import {
  isResponseActive,
  type Collection,
  type FileMeta,
  type FormFieldRow,
  type HistoryEntry,
  type KvRow,
  type KvSection,
  type PickedFile,
  type RequestDraft,
  type ResponseState,
  type SavedRequest,
  type SseEventItem,
  type StreamStartInfo,
  type StreamState
} from '@/types/http'

type DraftFieldPatch = Partial<
  Pick<RequestDraft, 'name' | 'method' | 'url' | 'bodyMode' | 'bodyText'>
>

type DraftRowPatch = Partial<Pick<KvRow, 'key' | 'value' | 'enabled'>>

type FormFieldPatch = Partial<Pick<FormFieldRow, 'key' | 'value' | 'kind'>>

type VscPostmanState = {
  draft: RequestDraft
  response: ResponseState
  collections: Collection[]
  history: HistoryEntry[]
  /** 历史记录上限。 */
  historyLimit: number
  /** 宿主当前激活的已保存请求，仅 VS Code 侧边栏用于高亮。 */
  activeRequestId: string | null
  /** 上传进度，非上传为 null */
  uploadProgress: UploadProgress | null
  setDraftField: (patch: DraftFieldPatch) => void
  addRow: (section: KvSection) => void
  updateRow: (section: KvSection, id: string, patch: DraftRowPatch) => void
  removeRow: (section: KvSection, id: string) => void
  toggleRow: (section: KvSection, id: string) => void
  addFormRow: () => void
  updateFormRow: (id: string, patch: FormFieldPatch) => void
  removeFormRow: (id: string) => void
  toggleFormRow: (id: string) => void
  /** 写入文件；多选时展开成多行同 key 字段 */
  assignFormFiles: (id: string, files: PickedFile[]) => void
  clearFormFile: (id: string) => void
  send: () => Promise<void>
  cancel: () => void
  newRequest: () => void
  createCollection: (name: string) => string
  renameCollection: (id: string, name: string) => void
  deleteCollection: (id: string) => void
  removeRequest: (collectionId: string, requestId: string) => void
  /** 复制请求并切换过去。 */
  duplicateRequest: (collectionId: string, requestId: string) => string | null
  saveCurrent: (name: string, collectionId: string) => void
  loadRequest: (collectionId: string, requestId: string) => void
  loadDraft: (draft: RequestDraft) => void
  deleteHistory: (id: string) => void
  /** 清空某个本地日历日的历史（日键见 historyDayKey）。 */
  deleteHistoryDay: (dayKey: string) => void
  clearHistory: () => void
  /** 调整历史上限，越界收敛，调小即裁旧记录。 */
  setHistoryLimit: (limit: number) => void
  setActiveRequestId: (id: string | null) => void
  /** 宿主推送快照时整体覆盖集合与历史（侧边栏与主面板共用宿主状态）。 */
  applyHostSnapshot: (snapshot: HostSnapshot) => void
}

/** 宿主（VS Code 扩展）推送的状态快照。 */
export type HostSnapshot = {
  collections: Collection[]
  history: HistoryEntry[]
  historyLimit: number
  activeRequestId?: string | null
}

function createKvRow(): KvRow {
  return { id: createId('kv'), key: '', value: '', enabled: true }
}

function createFormFieldRow(key = ''): FormFieldRow {
  return { id: createId('form'), key, enabled: true, kind: 'text', value: '', file: null }
}

function createDraft(): RequestDraft {
  return {
    id: createId('req'),
    name: '',
    method: 'GET',
    url: '',
    params: [createKvRow()],
    headers: [createKvRow()],
    bodyMode: 'none',
    bodyText: '',
    formFields: [],
    formData: []
  }
}

/** Params / Headers 至少保留一行空行（key 为空不进请求）。 */
function withDefaultRows(draft: RequestDraft): RequestDraft {
  const params = draft.params.length > 0 ? draft.params : [createKvRow()]
  const headers = draft.headers.length > 0 ? draft.headers : [createKvRow()]
  if (params === draft.params && headers === draft.headers) return draft
  return { ...draft, params, headers }
}

/** 补齐旧数据缺失的字段。 */
function normalizeDraft(input: RequestDraft): RequestDraft {
  return {
    ...input,
    params: input.params ?? [],
    headers: input.headers ?? [],
    bodyText: input.bodyText ?? '',
    formFields: input.formFields ?? [],
    formData: input.formData ?? []
  }
}

function cloneDraft(draft: RequestDraft): RequestDraft {
  const normalized = normalizeDraft(draft)
  return {
    id: normalized.id,
    name: normalized.name,
    method: normalized.method,
    url: normalized.url,
    params: normalized.params.map((row) => ({ ...row })),
    headers: normalized.headers.map((row) => ({ ...row })),
    bodyMode: normalized.bodyMode,
    bodyText: normalized.bodyText,
    formFields: normalized.formFields.map((row) => ({ ...row })),
    formData: normalized.formData.map((row) => ({
      ...row,
      file: row.file ? { ...row.file } : null
    }))
  }
}

/** 深拷贝请求：行换新 id，文件句柄转登记到新行。 */
function duplicateDraft(source: RequestDraft): RequestDraft {
  const normalized = normalizeDraft(source)

  return {
    id: createId('req'),
    name: normalized.name,
    method: normalized.method,
    url: normalized.url,
    params: normalized.params.map((row) => ({ ...row, id: createId('kv') })),
    headers: normalized.headers.map((row) => ({ ...row, id: createId('kv') })),
    bodyMode: normalized.bodyMode,
    bodyText: normalized.bodyText,
    formFields: normalized.formFields.map((row) => ({ ...row, id: createId('kv') })),
    formData: normalized.formData.map((row) => {
      const id = createId('form')
      const fileSource = getFileSource(row.id)
      if (fileSource && row.file) setFileSource(id, fileSource)
      return { ...row, id, file: row.file ? { ...row.file } : null }
    })
  }
}

/** 副本命名：原名 + 副本，重名追加序号。 */
function copyRequestName(base: string, existingNames: string[]): string {
  const language = getCurrentLanguage()
  const suffix = translate('store.copySuffix', language)
  const trimmed = base.trim() || translate('store.unnamedRequest', language)
  const markerText = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const marker = new RegExp(`\\s${markerText}(?:\\s\\d+)?$`)
  const root = marker.test(trimmed) ? trimmed.replace(marker, '') : trimmed

  let name = `${root} ${suffix}`
  let index = 2
  while (existingNames.includes(name)) {
    name = `${root} ${suffix} ${index}`
    index += 1
  }
  return name
}

/** 副本插在原请求之后，原请求不存在则置顶。 */
function insertRequestAfter(
  requests: SavedRequest[],
  afterId: string,
  record: SavedRequest
): SavedRequest[] {
  const index = requests.findIndex((request) => request.id === afterId)
  if (index < 0) return [record, ...requests]
  return [...requests.slice(0, index + 1), record, ...requests.slice(index + 1)]
}

function createCollectionRecord(name: string, requests: SavedRequest[] = []): Collection {
  const now = Date.now()
  return {
    id: createId('col'),
    name: name.trim() || translate('store.unnamedCollection', getCurrentLanguage()),
    requests,
    createdAt: now,
    updatedAt: now
  }
}

function withSectionRows(draft: RequestDraft, section: KvSection, rows: KvRow[]): RequestDraft {
  if (section === 'params') return { ...draft, params: rows }
  if (section === 'headers') return { ...draft, headers: rows }
  return { ...draft, formFields: rows }
}

const BODY_METHODS = ['POST', 'PUT', 'PATCH'] as const

/** 切到 POST / PUT / PATCH 时默认 JSON，仅在未配置过请求体时生效。 */
function withMethodBodyDefault(draft: RequestDraft, patch: DraftFieldPatch): RequestDraft {
  const next = { ...draft, ...patch }
  const toBodyMethod = BODY_METHODS.some((method) => method === next.method)
  const fromBodyMethod = BODY_METHODS.some((method) => method === draft.method)
  if (!toBodyMethod || fromBodyMethod) return next
  if (draft.bodyMode !== 'none' || draft.bodyText.trim()) return next
  return { ...next, bodyMode: 'json' }
}

/** 切到 form-data 且无字段时补一行空行。 */
function withFormDataDefault(draft: RequestDraft, patch: DraftFieldPatch): RequestDraft {
  if (patch.bodyMode !== 'form-data' || draft.formData.length > 0) return draft
  return { ...draft, formData: [createFormFieldRow()] }
}

function appendHistory(
  history: HistoryEntry[],
  entry: HistoryEntry,
  limit: number
): HistoryEntry[] {
  // 仅与最新一条比指纹：连续发同一请求只保留一条。
  const [latest] = history
  const duplicated = Boolean(entry.requestKey) && latest?.requestKey === entry.requestKey
  return [entry, ...(duplicated ? history.slice(1) : history)].slice(0, limit)
}

let sendSequence = 0
let activeController: AbortController | null = null

/** SSE 接收缓冲：分片按固定间隔合并进 store，避免逐分片渲染。 */
type StreamRuntime = {
  sequence: number
  parser: SseParser
  startedAt: number
  meta: StreamStartInfo | null
  /** 已合并进 store 的内容 */
  events: SseEventItem[]
  raw: string
  /** 待合并内容 */
  pendingEvents: SseEventItem[]
  pendingRaw: string
  receivedBytes: number
  truncated: boolean
  limitReached: boolean
  flushTimer: ReturnType<typeof setTimeout> | null
}

let streamRuntime: StreamRuntime | null = null

function disposeStreamRuntime(): void {
  if (streamRuntime?.flushTimer) clearTimeout(streamRuntime.flushTimer)
  streamRuntime = null
}

/** 终止进行中的连接，避免旧流写进新响应区。 */
function abortActiveRequest(): void {
  sendSequence += 1
  activeController?.abort()
  activeController = null
  disposeStreamRuntime()
}

function snapshotStream(runtime: StreamRuntime, patch: Partial<StreamState>): StreamState {
  const events =
    runtime.pendingEvents.length > 0 ? runtime.events.concat(runtime.pendingEvents) : runtime.events

  return {
    phase: 'ended',
    meta: runtime.meta,
    events,
    raw: runtime.raw + runtime.pendingRaw,
    truncated: runtime.truncated,
    limitReached: runtime.limitReached,
    durationMs: Date.now() - runtime.startedAt,
    sizeBytes: runtime.receivedBytes,
    ...patch
  }
}

/** 合并待展示内容；无新内容时不更新状态。 */
function flushStream(sequence: number): void {
  const runtime = streamRuntime
  if (!runtime || runtime.sequence !== sequence) return

  if (runtime.flushTimer) {
    clearTimeout(runtime.flushTimer)
    runtime.flushTimer = null
  }

  const nextEvents =
    runtime.pendingEvents.length > 0 ? runtime.events.concat(runtime.pendingEvents) : runtime.events
  const nextRaw = runtime.raw + runtime.pendingRaw
  const eventsChanged = nextEvents !== runtime.events
  const rawChanged = nextRaw !== runtime.raw
  if (!eventsChanged && !rawChanged) return

  runtime.events = nextEvents
  runtime.raw = nextRaw
  runtime.pendingEvents = []
  runtime.pendingRaw = ''

  const { events, raw, receivedBytes, truncated } = runtime
  const durationMs = Date.now() - runtime.startedAt

  useVscPostmanStore.setState((state) => {
    if (state.response.status !== 'stream') return {}
    return {
      response: {
        ...state.response,
        stream: {
          ...state.response.stream,
          events,
          raw,
          sizeBytes: receivedBytes,
          truncated,
          durationMs
        }
      }
    }
  })
}

function scheduleStreamFlush(sequence: number): void {
  const runtime = streamRuntime
  if (!runtime || runtime.sequence !== sequence || runtime.flushTimer) return

  runtime.flushTimer = setTimeout(() => {
    if (!streamRuntime || streamRuntime.sequence !== sequence) return
    streamRuntime.flushTimer = null
    flushStream(sequence)
  }, STREAM_FLUSH_INTERVAL_MS)
}

export const useVscPostmanStore = create<VscPostmanState>()(
  persist(
    (set, get) => ({
      draft: createDraft(),
      response: { status: 'idle' },
      collections: [],
      history: [],
      historyLimit: DEFAULT_HISTORY_LIMIT,
      activeRequestId: null,
      uploadProgress: null,

      setDraftField: (patch) =>
        set((state) => ({
          draft: withFormDataDefault(withMethodBodyDefault(state.draft, patch), patch)
        })),

      addRow: (section) =>
        set((state) => ({
          draft: withSectionRows(state.draft, section, [...state.draft[section], createKvRow()])
        })),

      updateRow: (section, id, patch) =>
        set((state) => ({
          draft: withSectionRows(
            state.draft,
            section,
            state.draft[section].map((row) => (row.id === id ? { ...row, ...patch } : row))
          )
        })),

      removeRow: (section, id) =>
        set((state) => ({
          draft: withSectionRows(
            state.draft,
            section,
            state.draft[section].filter((row) => row.id !== id)
          )
        })),

      toggleRow: (section, id) =>
        set((state) => ({
          draft: withSectionRows(
            state.draft,
            section,
            state.draft[section].map((row) =>
              row.id === id ? { ...row, enabled: !row.enabled } : row
            )
          )
        })),

      addFormRow: () =>
        set((state) => ({
          draft: { ...state.draft, formData: [...state.draft.formData, createFormFieldRow()] }
        })),

      updateFormRow: (id, patch) =>
        set((state) => ({
          draft: {
            ...state.draft,
            formData: state.draft.formData.map((row) => {
              if (row.id !== id) return row
              // 切回文本时清掉文件句柄
              if (patch.kind === 'text' && row.kind === 'file') {
                removeFileSource(row.id)
                return { ...row, ...patch, file: null }
              }
              return { ...row, ...patch }
            })
          }
        })),

      removeFormRow: (id) => {
        removeFileSource(id)
        set((state) => ({
          draft: {
            ...state.draft,
            formData: state.draft.formData.filter((row) => row.id !== id)
          }
        }))
      },

      toggleFormRow: (id) =>
        set((state) => ({
          draft: {
            ...state.draft,
            formData: state.draft.formData.map((row) =>
              row.id === id ? { ...row, enabled: !row.enabled } : row
            )
          }
        })),

      assignFormFiles: (id, files) => {
        if (files.length === 0) return

        const state = get()
        const index = state.draft.formData.findIndex((row) => row.id === id)
        if (index < 0) return

        const rows = [...state.draft.formData]
        const sourceKey = rows[index].key
        const extra: FormFieldRow[] = []

        files.forEach((picked, position) => {
          const targetId = position === 0 ? id : createId('form')
          const meta: FileMeta = {
            name: picked.name,
            size: picked.size,
            mimeType: picked.mimeType,
            ...(picked.path ? { path: picked.path } : {})
          }

          if (picked.file) {
            setFileSource(targetId, { kind: 'memory', file: picked.file })
          } else if (picked.path) {
            setFileSource(targetId, { kind: 'path', path: picked.path })
          }

          if (position === 0) {
            rows[index] = { ...rows[index], kind: 'file', file: meta }
          } else {
            extra.push({ ...createFormFieldRow(sourceKey), id: targetId, kind: 'file', file: meta })
          }
        })

        set({
          draft: {
            ...state.draft,
            formData: [...rows.slice(0, index + 1), ...extra, ...rows.slice(index + 1)]
          }
        })
      },

      clearFormFile: (id) => {
        removeFileSource(id)
        set((state) => ({
          draft: {
            ...state.draft,
            formData: state.draft.formData.map((row) =>
              row.id === id ? { ...row, file: null } : row
            )
          }
        }))
      },

      send: async () => {
        const state = get()
        if (isResponseActive(state.response)) return

        const draft = cloneDraft(state.draft)

        let prepared
        try {
          prepared = prepareRequest(draft)
        } catch (error) {
          const httpError = toHttpError(error)
          set((current) => {
            // 请求未真正发出，不写历史
            if (
              httpError.code === 'invalid-url' ||
              httpError.code === 'file-missing' ||
              httpError.code === 'unsupported'
            ) {
              return { response: { status: 'error', error: httpError } }
            }
            const entry: HistoryEntry = {
              id: createId('hist'),
              method: draft.method,
              url: draft.url,
              status: null,
              durationMs: 0,
              error: httpError.message,
              at: Date.now(),
              request: draft
            }
            return {
              response: { status: 'error', error: httpError },
              history: appendHistory(current.history, entry, current.historyLimit)
            }
          })
          return
        }

        sendSequence += 1
        const sequence = sendSequence
        activeController?.abort()
        disposeStreamRuntime()
        const controller = new AbortController()
        activeController = controller

        const startedAt = Date.now()
        const runtime: StreamRuntime = {
          sequence,
          parser: new SseParser(),
          startedAt,
          meta: null,
          events: [],
          raw: '',
          pendingEvents: [],
          pendingRaw: '',
          receivedBytes: 0,
          truncated: false,
          limitReached: false,
          flushTimer: null
        }
        streamRuntime = runtime

        set({ response: { status: 'loading' }, uploadProgress: null })

        // 达到展示上限：先落盘再断开。
        const stopByLimit = () => {
          if (runtime.limitReached) return
          runtime.limitReached = true
          runtime.truncated = true
          flushStream(sequence)
          controller.abort()
        }

        const handleChunk = (chunk: string, bytes: number) => {
          // 丢弃旧请求迟到的分片。
          if (sequence !== sendSequence || runtime.limitReached) return
          runtime.receivedBytes += bytes

          for (const item of runtime.parser.feed(chunk)) {
            if (runtime.events.length + runtime.pendingEvents.length >= MAX_STREAM_EVENTS) {
              stopByLimit()
              break
            }
            runtime.pendingEvents.push({
              ...item,
              index: runtime.events.length + runtime.pendingEvents.length,
              atMs: Date.now() - startedAt
            })
          }

          if (!runtime.limitReached) {
            const buffered = runtime.raw.length + runtime.pendingRaw.length
            if (buffered + chunk.length > MAX_STREAM_DISPLAY_BYTES) {
              const room = Math.max(0, MAX_STREAM_DISPLAY_BYTES - buffered)
              if (room > 0) runtime.pendingRaw += chunk.slice(0, room)
              stopByLimit()
            } else {
              runtime.pendingRaw += chunk
            }
          }

          if (!runtime.limitReached) scheduleStreamFlush(sequence)
        }

        try {
          const result = await getHttpTransport().send(prepared, {
            signal: controller.signal,
            requestId: createId('req'),
            onUploadProgress: (progress) => {
              if (sequence !== sendSequence) return
              set({ uploadProgress: progress })
            },
            onStreamStart: (info) => {
              if (sequence !== sendSequence || runtime.limitReached) return
              runtime.meta = info
              set({
                response: {
                  status: 'stream',
                  request: prepared,
                  stream: {
                    phase: 'open',
                    meta: info,
                    events: [],
                    raw: '',
                    truncated: false,
                    limitReached: false,
                    durationMs: Date.now() - startedAt,
                    sizeBytes: 0
                  }
                }
              })
            },
            onStreamChunk: handleChunk
          })
          if (sequence !== sendSequence) return

          if (!runtime.meta) {
            const entry: HistoryEntry = {
              id: createId('hist'),
              method: prepared.method,
              // 指纹用实际请求，不用跳转后的地址。
              requestKey: requestFingerprint(prepared),
              url: result.finalUrl ?? prepared.url,
              status: result.status,
              durationMs: result.durationMs,
              at: Date.now(),
              request: draft
            }

            set((current) => ({
              response: { status: 'success', result, request: prepared },
              uploadProgress: null,
              history: appendHistory(current.history, entry, current.historyLimit)
            }))
            return
          }

          const stream = snapshotStream(runtime, {
            phase: 'ended',
            durationMs: result.durationMs || Date.now() - startedAt,
            sizeBytes: result.sizeBytes || runtime.receivedBytes,
            truncated: runtime.truncated || result.truncated
          })
          const entry: HistoryEntry = {
            id: createId('hist'),
            method: prepared.method,
            requestKey: requestFingerprint(prepared),
            url: runtime.meta.finalUrl ?? prepared.url,
            status: result.status,
            durationMs: stream.durationMs,
            at: Date.now(),
            request: draft
          }

          set((current) => ({
            response: { status: 'stream', stream, request: prepared },
            uploadProgress: null,
            history: appendHistory(current.history, entry, current.historyLimit)
          }))
        } catch (error) {
          if (sequence !== sendSequence) return

          const httpError = toHttpError(error)

          // 已进入 SSE：保留事件，用 phase 表达结束原因。
          if (runtime.meta) {
            const aborted = httpError.code === 'aborted' && !runtime.limitReached

            const stream = snapshotStream(runtime, {
              phase: aborted ? 'aborted' : 'ended',
              durationMs: Date.now() - startedAt,
              sizeBytes: runtime.receivedBytes
            })

            if (aborted) {
              set({
                response: { status: 'stream', stream, request: prepared },
                uploadProgress: null
              })
              return
            }

            if (!runtime.limitReached) stream.error = httpError

            const entry: HistoryEntry = {
              id: createId('hist'),
              method: prepared.method,
              requestKey: requestFingerprint(prepared),
              url: runtime.meta.finalUrl ?? prepared.url,
              status: runtime.limitReached ? runtime.meta.status : null,
              durationMs: stream.durationMs,
              ...(runtime.limitReached ? {} : { error: httpError.message }),
              at: Date.now(),
              request: draft
            }

            set((current) => ({
              response: { status: 'stream', stream, request: prepared },
              uploadProgress: null,
              history: appendHistory(current.history, entry, current.historyLimit)
            }))
            return
          }

          if (httpError.code === 'aborted') {
            set({ response: { status: 'idle' }, uploadProgress: null })
            return
          }

          // 请求未发出，不写历史。
          if (httpError.code === 'permission-denied') {
            set({
              response: { status: 'error', error: httpError, request: prepared },
              uploadProgress: null
            })
            return
          }

          const entry: HistoryEntry = {
            id: createId('hist'),
            method: prepared.method,
            requestKey: requestFingerprint(prepared),
            url: prepared.url,
            status: null,
            durationMs: Date.now() - startedAt,
            error: httpError.message,
            at: Date.now(),
            request: draft
          }

          set((current) => ({
            response: { status: 'error', error: httpError, request: prepared },
            uploadProgress: null,
            history: appendHistory(current.history, entry, current.historyLimit)
          }))
        } finally {
          if (sequence === sendSequence) activeController = null
          if (streamRuntime?.sequence === sequence) disposeStreamRuntime()
        }
      },

      cancel: () => {
        const current = get()

        // SSE 已开始：只断开，保留已收事件。
        if (current.response.status === 'stream' && current.response.stream.phase === 'open') {
          activeController?.abort()
          return
        }

        sendSequence += 1
        activeController?.abort()
        activeController = null
        disposeStreamRuntime()
        set({ response: { status: 'idle' }, uploadProgress: null })
      },

      newRequest: () => {
        abortActiveRequest()
        set({ draft: createDraft(), response: { status: 'idle' }, uploadProgress: null })
      },

      createCollection: (name) => {
        const collection = createCollectionRecord(name)
        set((state) => ({ collections: [...state.collections, collection] }))
        return collection.id
      },

      renameCollection: (id, name) => {
        const trimmed = name.trim()
        if (!trimmed) return
        set((state) => ({
          collections: state.collections.map((collection) =>
            collection.id === id
              ? { ...collection, name: trimmed, updatedAt: Date.now() }
              : collection
          )
        }))
      },

      deleteCollection: (id) =>
        set((state) => ({
          collections: state.collections.filter((collection) => collection.id !== id)
        })),

      removeRequest: (collectionId, requestId) =>
        set((state) => ({
          collections: state.collections.map((collection) =>
            collection.id === collectionId
              ? {
                  ...collection,
                  requests: collection.requests.filter((request) => request.id !== requestId),
                  updatedAt: Date.now()
                }
              : collection
          )
        })),

      duplicateRequest: (collectionId, requestId) => {
        const state = get()
        const collection = state.collections.find((item) => item.id === collectionId)
        const source = collection?.requests.find((item) => item.id === requestId)
        if (!collection || !source) return null

        // 正在编辑的请求带上未保存的改动。
        const snapshot = state.draft.id === requestId ? state.draft : source
        const draft = duplicateDraft(snapshot)
        const now = Date.now()
        const baseName = snapshot.name.trim() || `${snapshot.method} ${snapshot.url}`.trim() || ''
        const record: SavedRequest = {
          ...draft,
          name: copyRequestName(
            baseName,
            collection.requests.map((request) => request.name)
          ),
          createdAt: now,
          updatedAt: now
        }

        abortActiveRequest()
        set({
          draft: { ...draft, name: record.name },
          response: { status: 'idle' },
          uploadProgress: null,
          collections: state.collections.map((item) =>
            item.id === collection.id
              ? {
                  ...item,
                  requests: insertRequestAfter(item.requests, requestId, record),
                  updatedAt: now
                }
              : item
          )
        })

        return record.id
      },

      saveCurrent: (name, collectionId) => {
        const state = get()
        const target = state.collections.find((collection) => collection.id === collectionId)
        if (!target) return

        const draft = cloneDraft(state.draft)
        const finalName =
          name.trim() ||
          draft.name.trim() ||
          `${draft.method} ${draft.url}`.trim() ||
          translate('store.unnamedRequest', getCurrentLanguage())
        const now = Date.now()

        let createdAt = now
        for (const collection of state.collections) {
          const existing = collection.requests.find((request) => request.id === draft.id)
          if (existing) {
            createdAt = existing.createdAt
            break
          }
        }

        const record: SavedRequest = {
          ...draft,
          name: finalName,
          createdAt,
          updatedAt: now
        }
        const isAlreadyInTarget = target.requests.some((request) => request.id === draft.id)

        set({
          draft: { ...state.draft, name: finalName },
          collections: state.collections.map((collection) => {
            if (collection.id === target.id) {
              return {
                ...collection,
                requests: isAlreadyInTarget
                  ? collection.requests.map((request) =>
                      request.id === draft.id ? record : request
                    )
                  : [record, ...collection.requests],
                updatedAt: now
              }
            }

            const containsRequest = collection.requests.some((request) => request.id === draft.id)
            if (!containsRequest) return collection

            return {
              ...collection,
              requests: collection.requests.filter((request) => request.id !== draft.id),
              updatedAt: now
            }
          })
        })
      },

      loadRequest: (collectionId, requestId) => {
        const collection = get().collections.find((item) => item.id === collectionId)
        const request = collection?.requests.find((item) => item.id === requestId)
        if (!request) return

        abortActiveRequest()
        set({
          draft: cloneDraft(normalizeDraft(request)),
          response: { status: 'idle' },
          uploadProgress: null
        })
      },

      loadDraft: (draft) => {
        abortActiveRequest()
        set({
          draft: withDefaultRows(cloneDraft(draft)),
          response: { status: 'idle' },
          uploadProgress: null
        })
      },

      deleteHistory: (id) =>
        set((state) => ({ history: state.history.filter((item) => item.id !== id) })),

      // 按整天过滤，搜索时也能清空当天。
      deleteHistoryDay: (dayKey) =>
        set((state) => ({
          history: state.history.filter((item) => historyDayKey(item.at) !== dayKey)
        })),

      clearHistory: () => set({ history: [] }),

      // 调小上限立即裁掉旧记录。
      setHistoryLimit: (limit) =>
        set((state) => {
          const nextLimit = clampHistoryLimit(limit)
          return {
            historyLimit: nextLimit,
            history: state.history.slice(0, nextLimit)
          }
        }),

      applyHostSnapshot: (snapshot) =>
        set((state) => ({
          collections: snapshot.collections,
          history: snapshot.history,
          historyLimit: clampHistoryLimit(snapshot.historyLimit),
          activeRequestId:
            snapshot.activeRequestId !== undefined
              ? snapshot.activeRequestId
              : state.activeRequestId,
          // 当前草稿可能已被宿主删除，保持原样即可（用户仍可重新保存）。
          draft: state.draft
        })),

      setActiveRequestId: (id) => set({ activeRequestId: id })
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => getStorageAdapter()),
      // Webview 的集合/历史由宿主快照填充（workspace.ready），不自行 hydrate。
      skipHydration: detectRuntime() === 'vscode-webview',
      // draft / response 属会话内临时状态，不落盘。
      partialize: (state) => ({
        collections: state.collections,
        history: state.history,
        historyLimit: state.historyLimit
      }),
      // 回填缺失的 historyLimit，并按上限裁剪历史。
      merge: (persisted, current) => {
        const next = { ...current, ...(persisted as Partial<VscPostmanState>) }
        const limit = clampHistoryLimit(next.historyLimit)
        return {
          ...next,
          historyLimit: limit,
          history: (next.history ?? []).slice(0, limit)
        }
      }
    }
  )
)

/**
 * VS Code Webview：订阅宿主通知。
 *
 * 侧边栏与主面板都是宿主的镜像，收到快照后只读（写入静音），
 * 避免与宿主互相触发持久化。
 */
export function installHostBridge(): () => void {
  if (detectRuntime() !== 'vscode-webview') return () => undefined

  // 拿到宿主快照前禁止回写，防首帧空状态覆盖 globalState。
  disarmStorage()

  const unsubscribe = onHostNotify((notify) => {
    const store = useVscPostmanStore.getState()

    switch (notify.event) {
      case 'workspace.changed':
        void withStorageMuted(() =>
          store.applyHostSnapshot({
            collections: notify.collections,
            history: notify.history,
            historyLimit: notify.historyLimit
          })
        )
        break
      case 'openRequest':
        store.loadDraft(notify.request)
        break
      case 'openHistory':
        store.loadDraft(notify.draft)
        break
      case 'newRequest':
        store.newRequest()
        break
      case 'activeRequest.changed':
        store.setActiveRequestId(notify.requestId)
        break
      case 'navigate':
        window.location.hash = notify.path.startsWith('#') ? notify.path : `#${notify.path}`
        break
      case 'settings.changed':
        void withStorageMuted(() => {
          store.setHistoryLimit(notify.historyLimit)
          useAppStore.getState().setLanguage(notify.language)
        })
        break
    }
  })

  // 启动时用宿主快照对齐：宿主是集合/历史的唯一来源。
  void announceWorkspaceReady()
    .then((snapshot) =>
      withStorageMuted(() => {
        useVscPostmanStore.getState().applyHostSnapshot({
          collections: snapshot.collections,
          history: snapshot.history,
          historyLimit: snapshot.historyLimit,
          activeRequestId: snapshot.activeRequestId
        })
        useAppStore.getState().setLanguage(snapshot.language)
      })
    )
    .then(() => armStorage())
    .catch(() => {
      // 宿主不可用时退回本地持久化，避免界面空白。
      armStorage()
      void useVscPostmanStore.persist.rehydrate()
    })

  // 侧边栏自身不驱动激活请求；主面板切换/保存草稿时同步给宿主。
  const isSidebarWebview =
    typeof document !== 'undefined' && document.body?.hasAttribute('data-vscode-sidebar') === true

  // 集合/历史/上限变化后主动推给宿主（宿主独占持久化并广播给其它 webview）。
  useVscPostmanStore.subscribe((state, prev) => {
    if (!isSidebarWebview && state.draft.id !== prev.draft.id) {
      const active = state.collections.some((collection) =>
        collection.requests.some((request) => request.id === state.draft.id)
      )
        ? state.draft.id
        : null
      void callHost('workspace.activeRequest', { requestId: active }).catch(() => undefined)
    }

    if (
      state.collections === prev.collections &&
      state.history === prev.history &&
      state.historyLimit === prev.historyLimit
    ) {
      return
    }
    if (isStorageMuted()) return
    void callHost('workspace.update', {
      collections: state.collections,
      history: state.history,
      historyLimit: state.historyLimit,
      draftId: state.draft.id
    }).catch(() => undefined)
  })

  return unsubscribe
}
