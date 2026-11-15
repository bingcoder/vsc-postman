import type { BridgeStoragePayload, BridgeStorageResult } from '@/services/bridge/protocol'
import { callHost } from '@/services/bridge/vscode'
import { STORAGE_KEY } from '@/services/vsc-postman/constants'
import { isStorageMuted } from './mute'

const STORAGE_BRIDGE_TIMEOUT_MS = 3_000

export interface StorageAdapter {
  readonly kind: 'local' | 'vscode' | 'memory'
  getItem(name: string): Promise<string | null>
  setItem(name: string, value: string): Promise<void>
  removeItem(name: string): Promise<void>
}

export function createMemoryStorageAdapter(): StorageAdapter {
  const store = new Map<string, string>()

  return {
    kind: 'memory',
    async getItem(name) {
      return store.get(name) ?? null
    },
    async setItem(name, value) {
      store.set(name, value)
    },
    async removeItem(name) {
      store.delete(name)
    }
  }
}

function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

export function createWebStorageAdapter(): StorageAdapter {
  const fallback = createMemoryStorageAdapter()
  const storage = getLocalStorage()

  if (!storage) return fallback

  return {
    kind: 'local',
    async getItem(name) {
      try {
        return storage.getItem(name)
      } catch {
        return fallback.getItem(name)
      }
    },
    async setItem(name, value) {
      try {
        storage.setItem(name, value)
      } catch {
        await fallback.setItem(name, value)
      }
    },
    async removeItem(name) {
      try {
        storage.removeItem(name)
      } catch {
        await fallback.removeItem(name)
      }
    }
  }
}

/** 优先用宿主 globalState，失败回退 localStorage。 */
export function createBridgeStorageAdapter(): StorageAdapter {
  const fallback = createWebStorageAdapter()
  /** 上次写入值：宿主写入是 RPC，内容没变就不必往返。 */
  const lastWritten = new Map<string, string>()

  return {
    kind: 'vscode',
    async getItem(name) {
      try {
        const result = await callHost<BridgeStorageResult>(
          'storage.get',
          {
            key: name
          } satisfies BridgeStoragePayload,
          { timeoutMs: STORAGE_BRIDGE_TIMEOUT_MS }
        )
        lastWritten.set(name, result.value ?? '')
        return result.value
      } catch {
        return fallback.getItem(name)
      }
    },
    async setItem(name, value) {
      // 镜像宿主快照时不回写，避免与宿主互相触发。
      if (isStorageMuted()) return
      // 集合/历史由宿主独占写入（workspace.update），这里不落盘。
      if (name === STORAGE_KEY) return
      if (lastWritten.get(name) === value) return
      lastWritten.set(name, value)
      try {
        await callHost<void>('storage.set', { key: name, value } satisfies BridgeStoragePayload, {
          timeoutMs: STORAGE_BRIDGE_TIMEOUT_MS
        })
      } catch {
        await fallback.setItem(name, value)
      }
    },
    async removeItem(name) {
      if (isStorageMuted()) return
      if (name === STORAGE_KEY) return
      lastWritten.delete(name)
      try {
        await callHost<void>('storage.remove', { key: name } satisfies BridgeStoragePayload, {
          timeoutMs: STORAGE_BRIDGE_TIMEOUT_MS
        })
      } catch {
        await fallback.removeItem(name)
      }
    }
  }
}
