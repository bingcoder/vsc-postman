import type { HttpResult, PreparedRequest } from '@/types/http'
import { buildBrowserFormData } from './browser-form-data'
import { executeFetch } from './fetch-core'
import type { HttpTransport, SendOptions } from './transport'

export class FetchTransport implements HttpTransport {
  readonly kind = 'fetch' as const

  async send(request: PreparedRequest, options: SendOptions = {}): Promise<HttpResult> {
    const formParts = request.body?.kind === 'form-data' ? request.body.parts : null
    const body = formParts
      ? buildBrowserFormData(formParts)
      : request.body?.kind === 'text'
        ? request.body.text
        : undefined

    return executeFetch(request, body, {
      ...options,
      upload: Boolean(formParts?.some((part) => part.kind === 'file'))
    })
  }
}
