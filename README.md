# vsc-postman

> 免登录、数据只留在本机的 HTTP 接口调试台 —— 装在 VS Code 和浏览器里。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%E2%89%A51.90-007ACC?logo=visualstudiocode&logoColor=white)](#vs-code-扩展)
[![Edge](https://img.shields.io/badge/Edge-Chromium%20116%2B-0078D7?logo=microsoftedge&logoColor=white)](#edge--chrome-扩展)

- **免登录**：没有账号、注册、邀请码、云端工作区。装完打开就能发请求。
- **数据在本地**：集合、历史、设置只写进浏览器的 `localStorage` 或 VS Code 的扩展存储，不上传、不同步、不经过任何服务器。
- **一套 UI，三个宿主**：VS Code 侧边栏与编辑器标签、Edge/Chrome 扩展、普通 Web 页面，共享同一份 React 代码。
- **调试力不打折**：Query / Headers / 四种请求体 / 不限大小的流式文件上传 / SSE 事件流边收边看。

> 当前版本 `3.0.0`。VS Code 扩展沿用既有扩展 ID `breaking-point.vsc-postman`（老用户原地升级）；Chrome/Edge 版本本期不发布，仍为本地加载。安装步骤见[安装](#安装)。

## 界面预览

![vsc-postman 请求页：左侧集合与历史，右侧请求编辑器（浅色主题，英文界面）](./docs/preview/vsc-postman-preview-light.png)

![vsc-postman 请求页（深色主题，中文界面）](./docs/preview/vsc-postman-preview-dark.png)

左边是集合与历史，右边是请求编辑器：选方法、填 URL、切 `Params / Headers / Body`，发送后响应在下方展开。浅色 / 深色跟随宿主主题，界面中英文可切换。上面两张是同一页面的浅色英文与深色中文状态（都是新建请求、尚未发送的初始界面）。

## 为什么是它

现成的接口调试工具大多默认你会注册一个账号，把集合同步到它们的云上——这对公司内网系统、带真实 Token 的请求、客户环境地址来说，常常是不可接受的。vsc-postman 把这条链路砍掉：

| 你的关注点          | 这里的行为                                                        |
| ------------------- | ----------------------------------------------------------------- |
| 要不要注册          | 不要。没有账号体系，也没有「登录以同步」的引导                    |
| 数据去了哪          | 只在本机。Web/扩展用 `localStorage`，VS Code 用 `globalState`     |
| 会不会被统计        | 没有埋点、没有遥测 SDK、没有远程配置                              |
| 会不会偷偷存 Cookie | 不会。请求固定 `credentials: 'omit'`，扩展也不申请 `cookies` 权限 |
| 会不会加载远程代码  | 不会。扩展 CSP 限定 `script-src 'self'`，所有代码随包分发         |

The same facts, in English: no account, no sign-in, no cloud sync, no telemetry. Collections and history are stored in the browser's `localStorage` or in VS Code's extension storage, and requests go straight from your machine to the URL you typed.

## 隐私与数据

这一节是发布口径的**唯一来源**，商店页与市场文案都从这里派生。完整版见 [docs/privacy.md](./docs/privacy.md)。

| 项目          | 行为                                                                                                             | 代码依据                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 账号 / 注册   | 不存在                                                                                                           | 全仓无登录入口与鉴权模块                                  |
| 遥测 / 埋点   | 不存在                                                                                                           | 无 analytics SDK、无上报端点                              |
| 云同步        | 不存在                                                                                                           | 仅 `localStorage` / `globalState` 两种持久化适配器        |
| 存储内容      | 集合、历史、设置、语言、主题                                                                                     | `src/services/storage/adapters.ts`                        |
| 敏感内容      | Headers 可能含 Token；`form-data` 只存**文件元信息**，不存文件内容                                               | `src/stores/http-store.ts`                                |
| 网络去向      | 只有你自己点「发送」的那一个 URL；开发环境经本机 Vite 代理，生产 Web 若配置 `VITE_HTTP_PROXY_URL` 才经该转发地址 | `src/services/vsc-postman/fetch-core.ts`                  |
| 卸载 / 清数据 | 一并丢失；当前只支持**导出** JSON 快照，尚无导入                                                                 | `src/pages/storage-page.tsx`、`vsc-postman.exportStorage` |

三条已知边界，请一并知道：

1. **换设备不会自动带过去**。VS Code 的 `globalState` 不进 Settings Sync，浏览器 `localStorage` 也不跨设备；请用「导出存储为 JSON」留档。
2. **明文存储**。Headers 里的 Token 与本地文件路径是明文，共享机器上请自行判断（见 [docs/architecture.md §8](./docs/architecture.md)）。
3. **生产 Web 版**如果配置了 `VITE_HTTP_PROXY_URL`，请求会经过你自己指定的转发服务——「不中转」只对扩展版与未配置代理的 Web 版成立。

## 功能

- HTTP 方法：`GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS`
- Query 参数、自定义 Headers、`JSON / Text / x-www-form-urlencoded / form-data` 请求体
- `form-data` 文本与文件混排、同名多文件、流式转发不限制大小、可随时取消；开发代理显示上传进度
- 响应状态码、耗时、大小、Headers、正文；JSON 格式化 / 原始视图 / 一键复制
- **SSE 事件流**：`text/event-stream` 边收边展示，左侧原始项 + 右侧解析内容分栏，支持取消并保留已收事件
- 集合管理：新建、重命名、删除、复制请求、跨集合移动、搜索过滤
- 历史记录：默认最近 50 条，可在设置页调到 10–500；连续重复请求只留一条
- 浅色 / 深色主题（`system` 跟随系统或 VS Code 主题）、中英文界面、`⌘/Ctrl + Enter` 发送
- 存储页可视化查看当前持久化内容，并可复制为 JSON

## 安装

三个宿主各自有独立说明，按你用的环境跳转：

| 宿主               | 说明                                           | 产物                                       |
| ------------------ | ---------------------------------------------- | ------------------------------------------ |
| VS Code 扩展       | [src-vsc/README.md](./src-vsc/README.md)       | `dist-vsc/` → `vsc-postman-<version>.vsix` |
| Edge / Chrome 扩展 | [src-chrome/README.md](./src-chrome/README.md) | `dist-chrome/` → zip                       |
| 源码运行（Web）    | 本文下面一节                                   | `dist/`                                    |

### VS Code 扩展

未在 Marketplace 上架时，从源码打包安装：

```bash
npm install
npm --prefix src-vsc install
npm run package:vsix
code --install-extension vsc-postman-3.0.0.vsix --force
```

打包脚本优先用本机全局 `vsce`；没有则自动 `npx --yes @vscode/vsce`，无需全局安装。要求 VS Code 1.90 及以上。安装后在活动栏点击 vsc-postman 图标：侧边栏是集合与历史，请求在编辑器标签里打开。细节见 [src-vsc/README.md](./src-vsc/README.md)。

### Edge / Chrome 扩展

> 本期不发版，以下仅用于本地调试。

```bash
npm run build:chrome
```

1. 打开 `edge://extensions`（或 `chrome://extensions`），开启开发者模式。
2. 选择「加载解压缩的扩展」，指向 `dist-chrome/`。
3. 点击工具栏图标，在新标签页打开应用页面。

要求 Chromium 116+。`manifest.json` 声明了全部 http/https 站点权限，发送请求时不再逐域名弹窗；需要收回时在扩展详情页把「站点访问」改为「点击时」。权限逐条用途见 [src-chrome/README.md](./src-chrome/README.md#权限说明)。

### 从源码运行（Web）

```bash
npm run dev
```

打开终端输出的地址（默认 `http://localhost:5173/#/`）。开发环境通过 Vite 插件 `/__http-proxy` 转发请求以绕开 CORS，该中间件只监听本机、不进入生产构建。

## 体积

三个宿主都随包分发完整前端，不依赖 CDN、不加载远程脚本，装好断网也能用。

| 产物                   | 下载体积   | 解包后 | 文件数 | 内容                                          |
| ---------------------- | ---------- | ------ | ------ | --------------------------------------------- |
| VS Code 扩展 `.vsix`   | **398 KB** | 1.3 MB | 29     | 扩展宿主 JS + 同一份 Webview 前端             |
| Edge / Chrome 扩展 zip | **360 KB** | 1.1 MB | 8      | MV3 清单 + Service Worker + 同一份前端 bundle |
| 共享 Web UI `dist/`    | —          | 1.1 MB | 7      | 同时作为 VS Code Webview 的 `media/` 资源     |

体积几乎都花在一个前端 bundle 上：约 1.03 MB 的 JS（gzip 332 KB）加 56 KB 的 CSS（gzip 9.8 KB），来自 React、CodeMirror 编辑器与 Radix / Base UI 组件运行时。包里没有字体文件、没有截图素材（图标仅 12 KB）、没有 sourcemap，也没有任何运行时的二次拉取——这正是[隐私与数据](#隐私与数据)里「不加载远程代码」的物质基础。

## 构建与产物

```bash
npm run build          # 共享 Web UI → dist/（同时作为 VS Code Webview 的 media）
npm run build:chrome   # Edge/Chrome MV3 → dist-chrome/
npm run build:vsc      # 完整 VS Code 扩展根目录 → dist-vsc/
npm run package:vsix   # 打包 vsc-postman-<version>.vsix
npm run package:chrome # 打包 out/vsc-postman-edge-<version>.zip（校验 zip 结构）
npm run release:bump   # 按提交类型算出下一个版本，并生成 release-notes.md
```

产物使用相对路径（`base: './'`）与 `HashRouter`，适配无 History API 的 Webview / 扩展容器。

## 发布

推送 `master` 即触发 [release 流水线](./.github/workflows/release.yml)：按语义化提交决定要不要发版 → 同步三处版本号 → 构建校验 → `vsce publish --oidc` 发 VS Code 市场（无需 PAT）→ 打 tag 并生成 Release。

Edge Add-ons 不做自动提交：CI 会把校验过的 `vsc-postman-edge-<version>.zip` 挂到 Release，到 Partner Center 上传即可（商店首次上架、元数据修改本来就只能网页操作）。完整说明、凭据配置与排错表见 [docs/release-plan.md](./docs/release-plan.md)。

## 已知限制

- 不支持环境变量、嵌套集合、拖拽排序、鉴权助手、代码生成、Mock
- 不支持二进制响应下载与 Cookie 凭据（固定 `credentials: 'omit'`）
- SSE 只做调试展示：不自动重连、不发 `Last-Event-ID`，展示上限 2MB / 2000 事件
- `form-data` 只持久化文件元信息，刷新后需重新选择文件
- VS Code 标签使用 `WebviewPanel`，Reload Window 后不恢复标签
- 开发代理不校验证书，自签名目标会失败

完整清单见 [docs/architecture.md §11](./docs/architecture.md)。

## 目录结构

```
src/            共享 React UI、Zustand Store、运行时抽象（Web / VS Code Webview / 扩展页面）
src-chrome/     MV3 扩展宿主：Service Worker、Port 协议、manifest、应用页面入口、扩展 README
src-vsc/        VS Code 扩展宿主：Webview、RPC、globalState 工作区模型、l10n、扩展 README
vite-plugins/   仅开发环境使用的 Vite 插件（/__http-proxy）
scripts/        构建与冒烟测试脚本
docs/           架构、隐私说明、商店上架文案
docs/preview/   README 与商店页截图（原图 2560×1600；store/ 下是 1280×800 上传版）
```

三份 README 的分工：根 README 面向仓库访客与贡献者；`src-vsc/README.md` 打包为 `dist-vsc/README.md`，就是 Marketplace 页面正文；`src-chrome/README.md` 随 `dist-chrome/` 打进商店 zip。改文案时注意各自约束（市场页不能用相对链接、不能有 SVG）：根 README 的截图用 `./docs/preview/` 相对路径，两份市场 README 只能用 GitHub raw 绝对地址，换图时同一组文件要改两处引用形式。

切换运行时只改两个组合根：`src/services/vsc-postman/index.ts`（请求通道）与 `src/services/storage/index.ts`（持久化），页面代码不感知环境。协议细节见 [docs/architecture.md](./docs/architecture.md)。

## 环境变量

| 变量                  | 作用                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `VITE_HTTP_PROXY_URL` | 非开发环境指定 HTTP 转发地址；需实现 `/__http-proxy`、`/__http-proxy/raw`、`/__http-proxy/stream` |

参见 [.env.example](./.env.example)。

## 文档

- [docs/architecture.md](./docs/architecture.md) — 分层、传输契约、代理协议、Webview 与 MV3 接入
- [docs/privacy.md](./docs/privacy.md) — 隐私与数据处理说明（可直接作为商店 Privacy Policy）
- [docs/store-listing-edge.md](./docs/store-listing-edge.md) — Edge Add-ons 上架表单文案与素材清单
- [docs/release-plan.md](./docs/release-plan.md) — 发布流水线：版本判定、OIDC 发布、Edge 手动上传、排错
- [src-vsc/README.md](./src-vsc/README.md) — VS Code 扩展说明（打包后即市场页正文）
- [src-chrome/README.md](./src-chrome/README.md) — Edge / Chrome 扩展说明（随 zip 发布）
- [CHANGELOG.md](./CHANGELOG.md)

## License

[MIT](./LICENSE)
