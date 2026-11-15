import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { getStorageAdapter } from '@/services/storage'
import { detectRuntime } from '@/lib/runtime'
import { setCurrentLanguage, type Language } from '@/lib/i18n'

const APP_STORAGE_KEY = 'vsc-postman:app'

/** 侧边栏宽度（px）。 */
export const SIDEBAR_MIN_WIDTH = 200
export const SIDEBAR_MAX_WIDTH = 480
export const SIDEBAR_DEFAULT_WIDTH = 240
/** 收起（窄轨道）状态下的侧边栏宽度（px），对应 w-14。 */
export const SIDEBAR_RAIL_WIDTH = 56
/** 越过 minSize 多少 px 触发折叠。 */
export const SIDEBAR_COLLAPSE_THRESHOLD = 8

type AppState = {
  sidebarCollapsed: boolean
  sidebarWidth: number
  /** 历史记录分栏是否已折叠。 */
  historyCollapsed: boolean
  language: Language
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setSidebarWidth: (width: number) => void
  setHistoryCollapsed: (collapsed: boolean) => void
  setLanguage: (language: Language) => void
}

type PersistedApp = {
  state?: {
    sidebarCollapsed?: unknown
    sidebarWidth?: unknown
    historyCollapsed?: unknown
    language?: unknown
  }
}

/** 首帧前同步读取折叠态与语言；异步适配器（webview）由 persist 稍后补齐。 */
function readInitialPersisted(): PersistedApp {
  try {
    const raw = globalThis.localStorage?.getItem(APP_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as PersistedApp
  } catch {
    return {}
  }
}

function readInitialCollapsed(): boolean {
  return readInitialPersisted().state?.sidebarCollapsed === true
}

function readInitialWidth(): number {
  const raw = readInitialPersisted().state?.sidebarWidth
  if (typeof raw === 'number' && raw >= SIDEBAR_MIN_WIDTH && raw <= SIDEBAR_MAX_WIDTH) return raw
  return SIDEBAR_DEFAULT_WIDTH
}

/** 收起侧边栏会卸载 AppSidebar，折叠态需入 store 才能保留。 */
function readInitialHistoryCollapsed(): boolean {
  return readInitialPersisted().state?.historyCollapsed === true
}

function readInitialLanguage(): Language {
  return readInitialPersisted().state?.language === 'en' ? 'en' : 'zh'
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarCollapsed: readInitialCollapsed(),
      sidebarWidth: readInitialWidth(),
      historyCollapsed: readInitialHistoryCollapsed(),
      language: readInitialLanguage(),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setSidebarWidth: (width) =>
        set({
          sidebarWidth: Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)))
        }),
      setHistoryCollapsed: (collapsed) => set({ historyCollapsed: collapsed }),
      setLanguage: (language) => set({ language })
    }),
    {
      name: APP_STORAGE_KEY,
      storage: createJSONStorage(() => getStorageAdapter()),
      // VS Code 下侧边栏与主面板共用 globalState：只持久化语言，避免互相覆盖布局字段。
      partialize: (state) =>
        detectRuntime() === 'vscode-webview'
          ? { language: state.language }
          : {
              sidebarCollapsed: state.sidebarCollapsed,
              sidebarWidth: state.sidebarWidth,
              historyCollapsed: state.historyCollapsed,
              language: state.language
            }
    }
  )
)

// 同步语言到 i18n 模块镜像与 <html lang>。
setCurrentLanguage(useAppStore.getState().language)
if (typeof document !== 'undefined') {
  document.documentElement.lang = useAppStore.getState().language === 'en' ? 'en' : 'zh-CN'
}

useAppStore.subscribe((state, prev) => {
  if (state.language === prev.language) return
  setCurrentLanguage(state.language)
  if (typeof document !== 'undefined') {
    document.documentElement.lang = state.language === 'en' ? 'en' : 'zh-CN'
  }
})
