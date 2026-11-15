import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { PanelLeft, PanelLeftOpen, Settings2, SquarePen } from 'lucide-react'
import { Group, Panel, type PanelImperativeHandle } from 'react-resizable-panels'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { AppSidebar } from '@/components/sidebar/app-sidebar'
import { ResizeHandle } from '@/components/common/resize-handle'
import { cn } from '@/lib/utils'
import { useT } from '@/hooks/use-i18n'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { useIsVscode } from '@/hooks/use-runtime'
import {
  SIDEBAR_COLLAPSE_THRESHOLD,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_RAIL_WIDTH,
  useAppStore
} from '@/stores/app-store'
import { useVscPostmanStore } from '@/stores/http-store'

/** Web 外壳：把 store 动作与路由导航注入共享侧边栏。 */
function WebSidebar({
  onNavigate,
  overlayActions,
  showClose,
  showCollapse
}: {
  onNavigate: () => void
  overlayActions: boolean
  showClose?: boolean
  showCollapse?: boolean
}) {
  const navigate = useNavigate()
  const newRequest = useVscPostmanStore((state) => state.newRequest)
  const loadRequest = useVscPostmanStore((state) => state.loadRequest)
  const loadDraft = useVscPostmanStore((state) => state.loadDraft)
  const toggleSidebar = useAppStore((state) => state.toggleSidebar)

  const goToClient = () => {
    navigate('/vsc-postman')
    onNavigate()
  }

  return (
    <AppSidebar
      onOpenWorkbench={goToClient}
      onOpenRequest={(collectionId, requestId) => {
        loadRequest(collectionId, requestId)
        goToClient()
      }}
      onOpenHistory={(entry) => {
        loadDraft(entry.request)
        goToClient()
      }}
      onNewRequest={() => {
        newRequest()
        goToClient()
      }}
      onOpenSettings={() => {
        navigate('/settings')
        onNavigate()
      }}
      onClose={showClose ? onNavigate : undefined}
      onCollapse={showCollapse ? toggleSidebar : undefined}
      showCollapse={showCollapse}
      overlayActions={overlayActions}
    />
  )
}

/** 收起态的窄轨道。 */
function SidebarRail({ onNew, onExpand }: { onNew: () => void; onExpand: () => void }) {
  const { t } = useT()
  return (
    <div className="flex h-full flex-col items-center gap-1 py-3">
      <Tooltip content={t('sidebar.newRequest')}>
        <Button variant="ghost" size="icon" aria-label={t('sidebar.newRequest')} onClick={onNew}>
          <SquarePen />
        </Button>
      </Tooltip>
      <Tooltip content={t('sidebar.expand')}>
        <Button variant="ghost" size="icon" aria-label={t('sidebar.expand')} onClick={onExpand}>
          <PanelLeftOpen />
        </Button>
      </Tooltip>
      <Tooltip content={t('sidebar.settings')}>
        <Button variant="ghost" size="icon" asChild aria-label={t('sidebar.settings')}>
          <NavLink to="/settings">
            <Settings2 />
          </NavLink>
        </Button>
      </Tooltip>
    </div>
  )
}

/** 桌面外壳：常驻横向分栏；收起态以 zustand 为准并与 Panel 双向同步。 */
function DesktopShell({
  sidebarCollapsed,
  sidebarWidth,
  children
}: {
  sidebarCollapsed: boolean
  sidebarWidth: number
  children: React.ReactNode
}) {
  const setSidebarWidth = useAppStore((state) => state.setSidebarWidth)
  const setSidebarCollapsed = useAppStore((state) => state.setSidebarCollapsed)
  const handleNewRequest = useVscPostmanStore((state) => state.newRequest)
  const navigate = useNavigate()
  const { t } = useT()
  const sidebarPanelRef = useRef<PanelImperativeHandle | null>(null)

  // 收起态同步到 Panel。
  useEffect(() => {
    const api = sidebarPanelRef.current
    if (!api) return
    if (sidebarCollapsed) api.collapse()
    else api.expand()
  }, [sidebarCollapsed])

  const onNewRequest = () => {
    handleNewRequest()
    navigate('/vsc-postman')
  }

  /** 显式 resize 到持久化像素宽度（expand() 恢复的是百分比快照）。 */
  const expandSidebar = () => {
    setSidebarCollapsed(false)
    sidebarPanelRef.current?.resize(sidebarWidth)
  }

  return (
    <Group
      orientation="horizontal"
      className="h-dvh min-h-0"
      onLayoutChanged={(_layout, meta) => {
        // 仅用户交互且展开态时持久化像素宽度。
        if (!meta.isUserInteraction || sidebarCollapsed) return
        const size = sidebarPanelRef.current?.getSize()
        if (!size) return
        if (size.inPixels <= SIDEBAR_RAIL_WIDTH) return
        setSidebarWidth(size.inPixels)
      }}
    >
      <Panel
        id="sidebar"
        panelRef={sidebarPanelRef}
        collapsible
        collapsedSize={SIDEBAR_RAIL_WIDTH}
        collapsedThreshold={SIDEBAR_COLLAPSE_THRESHOLD}
        minSize={SIDEBAR_MIN_WIDTH}
        maxSize={SIDEBAR_MAX_WIDTH}
        defaultSize={sidebarWidth}
        // 保持像素宽度；过渡帧由 onResize 处理。
        groupResizeBehavior="preserve-pixel-size"
        className="overflow-hidden"
        onResize={(_panelSize, _id, prevPanelSize) => {
          // 跳过首次挂载，交由上方 effect 收敛。
          if (prevPanelSize === undefined) return
          // 按库的布局百分比判定（而非像素宽度），缩放过渡帧才稳定。
          const api = sidebarPanelRef.current
          if (!api) return
          const collapsedNow = api.isCollapsed()
          if (collapsedNow !== sidebarCollapsed) setSidebarCollapsed(collapsedNow)
        }}
      >
        <aside className="flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
          {sidebarCollapsed ? (
            <SidebarRail onNew={onNewRequest} onExpand={expandSidebar} />
          ) : (
            <WebSidebar onNavigate={() => {}} overlayActions showCollapse />
          )}
        </aside>
      </Panel>

      {/* 手柄常驻挂载：收起态下拖拽也能展开，且避免拖拽中卸载 Separator。 */}
      <ResizeHandle
        direction="horizontal"
        label={t('sidebar.resize')}
        thin
        disableReset
        onDoubleClick={() => {
          // 程序式 resize 不触发持久化，这里显式回写。
          sidebarPanelRef.current?.resize(SIDEBAR_DEFAULT_WIDTH)
          setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)
        }}
      />

      <Panel id="main" className="overflow-hidden">
        {children}
      </Panel>
    </Group>
  )
}

export function AppLayout() {
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
  const sidebarWidth = useAppStore((state) => state.sidebarWidth)
  const { t } = useT()
  const [mobileOpen, setMobileOpen] = useState(false)
  const isDesktop = useIsDesktop()
  // VS Code 侧边栏是独立 WebviewView，面板内不再渲染自绘侧栏。
  const isVscode = useIsVscode()

  useEffect(() => {
    if (!mobileOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileOpen])

  const mainContent = (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* VS Code 下集合/历史在 WebviewView 侧边栏，无需自绘头部。 */}
      {!isVscode && (
        <header className="sticky top-0 z-30 flex h-12 items-center gap-1 border-b border-border bg-background/90 px-2 backdrop-blur md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('sidebar.open')}
            onClick={() => setMobileOpen(true)}
          >
            <PanelLeft />
          </Button>
          <span className="text-sm font-semibold tracking-tight">vsc-postman</span>
        </header>
      )}

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  )

  return (
    <div
      className={cn(
        'bg-background text-foreground',
        isVscode ? 'h-dvh overflow-hidden' : 'min-h-screen md:h-dvh md:overflow-hidden'
      )}
    >
      {mobileOpen && (
        <button
          type="button"
          aria-label={t('sidebar.close')}
          className="fixed inset-0 z-40 cursor-pointer bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {!isDesktop && !isVscode && (
        <div className="flex min-h-screen">
          <aside
            className={cn(
              'fixed inset-y-0 left-0 z-50 flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 ease-out',
              mobileOpen ? 'translate-x-0' : '-translate-x-full'
            )}
          >
            <WebSidebar onNavigate={() => setMobileOpen(false)} overlayActions={false} showClose />
          </aside>
          {mainContent}
        </div>
      )}

      {isDesktop && !isVscode && (
        <DesktopShell sidebarCollapsed={sidebarCollapsed} sidebarWidth={sidebarWidth}>
          {mainContent}
        </DesktopShell>
      )}

      {isVscode && <div className="flex h-dvh min-h-0">{mainContent}</div>}
    </div>
  )
}
