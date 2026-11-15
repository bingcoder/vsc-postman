/**
 * `vscode` 模块的最小替身，仅用于在 Node 里跑 `dist-vsc` 的迁移逻辑。
 *
 * 行为对齐 VS Code：
 * - `getConfiguration(section).get(key)` 的 key 是相对于 section 的；
 * - `globalState.get/update` 异步写、同步可读。
 */
const state = { config: {} }

module.exports = {
  __reset() {
    state.config = {}
  },
  /** 设置 `vscPostman.history`（完整 key，便于测试里直观点） */
  __setLegacyHistory(items) {
    state.config['vscPostman.history'] = items
  },
  workspace: {
    getConfiguration(section) {
      return {
        get(key) {
          return state.config[`${section}.${key}`] ?? state.config[key]
        }
      }
    }
  },
  l10n: {
    t: (message, ...args) =>
      String(message).replace(/\{(\d+)\}/g, (_match, index) => String(args[index]))
  },
  env: { language: 'en' }
}
