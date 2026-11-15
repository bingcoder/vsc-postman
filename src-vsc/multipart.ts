import * as fs from 'node:fs'
import { Readable } from 'node:stream'

export type MultipartPart =
  | { kind: 'text'; name: string; value: string }
  | {
      kind: 'file'
      name: string
      filename: string
      contentType: string
      size: number
      path: string
    }

export type MultipartStream = {
  stream: Readable
  /** 报文体长度（Content-Length）。 */
  contentLength: number
}

const CRLF = '\r\n'

/** 与浏览器 / undici 一致的字段转义。 */
function escapeField(value: string): string {
  return value.replace(/\r/g, '%0D').replace(/\n/g, '%0A').replace(/"/g, '%22')
}

function partHead(part: MultipartPart, boundary: string): string {
  const disposition =
    part.kind === 'file'
      ? `form-data; name="${escapeField(part.name)}"; filename="${escapeField(part.filename)}"`
      : `form-data; name="${escapeField(part.name)}"`

  const lines = [`--${boundary}${CRLF}`, `Content-Disposition: ${disposition}${CRLF}`]
  if (part.kind === 'file') {
    lines.push(`Content-Type: ${part.contentType || 'application/octet-stream'}${CRLF}`)
  }
  lines.push(CRLF)
  return lines.join('')
}

/** 拼成可流式上传的 multipart 报文；文件逐块读盘，onChunk 用于刷新空闲计时。 */
export async function createMultipartStream(
  parts: MultipartPart[],
  boundary: string,
  onChunk: () => void
): Promise<MultipartStream> {
  const fileSizes = new Map<string, number>()
  for (const part of parts) {
    if (part.kind !== 'file') continue
    const stat = await fs.promises.stat(part.path)
    fileSizes.set(part.path, stat.size)
  }

  const heads = parts.map((part) => Buffer.from(partHead(part, boundary), 'utf8'))
  const textBodies = parts.map((part) =>
    part.kind === 'text' ? Buffer.from(part.value, 'utf8') : null
  )
  const tail = Buffer.from(`--${boundary}--${CRLF}`, 'utf8')

  let contentLength = tail.byteLength
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]
    contentLength += heads[index].byteLength
    contentLength +=
      part.kind === 'text' ? (textBodies[index]?.byteLength ?? 0) : (fileSizes.get(part.path) ?? 0)
    contentLength += CRLF.length
  }

  async function* generate(): AsyncGenerator<Buffer> {
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]
      yield heads[index]

      if (part.kind === 'text') {
        const buffer = textBodies[index]
        if (buffer) yield buffer
      } else {
        const readStream = fs.createReadStream(part.path)
        for await (const chunk of readStream) {
          onChunk()
          yield chunk as Buffer
        }
      }

      yield Buffer.from(CRLF)
    }

    yield tail
  }

  return { stream: Readable.from(generate()), contentLength }
}
