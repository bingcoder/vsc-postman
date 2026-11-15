import { useEffect, useState } from 'react'
import { create } from 'zustand'
import {
  applyTheme,
  getStoredThemeMode,
  resolveTheme,
  storeThemeMode,
  watchTheme,
  type ResolvedTheme,
  type ThemeMode
} from '@/lib/theme'
import { detectRuntime } from '@/lib/runtime'

/** 主题模式全局共享，任一处切换所有消费处同步。 */
type ThemeStore = {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
  mode: getStoredThemeMode(),
  setMode: (mode) => {
    storeThemeMode(mode)
    set({ mode })
  }
}))

/** VS Code 内主题跟随工作台，切换接口降级为无操作。 */
const THEME_LOCKED = detectRuntime() === 'vscode-webview'

export function useTheme() {
  const storedMode = useThemeStore((state) => state.mode)
  const mode: ThemeMode = THEME_LOCKED ? 'system' : storedMode
  const setMode = useThemeStore((state) => state.setMode)
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(mode))

  useEffect(() => {
    setResolved(applyTheme(mode))
    return watchTheme(mode, setResolved)
  }, [mode])

  const toggle = () => {
    if (THEME_LOCKED) return
    setMode(resolved === 'dark' ? 'light' : 'dark')
  }

  const cycle = () => {
    if (THEME_LOCKED) return
    const order: ThemeMode[] = ['light', 'dark', 'system']
    const nextIndex = (order.indexOf(mode) + 1) % order.length
    setMode(order[nextIndex])
  }

  return { mode, resolved, isDark: resolved === 'dark', setMode, toggle, cycle }
}
