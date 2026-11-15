import { randomUUID } from 'node:crypto'
import * as vscode from 'vscode'
import type { HistoryEntry, HttpMethod, KvRow, RequestDraft } from './types'
import type { WorkspaceModel } from './workspace'

/**
 * 1.x → 2.0 数据迁移。
 *
 * 1.x 把历史存在 workspace 配置 `vscPostman.history` 里，元素是 JSON 字符串：
 *   { name, url, method, headers, body?, createTime, updateTime? }
 * 2.0 改为扩展 globalState 的 `vsc-postman:state`（zustand persist 信封）。
 *
 * 设计约束：
 * - 只跑一次：用 globalState 标记 `vsc-postman:migrated-legacy-history`；
 * - 单条失败只跳过，不整体失败；
 * - **不删除**老配置，保留回滚到 1.x 的可能；
 * - 无数据 / 读不到配置时也落标记，避免每次激活重复尝试。
 */

/** 与扩展宿主其它模块共用的常量；与前端 constants.ts 保持一致。 */
const LEGACY_HISTORY_KEY = 'vscPostman.history'
const LEGACY_SECTION = 'vscPostman'
const MIGRATION_MARKER_KEY = 'vsc-postman:migrated-legacy-history'

/** 1.x 历史项的形状（宽松解析，字段都可能缺失或类型不对）。 */
type LegacyHistoryItem = {
  name?: unknown
  url?: unknown
  method?: unknown
  headers?: unknown
  body?: unknown
  createTime?: unknown
  updateTime?: unknown
}

export type LegacyMigrationResult = {
  /** 老配置里解析出的合法条目数 */
  found: number
  /** 实际写入新存储的条数 */
  imported: number
  /** 解析或转换失败被跳过的条数 */
  skipped: number
  /** 迁移过程中出现的非致命错误 */
  errors: string[]
}

const EMPTY_RESULT: LegacyMigrationResult = { found: 0, imported: 0, skipped: 0, errors: [] }

const SUPPORTED_METHODS: readonly HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS'
]

/** 1.x 允许任意大小写，2.0 只接受大写枚举；未知方法统一退化为 GET。 */
function normalizeMethod(raw: unknown): HttpMethod {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase() : ''
  return (SUPPORTED_METHODS as readonly string[]).includes(value) ? (value as HttpMethod) : 'GET'
}

/** 1.x headers 可能是对象、JSON 字符串或空值，统一转成 2.0 的 kv 行。 */
function normalizeHeaders(raw: unknown): KvRow[] {
  let source: unknown = raw
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return []
    try {
      source = JSON.parse(text)
    } catch {
      // 非法 JSON：保留原文当一行提示，不丢用户数据。
      return [{ id: createRowId(), key: 'X-Legacy-Headers', value: raw, enabled: false }]
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return []

  return Object.entries(source as Record<string, unknown>)
    .map(([key, value]) => ({
      id: createRowId(),
      key,
      value: typeof value === 'string' ? value : String(value ?? ''),
      enabled: true
    }))
    .filter((row) => row.key.trim() !== '')
}

function createRowId(): string {
  return `kv-${randomUUID()}`
}

/** 从可能带 query 的 URL 推断一个可读名称。 */
function fallbackName(url: string): string {
  try {
    const { pathname } = new URL(url)
    if (pathname && pathname !== '/') return pathname
  } catch {
    // 非法 URL 交给下游校验，这里只做展示名
  }
  return url
}

type DraftBodyMode = 'none' | 'json' | 'text'

type NormalizedBody = {
  bodyMode: DraftBodyMode
  bodyText: string
  /** GET/HEAD 在 1.x 里把 body 当 query 用，迁移时还原成 params。 */
  params: KvRow[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text)
    return isPlainObject(value) ? value : null
  } catch {
    return null
  }
}

/** 嵌套/数组值无法安全展开成 query，返回 null 让调用方回退到 body。 */
function paramsFromObject(parsed: Record<string, unknown>): KvRow[] | null {
  const rows: KvRow[] = []
  for (const [key, value] of Object.entries(parsed)) {
    if (value === null || value === undefined) continue
    if (typeof value === 'object') return null
    rows.push({ id: createRowId(), key, value: String(value), enabled: true })
  }
  return rows.length > 0 ? rows : null
}

/**
 * 1.x 的 body 是面板里手填的字符串（校验器要求是 JSON 对象）。
 * GET/HEAD 在旧实现里被当作 query 参数发送（`params: JSON.parse(body)`），
 * 因此迁移时优先还原成 params；其它方法按 JSON / 文本落到 body。
 */
function normalizeBody(raw: unknown, method: HttpMethod): NormalizedBody {
  const text =
    typeof raw === 'string'
      ? raw
      : raw === undefined || raw === null
        ? ''
        : (JSON.stringify(raw) ?? '')
  const trimmed = text.trim()
  if (!trimmed) return { bodyMode: 'none', bodyText: '', params: [] }

  const parsed = parseJsonObject(trimmed)
  if (!parsed) return { bodyMode: 'text', bodyText: text, params: [] }

  if (method === 'GET' || method === 'HEAD') {
    const params = paramsFromObject(parsed)
    if (params) return { bodyMode: 'none', bodyText: '', params }
  }

  return { bodyMode: 'json', bodyText: text, params: [] }
}

/** 单条 1.x 历史 → 2.0 HistoryEntry；数据不足以重建时返回 null。 */
function convertItem(item: LegacyHistoryItem, index: number): HistoryEntry | null {
  const url = typeof item.url === 'string' ? item.url.trim() : ''
  if (!url) return null

  const timestampCandidates = [item.createTime, item.updateTime]
  const timestamp = timestampCandidates.find(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
  )
  const at = timestamp ?? Date.now() - index

  const name =
    typeof item.name === 'string' && item.name.trim() ? item.name.trim() : fallbackName(url)
  const method = normalizeMethod(item.method)
  const body = normalizeBody(item.body, method)

  // 其余字段按 2.0 的草稿形状补齐。
  const request: RequestDraft = {
    id: `legacy-${at}-${index}`,
    name,
    method,
    url,
    params: body.params,
    headers: normalizeHeaders(item.headers),
    bodyMode: body.bodyMode,
    bodyText: body.bodyText,
    formFields: [],
    formData: []
  }

  return {
    id: `legacy-${at}-${index}`,
    method,
    url,
    status: null,
    durationMs: 0,
    error: vscode.l10n.t('Imported from an older version; send again to see the response'),
    at,
    request
  }
}

function readLegacyHistory(): string[] {
  const raw = vscode.workspace.getConfiguration(LEGACY_SECTION).get<unknown>(LEGACY_HISTORY_KEY)
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is string => typeof item === 'string')
}

function parseItem(raw: string): LegacyHistoryItem | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as LegacyHistoryItem
  } catch {
    return null
  }
}

/** 纯转换：不碰存储，便于单测与复用。 */
export function convertLegacyHistory(rawItems: string[]): {
  entries: HistoryEntry[]
  skipped: number
} {
  const entries: HistoryEntry[] = []
  let skipped = 0

  rawItems.forEach((raw, index) => {
    const item = parseItem(raw)
    const entry = item ? convertItem(item, index) : null
    if (entry) entries.push(entry)
    else skipped += 1
  })

  return { entries, skipped }
}

/**
 * 执行一次性迁移。必须在宿主模型构造完成后、任何 webview 就绪之前调用，
 * 这样首个 `workspace.ready` 快照里就已经包含迁移后的历史。
 */
export function migrateLegacyHistory(
  context: vscode.ExtensionContext,
  model: WorkspaceModel
): LegacyMigrationResult {
  const errors: string[] = []

  try {
    if (context.globalState.get<boolean>(MIGRATION_MARKER_KEY) === true) {
      return EMPTY_RESULT
    }

    const rawItems = readLegacyHistory()
    if (rawItems.length === 0) {
      void context.globalState.update(MIGRATION_MARKER_KEY, true)
      return EMPTY_RESULT
    }

    const { entries, skipped } = convertLegacyHistory(rawItems)
    const imported = model.mergeHistory(entries)

    // 迁移完成才落标记：中途抛错时不标记，下次激活会重试（mergeHistory 自身可重入）。
    void context.globalState.update(MIGRATION_MARKER_KEY, true)

    return { found: entries.length, imported, skipped, errors }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    errors.push(message)
    console.warn('[vsc-postman] 旧版历史迁移失败：', message)
    return { found: 0, imported: 0, skipped: 0, errors }
  }
}
