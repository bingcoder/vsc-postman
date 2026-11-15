# Edge Add-ons 上架文案与素材清单

Partner Center 的表单字段长期不可复用于仓库，因此把最终文案固化在此。**发布时逐字粘贴，不要临场重写**，避免市场页与 README 口径漂移。

## 0. 提交前必须齐全的素材

| 素材             | 规格                              | 现状                                                    |
| ---------------- | --------------------------------- | ------------------------------------------------------- |
| 扩展 Logo        | 1:1，推荐 300×300，最小 128×128   | ⚠️ 现有 `public/icon.png` 为 200×200，需重出 300/512    |
| 截图             | 640×480 或 1280×800，最多 6 张    | ⚠️ 目录 `docs/preview/` 为空，需补                      |
| 小促销图（可选） | 440×280                           | 待补                                                    |
| 大促销图（可选） | 1400×560                          | 待补                                                    |
| 打包 zip         | `manifest.json` 必须在 zip 根目录 | 待 `scripts/package-chrome.mjs`                         |
| 隐私政策 URL     | 可公开访问                        | 待托管 `docs/privacy.md`（GitHub Pages / 仓库页面均可） |

建议截图组（1280×800）：① 请求编辑 + 响应 JSON ② SSE 事件流分栏 ③ 侧边栏集合与历史 ④ 设置页（体现本地存储与历史上限）。

## 1. 商店名称与短描述

> Edge 侧这两项**只读**，取自扩展包 `manifest.json` 的 `name` / `description`，改文案必须改 manifest 并重新上传 zip。

| 字段                       | 值                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `name`                     | `vsc-postman`                                                                           |
| `short_name`               | `vsc-postman`                                                                           |
| `description`（≤132 字符） | `HTTP client with no login and no cloud: collections and history stay on your machine.` |

字符数：85。受 Chrome 的 132 字符上限约束，不要把功能列表塞进这里，详情放商店 Description。

## 2. Description（en，≥250 字符）

```text
vsc-postman is an HTTP client for your browser that never asks you to sign up. There is no
account system, no cloud workspace and no telemetry: collections, request history and settings
are written to your browser's local storage and never leave your machine.

The extension opens as a full tab, so you get room for long requests and wide responses. It
supports GET, POST, PUT, PATCH, DELETE, HEAD and OPTIONS, with query parameters, custom headers,
and four body types: JSON, plain text, x-www-form-urlencoded and multipart form-data. form-data
fields can mix text and files, use the same field name multiple times, and are streamed to the
server without a file size limit; you can cancel an upload at any point. Requests run inside the
extension's service worker, so you are not blocked by ordinary page CORS rules, and the extension
asks for no cookie access: every request is sent with credentials omitted, so a stored browser
session is never read or replayed. Authentication is done the explicit way, with the headers you
provide.

Responses show status, elapsed time, size, headers and body, with formatted JSON, a raw view and
one-click copy. Server-sent events are rendered live: raw frames on the left, parsed events on the
right, with an option to cancel while keeping everything received so far. Collections let you
group saved requests, duplicate a request, move it between collections and filter them by name,
while history keeps the last 50 requests by default (adjustable from 10 to 500) and collapses
consecutive duplicates.

Sharing machines is a real scenario, so the extension is explicit about what it stores: headers
may contain tokens and are kept in plain text, and form-data keeps only file metadata, never file
contents. A storage page shows exactly what is persisted and lets you copy it as JSON, so you can
keep your own backup before clearing browser data or switching machines.

If you want an API client that works offline, needs no sign-in, and keeps your requests to
yourself, vsc-postman is built for that.
```

## 3. Description（zh-CN，若同时提交中文语言，≥250 字符）

```text
vsc-postman 是一个不需要登录的浏览器 HTTP 接口调试工具。它没有账号体系、没有云端工作区、
也没有任何埋点统计：集合、请求历史与设置只写入浏览器的本地存储，不会离开你的电脑。

扩展以独立标签页打开，长请求和宽响应都有足够空间。支持 GET、POST、PUT、PATCH、DELETE、
HEAD、OPTIONS 七种方法，可填写 Query 参数与自定义 Headers，支持 JSON、纯文本、
x-www-form-urlencoded 与 multipart form-data 四种请求体。form-data 支持文本与文件混排、
同名多文件，并以流式方式转发、不限制文件大小，上传过程中可随时取消。请求由扩展的 Service
Worker 发出，不受普通页面的跨域限制；同时不申请 Cookie 权限，所有请求固定不带凭据，
不会读取或重放你已登录的浏览器会话，鉴权请直接填写 Headers。

响应用于展示状态码、耗时、大小、Headers 与正文，支持 JSON 格式化、原始视图与一键复制。
服务端事件流（SSE）实时渲染：左侧原始报文、右侧解析后的事件，取消时保留已收到的内容。
集合可对已保存请求分组、复制、跨集合移动与按名称过滤；历史默认保留最近 50 条（可调
10–500），连续重复的同一请求自动合并。

共享设备是真实场景，因此扩展明确交代存了什么：Headers 可能包含 Token 且为明文，
form-data 只保存文件元信息、不保存文件内容。存储页可查看当前持久化的全部内容并复制为
JSON，便于在清理浏览器数据或换机前自行留档。

如果你想要一个离线可用、无需注册、请求不外传的接口调试工具，vsc-postman 就是为此而做。
```

## 4. Search terms（≤7 个词/短语，总计 ≤21 词，每条 ≤30 字符）

```text
http client, rest client, api testing, postman alternative, sse, no login, offline
```

（7 条，共 12 个词）

## 5. Properties

| 字段            | 值                                            |
| --------------- | --------------------------------------------- |
| Category        | Developer tools                               |
| Website         | `https://github.com/bingcoder/vsce-postman`        |
| Support contact | `https://github.com/bingcoder/vsce-postman/issues` |
| Mature content  | 否                                            |
| Visibility      | Public                                        |
| Markets         | 全部                                          |

## 6. Privacy 页逐项答案

**Single purpose**

```text
Send HTTP requests to URLs the user enters and display the responses, with collections and history
stored locally in the browser.
```

**Permission justification — `host_permissions: http://*/*, https://*/*`**

```text
The extension is an HTTP debugging client: the user types any URL and the request is sent from the
extension's background service worker. Target hosts cannot be known in advance and change with
every request, so per-site host permissions cannot express this use case. The permission is used
only to perform a request when the user explicitly clicks Send. The extension does not inject
content scripts, does not read page content, and does not issue background or periodic requests.
```

**Are you using remote code?** — `No`。所有代码随包分发，CSP 为 `script-src 'self'`。

**Data usage** — 全部不勾选（不收集个人身份信息、健康、财务、认证信息、个人通信、位置、
网页浏览历史、用户活动、网站内容）。勾选并确认「I certify that the following disclosures are true」。
若表单强制要求至少选择一项，请勿臆造：先核对本扩展是否真的读取了对应数据（当前实现不会）。

**Privacy policy URL** — 托管后的 `docs/privacy.md` 地址（如 `https://bingcoder.github.io/vsce-postman/privacy`）。

## 7. Notes for certification

```text
No account or sign-in is required; the extension opens directly into the request editor.

To verify request sending: open the extension, keep the default request, replace the URL with
https://httpbin.org/get and press Send (or Ctrl/Cmd+Enter). The response panel shows status 200,
headers and a JSON body.

To verify SSE streaming: send a GET to https://httpbin.org/stream/5 with header
Accept: text/event-stream; frames appear incrementally.

To verify local-only storage: save a request into a collection, reload the tab, and confirm it is
still there. The Settings page links to a storage view showing the persisted JSON.
No external services other than the URL typed by the user are contacted.
```

## 8. 一致性检查（提交前逐条打勾）

- [ ] `manifest.json` 的 `version` 与 `package.json`、`src-vsc/package.json` 一致
- [ ] Description 与 `docs/privacy.md`、根 README「隐私与数据」章节无矛盾
- [ ] 截图里的 UI 文案语言与提交语言一致
- [ ] zip 根目录含 `manifest.json` / `background.js` / `app.html` / `icon.png`
- [x] `OWNER` 占位符已全部替换（仓库地址：`bingcoder/vsce-postman`）
