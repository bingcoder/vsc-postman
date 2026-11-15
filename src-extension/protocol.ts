import type { HttpError, HttpMethod, HttpResult, StreamStartInfo } from '@/types/http'
import { HTTP_METHODS } from '@/types/http'

/** 扩展页面与 Service Worker 的 Port 名称。 */
export const HTTP_PORT_NAME = 'vsc-postman:http'

/** 发往 Service Worker 的请求：只承载文本字段，带文件的 multipart 在页面本地发送。 */
export type WireFormPart = {
  kind: 'text'
  name: string
  value: string
}

export type WirePreparedBody =
  { kind: 'text'; text: string } | { kind: 'form-data'; parts: WireFormPart[] }

export type WirePreparedRequest = {
  method: HttpMethod
  url: string
  headers: Record<string, string>
  body?: WirePreparedBody
}

export type ClientMessage =
  | { type: 'request'; requestId: string; request: WirePreparedRequest }
  | { type: 'abort'; requestId: string }
  | { type: 'ping' }

export type ServerMessage =
  | { type: 'start'; requestId: string; info: StreamStartInfo }
  | { type: 'chunk'; requestId: string; text: string; bytes: number }
  | { type: 'result'; requestId: string; result: HttpResult }
  | { type: 'error'; requestId: string; error: HttpError }
  | { type: 'pong' }

const HTTP_METHOD_SET = new Set<string>(HTTP_METHODS)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string')
}

function isWireBody(value: unknown): value is WirePreparedBody {
  if (!isRecord(value)) return false
  if (value.kind === 'text') return typeof value.text === 'string'
  if (value.kind !== 'form-data' || !Array.isArray(value.parts)) return false

  return value.parts.every(
    (part) =>
      isRecord(part) &&
      part.kind === 'text' &&
      typeof part.name === 'string' &&
      typeof part.value === 'string'
  )
}

function isWireRequest(value: unknown): value is WirePreparedRequest {
  if (!isRecord(value)) return false
  if (typeof value.url !== 'string' || !value.url) return false
  if (typeof value.method !== 'string' || !HTTP_METHOD_SET.has(value.method)) return false
  if (!isStringRecord(value.headers)) return false
  return value.body === undefined || isWireBody(value.body)
}

export function isClientMessage(value: unknown): value is ClientMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false

  if (value.type === 'ping') return true
  if (typeof value.requestId !== 'string' || !value.requestId) return false
  if (value.type === 'abort') return true
  if (value.type === 'request') return isWireRequest(value.request)
  return false
}

export function isServerMessage(value: unknown): value is ServerMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false
  if (value.type === 'pong') return true
  if (typeof value.requestId !== 'string' || !value.requestId) return false
  return (
    value.type === 'start' ||
    value.type === 'chunk' ||
    value.type === 'result' ||
    value.type === 'error'
  )
}
