import { useEffect } from 'react'
import { AppSidebar } from '@/components/sidebar/app-sidebar'
import {
  duplicatePanelRequest,
  focusPanel,
  openPanelHistory,
  openPanelNewRequest,
  openPanelRequest,
  openPanelSettings
} from '@/services/bridge/vscode'
import { useAppStore } from '@/stores/app-store'
import { useVscPostmanStore } from '@/stores/http-store'

/** VS Code 侧边栏：只渲染共享侧边栏，动作全部转给宿主打开/聚焦主面板。 */
export function VscodeSidebar() {
  const language = useAppStore((state) => state.language)
  const activeRequestId = useVscPostmanStore((state) => state.activeRequestId)

  useEffect(() => {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN'
  }, [language])

  return (
    <div className="h-dvh overflow-hidden bg-sidebar text-sidebar-foreground">
      <AppSidebar
        onOpenWorkbench={() => void focusPanel().catch(() => undefined)}
        onOpenRequest={(collectionId, requestId) =>
          void openPanelRequest(collectionId, requestId).catch(() => undefined)
        }
        onOpenHistory={(entry) => void openPanelHistory(entry.id).catch(() => undefined)}
        onNewRequest={() => void openPanelNewRequest().catch(() => undefined)}
        onOpenSettings={() => void openPanelSettings().catch(() => undefined)}
        onDuplicateRequest={(collectionId, requestId) =>
          void duplicatePanelRequest(collectionId, requestId).catch(() => undefined)
        }
        showCollapse={false}
        overlayActions
        activeRequestId={activeRequestId}
      />
    </div>
  )
}
