import type { Layout } from 'react-resizable-panels'

/** 布局读写（面板 id → 百分比）：只持久化用户交互结果，避免缩放覆盖期望尺寸。 */
export type PanelLayoutStore = {
  read: () => Layout | null
  write: (layout: Layout) => void
}

export function createPanelLayoutStore(key: string): PanelLayoutStore {
  const read = (): Layout | null => {
    try {
      const raw = globalThis.localStorage?.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object') return null
      const layout: Layout = {}
      for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'number' && Number.isFinite(value)) layout[id] = value
      }
      return Object.keys(layout).length > 0 ? layout : null
    } catch {
      return null
    }
  }

  const write = (layout: Layout) => {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(layout))
    } catch {
      // 存储不可用
    }
  }

  return { read, write }
}
