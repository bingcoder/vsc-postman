import type { HistoryEntry, PreparedBody, PreparedRequest } from '@/types/http'
import {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  MIN_HISTORY_LIMIT
} from '@/services/vsc-postman/constants'

/** 收敛历史条数：非法值回退默认，小数取整。 */
export function clampHistoryLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_HISTORY_LIMIT
  return Math.min(MAX_HISTORY_LIMIT, Math.max(MIN_HISTORY_LIMIT, Math.floor(value)))
}

export type HistoryDayGroup = {
  key: string
  dayStart: number
  entries: HistoryEntry[]
}

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 本地日历日键；用日历日而非毫秒除法，避免时区/夏令时切成两天。 */
export function historyDayKey(timestamp: number): string {
  return dayKey(new Date(timestamp))
}

/** 请求指纹：取 prepareRequest 后的最终形态，忽略空行、禁用行与书写顺序。 */
export function requestFingerprint(request: PreparedRequest): string {
  const headers = Object.entries(request.headers)
    .map(([name, value]): [string, string] => [name.toLowerCase(), value])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

  return JSON.stringify([request.method, request.url, headers, describeBody(request.body)])
}

/** multipart 指纹只含字段名/文件名/大小/类型，不含路径与内容。 */
function describeBody(body: PreparedBody | undefined): unknown {
  if (!body) return null
  if (body.kind === 'text') return ['text', body.text]

  return [
    'form-data',
    body.parts.map((part) =>
      part.kind === 'text'
        ? ['text', part.name, part.value]
        : ['file', part.name, part.filename, part.size, part.contentType]
    )
  ]
}

/** 按本地日期分组，组间与组内均按时间倒序。 */
export function groupHistoryByDay(entries: HistoryEntry[]): HistoryDayGroup[] {
  const groups = new Map<string, HistoryDayGroup>()

  for (const entry of entries) {
    const date = new Date(entry.at)
    const key = historyDayKey(entry.at)
    let group = groups.get(key)

    if (!group) {
      group = {
        key,
        dayStart: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
        entries: []
      }
      groups.set(key, group)
    }

    group.entries.push(entry)
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      entries: [...group.entries].sort((a, b) => b.at - a.at)
    }))
    .sort((a, b) => b.dayStart - a.dayStart)
}
