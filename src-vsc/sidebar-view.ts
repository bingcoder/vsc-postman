import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { buildWebviewHtml } from './html'
import type { BridgeClient, WebviewHost } from './webview-host'

/** Activity Bar 里的 Webview 侧边栏，与 Web 共用 AppSidebar 组件。 */
export class SidebarWebviewViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'vsc-postman.sidebar'
  /** 防止同一 view 被重复 resolve 时挂出多个客户端。 */
  private readonly resolved = new WeakSet<vscode.WebviewView>()

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly host: WebviewHost,
    private readonly onMessage: (message: unknown, client: BridgeClient) => void,
    private readonly onVisible: () => void
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    if (this.resolved.has(view)) return

    const distRoot = path.join(this.context.extensionPath, 'media')
    const sidebarHtml = path.join(distRoot, 'sidebar.html')
    if (!fs.existsSync(sidebarHtml)) {
      void vscode.window.showErrorMessage(
        vscode.l10n.t(
          'media/sidebar.html was not found. Run npm run build:vsc in the repository root.'
        )
      )
      return
    }
    this.resolved.add(view)

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(distRoot)]
    }

    const client = this.host.addView(view)
    const messageSub = view.webview.onDidReceiveMessage((message) => {
      this.onMessage(message, client)
    })
    const visibilitySub = view.onDidChangeVisibility(() => {
      client.setVisible(view.visible)
      // 隐藏期间的消息会被丢弃，重新可见时用快照补齐。
      if (view.visible) this.onVisible()
    })
    const disposeSub = view.onDidDispose(() => {
      messageSub.dispose()
      visibilitySub.dispose()
      disposeSub.dispose()
      this.resolved.delete(view)
      this.host.remove(client)
    })

    // 订阅就绪后再加载页面，避免错过 webview 的首个握手消息。
    view.webview.html = buildWebviewHtml(view.webview, distRoot, 'sidebar.html')
  }
}
