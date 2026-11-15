import { detectRuntime } from '@/lib/runtime'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'vsc-postman:theme'

/** VS Code 内主题由工作台决定，扩展不提供切换。 */
function forcedThemeMode(): ThemeMode | null {
  return detectRuntime() === 'vscode-webview' ? 'system' : null
}

export function getStoredThemeMode(): ThemeMode {
  const forced = forcedThemeMode()
  if (forced) return forced

  try {
    const stored = globalThis.localStorage?.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // 存储不可用
  }
  return 'system'
}

export function storeThemeMode(mode: ThemeMode): void {
  if (forcedThemeMode()) return
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // 存储不可用
  }
}

function getVSCodeTheme(): ResolvedTheme | null {
  if (typeof document === 'undefined' || !document.body) return null
  const { classList } = document.body
  if (classList.contains('vscode-dark') || classList.contains('vscode-high-contrast')) {
    return 'dark'
  }
  if (classList.contains('vscode-light') || classList.contains('vscode-high-contrast-light')) {
    return 'light'
  }
  return null
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode !== 'system') return mode

  const vsCodeTheme = getVSCodeTheme()
  if (vsCodeTheme) return vsCodeTheme

  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

export function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode)
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'dark' ? '#191919' : '#ffffff')
  return resolved
}

/** 渲染前应用主题，减少首屏闪烁。 */
export function initializeTheme(): void {
  applyTheme(getStoredThemeMode())
}

/** system 模式：同时监听系统偏好与 Webview 的 body 主题类名。 */
export function watchTheme(
  mode: ThemeMode,
  onChange: (resolved: ResolvedTheme) => void
): () => void {
  if (mode !== 'system' || typeof window === 'undefined') return () => undefined

  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const handleChange = () => onChange(applyTheme(mode))

  media.addEventListener('change', handleChange)

  const observer = new MutationObserver(handleChange)
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })

  return () => {
    media.removeEventListener('change', handleChange)
    observer.disconnect()
  }
}
