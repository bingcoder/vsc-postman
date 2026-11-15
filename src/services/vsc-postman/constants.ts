export const DEV_PROXY_PATH = '/__http-proxy'
/** raw 透传端点，请求体是原始 multipart 字节。 */
export const RAW_UPLOAD_SUFFIX = '/raw'
/** 流式端点，响应为 NDJSON 帧。 */
export const STREAM_SUFFIX = '/stream'
export const DEFAULT_TIMEOUT_MS = 30_000
export const PROXY_TIMEOUT_SLACK_MS = 5_000
/** 文本请求体上限；multipart 走流式透传，不限。 */
export const MAX_REQUEST_BYTES = 10 * 1024 * 1024
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024
/** 无数据流动的容忍时长。 */
export const IDLE_TIMEOUT_MS = 120_000
/** SSE 展示缓冲上限，超出后主动断开。 */
export const MAX_STREAM_DISPLAY_BYTES = 2 * 1024 * 1024
export const MAX_STREAM_EVENTS = 2000
export const STREAM_FLUSH_INTERVAL_MS = 80
/** 默认历史记录数，兼顾覆盖范围与持久化体积。 */
export const DEFAULT_HISTORY_LIMIT = 50
export const MIN_HISTORY_LIMIT = 10
export const MAX_HISTORY_LIMIT = 500
export const HISTORY_LIMIT_OPTIONS = [20, 50, 100, 200, 500] as const
export const STORAGE_KEY = 'vsc-postman:state'
