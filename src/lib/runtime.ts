export type RuntimeKind = 'web' | 'vscode-webview' | 'browser-extension'

type RuntimeGlobal = typeof globalThis & {
  acquireVsCodeApi?: () => unknown
  chrome?: {
    runtime?: {
      id?: string
    }
  }
}

export function detectRuntime(): RuntimeKind {
  const scope = globalThis as RuntimeGlobal
  if (typeof scope.acquireVsCodeApi === 'function') return 'vscode-webview'
  if (scope.chrome?.runtime?.id) return 'browser-extension'
  return 'web'
}
