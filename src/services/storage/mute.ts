/**
 * 写入闸门。
 *
 * - `muted`：宿主推送快照期间 webview 只做镜像，不应回写（否则与宿主互相触发）。
 * - `armed`：Webview 启动时先关闸，等拿到宿主快照（或确认宿主不可用）后再开闸，
 *   避免首帧把空集合写回 globalState 覆盖用户数据。
 */
let muted = 0
let armed = true

export function isStorageMuted(): boolean {
  return muted > 0 || !armed
}

export function disarmStorage(): void {
  armed = false
}

export function armStorage(): void {
  armed = true
}

export async function withStorageMuted<T>(run: () => T | Promise<T>): Promise<T> {
  muted += 1
  try {
    return await run()
  } finally {
    muted -= 1
  }
}
