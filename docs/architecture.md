# 架构说明：HTTP 接口调试工作台

本文说明「接口调试」页面的分层、开发代理协议，以及 VS Code / 浏览器扩展（MV3）的接入方式。

## 1. 目标

- 同一套 UI 在 Vite 开发环境、生产 Web、VS Code Webview、浏览器扩展中运行。
- 页面只依赖抽象契约，不直接依赖浏览器 History、CORS 或某种持久化 API。
- 切换运行时只修改组合根（工厂），不改页面、Store 与请求构建逻辑。
- 界面遵循 ChatGPT 的浅色/深色中性色板与布局习惯，同时保留 Postman/Apifox 的请求工作流。

## 2. 分层

```
┌──────────────────────────────────────────────────────────────┐
│ components/layout + components/sidebar + pages/vsc-postman   │
│  ChatGPT 风格外壳、集合侧边栏、请求编辑与响应展示             │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│ stores/http-store.ts (Zustand + persist)                     │
│  draft / response / collections / history / historyLimit     │
└──────────────┬───────────────────────────────┬───────────────┘
               │                               │
┌──────────────▼──────────────┐   ┌────────────▼───────────────┐
│ services/vsc-postman        │   │ services/storage           │
│  prepareRequest + Transport │   │  StorageAdapter            │
└──────────────┬──────────────┘   └────────────┬───────────────┘
               │                               │
   ┌───────────┼──────────────┬───────────────┐      ┌──────────┴───────────┐
   ▼           ▼              ▼               ▼      ▼                      ▼
DevProxy   VscodeBridge   ExtensionBridge     Fetch   localStorage      VSCode globalState
(Vite 插件) (postMessage)  (Port → SW)    (浏览器)                        (bridge RPC)
```

关键文件：

| 文件                                          | 职责                                                 |
| --------------------------------------------- | ---------------------------------------------------- |
| `src/types/http.ts`                           | 请求/响应/错误/历史类型，方法、Body 模式常量         |
| `src/services/vsc-postman/prepare-request.ts` | 纯函数：URL 校验与参数合并、Header 归一化、Body 编码 |
| `src/services/vsc-postman/transport.ts`       | `HttpTransport` 契约、超时/取消、错误归类            |
| `src/services/vsc-postman/fetch-core.ts`      | Web / SW 共用的 Fetch、SSE 与响应解码实现            |
| `src/lib/sse.ts`                              | SSE 检测、增量解析器（WHATWG 事件流格式）            |
| `src/services/vsc-postman/file-registry.ts`   | 文件句柄登记（仅内存，不参与持久化）                 |
| `src/components/http/form-data-editor.tsx`    | `form-data` 字段编辑器（文本 / 文件行）              |
| `src-vsc/extension.ts`                        | 扩展激活、命令注册、桥接消息分发                     |
| `src-vsc/workspace.ts`                        | 宿主侧工作区模型：集合/历史快照与持久化              |
| `src-vsc/sidebar-view.ts`                     | Activity Bar 的 WebviewView 侧边栏 Provider          |
| `src-vsc/webview-host.ts`                     | 多 Webview 客户端、就绪队列与快照广播                |
| `src-vsc/panel-manager.ts`                    | 编辑器 Webview 标签管理（去重、标题、激活请求）      |
| `src-vsc/html.ts`                             | Webview HTML 资源 URI 改写与 CSP 注入                |
| `src-vsc/http.ts`                             | 宿主侧 HTTP 转发、SSE 流式与 multipart               |
| `src-vsc/multipart.ts`                        | 宿主侧流式 multipart 报文构造                        |
| `src/services/vsc-postman/*-transport.ts`     | 各运行时传输实现                                     |
| `src/services/vsc-postman/index.ts`           | 运行时选择传输实现（组合根）                         |
| `src/services/bridge/*`                       | Webview ↔ 扩展宿主 RPC 协议与客户端                  |
| `src-extension/extension-transport.ts`        | 扩展页面侧 ExtensionTransport                        |
| `src-extension/protocol.ts`                   | 扩展页面 ↔ Service Worker Port 协议                  |
| `src-extension/background.ts`                 | MV3 Service Worker，统一执行 Fetch                   |
| `src-extension/permissions.ts`                | Host Permission 匹配模式                             |
| `src-extension/manifest.json`                 | MV3 清单                                             |
| `src-extension/app.html`                      | 扩展页面入口（点击图标在新标签页打开）               |
| `src-extension/vite.config.ts`                | MV3 构建配置                                         |
| `src/services/storage/*`                      | 存储适配器与选择逻辑                                 |
| `src/components/sidebar/*`                    | 集合树、请求列表、历史、搜索                         |
| `src/lib/theme.ts` / `src/hooks/use-theme.ts` | 浅色 / 深色 / 系统主题                               |
| `vite-plugins/dev-http-proxy.ts`              | 开发代理中间件                                       |

## 3. 运行时判定

`src/lib/runtime.ts` 依次判断：

1. 存在全局 `acquireVsCodeApi` → `vscode-webview`
2. 存在 `chrome.runtime.id` → `browser-extension`
3. 其他 → `web`

传输层选择（`src/services/vsc-postman/index.ts`）：

| 环境            | 条件                         | 实现                                         |
| --------------- | ---------------------------- | -------------------------------------------- |
| VS Code Webview | 优先                         | `VscodeTransport` → `postMessage` RPC        |
| 浏览器扩展      | 次优先                       | `ExtensionTransport` → Port → Service Worker |
| 任意环境        | 配置了 `VITE_HTTP_PROXY_URL` | `DevProxyTransport`（指向该地址）            |
| Vite 开发       | `import.meta.env.DEV`        | `DevProxyTransport('/__http-proxy')`         |
| 其他            | 默认                         | `FetchTransport`                             |

存储层选择（`src/services/storage/index.ts`）：Webview 使用桥接存储，其余使用 localStorage；桥接失败自动回退到 localStorage，localStorage 不可用时退回内存。

## 4. 传输契约

```ts
type PreparedBody =
  { kind: 'text'; text: string } | { kind: 'form-data'; parts: PreparedFormPart[] }

type PreparedFormPart =
  | { kind: 'text'; name: string; value: string }
  | {
      kind: 'file'
      name: string
      filename: string
      contentType: string
      size: number
      source: { kind: 'memory'; file: File } | { kind: 'path'; path: string }
    }

type PreparedRequest = {
  method: HttpMethod
  url: string
  headers: Record<string, string>
  body?: PreparedBody
}

interface HttpTransport {
  readonly kind: 'dev-proxy' | 'vscode' | 'fetch' | 'extension'
  send(
    request: PreparedRequest,
    options?: {
      signal?: AbortSignal
      requestId?: string
      onUploadProgress?: (progress: { loaded: number; total: number }) => void
      /** 响应被判定为 SSE 时回调一次（响应头已到） */
      onStreamStart?: (info: {
        status: number
        statusText: string
        headers: Record<string, string>
        contentType: string | null
        finalUrl?: string
      }) => void
      /** SSE 增量文本；bytes 为该分片的原始字节数 */
      onStreamChunk?: (chunk: string, bytes: number) => void
    }
  ): Promise<HttpResult>
}
```

`HttpResult` 统一为 `status/statusText/headers/bodyText/bodyBase64/contentType/durationMs/sizeBytes/truncated/finalUrl`。失败通过 `HttpRequestError`（`invalid-url | timeout | aborted | network | proxy-error | unsupported | file-missing`）抛出，Store 转为 `ResponseState.error`。

SSE 约定：

- 判定规则见 `shouldStreamEventStream()`：响应 `content-type` 为 `text/event-stream`（可带参数）即流式处理；或客户端显式 `Accept: text/event-stream` 且响应是文本类型（兼容把事件流错标成 `text/plain` 的服务端）。普通请求行为不变。
- 进入流式后 `send()` 仍会等到流结束才 resolve，期间通过 `onStreamChunk` 增量交付；resolve 的 `HttpResult` 只在 `status/headers/durationMs/sizeBytes` 等摘要字段上有意义，`bodyText` 为 `null`（正文以事件流形式增量展示，不再整包缓存）。
- 连接阶段沿用 `DEFAULT_TIMEOUT_MS`（30s，等响应头）；进入流式后只保留 `IDLE_TIMEOUT_MS`（120s 无任何字节）的空闲超时，没有总时长上限。
- 流式期间取消 / 超时都会中断上游（开发代理断开时 `response.on('close')` 中止 fetch；VS Code 走 `http.abort`），已收到的事件保留在 `ResponseState.stream` 中。

`prepareRequest` 的约定：

- 仅允许绝对 `http(s)` URL；空值或非法值抛 `invalid-url`。
- Params 使用 `URL.searchParams.set` 合并，同名参数覆盖 URL 中已有值，保留 hash。
- Headers 大小写不敏感去重，后出现的覆盖先出现的；未显式设置时按 Body 模式补 `Content-Type`。
- `GET/HEAD` 不发送 Body。
- `x-www-form-urlencoded` 通过 `URLSearchParams` 编码，只包含启用且 key 非空的行。
- `form-data` **剔除用户手写的 `Content-Type` 且不自动补齐**：multipart 的 boundary 只能由浏览器 / 扩展宿主在发送时生成，提前写死会让服务端无法解析。文件句柄不存在时抛 `file-missing`（文件内容不持久化，重新打开后需重选）。

## 5. 开发代理协议

端点：`POST /__http-proxy`（`src/services/vsc-postman/constants.ts` 中 `DEV_PROXY_PATH`）。

请求：

```json
{
  "url": "https://api.example.com/users?page=1",
  "method": "POST",
  "headers": { "Content-Type": "application/json", "Authorization": "Bearer ..." },
  "body": "{\"name\":\"Ada\"}",
  "timeoutMs": 30000
}
```

成功响应（HTTP 200）：

```json
{
  "ok": true,
  "response": {
    "ok": true,
    "status": 200,
    "statusText": "OK",
    "headers": { "content-type": "application/json" },
    "contentType": "application/json",
    "bodyText": "{\"id\":1}",
    "bodyBase64": null,
    "durationMs": 42,
    "sizeBytes": 9,
    "truncated": false,
    "finalUrl": "https://api.example.com/users?page=1"
  }
}
```

失败响应（仍为 HTTP 200，便于客户端统一解析）：

```json
{ "ok": false, "error": { "code": "timeout", "message": "请求超时（30s）" } }
```

参数不合法返回 HTTP 400；非 POST 返回 405。

中间件规则：

- 仅开发环境注册（`apply: 'serve'`），默认只监听 localhost。
- 请求体上限 10MB，响应上限 5MB（超出置 `truncated`），超时 1s–120s（默认 30s）。SSE 走独立的 `/stream` 端点，不套用 5MB 展示上限（改由前端限制展示缓冲）。
- 转发前移除 hop-by-hop 头与 `sec-*`：`host`、`connection`、`content-length`、`transfer-encoding`、`accept-encoding`、`keep-alive`、`te`、`trailer`、`upgrade`。
- 文本类内容按 UTF-8 解码；二进制返回 base64；`set-cookie` 合并为换行分隔字符串。
- 仅支持 http/https，不跟随用户提供的非 HTTP 协议。

安全提示：这是一个**本地开发用**的开放转发器，可访问本机/内网地址（SSRF 风险仅限开发机）。不要把带此插件的 dev server 暴露到公网。

### 5.1 multipart raw 透传

`form-data` 无法走上面的 JSON envelope（文件内容不能 JSON 序列化，base64 还会膨胀 33%），改用独立端点：

```
POST /__http-proxy/raw?url=<percent-encoded 目标 URL>&method=POST
content-type: multipart/form-data; boundary=----WebKitFormBoundary...
content-length: 104857600
<原始 multipart 字节，原样转发>
```

- 请求体**不解析、不缓冲**：直接作为上游请求的 body 流式转发（`Readable.from` + `duplex: 'half'`），因此没有体积上限，内存占用与文件大小无关。
- 保留 `content-type`（含 boundary）与 `content-length`；剔除 `host/connection/transfer-encoding/accept-encoding/origin/referer/cookie/sec-*` 等浏览器自动头。
- 必须剔除 `expect`：undici 的 fetch 不支持 `Expect: 100-continue`，转发会导致请求直接失败（`UND_ERR_NOT_SUPPORTED`）。
- `redirect: 'manual'`：流式 body 无法在 307/308 后重放，重定向响应原样返回给 UI。
- 不设总时长，只设空闲超时（`IDLE_TIMEOUT_MS`，默认 120s）：客户端断开或长时间没有任何字节流动即中断上游。
- 响应仍是与 §5 完全一致的 JSON envelope（响应侧仍按 `MAX_RESPONSE_BYTES` 截断，那是展示限制，与上传无关）。
- 目标 URL 放在 query 里，超长 URL 受 URL 长度限制；用户自定义请求头直接作为代理请求头传递。

### 5.2 SSE 流式透传

`POST /__http-proxy/stream`，请求体与 §5 一致（`{ url, method, headers, body, timeoutMs }`），响应为 `application/x-ndjson`：

```
{"type":"start","status":200,"statusText":"OK","headers":{...},"contentType":"text/event-stream; charset=utf-8","finalUrl":"..."}
{"type":"chunk","text":"event: tick\ndata: {\"n\":1}\n\n","bytes":33}
{"type":"chunk","text":"data: 第二块\n\n","bytes":24}
{"type":"end","durationMs":947,"sizeBytes":243,"truncated":false}
```

- 上游不是事件流时只回一帧完整结果，客户端无需额外分支：
  `{"type":"result","response":{ ...与 §5 的 response 完全一致... }}`
- 请求未发出（DNS / 连接失败 / 参数不合法）时回 `{"type":"error","error":{ code, message }}`；`start` 之后出错也回 `error` 帧（`end` 不再发送），客户端保留已收到的事件。
- 分片用 `TextDecoder(..., { stream: true })` 增量解码，跨分片的多字节 UTF-8 字符不会被拆坏；`bytes` 是该分片的原始字节数。
- 连接阶段沿用 `timeoutMs`（1s–120s，默认 30s）；响应头到达后清掉总时长，改为 `IDLE_TIMEOUT_MS`（120s）空闲超时。
- 客户端断开时中止上游 fetch；达到展示上限时前端会主动 abort，代理随之释放上游连接。
- 外部代理（`VITE_HTTP_PROXY_URL`）若还是旧版本、返回 404/405，客户端自动回退到 §5 的一次性端点（此时 SSE 只能收完后展示）。

## 6. VS Code Webview 接入

VS Code 侧使用侧边栏 Webview + 多个编辑器 Webview 标签，共用同一套 React 组件，不再注册原生 TreeView：

- Activity Bar 的 `vsc-postman.sidebar`（`sidebar.html`）：`WebviewView`，复用 `AppSidebar`，负责集合、历史、搜索与新建入口。
- 编辑器的 `vsc-postman.workbench`（`index.html`）：每个请求 / 历史 / 新建草稿 / 设置各占一个原生标签。已保存请求按 requestId 去重，历史按 entryId 去重，设置单例；新建请求和复制请求始终新开标签。

页面已经内置桥接客户端，扩展侧只需：

1. 构建扩展：`npm run build:vsc`。它会构建共享 UI（`index.html` + `sidebar.html`）、编译 `src-vsc/`，并组装完整的扩展根目录 `dist-vsc/`（其中 `media/` 内含前端产物）。
2. 创建侧边栏 `WebviewView` 与编辑器 Webview 标签（可多个），允许脚本，并限制 `localResourceRoots` 为 `media/`。
3. 改写 `dist-vsc/media/index.html` 与 `sidebar.html` 中 `./assets/...` 为 `webview.asWebviewUri(...)`，并注入 CSP。
4. 处理 `vsc-postman/request` 消息，回传 `vsc-postman/response`。

宿主用 `src-vsc/webview-host.ts` 管理所有客户端，用 `src-vsc/panel-manager.ts` 管理编辑器标签：每个客户端独立维护就绪状态与可见性；`workspace.ready` 回快照，`workspace.changed` / `settings.changed` 广播给所有标签和侧边栏。侧边栏隐藏时 `postMessage` 会被 VS Code 丢弃，因此重新可见时会补发完整快照；编辑器标签从后台切回时同样补发。

除 `http.request` / `storage.*` 外，桥接还支持：

- `file.pick`：宿主弹出 `showOpenDialog`，返回 `{ files: [{ path, name, size }] }`。Webview 里的 `<input type="file">` 拿不到本地路径，所以文件选择一律走宿主。
- `http.abort`：按客户端生成的 `requestId` 中断宿主侧进行中的请求（普通请求、multipart 与 SSE 都适用；webview 取消或超时后宿主不应继续跑）。
- `http.request` 的 multipart 形态：`{ url, method, headers, requestId, timeoutMs: 0, formData: { parts } }`，其中文件 part 只带绝对路径。宿主用 `fs.createReadStream` 边读边组报文（`src-vsc/multipart.ts`），预计算 `content-length`，因此不受 webview postMessage 消息体量限制，也没有文件大小上限。
- `panel.openRequest` / `panel.openHistory` / `panel.newRequest` / `panel.openSettings` / `panel.focus` / `panel.duplicateRequest`：侧边栏请求宿主打开、聚焦或复制编辑器标签；已保存请求与历史按 id 去重，设置单例，新建/复制始终新开标签。
- `activeRequest.changed`：宿主 → 侧边栏，用于高亮当前聚焦标签对应的已保存请求；`workspace.ready` 快照也携带 `activeRequestId`，避免首帧竞态。
- `workspace.activeRequest`：编辑器标签 → 宿主，草稿切换后同步当前激活请求；`workspace.update` 还携带 `draftId`，用于草稿保存后把 untitled 标签绑定到新请求。
- `workspace.update` 现包含 `historyLimit`，宿主据此同步历史上限，避免被默认值覆盖。

SSE 流式帧（与最终回复共用同一个 RPC `id`）：

```ts
type BridgeStreamFrame =
  | { type: 'start'; info: { status; statusText; headers; contentType; finalUrl? } }
  | { type: 'chunk'; text: string; bytes: number }
  | { type: 'error'; error: { code; message } }

// 宿主 → webview，可多次发送，先于最终的 vsc-postman/response
{ type: 'vsc-postman/stream', id: '<rpc id>', frame: BridgeStreamFrame }
```

- 宿主只在响应被判定为 SSE 时发 `start` + `chunk`；普通响应仍然只回一条 `vsc-postman/response`（一次 `arrayBuffer()` + 原有的 5MB 截断），行为与旧版一致。
- 分片在宿主侧按 50ms / 64KB 合并后再 `postMessage`：模型 token 级输出不会造成消息风暴。
- 流结束/出错时宿主回复最终摘要（`status/headers/durationMs/sizeBytes/truncated/finalUrl`，`bodyText: null`）；出错时同时回 `ok:false`，webview 把它当作流错误处理，已展示的分片不回滚。
- 连接阶段 30s 总超时，进入 SSE 后改为 120s 空闲超时；心跳与注释行会刷新空闲计时（按字节算，而不是按事件算）。

建议 CSP（页面没有内联脚本，因此不需要 nonce；请求走 postMessage，不需要 `connect-src`）：

```
default-src 'none';
script-src ${webview.cspSource};
style-src ${webview.cspSource};
img-src ${webview.cspSource} data:;
font-src ${webview.cspSource};
connect-src 'none';
```

宿主消息处理示例（Node 20+，与开发代理保持相同的结果结构；这里只展示非流式路径，SSE 的完整实现见 `src-vsc/extension.ts` 的 `forwardHttp`）：

```ts
panel.webview.onDidReceiveMessage(async (message) => {
  if (message?.type !== 'vsc-postman/request') return

  const reply = (payload: unknown, ok = true) =>
    panel.webview.postMessage({
      type: 'vsc-postman/response',
      id: message.id,
      ok,
      ...(ok ? { payload } : { error: payload })
    })

  try {
    if (message.method === 'storage.get') {
      reply({ value: context.globalState.get<string>(message.payload.key) ?? null })
      return
    }
    if (message.method === 'storage.set') {
      await context.globalState.update(message.payload.key, message.payload.value)
      reply(null)
      return
    }
    if (message.method === 'storage.remove') {
      await context.globalState.update(message.payload.key, undefined)
      reply(null)
      return
    }
    if (message.method === 'http.request') {
      const started = Date.now()
      const { url, method, headers, body, timeoutMs = 30_000 } = message.payload
      const response = await fetch(url, {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs)
      })
      const buffer = Buffer.from(await response.arrayBuffer())
      const contentType = response.headers.get('content-type')
      const textual = !contentType || /text\/|json|xml|javascript|urlencoded/i.test(contentType)

      reply({
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers),
        contentType,
        bodyText: textual ? buffer.toString('utf8') : null,
        bodyBase64: textual ? null : buffer.toString('base64'),
        durationMs: Date.now() - started,
        sizeBytes: buffer.byteLength,
        truncated: false,
        finalUrl: response.url
      })
      return
    }
  } catch (error) {
    reply({ code: 'network', message: error instanceof Error ? error.message : '请求失败' }, false)
  }
})
```

注意：

- `acquireVsCodeApi()` 每个 Webview 只能调用一次，客户端已单例缓存。
- 宿主应对 Body 大小与二进制做与开发代理一致的限制（示例省略）。
- Node `fetch` 不校验证书例外；自签名证书会失败，可在扩展中按需配置，但不建议全局关闭校验。
- Webview 内不要指向 dev server（HMR 与 CSP 都不适配），使用构建产物。

### 6.x 1.x 数据迁移（一次性）

2.0 首次启动时由 `src-vsc/migrate.ts` 把 1.x 的历史并入新存储：

- **来源**：workspace 配置 `vscPostman.history`（`string[]`，每项是 JSON 字符串 `{name,url,method,headers,createTime,updateTime?}`）。
- **目标**：`globalState` 的 `vsc-postman:state`（zustand persist 信封），并合并进现有集合/历史。
- **触发**：`activate()` 里 `WorkspaceModel` 构造之后、任何 webview 就绪之前执行，保证首个 `workspace.ready` 快照就带上迁移后的历史。
- **幂等**：用 `globalState` 标记 `vsc-postman:migrated-legacy-history`，只跑一次；迁移中途抛错则不落标记，下次激活重试。
- **容错**：单条解析失败只跳过（计入 `skipped`），不整体失败；`method` 统一大写、未知方法退化为 `GET`；`headers` 兼容对象/JSON 字符串，非法 JSON 保留原文并标记该行为禁用；缺 `url` 的条目丢弃。
- **不删旧数据**：`vscPostman.history` 原样保留，回滚到 1.x 仍有数据。
- **展示差异**：1.x 不保存请求体，迁移条目 `status = null`、`durationMs = 0`、`error` 标记为「从旧版本导入，重新发送后才会显示响应」。
- **验证**：`npm run smoke:migrate`（加载 `dist-vsc/` 编译产物 + `vscode` shim，覆盖正常/非法/缺字段/幂等/合并/上限裁剪）。

## 7. 浏览器扩展（MV3）接入

### 7.1 结构

浏览器扩展入口是 `src-extension/app.html`，它复用与 Web / VS Code 相同的 React UI。`chrome.runtime.id` 使 `detectRuntime()` 返回 `browser-extension`，组合根随之选择 `ExtensionTransport`。Service Worker 监听 `chrome.action.onClicked`，在新标签页打开 `chrome-extension://<id>/app.html`；页面已存在时聚焦现有标签页，不再重复新建。

```
App Page (chrome-extension://<id>/app.html)
  │ chrome.runtime.connect({ name: 'vsc-postman:http' })
  │ request / abort / ping
  ▼
Background Service Worker
  ├─ chrome.permissions.contains() 二次校验
  ├─ executeFetch()（与 Web 共用 fetch-core）
  └─ start / chunk / result / error
  ▼
目标 HTTP API
```

文本请求通过 JSON 可序列化的 wire 格式传给 SW；带文件的 multipart 无法通过 Port 传输 `File`，改由扩展页面直接 fetch（`buildBrowserFormData` + `executeFetch`），boundary 与上传仍由浏览器流式处理。

### 7.2 Manifest

```json
{
  "manifest_version": 3,
  "minimum_chrome_version": "116",
  "host_permissions": ["http://*/*", "https://*/*"],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_title": "Open vsc-postman"
  }
}
```

- 声明 `host_permissions`：安装时一次授予全部 http/https 站点访问权限，发送请求时不再调用 `chrome.permissions.request()`。
- 不声明 `side_panel` / `sidePanel`：应用是普通扩展页面，由 `chrome.action.onClicked` 在新标签页打开。
- 不声明 `cookies`，Fetch 固定 `credentials: 'omit'`。
- 点击工具栏图标时由 Service Worker 调用 `chrome.tabs.create()` 打开页面；重复点击会先通过 `chrome.runtime.getContexts()` 查找并聚焦已打开的页面，因此不需要 `tabs` 权限。

### 7.3 Host Permission

- 安装时由 manifest 的 `host_permissions` 一次授予全部 http/https 站点访问，`ExtensionTransport` 不再在发送前申请权限，也不会弹出按域名的授权框。
- Service Worker 收到请求后仍调用 `chrome.permissions.contains()` 复核：如果用户在扩展详情页把「站点访问」改成「点击时」或指定站点，会返回 `permission-denied`，请求区提示改回「在所有网站上」后重新发送。
- 匹配模式不支持端口，因此按主机整体授权（同一主机的所有端口共用）；这里只为 `contains()` 生成模式，不再发起授权请求。
- 设置页不再提供站点权限管理；收回权限通过扩展详情页完成，`chrome.permissions.remove()` 无法移除 manifest 中声明的必需权限。

### 7.4 限制与生命周期

- 支持文件上传：带文件的 `form-data` 在扩展页面本地发送、不经过 Service Worker；上传期间关闭页面会中断请求。
- 不携带 Cookie：即使目标服务端返回 `Set-Cookie`，扩展也不会保存或回传。
- 响应仍受 5MB 展示上限约束；SSE 使用 120s 空闲超时，SSE 期间扩展页面每 20s 发一次 `ping`，降低 Service Worker 因空闲被回收的概率。
- MV3 Service Worker 仍有生命周期与长任务限制；如果后续需要超长 SSE，应评估 Offscreen Document 或把流改由扩展页面持有，这需要与“统一在 SW Fetch”的目标做取舍。
- Service Worker 发出的请求会带上 `Origin: chrome-extension://<id>`；部分服务端会按该 Origin 做限制，这不是 CORS 能绕过的。
- 构建：`npm run build:extension`，加载 `dist-extension/`。Chrome 137+ 品牌版会忽略 `--load-extension` 自动化参数，手工“加载已解压的扩展程序”不受影响；CI 可使用 Edge / Chrome for Testing。

## 8. 状态、集合与持久化

Store：`src/stores/http-store.ts`，持久化 key 为 `vsc-postman:state`，只持久化 `collections`、`history` 与 `historyLimit`。`draft`（正在编辑的请求）和 `response` 只存在于内存，属于会话内临时状态。

```ts
type Collection = {
  id: string
  name: string
  requests: SavedRequest[]
  createdAt: number
  updatedAt: number
}
```

- 集合是一级扁平分组，不支持嵌套文件夹或拖拽排序。初始为空，不预置默认集合，用户通过侧边栏「+」或保存请求时创建。
- 保存请求时按 `draft.id` 在所有集合中查找：已存在则更新并允许移动到目标集合；不存在则插入目标集合顶部。
- 复制请求（`duplicateRequest`）在目标集合内新建一条记录：整份数据深拷贝，`params` / `headers` / `formFields` / `formData` 的行 id 全部换新，`form-data` 的内存文件句柄按新行 id 重新登记，因此副本可直接发送；名称按「原名 副本」生成，同集合重名时追加序号；副本插在原请求之后并立即成为当前 `draft`。
- `response` 有五种状态：`idle / loading / stream / success / error`（`stream` 用于 SSE）。`stream` 状态持有 `phase`（`open / ended / aborted`）、响应头元信息、已解析事件、原始报文与统计字段；取消后只把 `phase` 置为 `aborted`，已收到的事件继续可读、不写历史。
- SSE 分片先进入模块级缓冲，按 `STREAM_FLUSH_INTERVAL_MS`（80ms）合并进 store，避免每个网络分片触发一次 React 渲染；事件与原始文本分别累计，原始文本上限 `MAX_STREAM_DISPLAY_BYTES`（2MB）、事件上限 `MAX_STREAM_EVENTS`（2000），任一达到上限即主动断开并在界面提示已截断。
- 历史记录里的 SSE 请求只在正常结束或出错时写入（取消不写），记录状态码、耗时与错误，不保存正文。
- 历史默认最多 50 条（`DEFAULT_HISTORY_LIMIT`），可在设置页调整上限（`historyLimit`，10–500，预设 20 / 50 / 100 / 200 / 500）；写入时按上限截断，调小上限会立即裁掉最旧的记录。每条记录包含方法、URL、状态码、耗时、时间、错误信息与请求快照。历史快照保留发送时的 `draft.id`，若仍对应已保存请求则再次保存会更新它，否则新增。
- `form-data` 的行与文件元信息会随集合/历史一起持久化，但文件内容只存在内存（Web 的 `File` 与 VS Code 的路径句柄在 `file-registry.ts` 里），刷新后 `prepareRequest` 抛 `file-missing`，UI 提示重新选择。
- 相邻去重：写入前用 `requestFingerprint`（方法 + 实际 URL + 规范化 Headers + Body，见 `src/lib/history.ts`）和最新一条比对，连续发送同一个请求时不新增记录，而是用最新一次的结果替换它；中间夹了其他请求则各留一条。
- 尚未正式发布，没有历史数据需要兼容，`persist` 不设 `version` / `migrate`；改动持久化结构时直接改字段，必要时手动清空 `vsc-postman:state`。
- 保存内容包含 Headers（可能含 Token），目前为明文存储；如需加密，应在 `StorageAdapter` 层实现。

## 9. 扩展新能力的步骤

新增请求通道：

1. 在 `transport.ts` 中确认契约是否需要扩展。
2. 新建 `xxx-transport.ts` 实现 `HttpTransport`。
3. 在 `index.ts` 的 `createHttpTransport()` 中按运行时返回。
4. 若跨进程，按 `protocol.ts` 增加消息类型和宿主处理。

新增存储：

1. 在 `storage/adapters.ts` 实现 `StorageAdapter`。
2. 在 `storage/index.ts` 的 `getStorageAdapter()` 中按运行时返回。

新增页面能力（环境变量、鉴权助手、嵌套集合等）：优先扩展 `RequestDraft` / `PreparedRequest` 类型与 `prepareRequest`，保持传输层与 UI 解耦。

## 10. 验证

```bash
npm run lint
npm run build
npm run build:extension
npm run build:vsc
npm run package:vsix
npm run dev
npm run smoke:migrate
```

浏览器扩展自动化冒烟测试：

```bash
# 检查扩展页面能否在 chrome-extension:// 下正常渲染
npm run smoke:extension

# 检查 SW 跨域 Fetch、text-only form-data、SSE 与取消
npm run smoke:extension:fetch
```

脚本默认优先使用 Edge（Chrome 137+ 品牌版会忽略 `--load-extension`）。需要指定浏览器时：

```bash
BROWSER_PATH=/path/to/chrome-for-testing npm run smoke:extension
```

开发代理手工验证：

```bash
curl -s -X POST http://127.0.0.1:5173/__http-proxy \
  -H 'content-type: application/json' \
  -d '{"url":"http://127.0.0.1:5173/","method":"GET"}' | head -c 400
```

预期返回 `"ok": true` 且 `bodyText` 包含页面 HTML。错误路径可用 `"url":"ftp://example.com"`（参数错误）与 `"url":"http://127.0.0.1:59999/"`（连接被拒绝）。

SSE 流式端点手工验证（需要任意一个会持续输出 `data:` 的事件流地址）：

```bash
curl -sN -X POST http://127.0.0.1:5173/__http-proxy/stream \
  -H 'content-type: application/json' \
  -d '{"url":"http://127.0.0.1:8787/events","method":"GET"}'
```

预期先看到 `{"type":"start",...}`，随后连续出现 `{"type":"chunk",...}`，最后是 `{"type":"end",...}`；普通 JSON 目标只会回一帧 `{"type":"result",...}`。

## 11. 已知限制

- 不支持环境变量、嵌套集合/文件夹、拖拽排序、鉴权助手、代码生成、Mock。
- 不支持二进制响应下载、Cookie 凭据（`credentials: 'omit'`）。
- 浏览器扩展的文件上传由扩展页面直接发送，因此上传期间不能关闭页面；也不申请 `cookies` 权限，因此无法使用浏览器会话 Cookie。
- 浏览器扩展的长 SSE 受 MV3 Service Worker 生命周期限制；当前通过 20s `ping` 缓解空闲回收，但没有绕过浏览器对 Service Worker 的长任务上限。
- Chrome 137+ 品牌版忽略 `--load-extension` 自动化参数，扩展冒烟脚本因此优先使用 Edge / Chrome for Testing；手工加载 `dist-extension/` 不受影响。
- SSE 只做「调试展示」：不自动重连、不发 `Last-Event-ID`、不把 `retry` 用于重连；展示缓冲上限 2MB / 2000 事件，达到后主动断开（原始报文仍可查看已接收部分）。`EventSource` 的浏览器自动重连语义不会在这里复现。
- `form-data` 上传：不跟随 3xx（流式 body 无法重放，重定向响应原样展示）；`Content-Length`、`User-Agent`、`Connection` 等浏览器禁止头在 raw 模式下无法由用户设置；`VITE_HTTP_PROXY_URL` 指向的外部代理必须实现 `/__http-proxy/raw`；若要实时 SSE，还需实现 `/__http-proxy/stream`（缺失时自动回退为收完后展示）。
- VS Code 下文件只能通过宿主选择框选取（webview 拿不到本地路径），因此同一请求在 Web 与 VS Code 间切换后需要重新选文件。
- VS Code 编辑器标签使用 `WebviewPanel`，未实现 serializer：Reload Window 后不会恢复标签；关闭未保存标签也不会弹出确认。
- VS Code 每个编辑器标签都是完整 Webview，并开启 `retainContextWhenHidden`，标签较多时内存占用会上升。
- VS Code 的「复制请求」由宿主复制已保存版本，不包含当前标签里尚未保存的草稿修改。
- 仅展示最终 URL，不展示重定向链；不自动解压后的头信息修正（响应头按上游返回展示）。
- 开发代理不校验目标 TLS 证书配置，自签名目标会失败。
- 没有单元测试框架；`prepareRequest` 为纯函数，便于后续接入 Vitest。浏览器扩展提供渲染与 Fetch 冒烟脚本（见 §10）。

## 12. 界面与主题

- 侧边栏：默认 240px（200–480px 可拖拽），包含品牌、设置入口、新建请求、搜索、集合树与历史记录；移动端为带遮罩的抽屉。VS Code 侧边栏复用同一组件，宽度由工作台控制，不显示收起按钮。
- 主区域：最大宽度 896px 居中；请求 composer 与响应面板使用圆角边框，发送按钮为高对比圆形按钮（浅色下为黑色）。
- 设计令牌：`src/styles/globals.css` 定义 ChatGPT 风格的中性色板与 `--sidebar-*` 变量；`.dark` 使用 #212121（主区域）/ #171717（侧边栏）。
- 主题：`src/lib/theme.ts` 与 `src/hooks/use-theme.ts` 支持 `light | dark | system`。`system` 优先读取 VS Code Webview 的 `body.vscode-dark/light` 类名，其次使用 `prefers-color-scheme`；用户选择写入 localStorage 的 `vsc-postman:theme`。
- 首屏：`main.tsx` 在 React 渲染前调用 `initializeTheme()`，减少主题闪烁；不依赖内联脚本，兼容 Webview CSP。
