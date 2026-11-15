import {
  HTTP_PORT_NAME,
  isClientMessage,
  type ClientMessage,
  type ServerMessage,
  type WirePreparedBody
} from './protocol'
import { permissionPatternForUrl } from './permissions'
import { getCurrentLanguage, translate } from '@/lib/i18n'
import { executeFetch } from '@/services/vsc-postman/fetch-core'
import { toHttpError } from '@/services/vsc-postman/transport'
import type { HttpError } from '@/types/http'

type ActiveRequest = {
  port: chrome.runtime.Port
  controller: AbortController
}

const activeRequests = new Map<string, ActiveRequest>()
const disconnectedPorts = new WeakSet<chrome.runtime.Port>()

/** 点击图标打开 app.html，已存在则聚焦。 */
const APP_PAGE_PATH = 'app.html'

chrome.action.onClicked.addListener(() => {
  void openAppPage().catch(() => undefined)
})

/** 用 getContexts（Chromium 116+）查找已打开的页面，无需 tabs 权限。 */
async function openAppPage(): Promise<void> {
  const pageUrl = chrome.runtime.getURL(APP_PAGE_PATH)
  const existing = await findAppTab(pageUrl)

  if (existing) {
    try {
      if (typeof existing.tabId === 'number' && existing.tabId >= 0) {
        await chrome.tabs.update(existing.tabId, { active: true })
      }
      if (typeof existing.windowId === 'number' && existing.windowId >= 0) {
        await chrome.windows.update(existing.windowId, { focused: true })
      }
      return
    } catch {
      // 标签页已关闭，改为新建
    }
  }

  await chrome.tabs.create({ url: pageUrl })
}

async function findAppTab(
  pageUrl: string
): Promise<{ tabId?: number; windowId?: number } | null> {
  const getContexts = chrome.runtime.getContexts
  if (typeof getContexts !== 'function') return null

  const targetPath = new URL(pageUrl).pathname
  try {
    const contexts = await getContexts({ contextTypes: ['TAB'] })
    for (const context of contexts) {
      if (!context.documentUrl) continue
      if (new URL(context.documentUrl).pathname === targetPath) {
        return { tabId: context.tabId, windowId: context.windowId }
      }
    }
  } catch {
    // getContexts 不可用
  }
  return null
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== HTTP_PORT_NAME) return
  // 只接受本扩展的连接。
  if (port.sender?.id && port.sender.id !== chrome.runtime.id) return

  port.onMessage.addListener((message) => {
    if (!isClientMessage(message)) return
    if (message.type === 'ping') {
      post(port, { type: 'pong' })
      return
    }
    if (message.type === 'abort') {
      activeRequests.get(message.requestId)?.controller.abort()
      return
    }
    void handleRequest(port, message)
  })

  port.onDisconnect.addListener(() => {
    disconnectedPorts.add(port)
    for (const [requestId, active] of activeRequests) {
      if (active.port !== port) continue
      active.controller.abort()
      activeRequests.delete(requestId)
    }
  })
})

async function handleRequest(
  port: chrome.runtime.Port,
  message: Extract<ClientMessage, { type: 'request' }>
): Promise<void> {
  const { requestId, request } = message
  if (activeRequests.has(requestId)) return

  const lang = getCurrentLanguage()
  const pattern = permissionPatternForUrl(request.url)
  if (!pattern) {
    postError(port, requestId, {
      code: 'invalid-url',
      message: translate('error.invalidUrl.format', lang)
    })
    return
  }

  let granted = false
  try {
    // 校验站点权限（安装时已全量授予）。
    granted = await chrome.permissions.contains({ origins: [pattern] })
  } catch {
    // 权限查询失败按未授权处理
    granted = false
  }

  if (!granted) {
    let host = request.url
    try {
      host = new URL(request.url).host
    } catch {
      // 保留原 URL
    }
    postError(port, requestId, {
      code: 'permission-denied',
      message: translate('error.permission.denied', lang, { host })
    })
    return
  }

  if (disconnectedPorts.has(port)) return

  const controller = new AbortController()
  activeRequests.set(requestId, { port, controller })

  try {
    const result = await executeFetch(request, buildRequestBody(request.body), {
      signal: controller.signal,
      requestId,
      onStreamStart: (info) => post(port, { type: 'start', requestId, info }),
      onStreamChunk: (text, bytes) => post(port, { type: 'chunk', requestId, text, bytes })
    })
    post(port, { type: 'result', requestId, result })
  } catch (error) {
    postError(port, requestId, toHttpError(error))
  } finally {
    activeRequests.delete(requestId)
  }
}

function buildRequestBody(body: WirePreparedBody | undefined): BodyInit | undefined {
  if (!body) return undefined
  if (body.kind === 'text') return body.text

  const formData = new FormData()
  for (const part of body.parts) {
    formData.append(part.name, part.value)
  }
  return formData
}

function post(port: chrome.runtime.Port, message: ServerMessage): void {
  try {
    port.postMessage(message)
  } catch {
    // Port 已断开，忽略
  }
}

function postError(port: chrome.runtime.Port, requestId: string, error: HttpError): void {
  post(port, { type: 'error', requestId, error })
}
