# Changelog

本项目的所有重要变更记录在此文件。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [3.0.0] - 2026-11-15

> 以 `3.0.0` 为基线的整理版本：版本号统一上调，仓库历史精简为单一提交。

### Changed

- 版本号统一为 `3.0.0`（根 `package.json`、`src-vsc/package.json`、`src-chrome/manifest.json` 三处），两个 `package-lock.json` 同步
- README 的当前版本与安装示例产物名更新为 `vsc-postman-3.0.0.vsix`

### Removed

- `docs/repo-migration-plan.md`：已完成的迁移记录，不再随仓库发布（本地留存于被忽略的 `docs/internal/`）

## [2.0.0] - 2026-11-15

> 首次以 `breaking-point.vsc-postman` 扩展 ID 发布的重写版本，老用户原地升级。

### Added

- 版本号统一为 `2.0.0`（根 `package.json`、`src-vsc/package.json`、`src-chrome/manifest.json` 三处）
- `scripts/version.mjs`：版本号单一来源校验与写入（`npm run version:check` / `npm run version:set`），`build:vsc` 与 `package:vsix` 前置校验
- 根 `package.json` 补齐 `repository` / `bugs` / `homepage`（指向 `bingcoder/vsce-postman`）与 `engines.node >= 20.19`

### Changed

- 包管理从 pnpm 切换为 npm：移除 `pnpm-lock.yaml`（根与 `src-vsc`），改用 `package-lock.json`；`scripts/build-vsc.mjs`、`scripts/package-vsix.sh`、`.vscode/tasks.json`、全部文档与扩展内提示文案同步改为 `npm run` / `npm --prefix`
- 扩展身份对齐老仓库：`name` 由 `vsc-postman-extension` 改为 `vsc-postman`，`publisher` 由 `local` 改为 `breaking-point`，扩展 ID 保持 `breaking-point.vsc-postman`
- `src-vsc/package.json` 移除 `private: true`，补齐 `repository`，可直接打包发布
- `scripts/package-vsix.sh`：优先用全局 `vsce`，没有则 `npx --yes` 拉取；npx 缓存固定在仓库内 `.npm-cache/`，打包后自动清理
- 文档中的 `OWNER` 占位链接全部替换为 `bingcoder/vsce-postman`
- 两份扩展 README（`src-vsc` / `src-chrome`）改为中英双语（中文在前、英文在后），标题统一为 `vsc-postman`，去掉标题下的英文副标题；VS Code 版移除安装/使用/要求/已知限制章节，Chrome 版移除安装/已知限制章节

### Migration

- 新增 `src-vsc/migrate.ts`：首次激活时把 1.x 的 workspace 配置 `vscPostman.history` 一次性并入 `globalState` 的 `vsc-postman:state`
  - 幂等：`vsc-postman:migrated-legacy-history` 标记，只跑一次
  - 容错：单条失败跳过；`method` 大写化、未知方法退化为 `GET`；`headers` 兼容对象/JSON 字符串，非法 JSON 保留并禁用
  - 请求体：1.x 的 `body` 字符串按内容还原——JSON 对象落为 `bodyMode: json`，其它文本落为 `text`；GET/HEAD 的 body 在 1.x 里是 query，迁移回 `params`，嵌套对象则回退为 JSON body
  - 不删除旧配置，回滚 1.x 时数据仍在
- 新增 `npm run smoke:migrate`：基于 `dist-vsc/` 编译产物 + `vscode` shim 的迁移冒烟测试（正常/异常数据、body 与 query 映射、幂等、合并、上限裁剪）

### Breaking

- 最低 VS Code 版本从 1.55 提升到 1.90（低版本用户不会自动收到该更新）
- 命令 ID 由 `vscPostman.*` 改为 `vsc-postman.*`（旧快捷键需重新绑定）
- 数据存储从工作区配置 `vscPostman.history` 迁移到扩展 `globalState`（迁移逻辑见 [docs/upgrade-plan.md](./docs/upgrade-plan.md) V3）

## [Unreleased]

### Added

- 首发文档：`docs/privacy.md`（隐私与数据处理）、`docs/store-listing-edge.md`（Edge 上架文案）
- 分宿主 README：`src-vsc/README.md`（打包为市场页正文）、`src-chrome/README.md`（随 zip 发布）
- `LICENSE`（MIT，版权人沿用 1.x 的 `2021 breaking-point`）、`CHANGELOG.md`

### Changed

- 重写根 `README.md`：首屏明确「免登录 / 数据在本地」，新增隐私与数据章节，安装改为按宿主分流，移除内部实现细节堆叠
- `scripts/build-vsc.mjs`：把 `src-vsc/README.md` 与根 `LICENSE`、`CHANGELOG.md` 复制进 `dist-vsc/`（vsce 需要）
- `src-chrome/vite.config.ts`：把 `src-chrome/README.md` 复制进 `dist-chrome/`
- `docs/release-plan.md`：发布凭据改为 Marketplace Trusted Publishing（Azure DevOps 全局 PAT 2026-12-01 退役）

## [0.1.1] - 2026-11-10

### Added

- 多运行时架构：同一套 UI 运行在 Vite 开发环境、生产 Web、VS Code Webview 与 Chrome/Edge MV3 扩展
- 集合与请求管理：新建、重命名、删除、复制、跨集合移动、搜索过滤
- 历史记录：默认 50 条，可在设置页调至 10–500，连续重复请求自动去重
- HTTP 调试：7 种方法、Query/Headers、JSON / Text / urlencoded / form-data 请求体、流式文件上传
- SSE 事件流：边收边展示，原始项与解析内容分栏，支持取消并保留已收事件
- 开发代理 `/__http-proxy`（含 `/raw` 字节透传与 `/stream` NDJSON 流式端点）
- 浅色 / 深色主题、中英文界面、存储页 JSON 导出
- VS Code 扩展：侧边栏 + 编辑器标签、`globalState` 工作区模型、`vsc-postman.exportStorage` 命令
- Chrome MV3 扩展：Service Worker 统一 Fetch、Host Permission 复核、渲染与 Fetch 冒烟脚本
