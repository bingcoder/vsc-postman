import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  Check,
  CircleAlert,
  Copy,
  FileJson,
  Inbox,
  Loader2,
  SquareArrowOutUpRight
} from 'lucide-react'
import { Group, Panel, type Layout } from 'react-resizable-panels'
import { Button } from '@/components/ui/button'
import { ResizeHandle } from '@/components/common/resize-handle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip } from '@/components/ui/tooltip'
import { CodeEditor } from '@/components/ui/code-editor'
import { ScrollArea } from '@/components/ui/scroll-area'
import { copyText } from '@/lib/clipboard'
import { formatBytes, formatDuration, statusDotTone, statusTextTone } from '@/lib/format'
import { detectRuntime } from '@/lib/runtime'
import { formatEventData } from '@/lib/sse'
import { callHost } from '@/services/bridge/vscode'
import { MAX_STREAM_DISPLAY_BYTES } from '@/services/vsc-postman/constants'
import { cn } from '@/lib/utils'
import { useT } from '@/hooks/use-i18n'
import type {
  HttpErrorCode,
  PreparedRequest,
  ResponseState,
  SseEventItem,
  StreamState
} from '@/types/http'

type ResponseViewerProps = {
  response: ResponseState
}

/** 事件视图分栏的会话内布局，不持久化。 */
let eventPaneLayout: Layout | null = null

type ResponseTab = 'body' | 'headers' | 'request'
type StreamView = 'events' | 'raw'

export function ResponseViewer({ response }: ResponseViewerProps) {
  const { t } = useT()

  const errorLabel = (code: HttpErrorCode): string => {
    switch (code) {
      case 'invalid-url':
        return t('response.err.invalidUrl')
      case 'timeout':
        return t('response.err.timeout')
      case 'aborted':
        return t('response.err.aborted')
      case 'network':
        return t('response.err.network')
      case 'proxy-error':
        return t('response.err.proxyError')
      case 'unsupported':
        return t('response.err.unsupported')
      case 'file-missing':
        return t('response.err.fileMissing')
      case 'permission-denied':
        return t('response.err.permissionDenied')
    }
  }

  const [tab, setTab] = useState<ResponseTab>('body')
  const [streamView, setStreamView] = useState<StreamView>('events')
  const [copied, setCopied] = useState<'idle' | 'ok' | 'error'>('idle')
  const [showJump, setShowJump] = useState(false)

  const stream = response.status === 'stream' ? response.stream : null
  const result = response.status === 'success' ? response.result : null
  const requestData: PreparedRequest | undefined =
    response.status === 'success' || response.status === 'error' || response.status === 'stream'
      ? response.request
      : undefined

  const headers = result?.headers ?? stream?.meta?.headers ?? {}
  const bodyText = result?.bodyText ?? stream?.raw ?? null

  const canPretty = useMemo(() => {
    if (!bodyText) return false
    try {
      const parsed: unknown = JSON.parse(bodyText)
      return typeof parsed === 'object' && parsed !== null
    } catch {
      return false
    }
  }, [bodyText])

  const formattedBody = useMemo(() => {
    if (!bodyText) return ''
    if (!canPretty) return bodyText
    try {
      return JSON.stringify(JSON.parse(bodyText) as unknown, null, 2)
    } catch {
      return bodyText
    }
  }, [bodyText, canPretty])

  // SSE 原始视图不做 JSON 格式化，保持逐字节一致。
  const displayBody = stream ? (stream.raw ?? '') : formattedBody

  useEffect(() => {
    if (copied === 'idle') return
    const timer = setTimeout(() => setCopied('idle'), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const handleCopy = async () => {
    if (!bodyText) return
    const ok = await copyText(displayBody)
    setCopied(ok ? 'ok' : 'error')
  }

  const isVscode = detectRuntime() === 'vscode-webview'

  const handleOpenInVsCode = async () => {
    if (!bodyText) return
    try {
      await callHost<void>('response.open', { content: displayBody })
    } catch {
      // 宿主不可用，忽略
    }
  }

  // 贴底时自动跟随，向上翻阅时暂停。
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const followRef = useRef(true)

  const handleViewportScroll = useCallback(() => {
    const element = viewportRef.current
    if (!element) return
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 32
    followRef.current = nearBottom
    setShowJump(!nearBottom)
  }, [])

  const attachViewport = useCallback(
    (node: HTMLDivElement | null) => {
      if (viewportRef.current) {
        viewportRef.current.removeEventListener('scroll', handleViewportScroll)
      }
      viewportRef.current = node
      if (node) node.addEventListener('scroll', handleViewportScroll, { passive: true })
    },
    [handleViewportScroll]
  )

  const streamRawLength = stream?.raw.length ?? 0

  // 仅原始报文视图自动跟随，切换视图时重置。
  useEffect(() => {
    setShowJump(false)
    if (streamView !== 'raw') return
    followRef.current = true
    const element = viewportRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [streamView, tab])

  useEffect(() => {
    if (streamView !== 'raw' || !followRef.current) return
    const element = viewportRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
  }, [streamRawLength, streamView])

  const jumpToLatest = () => {
    const element = viewportRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
    followRef.current = true
    setShowJump(false)
  }

  const hasView = Boolean(result || stream)
  const showCopy = tab === 'body' && Boolean(bodyText)

  const status = result?.status ?? stream?.meta?.status
  const statusText = result?.statusText ?? stream?.meta?.statusText

  return (
    <section className="flex h-full min-h-0 flex-col rounded-md">
      {hasView && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-2 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <ToggleGroup
              aria-label={t('response.view')}
              value={[tab]}
              onValueChange={(value) => {
                const next = value[0]
                if (next === 'body' || next === 'headers' || next === 'request') setTab(next)
              }}
            >
              <ToggleGroupItem value="body">Body</ToggleGroupItem>
              <ToggleGroupItem value="headers">
                Headers ({Object.keys(headers).length})
              </ToggleGroupItem>
              {requestData && (
                <ToggleGroupItem value="request">{t('response.tab.request')}</ToggleGroupItem>
              )}
            </ToggleGroup>

            {stream && tab === 'body' && (
              <>
                <span aria-hidden="true" className="mx-0.5 h-3.5 w-px bg-border" />
                <ToggleGroup
                  aria-label={t('response.stream.view')}
                  value={[streamView]}
                  onValueChange={(value) => {
                    const next = value[0]
                    if (next === 'events' || next === 'raw') setStreamView(next)
                  }}
                >
                  <ToggleGroupItem value="events">
                    {t('response.stream.tab.events')}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="raw">{t('response.stream.tab.raw')}</ToggleGroupItem>
                </ToggleGroup>
                {showJump && (
                  <Button type="button" variant="ghost" size="sm" onClick={jumpToLatest}>
                    <ArrowDown /> {t('response.stream.jumpToBottom')}
                  </Button>
                )}
              </>
            )}

            {showCopy && (
              <>
                <Button type="button" variant="ghost" size="sm" onClick={handleCopy}>
                  {copied === 'ok' ? (
                    <>
                      <Check /> {t('common.copied')}
                    </>
                  ) : copied === 'error' ? (
                    <>
                      <CircleAlert /> {t('common.copyFailed')}
                    </>
                  ) : (
                    <>
                      <Copy /> {t('common.copy')}
                    </>
                  )}
                </Button>
                {isVscode && (
                  <Tooltip content={t('response.openInVscode')} side="bottom">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleOpenInVsCode}
                      aria-label={t('response.openInVscode')}
                    >
                      <SquareArrowOutUpRight /> {t('response.open')}
                    </Button>
                  </Tooltip>
                )}
              </>
            )}
          </div>

          {stream && (
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    stream.phase === 'open'
                      ? 'animate-pulse bg-emerald-500'
                      : stream.phase === 'aborted'
                        ? 'bg-subtle-foreground'
                        : 'bg-emerald-600/70'
                  )}
                  aria-hidden="true"
                />
                <span className="font-medium">{t(`response.stream.phase.${stream.phase}`)}</span>
              </span>

              {status !== undefined && (
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <span
                    className={cn('size-1.5 rounded-full', statusDotTone(status))}
                    aria-hidden="true"
                  />
                  <span className={cn('font-medium tabular-nums', statusTextTone(status))}>
                    {status} {statusText}
                  </span>
                </span>
              )}

              <span className="text-xs tabular-nums text-muted-foreground">
                {t('response.stream.events', { count: stream.events.length })} ·{' '}
                {formatDuration(stream.durationMs)} · {formatBytes(stream.sizeBytes)}
              </span>

              {stream.truncated && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400">
                  {t('response.truncated')}
                </span>
              )}
            </div>
          )}

          {result && (
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span
                  className={cn('size-1.5 rounded-full', statusDotTone(result.status))}
                  aria-hidden="true"
                />
                <span className={cn('font-medium tabular-nums', statusTextTone(result.status))}>
                  {result.status} {result.statusText}
                </span>
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatDuration(result.durationMs)} · {formatBytes(result.sizeBytes)}
              </span>
              {result.truncated && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400">
                  {t('response.truncated')}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1">
        {response.status === 'idle' && (
          <div className="flex h-full min-h-36 flex-col items-center justify-center gap-2 rounded-md px-2 py-2 text-center">
            <Inbox size={20} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('response.idle')}</p>
          </div>
        )}

        {response.status === 'loading' && (
          <div className="flex h-full min-h-36 flex-col items-center justify-center gap-3 rounded-md px-2 py-2 text-center">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('response.loading')}</p>
          </div>
        )}

        {response.status === 'error' && (
          <ScrollArea className="h-full">
            <div className="px-2 pb-2">
              <div className="space-y-2 rounded-md border border-destructive/20 p-2">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <CircleAlert size={15} />
                  {errorLabel(response.error.code)}
                </div>
                <p className="break-words text-sm text-foreground">{response.error.message}</p>
                {response.error.code === 'proxy-error' && (
                  <p className="text-xs text-muted-foreground">{t('response.tip.proxy')}</p>
                )}
              </div>
            </div>
          </ScrollArea>
        )}

        {response.status === 'stream' && stream && (
          <>
            {tab === 'body' && (
              <div className="flex h-full min-h-0 flex-col">
                {stream.error && (
                  <div className="mx-2 mb-2 flex items-start gap-2 rounded-md border border-destructive/20 px-3 py-2 text-xs">
                    <CircleAlert size={14} className="mt-0.5 shrink-0 text-destructive" />
                    <span className="break-words text-foreground">
                      <span className="font-medium text-destructive">
                        {errorLabel(stream.error.code)}
                      </span>
                      <span className="mx-1.5 text-subtle-foreground">·</span>
                      {stream.error.message}
                    </span>
                  </div>
                )}

                {stream.limitReached && (
                  <div className="mx-2 mb-2 rounded-md px-3 py-2 text-xs text-muted-foreground">
                    {t('response.stream.limitReached', {
                      size: formatBytes(MAX_STREAM_DISPLAY_BYTES)
                    })}
                  </div>
                )}

                <div className="min-h-0 flex-1">
                  {streamView === 'events' ? (
                    <SseEventView stream={stream} viewportRef={attachViewport} />
                  ) : (
                    <SseRawView stream={stream} viewportRef={attachViewport} />
                  )}
                </div>
              </div>
            )}

            {tab === 'headers' && (
              <ScrollArea className="h-full">
                <div className="px-2 pb-2">
                  {Object.keys(headers).length > 0 ? (
                    <ul className="divide-y divide-border overflow-hidden rounded-md border border-border text-xs">
                      {Object.entries(headers).map(([key, value]) => (
                        <li
                          key={key}
                          className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)] gap-3 px-3 py-2"
                        >
                          <span className="break-all font-medium text-muted-foreground">{key}</span>
                          <span className="whitespace-pre-wrap break-all font-mono">{value}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-md px-3 py-2 text-center text-xs text-muted-foreground">
                      {t('response.noHeaders')}
                    </p>
                  )}
                </div>
              </ScrollArea>
            )}

            {tab === 'request' && requestData && (
              <ScrollArea className="h-full">
                <div className="px-2 pb-2">
                  <RequestDetail request={requestData} />
                </div>
              </ScrollArea>
            )}
          </>
        )}

        {response.status === 'success' && result && (
          <>
            {tab === 'body' &&
              (bodyText !== null ? (
                <div className="h-full px-2 pb-2">
                  <CodeEditor
                    value={displayBody}
                    editable={false}
                    language={canPretty ? 'json' : 'text'}
                    placeholder={t('response.emptyBody')}
                    minHeight={0}
                    className="h-full"
                  />
                </div>
              ) : (
                <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 rounded-md px-2 py-2 text-center">
                  <FileJson size={18} className="text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {t('response.binary', { size: formatBytes(result.sizeBytes) })}
                  </p>
                </div>
              ))}

            {tab === 'headers' && (
              <ScrollArea className="h-full">
                <div className="px-2 pb-2">
                  {Object.keys(result.headers).length > 0 ? (
                    <ul className="divide-y divide-border overflow-hidden rounded-md border border-border text-xs">
                      {Object.entries(result.headers).map(([key, value]) => (
                        <li
                          key={key}
                          className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)] gap-3 px-3 py-2"
                        >
                          <span className="break-all font-medium text-muted-foreground">{key}</span>
                          <span className="whitespace-pre-wrap break-all font-mono">{value}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-md px-3 py-2 text-center text-xs text-muted-foreground">
                      {t('response.noHeaders')}
                    </p>
                  )}
                </div>
              </ScrollArea>
            )}

            {tab === 'request' && requestData && (
              <ScrollArea className="h-full">
                <div className="px-2 pb-2">
                  <RequestDetail request={requestData} />
                </div>
              </ScrollArea>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function SseEventView({
  stream,
  viewportRef
}: {
  stream: StreamState
  viewportRef: React.Ref<HTMLDivElement>
}) {
  const { t } = useT()
  // 记录「哪条流的第几条事件」，新流回到第一条。
  const [selection, setSelection] = useState<{
    meta: StreamState['meta']
    index: number
  } | null>(null)
  const detailRef = useRef<HTMLDivElement | null>(null)

  const events = stream.events
  const selectedIndex = selection && selection.meta === stream.meta ? selection.index : null
  const selected = events.find((event) => event.index === selectedIndex) ?? events[0] ?? null

  const metaRef = useRef(stream.meta)
  metaRef.current = stream.meta
  const handleSelect = useCallback((index: number) => {
    setSelection({ meta: metaRef.current, index })
  }, [])

  useEffect(() => {
    if (detailRef.current) detailRef.current.scrollTop = 0
  }, [selected?.index, stream.meta])

  if (events.length === 0) {
    return (
      <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 rounded-md px-2 py-2 text-center">
        {stream.phase === 'open' ? (
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        ) : (
          <Inbox size={18} className="text-muted-foreground" />
        )}
        <p className="text-sm text-muted-foreground">
          {stream.phase === 'open'
            ? t('response.stream.waiting')
            : stream.phase === 'aborted'
              ? t('response.stream.emptyAborted')
              : t('response.stream.empty')}
        </p>
      </div>
    )
  }

  return (
    <Group
      orientation="horizontal"
      className="h-full min-h-0"
      defaultLayout={eventPaneLayout ?? undefined}
      onLayoutChanged={(layout, meta) => {
        if (meta.isUserInteraction) eventPaneLayout = layout
      }}
    >
      <Panel
        id="sse-event-list"
        defaultSize="60"
        minSize={160}
        className="flex min-h-0 min-w-0 flex-col"
      >
        <div className="shrink-0 border-b border-border px-3 py-1.5 text-[11px] font-medium text-subtle-foreground">
          {t('response.stream.rawItems')}
        </div>
        <ScrollArea
          className="min-h-0 flex-1"
          viewportRef={viewportRef}
          aria-label={t('response.stream.eventsList')}
        >
          <ul className="divide-y divide-border">
            {events.map((event) => (
              <SseEventListItem
                key={event.index}
                event={event}
                selected={selected?.index === event.index}
                onSelect={handleSelect}
              />
            ))}
          </ul>
        </ScrollArea>
      </Panel>

      <ResizeHandle direction="horizontal" label={t('response.stream.resize')} />

      <Panel id="sse-event-detail" defaultSize="40" minSize={200} className="min-h-0 min-w-0">
        <ScrollArea className="h-full" viewportRef={detailRef}>
          {selected && <SseEventDetail event={selected} />}
        </ScrollArea>
      </Panel>
    </Group>
  )
}

/** 左侧原始项；用 event 引用做 memo，批量刷新时只渲染新增事件。 */
const SseEventListItem = memo(function SseEventListItem({
  event,
  selected,
  onSelect
}: {
  event: SseEventItem
  selected: boolean
  onSelect: (index: number) => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(event.index)}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'w-full cursor-pointer px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/25',
          selected ? 'bg-surface-selected' : 'hover:bg-muted/40'
        )}
      >
        <span className="mb-1 flex items-center gap-2 text-[11px] text-subtle-foreground">
          <span className="tabular-nums">#{event.index + 1}</span>
          {event.event !== undefined && <span className="truncate font-medium">{event.event}</span>}
          <span className="ml-auto shrink-0 tabular-nums">+{formatDuration(event.atMs)}</span>
        </span>
        <span className="line-clamp-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-foreground/90">
          {event.raw}
        </span>
      </button>
    </li>
  )
})

const SseEventDetail = memo(function SseEventDetail({ event }: { event: SseEventItem }) {
  const { t } = useT()
  const data = useMemo(() => formatEventData(event.data), [event.data])
  const eventName = event.event ?? 'message'

  return (
    <div className="px-2 py-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {t('response.stream.parsed')}
        </span>
        <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground">
          {eventName}
        </span>
        <span className="ml-auto text-[11px] tabular-nums text-subtle-foreground">
          #{event.index + 1} · +{formatDuration(event.atMs)}
        </span>
      </div>

      <dl className="mb-4 grid grid-cols-[minmax(0,72px)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">{t('response.stream.field.event')}</dt>
        <dd className="break-all font-mono">{eventName}</dd>
        {event.id !== undefined && (
          <>
            <dt className="text-muted-foreground">{t('response.stream.field.id')}</dt>
            <dd className="break-all font-mono">{event.id}</dd>
          </>
        )}
        {event.retry !== undefined && (
          <>
            <dt className="text-muted-foreground">{t('response.stream.field.retry')}</dt>
            <dd className="font-mono tabular-nums">{event.retry} ms</dd>
          </>
        )}
      </dl>

      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        {t('response.stream.field.data')}
      </p>
      {data ? (
        <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-foreground">
          {data}
        </pre>
      ) : (
        <p className="rounded-md px-3 py-2 text-xs text-muted-foreground">
          {t('response.stream.emptyData')}
        </p>
      )}
    </div>
  )
})

function SseRawView({
  stream,
  viewportRef
}: {
  stream: StreamState
  viewportRef: React.Ref<HTMLDivElement>
}) {
  const { t } = useT()

  if (!stream.raw) {
    return (
      <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 rounded-md px-2 py-2 text-center">
        {stream.phase === 'open' ? (
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        ) : (
          <Inbox size={18} className="text-muted-foreground" />
        )}
        <p className="text-sm text-muted-foreground">
          {stream.phase === 'open' ? t('response.stream.waiting') : t('response.stream.rawEmpty')}
        </p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full" viewportRef={viewportRef}>
      <pre className="px-2 pb-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
        {stream.raw}
      </pre>
    </ScrollArea>
  )
}

function RequestDetail({ request }: { request: PreparedRequest }) {
  const { t } = useT()
  const headerEntries = Object.entries(request.headers)
  const body = request.body
  const bodyTextValue = body?.kind === 'text' ? body.text : null
  const bodyParts = body?.kind === 'form-data' ? body.parts : null

  const displayBody = useMemo(() => {
    if (!bodyTextValue) return ''
    try {
      const parsed: unknown = JSON.parse(bodyTextValue)
      if (typeof parsed === 'object' && parsed !== null) {
        return JSON.stringify(parsed, null, 2)
      }
    } catch {
      // 非 JSON
    }
    return bodyTextValue
  }, [bodyTextValue])

  const isJsonBody = useMemo(() => {
    if (!bodyTextValue) return false
    try {
      const parsed: unknown = JSON.parse(bodyTextValue)
      return typeof parsed === 'object' && parsed !== null
    } catch {
      return false
    }
  }, [bodyTextValue])

  return (
    <div className="space-y-3 text-xs">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 rounded-md border border-border px-3 py-2.5">
        <dt className="whitespace-nowrap font-medium text-muted-foreground">
          {t('response.request.method')}
        </dt>
        <dd className="flex items-center gap-1.5">
          <span className="font-semibold">{request.method}</span>
        </dd>
        <dt className="whitespace-nowrap font-medium text-muted-foreground">
          {t('response.request.url')}
        </dt>
        <dd className="break-all font-mono">{request.url}</dd>
      </dl>

      <div className="space-y-1.5">
        <p className="font-medium text-muted-foreground">{t('response.request.headers')}</p>
        {headerEntries.length > 0 ? (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {headerEntries.map(([key, value]) => (
              <li
                key={key}
                className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)] gap-3 px-3 py-2"
              >
                <span className="break-all font-medium text-muted-foreground">{key}</span>
                <span className="whitespace-pre-wrap break-all font-mono">{value}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md px-3 py-2 text-center text-muted-foreground">
            {t('response.request.noHeaders')}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="font-medium text-muted-foreground">{t('response.request.body')}</p>
        {bodyTextValue ? (
          <CodeEditor
            value={displayBody}
            editable={false}
            language={isJsonBody ? 'json' : 'text'}
            minHeight={0}
            className="min-h-32"
          />
        ) : bodyParts && bodyParts.length > 0 ? (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {bodyParts.map((part, index) => (
              <li
                key={`${part.name}-${index}`}
                className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-3 px-3 py-2"
              >
                <span className="break-all font-medium text-muted-foreground">{part.name}</span>
                <span className="break-all font-mono">
                  {part.kind === 'text'
                    ? part.value
                    : `${part.filename} · ${formatBytes(part.size)}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md px-3 py-2 text-center text-muted-foreground">
            {t('response.request.noBody')}
          </p>
        )}
      </div>
    </div>
  )
}
