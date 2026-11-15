import { detectRuntime } from '@/lib/runtime'
import { STORAGE_KEY } from '@/services/vsc-postman/constants'
import { callHost } from '@/services/bridge/vscode'
import {
  createBridgeStorageAdapter,
  createMemoryStorageAdapter,
  createWebStorageAdapter,
  type StorageAdapter
} from './adapters'

let adapter: StorageAdapter | null = null

export function getStorageAdapter(): StorageAdapter {
  if (adapter) return adapter

  if (typeof window === 'undefined') {
    adapter = createMemoryStorageAdapter()
    return adapter
  }

  adapter =
    detectRuntime() === 'vscode-webview' ? createBridgeStorageAdapter() : createWebStorageAdapter()

  return adapter
}

/** 全部持久化键（主题 key 仅 web 端存在）。 */
export const STORAGE_KEYS = ['vsc-postman:state', 'vsc-postman:app', 'vsc-postman:theme'] as const

/** 导出到宿主 globalState 的键。 */
const VSCODE_HOST_KEYS = [STORAGE_KEY, 'vsc-postman:app'] as const

/** 让宿主把 globalState 导出为 JSON 并打开；失败由调用方回退。 */
export async function openStorageInVsCode(): Promise<void> {
  await callHost<void>('storage.open', { keys: [...VSCODE_HOST_KEYS] })
}

export type { StorageAdapter } from './adapters'
