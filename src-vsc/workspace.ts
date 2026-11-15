import { randomUUID } from 'node:crypto'
import * as vscode from 'vscode'
import type { Collection, HistoryEntry, PersistedEnvelope, SavedRequest } from './types'

/** 与 src/services/vsc-postman/constants.ts 保持一致（宿主侧独立编译，不复用前端常量）。 */
export const STORAGE_KEY = 'vsc-postman:state'
export const APP_STORAGE_KEY = 'vsc-postman:app'
export const DEFAULT_HISTORY_LIMIT = 50
export const MIN_HISTORY_LIMIT = 10
export const MAX_HISTORY_LIMIT = 500
export const HISTORY_LIMIT_OPTIONS = [20, 50, 100, 200, 500] as const

export type ChangeOrigin = 'host' | 'webview' | 'external'

function createId(prefix: string): string {
  return `${prefix}-${randomUUID()}`
}

function clampHistoryLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_HISTORY_LIMIT
  return Math.min(MAX_HISTORY_LIMIT, Math.max(MIN_HISTORY_LIMIT, Math.floor(value)))
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** 宽松校验：只丢弃结构明显错误的条目，尽量保住用户数据。 */
function parseCollections(raw: unknown): Collection[] {
  if (!Array.isArray(raw)) return []

  const collections: Collection[] = []
  for (const item of raw) {
    const record = asRecord(item)
    if (!record || typeof record.id !== 'string') continue
    const requests = Array.isArray(record.requests)
      ? record.requests.filter((request): request is SavedRequest => {
          const entry = asRecord(request)
          return Boolean(entry && typeof entry.id === 'string')
        })
      : []
    collections.push({
      id: record.id,
      name: typeof record.name === 'string' && record.name.trim() ? record.name : 'Untitled',
      requests,
      createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
      updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : Date.now()
    })
  }
  return collections
}

function parseHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return []

  return raw.filter((item): item is HistoryEntry => {
    const record = asRecord(item)
    if (!record) return false
    return (
      typeof record.id === 'string' &&
      typeof record.url === 'string' &&
      typeof record.method === 'string' &&
      typeof record.at === 'number'
    )
  })
}

/** 从持久化信封中取出集合与历史，与 webview 的 zustand persist 结构一致。 */
export function readEnvelope(envelope: PersistedEnvelope | null): {
  collections: Collection[]
  history: HistoryEntry[]
  historyLimit: number
} {
  const state = envelope?.state ?? {}
  return {
    collections: parseCollections(state.collections),
    history: parseHistory(state.history).slice(0, clampHistoryLimit(state.historyLimit)),
    historyLimit: clampHistoryLimit(state.historyLimit)
  }
}

/**
 * 宿主侧工作区模型：与两个 webview 共用同一个持久化信封（globalState 里的 JSON 字符串）。
 *
 * - 侧边栏/编辑器标签通过 `workspace.update` 写入后，宿主重新解析并广播快照；
 * - 设置页写入上限后写回同一信封，并通知两个 webview 重新对齐。
 */
export class WorkspaceModel implements vscode.Disposable {
  private collections: Collection[] = []
  private history: HistoryEntry[] = []
  private historyLimit: number = DEFAULT_HISTORY_LIMIT
  /** 上次广播的快照指纹：没有实质变化时不必重新解析/广播。 */
  private fingerprint = ''
  /** 上次解析过的原始 JSON：避免每次按键都整包 parse。 */
  private lastRaw: string | null = null
  private disposed = false

  constructor(private readonly context: vscode.ExtensionContext) {
    this.reload()
  }

  getCollections(): Collection[] {
    return this.collections
  }

  getHistory(): HistoryEntry[] {
    return this.history
  }

  getHistoryLimit(): number {
    return this.historyLimit
  }

  findRequest(
    collectionId: string,
    requestId: string
  ): { collection: Collection; request: SavedRequest } | null {
    const collection = this.collections.find((item) => item.id === collectionId)
    const request = collection?.requests.find((item) => item.id === requestId)
    if (!collection || !request) return null
    return { collection, request }
  }

  findHistoryEntry(id: string): HistoryEntry | null {
    return this.history.find((item) => item.id === id) ?? null
  }

  /** 从 globalState 重新解析（webview 写入后调用）。 */
  reload(origin: ChangeOrigin = 'external'): void {
    const raw = this.context.globalState.get<string>(STORAGE_KEY)
    let envelope: PersistedEnvelope | null = null
    if (typeof raw === 'string' && raw) {
      try {
        envelope = JSON.parse(raw) as PersistedEnvelope
      } catch {
        envelope = null
      }
    }

    this.lastRaw = typeof raw === 'string' ? raw : null
    this.assign(readEnvelope(envelope))
    if (origin === 'external') this.fingerprint = this.computeFingerprint()
  }

  private assign(parsed: {
    collections: Collection[]
    history: HistoryEntry[]
    historyLimit: number
  }): void {
    this.collections = parsed.collections
    this.history = parsed.history
    this.historyLimit = parsed.historyLimit
  }

  private computeFingerprint(): string {
    return JSON.stringify([this.collections, this.history, this.historyLimit])
  }

  /** 复制请求：紧跟原请求插入，返回副本（由调用方持久化/广播）。 */
  duplicateRequest(collectionId: string, requestId: string): SavedRequest | null {
    const found = this.findRequest(collectionId, requestId)
    if (!found) return null

    const source = found.request
    const now = Date.now()
    const copy: SavedRequest = {
      ...(JSON.parse(JSON.stringify(source)) as SavedRequest),
      id: createId('req'),
      name: nextCopyName(
        source.name ?? '',
        found.collection.requests.map((item) => item.name ?? '')
      ),
      createdAt: now,
      updatedAt: now
    }

    this.collections = this.collections.map((collection) => {
      if (collection.id !== collectionId) return collection
      const index = collection.requests.findIndex((item) => item.id === requestId)
      const at = index < 0 ? 0 : index + 1
      return {
        ...collection,
        updatedAt: now,
        requests: [...collection.requests.slice(0, at), copy, ...collection.requests.slice(at)]
      }
    })
    return copy
  }

  setHistoryLimit(limit: number): void {
    this.historyLimit = clampHistoryLimit(limit)
    this.history = this.history.slice(0, this.historyLimit)
  }

  /**
   * 合并外部来源的历史（目前用于 1.x 配置迁移）。
   *
   * - 同一时间戳已存在时视为同一条，不重复导入；
   * - 合并后按时间倒序，并按当前上限裁剪；
   * - 有新增时才写回 globalState，返回实际新增条数。
   */
  mergeHistory(entries: HistoryEntry[]): number {
    if (entries.length === 0) return 0

    const seen = new Set(this.history.map((item) => item.at))
    const added = entries.filter((item) => !seen.has(item.at))
    if (added.length === 0) return 0

    this.history = [...this.history, ...added]
      .sort((a, b) => b.at - a.at)
      .slice(0, this.historyLimit)
    this.persist()
    return added.length
  }

  /**
   * 合并 webview 推送的最新整体状态（侧边栏与编辑器标签都是写入方）。
   *
   * 草稿变更也会触发 webview 落盘，因此只在集合/历史真正变化时才刷新快照。
   */
  applyFromWebview(envelope: PersistedEnvelope | null, raw?: string): void {
    if (typeof raw === 'string') {
      // 内容与上次一致（草稿变更不影响集合/历史）时直接跳过解析。
      if (raw === this.lastRaw) return
      this.lastRaw = raw
    }

    const parsed = readEnvelope(envelope)
    const next = JSON.stringify([parsed.collections, parsed.history, parsed.historyLimit])
    if (next === this.fingerprint) return

    this.fingerprint = next
    this.assign(parsed)
    this.persist()
  }

  /**
   * 把宿主侧改动写回持久化信封，保留 webview 自己的其它字段。
   *
   * 同步写入：宿主写入频率低，而延迟写入会与 webview 的整包写入竞争，
   * 造成「刚改的配置被旧快照覆盖」。
   */
  commit(): void {
    if (this.disposed) return
    this.persist()
  }

  /** 写回持久化信封，保留 webview 自己的其它字段（如 version）。 */
  private persist(): void {
    if (this.disposed) return

    const raw = this.context.globalState.get<string>(STORAGE_KEY)
    let envelope: PersistedEnvelope = {}
    if (typeof raw === 'string' && raw) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') envelope = parsed as PersistedEnvelope
      } catch {
        envelope = {}
      }
    }

    envelope.state = {
      ...(envelope.state ?? {}),
      collections: this.collections,
      history: this.history,
      historyLimit: this.historyLimit
    }

    const serialized = JSON.stringify(envelope)
    this.fingerprint = this.computeFingerprint()
    this.lastRaw = serialized
    void this.context.globalState.update(STORAGE_KEY, serialized)
  }

  dispose(): void {
    this.disposed = true
  }
}

/** 与前端 copyRequestName 语义一致：追加「副本」并保证唯一。 */
function nextCopyName(base: string, existingNames: string[]): string {
  const suffix = vscode.env.language.startsWith('zh') ? '副本' : 'copy'
  const trimmed = base.trim() || 'Untitled'
  const marker = new RegExp(`\\s${suffix}(?:\\s\\d+)?$`)
  const root = marker.test(trimmed) ? trimmed.replace(marker, '') : trimmed

  let name = `${root} ${suffix}`
  let index = 2
  while (existingNames.includes(name)) {
    name = `${root} ${suffix} ${index}`
    index += 1
  }
  return name
}
