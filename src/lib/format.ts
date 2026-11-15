import type { HttpMethod } from '@/types/http'
import { translate, getCurrentLanguage } from '@/lib/i18n'

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '-'
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`
}

export function formatTime(timestamp: number): string {
  const lang = getCurrentLanguage()
  return new Date(timestamp).toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN', { hour12: false })
}

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** 分组标题：今天 / 昨天 / 具体日期。 */
export function formatDayLabel(timestamp: number): string {
  const lang = getCurrentLanguage()
  const start = startOfLocalDay(timestamp)
  const now = new Date()
  const todayStart = startOfLocalDay(now.getTime())
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime()

  if (start === todayStart) return translate('history.group.today', lang)
  if (start === yesterdayStart) return translate('history.group.yesterday', lang)

  return new Date(timestamp).toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

/** 方法缩写（3 字母）。 */
export function methodAbbr(method: HttpMethod): string {
  return method.slice(0, 3)
}

export function methodTextTone(method: HttpMethod): string {
  switch (method) {
    case 'GET':
      return 'text-emerald-600 dark:text-emerald-400'
    case 'POST':
      return 'text-sky-600 dark:text-sky-400'
    case 'PUT':
      return 'text-amber-600 dark:text-amber-400'
    case 'PATCH':
      return 'text-violet-600 dark:text-violet-400'
    case 'DELETE':
      return 'text-red-600 dark:text-red-400'
    default:
      return 'text-muted-foreground'
  }
}

export function statusDotTone(status: number): string {
  if (status >= 200 && status < 300) return 'bg-emerald-500'
  if (status >= 300 && status < 400) return 'bg-amber-500'
  if (status >= 400 && status < 500) return 'bg-orange-500'
  if (status >= 500) return 'bg-red-500'
  return 'bg-muted-foreground'
}

export function statusTextTone(status: number): string {
  if (status >= 200 && status < 300) return 'text-emerald-600 dark:text-emerald-400'
  if (status >= 300 && status < 400) return 'text-amber-600 dark:text-amber-400'
  if (status >= 400 && status < 500) return 'text-orange-600 dark:text-orange-400'
  if (status >= 500) return 'text-red-600 dark:text-red-400'
  return 'text-muted-foreground'
}

export function summarizeRequest(request: {
  method: HttpMethod
  url: string
  name?: string
}): string {
  if (request.name?.trim()) return request.name.trim()
  if (!request.url.trim())
    return translate('format.requestSummary', getCurrentLanguage(), { method: request.method })

  try {
    const url = new URL(request.url)
    const path = url.pathname === '/' ? url.host : url.pathname
    return `${request.method} ${path}`
  } catch {
    return `${request.method} ${request.url}`
  }
}
