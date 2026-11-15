import { useMemo, useState } from 'react'
import { ChevronRight, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { RequestTooltip } from '@/components/sidebar/request-tooltip'
import {
  formatDayLabel,
  formatTime,
  methodAbbr,
  methodTextTone,
  statusTextTone,
  summarizeRequest
} from '@/lib/format'
import { groupHistoryByDay } from '@/lib/history'
import { useT } from '@/hooks/use-i18n'
import { cn } from '@/lib/utils'
import type { HistoryEntry } from '@/types/http'

type HistoryListProps = {
  entries: HistoryEntry[]
  searchQuery: string
  /** 折叠时只渲染标题。 */
  collapsed: boolean
  /** 窄容器用覆盖式行尾操作，避免挤占标题。 */
  overlayActions: boolean
  onLoad: (entry: HistoryEntry) => void
  onDelete: (id: string) => void
  /** 清空某天（日键见 groupHistoryByDay）。 */
  onClearDay: (dayKey: string) => void
  onClear: () => void
}

type HistoryRowProps = {
  entry: HistoryEntry
  overlayActions: boolean
  onLoad: (entry: HistoryEntry) => void
  onDelete: (id: string) => void
}

function HistoryRow({ entry, overlayActions, onLoad, onDelete }: HistoryRowProps) {
  const { t } = useT()

  return (
    <li>
      <div className="group/history relative flex items-center gap-1 rounded-sm hover:bg-sidebar-accent">
        <RequestTooltip
          method={entry.method}
          url={entry.url}
          status={entry.status}
          time={formatTime(entry.at)}
          error={entry.error}
        >
          <Button
            type="button"
            variant="ghost"
            onClick={() => onLoad(entry)}
            aria-label={t('history.open', { name: summarizeRequest(entry.request) })}
            className="h-auto min-w-0 flex-1 justify-start gap-1.5 rounded-sm px-1.5 py-1 text-left hover:bg-transparent"
          >
            <span
              className={cn(
                'shrink-0 font-mono text-[10px] font-bold tabular-nums',
                methodTextTone(entry.method)
              )}
            >
              {methodAbbr(entry.method)}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">
              {summarizeRequest(entry.request)}
            </span>
            <span
              className={cn(
                'shrink-0 text-[11px] font-medium tabular-nums',
                entry.status !== null ? statusTextTone(entry.status) : 'text-destructive'
              )}
            >
              {entry.status ?? t('common.failed')}
            </span>
          </Button>
        </RequestTooltip>
        <div
          className={cn(
            'flex items-center gap-0.5 transition-opacity',
            overlayActions &&
              'absolute inset-y-0 right-0 bg-linear-to-l from-sidebar-accent via-sidebar-accent to-transparent pl-7 pr-1 pointer-events-none opacity-0 group-hover/history:pointer-events-auto group-hover/history:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100'
          )}
        >
          <Tooltip content={t('history.delete')}>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => onDelete(entry.id)}
              aria-label={t('history.delete')}
              className="text-muted-foreground hover:bg-background hover:text-destructive"
            >
              <Trash2 size={12} />
            </Button>
          </Tooltip>
        </div>
      </div>
    </li>
  )
}

export function HistoryList({
  entries,
  searchQuery,
  collapsed,
  overlayActions,
  onLoad,
  onDelete,
  onClearDay,
  onClear
}: HistoryListProps) {
  const { t } = useT()

  const groups = useMemo(() => groupHistoryByDay(entries), [entries])
  const newestKey = groups[0]?.key ?? null
  const isSearching = searchQuery.trim().length > 0

  // 只记用户手动切换的分组；默认搜索全展开，否则只展开最新一天。
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({})

  const isExpanded = (key: string) => expandedOverrides[key] ?? (isSearching || key === newestKey)

  const toggleGroup = (key: string) =>
    setExpandedOverrides((current) => ({ ...current, [key]: !isExpanded(key) }))

  return (
    <section aria-label={t('history.title')} className="flex h-full min-h-0 flex-col px-2">
      <div className="flex shrink-0 items-center justify-between gap-1 px-1.5 pb-1 pt-1.5">
        <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">
          {t('history.title')}
        </span>
        {!collapsed && (
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={onClear}
            disabled={entries.length === 0}
            className="h-auto shrink-0 px-0 text-xs text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            {t('history.clear')}
          </Button>
        )}
      </div>

      {!collapsed &&
        (entries.length === 0 ? (
          <p className="px-1.5 py-1.5 text-xs text-muted-foreground">
            {isSearching ? t('history.noMatch') : t('history.empty')}
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto pb-2">
            <div className="space-y-1">
              {groups.map((group) => {
                const expanded = isExpanded(group.key)
                const label = formatDayLabel(group.dayStart)

                return (
                  <div key={group.key}>
                    <div className="group/day relative flex items-center gap-1 rounded-sm hover:bg-sidebar-accent">
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.key)}
                        aria-expanded={expanded}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 px-1.5 py-1 text-left focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
                      >
                        <ChevronRight
                          size={12}
                          aria-hidden="true"
                          className={cn(
                            'shrink-0 text-subtle-foreground transition-transform duration-150',
                            expanded && 'rotate-90'
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
                          {label}
                        </span>
                        <span
                          aria-label={t('history.group.count', { count: group.entries.length })}
                          className="shrink-0 text-[11px] tabular-nums text-subtle-foreground"
                        >
                          {group.entries.length}
                        </span>
                      </button>

                      {/* 清空当天：桌面端 Hover 浮出，窄屏常驻。 */}
                      <div
                        className={cn(
                          'flex items-center gap-0.5 transition-opacity',
                          overlayActions &&
                            'absolute inset-y-0 right-0 bg-linear-to-l from-sidebar-accent via-sidebar-accent to-transparent pl-7 pr-1 pointer-events-none opacity-0 group-hover/day:pointer-events-auto group-hover/day:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100'
                        )}
                      >
                        <Tooltip content={t('history.group.clear', { date: label })}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => onClearDay(group.key)}
                            aria-label={t('history.group.clear', { date: label })}
                            className="text-muted-foreground hover:bg-background hover:text-destructive"
                          >
                            <Trash2 size={12} />
                          </Button>
                        </Tooltip>
                      </div>
                    </div>

                    {/* 左侧连接线与集合树一致 */}
                    {expanded && (
                      <ul className="mt-0.5 ml-4 space-y-0.5 border-l border-sidebar-border pl-1.5">
                        {group.entries.map((entry) => (
                          <HistoryRow
                            key={entry.id}
                            entry={entry}
                            overlayActions={overlayActions}
                            onLoad={onLoad}
                            onDelete={onDelete}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
    </section>
  )
}
