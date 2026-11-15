import type * as vscode from 'vscode'
import type { HostNotify } from './host-protocol'

export type ClientKind = 'panel' | 'sidebar'

/**
 * 一个 webview 客户端。
 *
 * 侧边栏隐藏时 postMessage 会被丢弃，因此隐藏态只保留“就绪前队列”，
 * 重新可见时由 Provider 补发完整快照。
 */
export class BridgeClient {
  readonly kind: ClientKind
  readonly webview: vscode.Webview
  private ready = false
  private visible: boolean
  private queue: HostNotify[] = []

  constructor(kind: ClientKind, webview: vscode.Webview, visible: boolean) {
    this.kind = kind
    this.webview = webview
    this.visible = visible
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    if (!visible) this.queue = []
  }

  markReady(): void {
    this.ready = true
    // 隐藏状态下发送会被丢弃，等可见时用快照补齐。
    if (this.kind === 'sidebar' && !this.visible) {
      this.queue = []
      return
    }

    const queued = this.queue
    this.queue = []
    for (const message of queued) this.post(message)
  }

  send(message: HostNotify): void {
    if (!this.ready) {
      this.queue.push(message)
      return
    }
    if (this.kind === 'sidebar' && !this.visible) return
    this.post(message)
  }

  reply(id: string, ok: boolean, body: unknown): void {
    void this.webview.postMessage({
      type: 'vsc-postman/response',
      id,
      ok,
      ...(ok ? { payload: body } : { error: body })
    })
  }

  stream(id: string, frame: unknown): void {
    void this.webview.postMessage({
      type: 'vsc-postman/stream',
      id,
      frame
    })
  }

  private post(message: HostNotify): void {
    void this.webview.postMessage({ type: 'vsc-postman/notify', ...message })
  }
}

/** 管理多个编辑器面板与侧边栏 Webview 客户端。 */
export class WebviewHost implements vscode.Disposable {
  private readonly clients = new Set<BridgeClient>()

  addPanel(panel: vscode.WebviewPanel): BridgeClient {
    const client = new BridgeClient('panel', panel.webview, true)
    this.clients.add(client)
    return client
  }

  addView(view: vscode.WebviewView): BridgeClient {
    const client = new BridgeClient('sidebar', view.webview, view.visible)
    this.clients.add(client)
    return client
  }

  remove(client: BridgeClient): void {
    this.clients.delete(client)
  }

  markReady(client: BridgeClient): void {
    client.markReady()
  }

  broadcast(message: HostNotify): void {
    for (const client of this.clients) client.send(message)
  }

  broadcastExcept(source: BridgeClient, message: HostNotify): void {
    for (const client of this.clients) {
      if (client !== source) client.send(message)
    }
  }

  toSidebar(message: HostNotify): void {
    for (const client of this.clients) {
      if (client.kind === 'sidebar') client.send(message)
    }
  }

  dispose(): void {
    this.clients.clear()
  }
}
