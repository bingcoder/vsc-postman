import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { resolveLanguage } from './settings'
import {
  abortRequest,
  errorCode,
  forwardRequest,
  type BridgeRequestMessage,
  type BridgeStreamFrame,
  type HttpPayload
} from './http'
import { migrateLegacyHistory } from './migrate'
import { PanelManager } from './panel-manager'
import { SidebarWebviewViewProvider } from './sidebar-view'
import { WebviewHost, type BridgeClient } from './webview-host'
import { APP_STORAGE_KEY, WorkspaceModel } from './workspace'
import type { Collection, HistoryEntry } from './types'

type StoragePayload = { key: string; value?: string | null }
type StorageOpenPayload = { keys: string[] }
type ResponseOpenPayload = { content: string }
type FilePickPayload = { canSelectMany?: boolean }
type AbortPayload = { id: string }
type PanelOpenRequestPayload = { collectionId: string; requestId: string }
type PanelOpenHistoryPayload = { entryId: string }
type PanelDuplicatePayload = { collectionId: string; requestId: string }

type WorkspaceSnapshot = {
  collections: Collection[]
  history: HistoryEntry[]
  historyLimit: number
}

type BridgeDeps = {
  context: vscode.ExtensionContext
  model: WorkspaceModel
  host: WebviewHost
  panels: PanelManager
  snapshot: () => WorkspaceSnapshot
}

const STORAGE_KEY = 'vsc-postman:state'

export function activate(context: vscode.ExtensionContext): void {
  const model = new WorkspaceModel(context)
  const host = new WebviewHost()

  // 1.x → 2.0：把老版本的 vscPostman.history 一次性并入新存储。
  // 必须早于任何 webview 就绪，保证首个快照就带上迁移后的历史。
  migrateLegacyHistory(context, model)

  const snapshot = (): WorkspaceSnapshot => ({
    collections: model.getCollections(),
    history: model.getHistory(),
    historyLimit: model.getHistoryLimit()
  })

  let dispatch: (message: unknown, client: BridgeClient) => void = () => undefined
  const panels = new PanelManager(context, host, model, (message, client) => {
    dispatch(message, client)
  })
  const deps: BridgeDeps = { context, model, host, panels, snapshot }
  dispatch = (message, client) => {
    void handleBridgeMessage(message as BridgeRequestMessage, client, deps)
  }

  const resyncSidebar = () => {
    host.toSidebar({ event: 'workspace.changed', ...snapshot() })
    host.toSidebar({
      event: 'settings.changed',
      language: resolveLanguage(context),
      historyLimit: model.getHistoryLimit()
    })
    host.toSidebar({ event: 'activeRequest.changed', requestId: panels.getActiveRequestId() })
  }

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarWebviewViewProvider.viewType,
      new SidebarWebviewViewProvider(
        context,
        host,
        (message, client) => {
          dispatch(message, client)
        },
        resyncSidebar
      ),
      { webviewOptions: { retainContextWhenHidden: true } }
    ),
    panels,
    model,
    host
  )

  registerCommands(context, { model, host, panels, snapshot })
}

type CommandDeps = {
  model: WorkspaceModel
  host: WebviewHost
  panels: PanelManager
  snapshot: () => WorkspaceSnapshot
}

function registerCommands(context: vscode.ExtensionContext, deps: CommandDeps): void {
  const register = (id: string, handler: (...args: never[]) => unknown) =>
    context.subscriptions.push(
      vscode.commands.registerCommand(id, handler as (...args: unknown[]) => unknown)
    )

  register('vsc-postman.open', () => deps.panels.focus())

  register('vsc-postman.refresh', () => {
    deps.model.reload()
    deps.host.broadcast({ event: 'workspace.changed', ...deps.snapshot() })
    deps.panels.refreshAfterWorkspaceChange()
  })

  register('vsc-postman.newRequest', () => void deps.panels.openNewRequest())

  register('vsc-postman.exportStorage', () => openStorageFile(context, [STORAGE_KEY]))
}

async function handleBridgeMessage(
  message: BridgeRequestMessage,
  client: BridgeClient,
  deps: BridgeDeps
): Promise<void> {
  if (message?.type !== 'vsc-postman/request') return

  const reply = (ok: boolean, body: unknown) => client.reply(message.id, ok, body)

  try {
    switch (message.method) {
      case 'workspace.ready': {
        // 宿主模型是内存中的唯一来源；不要在这里 reload，避免刚复制/保存的数据
        // 因 globalState 异步写入未完成而被旧快照覆盖。
        // 先回复快照，再补发排队通知：保证 webview 先拿到基线状态。
        reply(true, {
          language: resolveLanguage(deps.context),
          historyLimit: deps.model.getHistoryLimit(),
          collections: deps.model.getCollections(),
          history: deps.model.getHistory(),
          activeRequestId: deps.panels.getActiveRequestId()
        })
        deps.host.markReady(client)
        if (client.kind === 'sidebar') {
          client.send({
            event: 'activeRequest.changed',
            requestId: deps.panels.getActiveRequestId()
          })
        }
        return
      }
      case 'panel.openRequest': {
        const { collectionId, requestId } = (message.payload ?? {}) as PanelOpenRequestPayload
        const opened = await deps.panels.openRequest(collectionId, requestId)
        reply(
          opened,
          opened ? null : { code: 'notFound', message: vscode.l10n.t('Request not found') }
        )
        return
      }
      case 'panel.openHistory': {
        const { entryId } = (message.payload ?? {}) as PanelOpenHistoryPayload
        const opened = await deps.panels.openHistory(entryId)
        reply(
          opened,
          opened ? null : { code: 'notFound', message: vscode.l10n.t('History entry not found') }
        )
        return
      }
      case 'panel.newRequest': {
        const opened = await deps.panels.openNewRequest()
        reply(
          opened,
          opened ? null : { code: 'internal', message: vscode.l10n.t('Request failed') }
        )
        return
      }
      case 'panel.openSettings': {
        const opened = await deps.panels.openSettings()
        reply(
          opened,
          opened ? null : { code: 'internal', message: vscode.l10n.t('Request failed') }
        )
        return
      }
      case 'panel.focus': {
        deps.panels.focus()
        reply(true, null)
        return
      }
      case 'panel.duplicateRequest': {
        const { collectionId, requestId } = (message.payload ?? {}) as PanelDuplicatePayload
        const opened = await deps.panels.duplicateRequest(collectionId, requestId)
        reply(
          opened,
          opened ? null : { code: 'notFound', message: vscode.l10n.t('Request not found') }
        )
        return
      }
      case 'workspace.activeRequest': {
        const { requestId = null } = (message.payload ?? {}) as { requestId?: string | null }
        deps.panels.handleActiveRequest(client, requestId)
        reply(true, null)
        return
      }
      case 'workspace.update': {
        const payload = (message.payload ?? {}) as Record<string, unknown>
        deps.model.applyFromWebview({ state: payload })
        if (client.kind === 'panel') {
          deps.panels.handlePanelUpdate(
            client,
            typeof payload.draftId === 'string' ? payload.draftId : null
          )
        }
        deps.panels.refreshAfterWorkspaceChange()
        reply(true, null)
        // 源 webview 已有最新状态，只推给其它标签/侧边栏，避免回声。
        deps.host.broadcastExcept(client, {
          event: 'workspace.changed',
          ...deps.snapshot()
        })
        return
      }
      case 'storage.get': {
        const { key } = message.payload as StoragePayload
        reply(true, { value: deps.context.globalState.get<string>(key) ?? null })
        return
      }
      case 'storage.set': {
        const { key, value } = message.payload as StoragePayload
        await deps.context.globalState.update(key, value ?? undefined)
        if (key === STORAGE_KEY && typeof value === 'string') {
          try {
            deps.model.applyFromWebview(JSON.parse(value), value)
          } catch {
            deps.model.reload('webview')
          }
          deps.panels.refreshAfterWorkspaceChange()
          deps.host.broadcastExcept(client, {
            event: 'workspace.changed',
            ...deps.snapshot()
          })
        }
        // 设置页写入语言后，其它 webview 与编辑器标签标题一起跟随。
        if (key === APP_STORAGE_KEY) {
          deps.host.broadcastExcept(client, {
            event: 'settings.changed',
            language: resolveLanguage(deps.context),
            historyLimit: deps.model.getHistoryLimit()
          })
          deps.panels.refreshTitles()
        }
        reply(true, null)
        return
      }
      case 'storage.remove': {
        const { key } = message.payload as StoragePayload
        await deps.context.globalState.update(key, undefined)
        reply(true, null)
        return
      }
      case 'storage.open': {
        const { keys } = message.payload as StorageOpenPayload
        await openStorageFile(deps.context, keys)
        reply(true, null)
        return
      }
      case 'response.open': {
        const { content } = message.payload as ResponseOpenPayload
        await openResponseDocument(content)
        reply(true, null)
        return
      }
      case 'file.pick': {
        const { canSelectMany = true } = (message.payload ?? {}) as FilePickPayload
        const uris = await vscode.window.showOpenDialog({
          canSelectMany,
          canSelectFiles: true,
          canSelectFolders: false,
          openLabel: vscode.l10n.t('Select files')
        })
        const files: { path: string; name: string; size: number }[] = []
        for (const uri of uris ?? []) {
          const stat = await fs.promises.stat(uri.fsPath)
          files.push({ path: uri.fsPath, name: path.basename(uri.fsPath), size: stat.size })
        }
        reply(true, { files })
        return
      }
      case 'http.abort': {
        const { id } = message.payload as AbortPayload
        abortRequest(id)
        reply(true, null)
        return
      }
      case 'http.request': {
        const payload = message.payload as HttpPayload
        reply(
          true,
          await forwardRequest(payload, (frame: BridgeStreamFrame) => {
            client.stream(message.id, frame)
          })
        )
        return
      }
      default:
        reply(false, {
          code: 'unsupported',
          message: vscode.l10n.t('Unknown method: {0}', String(message.method))
        })
    }
  } catch (error) {
    reply(false, {
      code: errorCode(error),
      message: error instanceof Error ? error.message : vscode.l10n.t('Request failed')
    })
  }
}

/** 把 globalState 导出为临时目录下的 JSON 并打开。 */
async function openStorageFile(context: vscode.ExtensionContext, keys: string[]): Promise<void> {
  const snapshot: Record<string, unknown> = {}
  for (const key of keys) {
    const raw = context.globalState.get<string>(key)
    if (raw === undefined || raw === null) continue
    try {
      snapshot[key] = JSON.parse(raw)
    } catch {
      snapshot[key] = raw
    }
  }

  const dir = path.join(os.tmpdir(), 'vsc-postman')
  await fs.promises.mkdir(dir, { recursive: true })
  const file = path.join(dir, 'storage.json')
  await fs.promises.writeFile(file, JSON.stringify(snapshot, null, 2), 'utf8')

  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
  await vscode.window.showTextDocument(document, { preview: false })
}

/** 以未命名文档打开正文：先展示空文档触发语言检测，再写入内容。 */
async function openResponseDocument(content: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument({ content: '' })
  const editor = await vscode.window.showTextDocument(document, { preview: false })

  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length)
  )
  await editor.edit((editBuilder) => editBuilder.replace(fullRange, content))
}

export function deactivate(): void {}
