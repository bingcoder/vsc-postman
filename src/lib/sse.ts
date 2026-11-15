import type { SseEventItem } from '../types/http'
import { isTextualContentType } from './content-type'

/** 上游是否声明 text/event-stream。 */
export function isEventStreamContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false
  return /^\s*text\/event-stream\s*(?:;|$)/i.test(contentType)
}

export function acceptsEventStream(headers: Record<string, string>): boolean {
  return Object.entries(headers).some(
    ([key, value]) => key.toLowerCase() === 'accept' && /text\/event-stream/i.test(value ?? '')
  )
}

/** 上游声明事件流，或客户端要求 SSE 且响应为文本类型（服务端可能错标为 text/plain）。 */
export function shouldStreamEventStream(
  headers: Record<string, string>,
  contentType: string | null
): boolean {
  if (isEventStreamContentType(contentType)) return true
  return acceptsEventStream(headers) && isTextualContentType(contentType)
}

export type ParsedSseEvent = Pick<SseEventItem, 'id' | 'event' | 'data' | 'retry' | 'raw'>

/** 增量 SSE 解析器（WHATWG）：空行派发，无 data 的块不派发，跨分片安全。 */
export class SseParser {
  private buffer = ''
  private dataLines: string[] = []
  /** 当前事件块的原始行（仅展示） */
  private rawLines: string[] = []
  private pendingEvent: string | undefined
  private pendingId: string | undefined
  private pendingRetry: number | undefined
  private started = false

  feed(text: string): ParsedSseEvent[] {
    if (!text) return []

    let source = text
    if (!this.started) {
      this.started = true
      // 仅去流首 BOM
      if (source.charCodeAt(0) === 0xfeff) source = source.slice(1)
      if (!source) return []
    }

    this.buffer += source
    const events: ParsedSseEvent[] = []
    let consumed = 0
    let index = 0

    while (index < this.buffer.length) {
      const char = this.buffer[index]

      if (char === '\n') {
        this.processLine(this.buffer.slice(consumed, index), events)
        index += 1
        consumed = index
        continue
      }

      if (char === '\r') {
        // 末尾 CR 可能是被拆开的 CRLF，留到下一段
        if (index + 1 >= this.buffer.length) break
        const width = this.buffer[index + 1] === '\n' ? 2 : 1
        this.processLine(this.buffer.slice(consumed, index), events)
        index += width
        consumed = index
        continue
      }

      index += 1
    }

    this.buffer = this.buffer.slice(consumed)
    return events
  }

  private processLine(line: string, out: ParsedSseEvent[]): void {
    if (line === '') {
      this.dispatch(out)
      return
    }
    this.rawLines.push(line)
    if (line.startsWith(':')) return

    const colon = line.indexOf(':')
    const field = colon < 0 ? line : line.slice(0, colon)
    let value = colon < 0 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    switch (field) {
      case 'event':
        this.pendingEvent = value
        break
      case 'data':
        this.dataLines.push(value)
        break
      case 'id':
        if (!value.includes('\0')) this.pendingId = value
        break
      case 'retry':
        if (/^\d+$/.test(value)) this.pendingRetry = Number(value)
        break
      default:
        break
    }
  }

  private dispatch(out: ParsedSseEvent[]): void {
    const hasData = this.dataLines.length > 0
    const data = this.dataLines.join('\n')
    const event = this.pendingEvent
    const id = this.pendingId
    const retry = this.pendingRetry
    // 统一用 LF 还原展示文本
    const raw = this.rawLines.length > 0 ? `${this.rawLines.join('\n')}\n` : ''

    this.dataLines = []
    this.rawLines = []
    this.pendingEvent = undefined
    this.pendingId = undefined
    this.pendingRetry = undefined

    if (!hasData) return

    const item: ParsedSseEvent = { data, raw }
    if (event !== undefined && event !== '') item.event = event
    if (id !== undefined) item.id = id
    if (retry !== undefined) item.retry = retry
    out.push(item)
  }
}

/** data 是 JSON 时格式化，否则原样返回。 */
export function formatEventData(data: string): string {
  const trimmed = data.trim()
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return data
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (parsed !== null && typeof parsed === 'object') return JSON.stringify(parsed, null, 2)
  } catch {
    // 非 JSON
  }
  return data
}
