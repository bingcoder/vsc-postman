import { useAppStore } from '@/stores/app-store'
import { translate, type Language } from '@/lib/i18n'

/** 按当前语言翻译；vars 替换 {name} 占位符。 */
export function useT(): {
  language: Language
  t: (key: string, vars?: Record<string, string | number>) => string
} {
  const language = useAppStore((state) => state.language)
  return {
    language,
    t: (key: string, vars?: Record<string, string | number>) => translate(key, language, vars)
  }
}
