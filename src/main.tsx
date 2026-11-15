import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initializeTheme } from '@/lib/theme'
import { useAppStore } from '@/stores/app-store'
import { installHostBridge } from '@/stores/http-store'
import '@/styles/globals.css'

initializeTheme()

// VS Code Webview：接上宿主通知（原生树视图驱动集合/历史）。
installHostBridge()

// 渲染前定语言，避免首帧闪烁。
if (typeof document !== 'undefined') {
  document.documentElement.lang = useAppStore.getState().language === 'en' ? 'en' : 'zh-CN'
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
