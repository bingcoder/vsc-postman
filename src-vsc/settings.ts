import * as vscode from 'vscode'
import { APP_STORAGE_KEY } from './workspace'

/**
 * 界面语言：唯一来源是设置页写入的持久化状态（与 webview 的 zustand 信封同键），
 * 未设置过时退回 VS Code 的显示语言。扩展不再贡献 host 侧配置项。
 */
export function resolveLanguage(context: vscode.ExtensionContext): 'zh' | 'en' {
  const raw = context.globalState.get<string>(APP_STORAGE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { state?: { language?: unknown } }
      const language = parsed.state?.language
      if (language === 'zh' || language === 'en') return language
    } catch {
      // 信封损坏时按系统语言兜底
    }
  }
  return vscode.env.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}
