/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 可选：生产环境的调试代理地址 */
  readonly VITE_HTTP_PROXY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
