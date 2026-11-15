import type {
  FormFieldRow,
  HttpMethod,
  KvRow,
  PreparedBody,
  PreparedFormPart,
  PreparedRequest,
  RequestDraft
} from '@/types/http'
import { translate, getCurrentLanguage } from '@/lib/i18n'
import { getFileSource } from './file-registry'
import { HttpRequestError } from './transport'

export function prepareRequest(draft: RequestDraft): PreparedRequest {
  return {
    method: draft.method,
    url: buildUrl(draft.url, draft.params),
    headers: buildHeaders(draft),
    body: buildBody(draft)
  }
}

function buildUrl(rawUrl: string, params: KvRow[]): string {
  const lang = getCurrentLanguage()
  const trimmed = rawUrl.trim()
  if (!trimmed) {
    throw new HttpRequestError('invalid-url', translate('error.invalidUrl.empty', lang))
  }

  // 未写协议时补 http://
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new HttpRequestError('invalid-url', translate('error.invalidUrl.format', lang))
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpRequestError('invalid-url', translate('error.invalidUrl.scheme', lang))
  }

  for (const row of params) {
    const key = row.key.trim()
    if (!row.enabled || !key) continue
    url.searchParams.set(key, row.value)
  }

  return url.toString()
}

function buildHeaders(draft: RequestDraft): Record<string, string> {
  const headers: Record<string, string> = {}
  const actualKeys = new Map<string, string>()
  // multipart 的 Content-Type 由发送端生成（带 boundary），剔除用户手写的。
  const isFormData = draft.bodyMode === 'form-data' && methodSupportsBody(draft.method)

  for (const row of draft.headers) {
    const key = row.key.trim()
    if (!row.enabled || !key) continue

    const lowerKey = key.toLowerCase()
    if (isFormData && lowerKey === 'content-type') continue

    const previousKey = actualKeys.get(lowerKey)
    if (previousKey) delete headers[previousKey]

    actualKeys.set(lowerKey, key)
    headers[key] = row.value
  }

  if (!isFormData && !actualKeys.has('content-type') && methodSupportsBody(draft.method)) {
    if (draft.bodyMode === 'json') {
      headers['Content-Type'] = 'application/json'
    } else if (draft.bodyMode === 'x-www-form-urlencoded') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
    } else if (draft.bodyMode === 'text') {
      headers['Content-Type'] = 'text/plain; charset=utf-8'
    }
  }

  return headers
}

function buildBody(draft: RequestDraft): PreparedBody | undefined {
  if (!methodSupportsBody(draft.method) || draft.bodyMode === 'none') {
    return undefined
  }

  if (draft.bodyMode === 'x-www-form-urlencoded') {
    const params = new URLSearchParams()
    for (const row of draft.formFields) {
      const key = row.key.trim()
      if (row.enabled && key) params.append(key, row.value)
    }
    return { kind: 'text', text: params.toString() }
  }

  if (draft.bodyMode === 'form-data') {
    return { kind: 'form-data', parts: buildFormParts(draft.formData) }
  }

  return { kind: 'text', text: draft.bodyText }
}

/** 按书写顺序生成 part；同名 key 生成多个 part。 */
function buildFormParts(rows: FormFieldRow[]): PreparedFormPart[] {
  const lang = getCurrentLanguage()
  const parts: PreparedFormPart[] = []

  for (const row of rows) {
    const name = row.key.trim()
    if (!row.enabled || !name) continue

    if (row.kind === 'text') {
      parts.push({ kind: 'text', name, value: row.value })
      continue
    }

    const source = getFileSource(row.id)
    const meta = row.file
    if (!source || !meta) {
      throw new HttpRequestError(
        'file-missing',
        translate('error.formData.fileMissing', lang, { name })
      )
    }

    parts.push({
      kind: 'file',
      name,
      filename: meta.name || 'blob',
      contentType: meta.mimeType || 'application/octet-stream',
      size: meta.size,
      source
    })
  }

  return parts
}

export function methodSupportsBody(method: HttpMethod): boolean {
  return method !== 'GET' && method !== 'HEAD'
}
