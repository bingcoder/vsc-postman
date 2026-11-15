import { createHashRouter } from 'react-router-dom'
import { AppLayout } from '@/components/layout/app-layout'
import { VscPostmanPage } from '@/pages/vsc-postman-page'
import { SettingsPage } from '@/pages/settings-page'
import { StoragePage } from '@/pages/storage-page'
import { NotFoundPage } from '@/pages/not-found-page'

// Webview / 扩展没有 History API 路径支持，用 HashRouter。
export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <VscPostmanPage /> },
      { path: 'vsc-postman', element: <VscPostmanPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'storage', element: <StoragePage /> },
      { path: '*', element: <NotFoundPage /> }
    ]
  }
])
