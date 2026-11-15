import { useMemo } from 'react'
import { detectRuntime, type RuntimeKind } from '@/lib/runtime'

/** 运行时判定只做一次：webview 中不会切换。 */
export function useRuntime(): RuntimeKind {
  return useMemo(() => detectRuntime(), [])
}

/** VS Code Webview 下隐藏自绘侧边栏与底部条。 */
export function useIsVscode(): boolean {
  return useRuntime() === 'vscode-webview'
}
