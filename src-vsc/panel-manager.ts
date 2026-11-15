import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { resolveLanguage } from './settings'
import { buildWebviewHtml } from './html'
import type { HostNotify } from './host-protocol'
import type { Collection, HistoryEntry, SavedRequest } from './types'
import type { BridgeClient, WebviewHost } from './webview-host'
import type { WorkspaceModel } from './workspace'

const VIEW_TYPE = 'vsc-postman.workbench'
const SETTINGS_KEY = 'settings'

/** 标签标题跟随设置页选择（未设置时用 VS Code 显示语言）。 */
const TITLES = {
  zh: { newRequest: '新建请求', history: '历史', settings: '设置', untitled: '未命名请求' },
  en: {
    newRequest: 'New request',
    history: 'History',
    settings: 'Settings',
    untitled: 'Untitled request'
  }
} as const

function titleLabel(language: 'zh' | 'en', key: keyof (typeof TITLES)['en']): string {
  return TITLES[language][key]
}

type PanelKind = 'request' | 'history' | 'draft' | 'settings'

type PanelEntry = {
  key: string
  kind: PanelKind
  panel: vscode.WebviewPanel
  client: BridgeClient
  requestId: string | null
  collectionId: string | null
  history: HistoryEntry | null
}

type CreatePanelOptions = {
  key: string
  kind: PanelKind
  requestId: string | null
  collectionId?: string | null
  history?: HistoryEntry | null
  initial: HostNotify
}

/**
 * 编辑器 Webview 标签管理器。
 *
 * 新建请求/历史/未打开的请求各自占一个原生标签；设置单例；
 * 已保存请求按 requestId 去重，历史按 entryId 去重。
 */
export class PanelManager implements vscode.Disposable {
  private readonly entries = new Map<string, PanelEntry>()
  private activeKey: string | null = null
  private lastRequestKey: string | null = null
  private lastActiveRequestId: string | null = null

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly host: WebviewHost,
    private readonly model: WorkspaceModel,
    private readonly onMessage: (message: unknown, client: BridgeClient) => void
  ) {}

  /** 界面语言跟随设置页，未设置时退回 VS Code 显示语言。 */
  private get language(): 'zh' | 'en' {
    return resolveLanguage(this.context)
  }

  getActiveRequestId(): string | null {
    const entry = this.activeEntry()
    if (!entry) return null
    return entry.kind === 'request' || entry.kind === 'draft' ? entry.requestId : null
  }

  async openRequest(collectionId: string, requestId: string): Promise<boolean> {
    const existing = this.findByRequestId(requestId)
    if (existing) {
      this.reveal(existing)
      return true
    }

    const found = this.model.findRequest(collectionId, requestId)
    if (!found) return false

    return (
      this.create({
        key: `request:${collectionId}:${requestId}`,
        kind: 'request',
        requestId,
        collectionId,
        initial: { event: 'openRequest', request: found.request }
      }) !== null
    )
  }

  async openHistory(entryId: string): Promise<boolean> {
    const key = `history:${entryId}`
    const existing = this.entries.get(key)
    if (existing) {
      this.reveal(existing)
      return true
    }

    const found = this.model.findHistoryEntry(entryId)
    if (!found) return false

    return (
      this.create({
        key,
        kind: 'history',
        requestId: null,
        history: found,
        initial: { event: 'openHistory', draft: found.request }
      }) !== null
    )
  }

  async openNewRequest(): Promise<boolean> {
    return (
      this.create({
        key: `draft:${randomUUID()}`,
        kind: 'draft',
        requestId: null,
        initial: { event: 'newRequest' }
      }) !== null
    )
  }

  async openSettings(): Promise<boolean> {
    const existing = this.entries.get(SETTINGS_KEY)
    if (existing) {
      this.reveal(existing)
      existing.client.send({ event: 'navigate', path: '/settings' })
      return true
    }

    return (
      this.create({
        key: SETTINGS_KEY,
        kind: 'settings',
        requestId: null,
        initial: { event: 'navigate', path: '/settings' }
      }) !== null
    )
  }

  async duplicateRequest(collectionId: string, requestId: string): Promise<boolean> {
    const copy = this.model.duplicateRequest(collectionId, requestId)
    if (!copy) return false

    this.model.commit()
    this.host.broadcast({ event: 'workspace.changed', ...this.snapshot() })
    this.refreshTitles()
    return this.openRequest(collectionId, copy.id)
  }

  /** 设置返回/命令入口：聚焦最后一个请求标签；没有请求标签则新建。 */
  focus(): void {
    const active = this.activeEntry()
    if (active && active.kind !== 'settings') {
      this.reveal(active)
      return
    }

    const lastRequest = this.lastRequestKey ? this.entries.get(this.lastRequestKey) : null
    if (lastRequest) {
      this.reveal(lastRequest)
      return
    }

    const fallback = [...this.entries.values()].reverse().find((entry) => entry.kind !== 'settings')
    if (fallback) {
      this.reveal(fallback)
      return
    }

    // 只有 Settings 标签时也回到工作台，而不是再次聚焦设置。
    void this.openNewRequest()
  }

  /** 编辑器标签草稿切换/保存后同步标签对应的请求 id。 */
  handleActiveRequest(client: BridgeClient, requestId: string | null): void {
    const entry = this.findByClient(client)
    if (!entry) return
    if (entry.kind !== 'request' && entry.kind !== 'draft') return

    entry.requestId = requestId
    this.refreshTitle(entry)
    if (this.activeKey === entry.key) this.notifyActive()
  }

  /**
   * 保存草稿时 id 通常不变，因此用 workspace.update 里的 draftId 把标签绑定到请求；
   * 否则新建标签保存后仍会被当成 untitled，点侧边栏会重复开标签。
   */
  handlePanelUpdate(client: BridgeClient, draftId: string | null): void {
    const entry = this.findByClient(client)
    if (!entry) return
    if (entry.kind !== 'request' && entry.kind !== 'draft') return
    if (!draftId) return

    entry.requestId = this.findRequestById(draftId) ? draftId : null
    this.refreshTitle(entry)
    if (this.activeKey === entry.key) this.notifyActive()
  }

  /** 集合/历史变化后：失效的请求 id 清空，所有标签标题重新解析。 */
  refreshAfterWorkspaceChange(): void {
    for (const entry of this.entries.values()) {
      if (entry.kind !== 'request' && entry.kind !== 'draft') continue
      if (entry.requestId && !this.findRequestById(entry.requestId)) {
        entry.requestId = null
      }
      this.refreshTitle(entry)
    }
    this.notifyActive()
  }

  /** 语言变化后刷新 Settings/History 等本地化标题。 */
  refreshTitles(): void {
    for (const entry of this.entries.values()) this.refreshTitle(entry)
  }

  private create(options: CreatePanelOptions): PanelEntry | null {
    const distRoot = path.join(this.context.extensionPath, 'media')
    const indexHtml = path.join(distRoot, 'index.html')
    if (!fs.existsSync(indexHtml)) {
      void vscode.window.showErrorMessage(
        vscode.l10n.t('media/index.html was not found. Run npm run build:vsc in the repository root.')
      )
      return null
    }

    const panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      this.titleFor(options),
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(distRoot)]
      }
    )
    panel.iconPath = vscode.Uri.file(path.join(distRoot, 'activity.svg'))

    const entry: PanelEntry = {
      key: options.key,
      kind: options.kind,
      panel,
      client: this.host.addPanel(panel),
      requestId: options.requestId,
      collectionId: options.collectionId ?? null,
      history: options.history ?? null
    }
    this.entries.set(entry.key, entry)

    const messageSub = panel.webview.onDidReceiveMessage((message) => {
      this.onMessage(message, entry.client)
    })
    const viewStateSub = panel.onDidChangeViewState((event) => {
      if (event.webviewPanel.active) this.activate(entry)
      if (event.webviewPanel.visible) this.syncVisiblePanel(entry)
    })
    const disposeSub = panel.onDidDispose(() => {
      messageSub.dispose()
      viewStateSub.dispose()
      disposeSub.dispose()
      this.remove(entry)
    })

    // 订阅就绪后再加载页面，避免错过 webview 的首个握手消息。
    panel.webview.html = buildWebviewHtml(panel.webview, distRoot, 'index.html')
    entry.client.send(options.initial)
    this.activate(entry)
    return entry
  }

  /** 后台标签可能收不到广播，重新可见时补发快照。 */
  private syncVisiblePanel(entry: PanelEntry): void {
    entry.client.send({ event: 'workspace.changed', ...this.snapshot() })
    entry.client.send({
      event: 'settings.changed',
      language: resolveLanguage(this.context),
      historyLimit: this.model.getHistoryLimit()
    })
  }

  private reveal(entry: PanelEntry): void {
    // 保留标签所在编辑器组，而不是把它移动到当前组。
    entry.panel.reveal(entry.panel.viewColumn)
    this.activate(entry)
  }

  private activate(entry: PanelEntry): void {
    this.activeKey = entry.key
    if (entry.kind !== 'settings') this.lastRequestKey = entry.key
    this.notifyActive()
  }

  private notifyActive(): void {
    const requestId = this.getActiveRequestId()
    if (requestId === this.lastActiveRequestId) return
    this.lastActiveRequestId = requestId
    this.host.toSidebar({ event: 'activeRequest.changed', requestId })
  }

  private remove(entry: PanelEntry): void {
    this.entries.delete(entry.key)
    this.host.remove(entry.client)

    if (this.lastRequestKey === entry.key) {
      this.lastRequestKey =
        [...this.entries.values()].reverse().find((item) => item.kind !== 'settings')?.key ?? null
    }
    if (this.activeKey === entry.key) {
      this.activeKey = null
      // 关闭活动标签后 VS Code 会切到另一个标签；先尽量同步到当前 active 的标签。
      const next = [...this.entries.values()].find((item) => item.panel.active)
      if (next) this.activeKey = next.key
      this.notifyActive()
    }
  }

  private activeEntry(): PanelEntry | null {
    return this.activeKey ? (this.entries.get(this.activeKey) ?? null) : null
  }

  private findByRequestId(requestId: string): PanelEntry | null {
    for (const entry of this.entries.values()) {
      if (entry.kind === 'history' || entry.kind === 'settings') continue
      if (entry.requestId === requestId) return entry
    }
    return null
  }

  private findByClient(client: BridgeClient): PanelEntry | null {
    for (const entry of this.entries.values()) {
      if (entry.client === client) return entry
    }
    return null
  }

  private findRequestById(
    requestId: string
  ): { collection: Collection; request: SavedRequest } | null {
    for (const collection of this.model.getCollections()) {
      const request = collection.requests.find((item) => item.id === requestId)
      if (request) return { collection, request }
    }
    return null
  }

  private titleFor(options: CreatePanelOptions): string {
    if (options.kind === 'settings') return titleLabel(this.language, 'settings')
    if (options.kind === 'history') {
      return options.history
        ? `${titleLabel(this.language, 'history')} · ${requestLabel(this.language, options.history.request)}`
        : titleLabel(this.language, 'history')
    }
    if (options.requestId) {
      const found = this.findRequestById(options.requestId)
      if (found) return `${found.collection.name} / ${requestLabel(this.language, found.request)}`
    }
    return titleLabel(this.language, 'newRequest')
  }

  private refreshTitle(entry: PanelEntry): void {
    if (entry.kind === 'settings') {
      entry.panel.title = titleLabel(this.language, 'settings')
      return
    }

    if (entry.kind === 'history') {
      entry.panel.title = entry.history
        ? `${titleLabel(this.language, 'history')} · ${requestLabel(this.language, entry.history.request)}`
        : titleLabel(this.language, 'history')
      return
    }

    if (entry.requestId) {
      const found = this.findRequestById(entry.requestId)
      if (found) {
        entry.panel.title = `${found.collection.name} / ${requestLabel(this.language, found.request)}`
        return
      }
    }
    entry.panel.title = titleLabel(this.language, 'newRequest')
  }

  private snapshot(): {
    collections: Collection[]
    history: HistoryEntry[]
    historyLimit: number
  } {
    return {
      collections: this.model.getCollections(),
      history: this.model.getHistory(),
      historyLimit: this.model.getHistoryLimit()
    }
  }

  dispose(): void {
    for (const entry of [...this.entries.values()]) entry.panel.dispose()
    this.entries.clear()
    this.activeKey = null
    this.lastRequestKey = null
    this.lastActiveRequestId = null
  }
}

/** 请求标题：名称优先，其次方法 + URL。 */
function requestLabel(
  language: 'zh' | 'en',
  request: { name?: string; method: string; url: string }
): string {
  const name = request.name?.trim()
  if (name) return name
  const url = request.url?.trim()
  if (url) return `${request.method} ${url}`
  return titleLabel(language, 'untitled')
}
