# 发布自动化方案（push master → 升版本 → 发 VS Code / Edge 市场）

## 1. 现状盘点

| 项目             | 现状                                                                                             | 影响                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| 远端             | `git remote -v` 为空，只有本地 `master`                                                          | 没有远端就没有「push 触发」，CI 是前置条件                   |
| CI               | 无 `.github/`、无任何流水线配置                                                                  | 全部新建                                                     |
| 版本号           | 3 处重复：`package.json`、`src-vsc/package.json`、`src-chrome/manifest.json`，当前均为 `0.1.1`   | 必须收敛为单一来源，否则三个产物版本会漂移                   |
| VS Code 打包     | `scripts/package-vsix.sh`（依赖全局 `vsce` 1.88.0），产物 `dist-vsc/`                            | 可复用，但需改成 CI 内 `npx @vscode/vsce`               |
| Chrome/Edge 打包 | 只有 `npm run build:chrome` 产出 `dist-chrome/`，**没有打 zip 的脚本**                              | 需要新增打包脚本（Edge 上传要 zip）                          |
| publisher        | `src-vsc/package.json` 里是 `"publisher": "local"`                                               | 未改成真实 publisher 前无法发市场                            |
| 依赖安装         | 根目录与 `src-vsc/` 是**两套独立依赖**（`src-vsc` 有自己的 `package-lock.json`，无 workspace 配置） | CI 必须装两次：`npm install` + `npm --prefix src-vsc install`    |
| 扩展状态         | README 写「尚未正式发布」，Marketplace 与 Edge 都还没上架                                        | VS Code 与 Edge 都要先完成**首次人工发布**，之后才谈自动更新 |
| README 分工      | 根 README 面向仓库；`src-vsc/README.md` 打包为市场页正文；`src-chrome/README.md` 随 zip 发布     | 三份文案需同口径，市场版不能用相对链接/SVG                   |

## 2. 目标链路

```
git push origin master
        │
        ▼
  CI：判断该不该发版（语义化提交）
        │  否 → 结束（不打扰市场）
        ▼ 是
  升版本号（3 个文件一次改完）→ 构建 → 校验产物
        │
        ├─→ vsce publish          → VS Code Marketplace（即时生效，无审核）
        └─→ 打 zip → 上传 Edge Add-ons（有审核，最长 7 个工作日）
        │
        ▼
  自动提交 chore(release): v0.x.y + 打 tag + GitHub Release 挂产物
```

## 3. 必须先说清的一条硬限制：Edge 目前不能真正「自动发布」

查过官方文档（`learn.microsoft.com/microsoft-edge/extensions/publish/publish-extension`，2026-08-12 更新）：Edge Add-ons 的发布流程**全程是 Partner Center 网页操作**——上传 zip、填 Availability/Properties/Privacy/Store listings、点 Publish 进审核。官方没有对外公开的提交 API（Chrome Web Store 有，Edge 没有）。

所以「自动发布到 Edge」只有三种落地方式，建议选 A：

| 方案                                 | 做法                                                                                                | 评价                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **A. 自动备包 + 人工点上传（推荐）** | CI 产出 `vsc-postman-edge-x.y.z.zip` 挂到 GitHub Release，你打开 Partner Center 拖拽上传，约 2 分钟 | 稳、不违规、零维护；发布节奏仍由 CI 保证「包一定是对的」             |
| B. Playwright 硬自动化               | 自托管 runner + 持久化登录态，脚本模拟点击上传                                                      | 能跑，但 2FA/cookie 会过期、页面改版即挂、有违反商店条款风险，不建议 |
| C. 只自动 VS Code，Edge 完全手动     | 最省事                                                                                              | 版本号仍需人工同步                                                   |

> 注意：首次提交必须人工走完整 listing 流程（截图、logo、隐私政策、权限理由）。**通过一次之后**，后续更新才只是「上传 zip → Publish」。

VS Code 侧则是真·全自动：`vsce publish` 用 Azure DevOps PAT，发布即时生效、不需要审核队列。

## 4. 版本号策略

**单一来源 = 根 `package.json` 的 `version`**，其余两处由脚本写入。

新增 `scripts/version.mjs` 三个子命令：

```bash
npm run version:check          # 校验三处一致，不一致直接 exit 1（CI 与 pre-commit 都用）
npm run version:set 0.2.0      # 一次写三处
npm run version:bump patch      # patch | minor | major，基于当前版本自增
```

目标文件：

- `package.json` → `version`
- `src-vsc/package.json` → `version`（`build-vsc.mjs` 会把它复制进 `dist-vsc/`）
- `src-chrome/manifest.json` → `version`（vite 插件在 `closeBundle` 时复制进 `dist-chrome/`，所以**必须在 build 之前**改）

版本格式约束（Edge/Chrome 比 npm 严）：1~4 段点分整数，每段 0–65535，不能有前导零。`0.1.2` 这种三段式两者都合法，保持现状即可。

## 5. 触发与 bump 规则

**不建议**「每次 commit 都发一版」——这个仓库已经有 30 个 commit，等于 30 次公开发版，且 docs/样式微调都会触发。推荐按语义化提交判断：

| 提交类型                                            | 动作                         |
| --------------------------------------------------- | ---------------------------- |
| `feat:`                                             | minor +1（如 0.1.2 → 0.2.0） |
| `fix:` / `perf:`                                    | patch +1                     |
| `feat!:` / `BREAKING CHANGE`                        | major +1                     |
| `docs:` `chore:` `style:` `test:` `ci:` `refactor:` | 不发版                       |
| 无匹配前缀                                          | 不发版（宁可漏发，不要误发） |

三种节奏可选，方案默认第二种：

1. **全自动**：任何 push 都 patch +1 发布 —— 改动最省心，噪音最大。
2. **语义化自动（推荐）**：CI 读提交信息决定 bump，无可发布内容就跳过。
3. **手动闸门**：平时 push 只跑构建校验，只有打 `v*` tag 才真正发布 —— 最可控，但要多一步。

另外两个细节：

- **防死循环**：GitHub Actions 用 `GITHUB_TOKEN` 推的 commit **不会**再触发 workflow，天然不循环；再加 `chore(release): v0.x.y [skip ci]` 和 job 级 `if` 兜底。
- **分支保护**：如果 `master` 开了保护规则，bot 推不回去，此时退化为「只打 tag，不回写 master」，版本号在 CI 里临时改、不提交。方案里把这点做成配置开关。

## 6. 分阶段实施

### P0 前置账号（一次性，只能人工）

1. VS Code：注册 Azure DevOps 组织 → 创建 Marketplace 的 publisher（ID 比如 `your-pub-id`）→ 生成 PAT（Marketplace → Manage 权限）。
2. 改 `src-vsc/package.json`：`"publisher"` 换成真实 ID，补 `"repository"`（否则每次都得带 `--allow-missing-repository`），名称建议统一成市场里的 `vsc-postman`。
3. Edge：Partner Center 注册（须用 @outlook/@live/@hotmail 的 MSA）→ 首次提交完整 listing，拿到 product ID。
4. 把 VSIX 和 Edge zip 各人工发一次，确认市场侧链路通。

### P1 版本号单一来源（0.5 天）

- 新增 `scripts/version.mjs`（check / set / bump）。
- 在 `package-vsix.sh`、`build-vsc.mjs`、`src-chrome/vite.config.ts` 前加 `version:check` 断言。
- ✅ 打包瑕疵已修：`build-vsc.mjs` 现在会把 `src-vsc/README.md`（扩展专版）、根 `LICENSE`、`CHANGELOG.md` 复制进 `dist-vsc/`；`src-chrome/vite.config.ts` 会把 `src-chrome/README.md` 复制进 `dist-chrome/`。

### P2 打包产物统一（0.5 天）

- `npm run package:vsix` 保持，内部改用 `npx @vscode/vsce`，不再依赖全局安装。
- 新增 `scripts/package-chrome.mjs`：把 `dist-chrome/` **内容**打成 `vsc-postman-edge-<version>.zip`，**manifest.json 必须在 zip 根目录**（不能有外层文件夹），并校验 zip 内存在 `manifest.json` / `background.js` / `app.html`。
- `package.json` 加脚本：`package:chrome`、`release:dry`。

### P3 CI 流水线（1~2 天）

新增 `.github/workflows/release.yml`：

```yaml
name: release
on:
  push: { branches: [master] }
  workflow_dispatch:
    inputs:
      dry_run: { type: boolean, default: true } # 首次务必先跑 dry_run
permissions:
  contents: write
concurrency: { group: release, cancel-in-progress: false }

jobs:
  release:
    if: "!contains(github.event.head_commit.message, '[skip ci]')"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 } # 需要历史算 bump 和 tag
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm --prefix src-vsc ci # 独立的第二套依赖（package-lock 在 src-vsc/）
      - run: node scripts/release-bump.mjs >> $GITHUB_OUTPUT # 算 next version，无则 skip
      # ... 构建 → vsce package → vsce publish → build:chrome → package:chrome
      # ... git commit + tag + push → gh release create（挂 vsix + edge zip）
```

要点：

- `fetch-depth: 0`，否则算不出「上个 tag 之后的提交」。
- bump 与发布拆成两个 job 更安全：`build-and-verify` 先过（`vsce ls` 校验包内容、`unzip -l` 校验 zip），再进 `publish`。
- `dry_run` 默认 true，第一次跑只出产物不发市场。
- 产物（`.vsix` / `.zip`）通过 `actions/upload-artifact` + Release 附件双份留存，Edge 那 2 分钟人工上传就从 Release 下载。

### P4 Edge 半自动（0.5 天，可选）

- Release 正文模板里固定放：版本号、变更摘要（从 commit 生成）、zip 直链、Partner Center 链接。
- 如果之后微软放出提交 API（或你用方案 B），只替换这一段即可，其余链路不动。

### P5 验收与回滚

- 验收：一次 `feat:` 提交 → 版本变 0.2.0 → 市场可见新版本 → Edge zip 命名正确 → tag 与 Release 齐全 → 再次 push 空改动不触发发布。
- 回滚：VS Code 不能「撤回」已发布版本（只能发更高的新版，或 `vsce unpublish` 极不推荐）；Edge 可在 Partner Center 停止分发。所以 **dry_run + 产物校验** 是唯一保险。

## 7. 需要配置的凭据

> **2026-12-01 起 Azure DevOps 全局 PAT 退役**，靠 `VSCE_PAT` 的流水线会在到期后静默失败。首发前就把发布方式换成 Marketplace Trusted Publishing（GitHub OIDC），不要再新建 PAT。

| 名称                    | 用途                         | 备注                                                                                                                       |
| ----------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Trusted Publishing 策略 | `vsce publish --oidc`        | 在 Marketplace 管理页为「发布者 + 仓库 + workflow 文件名」建策略；job 需 `permissions: id-token: write`，token 15 分钟有效 |
| `VSCE_PAT`（仅过渡期）  | 旧式 `vsce publish`          | 仅在 Trusted Publishing 未配好时临时使用，2026-12-01 后不可用                                                              |
| `GITHUB_TOKEN`          | 回写版本 commit / 建 Release | 内置，只需 `permissions: contents: write`                                                                                  |
| Edge                    | 无（人工上传）               | 若走方案 B 另需 MSA 登录态，不推荐                                                                                         |

## 8. 风险清单

1. **发布即公开且不可撤回** —— 误发只能靠更高版本覆盖，故默认 `dry_run`、默认跳过非功能性提交。
2. **三个版本号漂移** —— 一旦 `manifest.json` 忘改，Edge 会以「版本已存在」拒绝上传；`version:check` 前置拦截。
3. **`src-vsc` 双依赖树** —— CI 少装一次就编译失败，已写进流水线。
4. **PAT 过期** —— 建议日历提醒，或改用 GitHub Environment + 定期轮换。
5. **Edge 审核延迟（最长 7 个工作日）** —— 两个市场必然不同步，Release 里注明。

## 9. 工作量

| 阶段     | 产出                                   | 估时                                    |
| -------- | -------------------------------------- | --------------------------------------- |
| P0       | 账号、publisher、首次人工发布          | 半天（含审核等待）                      |
| P1       | `scripts/version.mjs`                  | 0.5 天                                  |
| P2       | `scripts/package-chrome.mjs`、打包改造 | 0.5 天                                  |
| P3       | `release.yml` + release-bump 脚本      | 1–2 天                                  |
| P4       | Release 模板                           | 0.5 天                                  |
| **合计** |                                        | **约 3–4 个工作日**（不含商店审核等待） |

按方案 A（Edge 人工 2 分钟），VS Code 侧从「push」到「市场可见」约 3–5 分钟；Edge 侧从点上传到通过审核 1–7 个工作日。
