import { useEffect, useMemo, useRef, useState } from 'react'
import { PanelLeftClose, Search, Settings2, SquarePen, X } from 'lucide-react'
import { Group, Panel, type Layout, type PanelImperativeHandle } from 'react-resizable-panels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip } from '@/components/ui/tooltip'
import { ResizeHandle } from '@/components/common/resize-handle'
import { CollectionTree } from '@/components/sidebar/collection-tree'
import { HistoryList } from '@/components/sidebar/history-list'
import { useT } from '@/hooks/use-i18n'
import { createPanelLayoutStore } from '@/lib/panel-layout-store'
import { useAppStore } from '@/stores/app-store'
import { useVscPostmanStore } from '@/stores/http-store'
import type { HistoryEntry } from '@/types/http'

/** 集合 / 历史分栏布局键。 */
const SIDEBAR_SECTIONS_LAYOUT_KEY = 'vsc-postman:sidebar-sections-layout'

/** 历史折叠后的高度（px），须小于 Panel 的 minSize。 */
const HISTORY_COLLAPSED_HEIGHT = 32

type AppSidebarProps = {
  onOpenWorkbench: () => void
  onOpenRequest: (collectionId: string, requestId: string) => void
  onOpenHistory: (entry: HistoryEntry) => void
  onNewRequest: () => void
  onOpenSettings: () => void
  /** 宿主侧复制并打开新标签；不传时走本地复制（Web）。 */
  onDuplicateRequest?: (collectionId: string, requestId: string) => void
  /** 移动端抽屉的关闭按钮；桌面外壳不传。 */
  onClose?: () => void
  /** 桌面外壳的收起按钮；VS Code 侧边栏不传。 */
  onCollapse?: () => void
  showCollapse?: boolean
  /** 窄容器（VS Code 侧边栏）用覆盖式行尾操作，避免挤占标题。 */
  overlayActions?: boolean
  activeRequestId?: string | null
}

export function AppSidebar({
  onOpenWorkbench,
  onOpenRequest,
  onOpenHistory,
  onNewRequest,
  onOpenSettings,
  onDuplicateRequest,
  onClose,
  onCollapse,
  showCollapse = true,
  overlayActions = true,
  activeRequestId
}: AppSidebarProps) {
  const collections = useVscPostmanStore((state) => state.collections)
  const history = useVscPostmanStore((state) => state.history)
  const draftId = useVscPostmanStore((state) => state.draft.id)
  const createCollection = useVscPostmanStore((state) => state.createCollection)
  const renameCollection = useVscPostmanStore((state) => state.renameCollection)
  const deleteCollection = useVscPostmanStore((state) => state.deleteCollection)
  const removeRequest = useVscPostmanStore((state) => state.removeRequest)
  const duplicateRequest = useVscPostmanStore((state) => state.duplicateRequest)
  const deleteHistory = useVscPostmanStore((state) => state.deleteHistory)
  const deleteHistoryDay = useVscPostmanStore((state) => state.deleteHistoryDay)
  const clearHistory = useVscPostmanStore((state) => state.clearHistory)
  const { t } = useT()

  const [query, setQuery] = useState('')

  const sectionLayoutStore = useMemo(() => createPanelLayoutStore(SIDEBAR_SECTIONS_LAYOUT_KEY), [])
  const defaultSectionLayout = useMemo<Layout | undefined>(
    () => sectionLayoutStore.read() ?? undefined,
    [sectionLayoutStore]
  )

  // 折叠态存 store：侧边栏收起会卸载 AppSidebar。
  const historyCollapsed = useAppStore((state) => state.historyCollapsed)
  const setHistoryCollapsed = useAppStore((state) => state.setHistoryCollapsed)
  const historyPanelRef = useRef<PanelImperativeHandle | null>(null)

  useEffect(() => {
    const api = historyPanelRef.current
    if (!api) return
    if (historyCollapsed) api.collapse()
    else api.expand()
  }, [historyCollapsed])

  const resolvedActiveRequestId = useMemo(() => {
    if (activeRequestId !== undefined) {
      if (!activeRequestId) return null
      return collections.some((collection) =>
        collection.requests.some((request) => request.id === activeRequestId)
      )
        ? activeRequestId
        : null
    }

    for (const collection of collections) {
      if (collection.requests.some((request) => request.id === draftId)) return draftId
    }
    return null
  }, [activeRequestId, collections, draftId])

  const normalizedQuery = query.trim().toLowerCase()

  const filteredCollections = useMemo(() => {
    if (!normalizedQuery) return collections

    return collections
      .map((collection) => {
        const collectionMatches = collection.name.toLowerCase().includes(normalizedQuery)
        const requests = collectionMatches
          ? collection.requests
          : collection.requests.filter((request) =>
              [request.name, request.url, request.method].some((value) =>
                value.toLowerCase().includes(normalizedQuery)
              )
            )

        return { ...collection, requests }
      })
      .filter(
        (collection) =>
          collection.name.toLowerCase().includes(normalizedQuery) || collection.requests.length > 0
      )
  }, [collections, normalizedQuery])

  const filteredHistory = useMemo(() => {
    if (!normalizedQuery) return history

    return history.filter((entry) =>
      [entry.url, entry.method, entry.request.name ?? ''].some((value) =>
        value.toLowerCase().includes(normalizedQuery)
      )
    )
  }, [history, normalizedQuery])

  const handleDuplicateRequest = (collectionId: string, requestId: string) => {
    if (onDuplicateRequest) {
      onDuplicateRequest(collectionId, requestId)
      return
    }
    if (!duplicateRequest(collectionId, requestId)) return
    onOpenWorkbench()
  }

  const handleLoadHistory = (entry: HistoryEntry) => {
    onOpenHistory(entry)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-1.5 pb-1 pt-1.5">
        <div className="min-w-0 flex-1 truncate px-1 text-sm font-semibold tracking-wide text-muted-foreground">
          vsc-postman
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Tooltip content={t('sidebar.settings')}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('sidebar.settings')}
              onClick={onOpenSettings}
            >
              <Settings2 />
            </Button>
          </Tooltip>
          {onClose && (
            <Tooltip content={t('sidebar.close')}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('sidebar.close')}
                onClick={onClose}
              >
                <X />
              </Button>
            </Tooltip>
          )}
          {showCollapse && onCollapse && (
            <Tooltip content={t('sidebar.collapse')}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('sidebar.collapse')}
                onClick={onCollapse}
              >
                <PanelLeftClose />
              </Button>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="px-2 py-1.5">
        <Button
          type="button"
          variant="soft"
          className="h-8 w-full justify-start gap-2 rounded-md px-2 text-sm font-normal"
          aria-label={t('sidebar.newRequest')}
          onClick={onNewRequest}
        >
          <SquarePen /> {t('sidebar.newRequest')}
        </Button>
      </div>

      <div className="px-2 pb-1.5">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('sidebar.search')}
            aria-label={t('sidebar.search')}
            className="h-8 w-full rounded-md border border-transparent bg-sidebar-accent/60 pl-9 pr-8 text-sm shadow-none outline-none transition-colors placeholder:text-subtle-foreground focus:border-transparent focus:bg-background focus-visible:ring-2 focus-visible:ring-focus/20"
          />
          {query.length > 0 && (
            <Tooltip content={t('sidebar.clearSearch')}>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setQuery('')}
                aria-label={t('sidebar.clearSearch')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              >
                <X size={13} />
              </Button>
            </Tooltip>
          )}
        </div>
      </div>

      <Group
        orientation="vertical"
        className="min-h-0 flex-1"
        defaultLayout={defaultSectionLayout}
        onLayoutChanged={(layout, meta) => {
          // 仅持久化用户操作。
          if (!meta.isUserInteraction) return
          // 折叠态不持久化。
          if (historyPanelRef.current?.isCollapsed()) return
          sectionLayoutStore.write(layout)
        }}
      >
        <Panel id="collections" minSize={80} className="overflow-hidden">
          <CollectionTree
            collections={filteredCollections}
            activeRequestId={resolvedActiveRequestId}
            searchQuery={query}
            overlayActions={overlayActions}
            onLoadRequest={onOpenRequest}
            onRemoveRequest={removeRequest}
            onDuplicateRequest={handleDuplicateRequest}
            onCreateCollection={createCollection}
            onRenameCollection={renameCollection}
            onDeleteCollection={deleteCollection}
          />
        </Panel>

        <ResizeHandle direction="vertical" label={t('sidebar.resizeSections')} className="h-2" />

        <Panel
          id="history"
          panelRef={historyPanelRef}
          collapsible
          collapsedSize={HISTORY_COLLAPSED_HEIGHT}
          collapsedThreshold={8}
          minSize={80}
          defaultSize="45"
          // 保持像素高度，折叠后不会随容器缩放变大。
          groupResizeBehavior="preserve-pixel-size"
          className="overflow-hidden"
          onResize={(_panelSize, _id, prevPanelSize) => {
            // 首次挂载不同步，交由上方 effect 收敛。
            if (prevPanelSize === undefined) return
            const api = historyPanelRef.current
            if (!api) return
            const collapsedNow = api.isCollapsed()
            if (collapsedNow !== historyCollapsed) setHistoryCollapsed(collapsedNow)
          }}
        >
          <HistoryList
            entries={filteredHistory}
            searchQuery={query}
            collapsed={historyCollapsed}
            overlayActions={overlayActions}
            onLoad={handleLoadHistory}
            onDelete={deleteHistory}
            onClearDay={deleteHistoryDay}
            onClear={clearHistory}
          />
        </Panel>
      </Group>
    </div>
  )
}
