import { translate, getCurrentLanguage } from '@/lib/i18n'
import type { PreparedFormPart } from '@/types/http'
import { HttpRequestError } from './transport'

/** 浏览器侧组装 multipart；Content-Type 交给 fetch/XHR 生成。 */
export function buildBrowserFormData(parts: PreparedFormPart[]): FormData {
  const lang = getCurrentLanguage()
  const form = new FormData()

  for (const part of parts) {
    if (part.kind === 'text') {
      form.append(part.name, part.value)
      continue
    }

    if (part.source.kind !== 'memory') {
      // 浏览器拿不到宿主路径，VS Code 环境应走 VscodeTransport。
      throw new HttpRequestError(
        'unsupported',
        translate('error.upload.pathUnsupported', lang, { name: part.filename })
      )
    }

    form.append(part.name, part.source.file, part.filename)
  }

  return form
}
