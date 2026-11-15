# vsc-postman

## 为什么用它

大多数接口调试工具默认你会注册账号、把集合同步到它们的云。vsc-postman 去掉了这条链路：

- **免登录**：装完即用，没有账号、注册、邀请码。
- **数据在本地**：集合、历史、设置写入 VS Code 扩展的本机存储（`globalState`），不上传、不同步。
- **无埋点**：不含任何分析或崩溃上报 SDK，不加载远程代码。
- **不碰 Cookie**：请求固定 `credentials: 'omit'`，不读取也不重放你的登录态。
- **完整调试力**：7 种方法、四种请求体、流式文件上传、SSE 事件流。

## 功能

- 请求：`GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS`，Query、自定义 Headers
- 请求体：JSON、纯文本、`x-www-form-urlencoded`、`form-data`（文本与文件混排、同名多文件、不限大小、可随时取消）
- 响应：状态码、耗时、大小、Headers、正文；JSON 格式化 / 原始视图 / 一键复制
- **SSE 事件流**：`text/event-stream` 边收边展示，左侧原始项、右侧解析内容，取消后保留已收事件
- 集合：新建、重命名、删除、复制请求、跨集合移动、搜索过滤
- 历史：默认最近 50 条，可调 10–500，连续重复请求自动去重
- 侧边栏与编辑器标签联动；浅色/深色跟随 VS Code 主题；中英文界面

## 命令

| 命令                                  | 说明                                         |
| ------------------------------------- | -------------------------------------------- |
| `vsc-postman: Open`                   | 新建或打开请求标签                           |
| `vsc-postman: New request`            | 新建请求                                     |
| `vsc-postman: Refresh`                | 刷新侧边栏                                   |
| `vsc-postman: Export storage as JSON` | 把本机存储导出为 JSON 文件并打开（用于留档） |

## 数据与隐私

- 集合、历史、设置保存在扩展的 `globalState`（本机），**不随 Settings Sync 同步**。
- 请求从你的机器直接发往你填写的地址；扩展不做后台联网。
- Headers 可能包含 Token，且为明文存储；`form-data` 只记录文件元信息，不保存文件内容。
- 当前只有导出、没有导入；换设备前请先导出。
- 完整说明：[Privacy & data handling](https://github.com/bingcoder/vsce-postman/blob/main/docs/privacy.md)

## 反馈

问题与建议：[Issues](https://github.com/bingcoder/vsce-postman/issues)

## License

[MIT](https://github.com/bingcoder/vsce-postman/blob/main/LICENSE)

---

# vsc-postman

## Why this

Most API debugging tools assume you will register an account and sync your collections to their cloud. vsc-postman removes that entire path:

- **No sign-in**: install and go. No account, no registration, no invite codes.
- **Data stays local**: collections, history and settings are written to the extension's on-device storage (`globalState`). Nothing is uploaded or synced.
- **No telemetry**: no analytics or crash-reporting SDK, no remote code loading.
- **No cookies touched**: requests are fixed to `credentials: 'omit'`, so your login state is never read or replayed.
- **Full debugging power**: 7 methods, four body types, streaming file upload, SSE event streams.

## Features

- Requests: `GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS`, with Query params and custom headers
- Bodies: JSON, plain text, `x-www-form-urlencoded`, `form-data` (text and files mixed, multiple files per field, no size limit, cancellable at any time)
- Responses: status code, duration, size, headers, body; JSON formatting / raw view / one-click copy
- **SSE streams**: `text/event-stream` displayed as it arrives, raw events on the left and parsed content on the right; cancelling keeps the events already received
- Collections: create, rename, delete, duplicate requests, move across collections, search filter
- History: latest 50 by default, adjustable from 10 to 500, consecutive duplicate requests deduplicated automatically
- Sidebar and editor tabs stay in sync; light/dark follows the VS Code theme; Chinese and English UI

## Commands

| Command                               | Description                                                  |
| ------------------------------------- | ------------------------------------------------------------ |
| `vsc-postman: Open`                   | Create or open a request tab                                 |
| `vsc-postman: New request`            | Create a new request                                         |
| `vsc-postman: Refresh`                | Refresh the sidebar                                          |
| `vsc-postman: Export storage as JSON` | Export on-device storage as a JSON file and open it (backup) |

## Data & privacy

- Collections, history and settings are stored in the extension's `globalState` (on this machine) and **are not synced by Settings Sync**.
- Requests go straight from your machine to the URL you typed; the extension makes no background network calls.
- Headers may contain tokens and are stored in plain text; `form-data` only records file metadata, never file contents.
- Currently export-only, no import; export before switching machines.
- Full details: [Privacy & data handling](https://github.com/bingcoder/vsce-postman/blob/main/docs/privacy.md)

## Feedback

Questions and suggestions: [Issues](https://github.com/bingcoder/vsce-postman/issues)

## License

[MIT](https://github.com/bingcoder/vsce-postman/blob/main/LICENSE)
