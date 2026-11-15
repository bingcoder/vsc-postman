import React from 'react'
import ReactDOM from 'react-dom/client'
import { VscodeSidebar } from '@/components/sidebar/vscode-sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { initializeTheme } from '@/lib/theme'
import { installHostBridge } from '@/stores/http-store'
import '@/styles/globals.css'

initializeTheme()

// 侧边栏与主面板共用宿主快照，自己不做持久化。
installHostBridge()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TooltipProvider>
      <VscodeSidebar />
    </TooltipProvider>
  </React.StrictMode>
)
