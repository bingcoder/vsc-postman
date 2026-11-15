import { detectRuntime } from '@/lib/runtime'
import { ChromeTransport } from '@chrome/chrome-transport'
import { DEV_PROXY_PATH } from './constants'
import { DevProxyTransport } from './dev-proxy-transport'
import { FetchTransport } from './fetch-transport'
import type { HttpTransport } from './transport'
import { VscodeTransport } from './vscode-transport'

let instance: HttpTransport | null = null

/** 按运行时选择通道：Webview 走宿主，扩展走 Service Worker，其余走代理或直连。 */
export function createHttpTransport(): HttpTransport {
  const runtime = detectRuntime()
  if (runtime === 'vscode-webview') return new VscodeTransport()
  if (runtime === 'browser-extension') return new ChromeTransport()

  const configuredProxy = import.meta.env.VITE_HTTP_PROXY_URL?.trim()
  if (configuredProxy) return new DevProxyTransport(configuredProxy)
  if (import.meta.env.DEV) return new DevProxyTransport(DEV_PROXY_PATH)

  return new FetchTransport()
}

export function getHttpTransport(): HttpTransport {
  instance ??= createHttpTransport()
  return instance
}
