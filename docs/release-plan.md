# 发布流水线（push master → 自动发版 → VS Code 市场 + Edge 人工上传包）

> 本文件是**已实现流水线**的说明书。代码：`.github/workflows/release.yml`、`scripts/release-bump.mjs`、`scripts/package-chrome.mjs`、`scripts/version.mjs`、`scripts/package-vsix.sh`。

## 1. 一句话链路

```
push master
   │
   ▼
prepare  读「上个 tag 之后的提交」→ 决定 bump（feat / fix / perf / 破坏性）→ 算出 vX.Y.Z
   │                                                   │ 无可发布内容 → 整条流水线结束
   ▼
build    写三处版本号 → 构建 → 打包 .vsix + Edge zip → 校验 → 发 VS Code 市场（OIDC）
   ▼
tag      回写版本提交 → 打 vX.Y.Z → 建 GitHub Release
         （附件：vsc-postman-X.Y.Z.vsix、vsc-postman-edge-X.Y.Z.zip）
                                   │
                                   ▼
                        人工：Partner Center 上传 zip → Publish（约 2 分钟）
```

**VS Code 全自动，Edge 半自动**：CI 保证「包一定是对的、版本一定没漂」，Edge 侧只剩一次拖拽上传。

## 2. 什么时候会发版

默认按 Conventional Commits 判断，**不做「每个 commit 都发」**（否则市场会被历史提交灌满版本）：

| 提交特征                                                                | 动作   |
| ----------------------------------------------------------------------- | ------ |
| `feat!:` / 正文含 `BREAKING CHANGE`                                     | major  |
| `feat:`                                                                 | minor  |
| `fix:` / `perf:`                                                        | patch  |
| `docs:` `chore:` `style:` `test:` `ci:` `refactor:` `build:` `release:` | 不发版 |
| 无前缀                                                                  | 不发版 |

手动覆盖：`workflow_dispatch` 的 `bump` 可选 `auto / patch / minor / major`。

防呆两条：

- **不循环**：tag job 的提交信息带 `[skip ci]`，且下一轮的计算范围从新 tag 之后开始，天然为空。
- **可刹车**：`dry_run=true`（默认值）只构建校验不发市场、不打 tag；仓库变量 `VSC_PUBLISH=false` 单独关掉 VS Code 发布。

## 3. 版本号：仍然只有一处权威

`package.json` 的 `version` 是唯一来源，`scripts/version.mjs set` 一次写三处：

| 文件                       | 为什么必须同步                  |
| -------------------------- | ------------------------------- |
| `package.json`             | 权威值，`release-bump.mjs` 读它 |
| `src-vsc/package.json`     | 打进 `.vsix`，市场按它判断版本  |
| `src-chrome/manifest.json` | Edge zip 的版本，重复会被拒收   |

`release-bump.mjs` 只**算**不写，`version.mjs` 只**写**不算，职责分离。版本格式受商店约束：1~4 段点分整数，每段 0–65535，无前导零。

## 4. VS Code Marketplace（全自动）

用 **Trusted Publishing（GitHub OIDC）**，不存任何长期凭据：

```yaml
permissions: { id-token: write }
# 在 dist-vsc 下执行，publisher 取自 package.json
npx @vscode/vsce publish --oidc --packagePath …/vsc-postman-X.Y.Z.vsix
```

几个必须知道的细节：

- **PAT 已经不能用**：Azure DevOps 的全局 PAT 在 **2026-12-01 退役**，靠 `VSCE_PAT` 的流水线到期后会静默失败，所以这里直接用 OIDC。
- 需要先在 Marketplace publisher 页 → **Trusted Publishing** 建策略：Repository owner `bingcoder`、Repository `vsc-postman`、Workflow `release.yml`、Environment `production`（必须与 workflow 里的 `environment: production` 一致，否则 OIDC 主体对不上）。
- Marketplace 凭据 15 分钟有效，每个 OIDC token 只能用一次 → 发布步骤失败要重跑整个 job，不能「续跑」。
- 打包传了 `--githubBranch master`：vsce 会按仓库默认分支改写 README 里的相对链接，本仓库默认分支是 `master` 而不是 `main`。
- **Environment 必须两边一致**：workflow 里写的是 `environment: production`，策略里 Environment 就填 `production`；如果你不想用环境审批，把 workflow 里那一行删掉，策略里也留空。
- 打包前有校验：README 里出现相对图片路径会直接失败（市场页不解析相对路径，会裂图）。

## 5. Edge Add-ons（CI 出包，人工上传）

官方确实有 Add-ons REST API（v1.1，`api.addons.microsoftedge.microsoft.com`），但它能做的很有限，所以这里**不接自动提交**：

| 限制                                                    | 后果                                  |
| ------------------------------------------------------- | ------------------------------------- |
| 只能更新**已存在**的产品，不能创建新产品                | 首次上架无论如何都得走 Partner Center |
| 不能改商店元数据（描述、截图、权限理由）                | 改文案仍要网页操作                    |
| 上传/提交是异步操作，要轮询 operationId                 | 流水线要加轮询、超时、重试逻辑        |
| 上一次提交仍在审核时再次提交会报 `InProgressSubmission` | 自动重试无意义，仍需人判断            |

权衡结果：CI 产出**已校验的 zip**（`manifest.json` 在根目录、版本三处一致、体积打印），挂到 Release；人工上传约 2 分钟，零维护、不引入 Client ID / API Key 这类会过期的凭据。

打包脚本：`npm run package:chrome` → `out/vsc-postman-edge-<version>.zip`，内部会校验：

- `manifest.json` / `background.js` / `app.html` / `icon.png` 都在 zip **根目录**；
- 没有外层文件夹（`dist-chrome/manifest.json` 这种会被商店拒收）；
- 版本号是 1~4 段点分整数。

> 注意：这个 zip 同时也是「加载解压的扩展」用的产物，但**不发布到 Chrome Web Store**，本期只面向 Edge。

## 6. 需要配置的东西

### 仓库 Secrets

| 名称           | 用途                      | 必填           |
| -------------- | ------------------------- | -------------- |
| `GITHUB_TOKEN` | 回写版本提交 / 建 Release | 内置，无需配置 |

### 仓库 Variables（可选）

| 名称          | 值      | 作用                  |
| ------------- | ------- | --------------------- |
| `VSC_PUBLISH` | `false` | 临时关闭 VS Code 发布 |

### 平台侧（一次性，只能人工点）

1. **VS Code Trusted Publishing**：<https://marketplace.visualstudio.com/manage> → 打开 publisher `breaking-point` → **Trusted Publishing** → Create：
   - Repository owner：`bingcoder`
   - Repository：`vsc-postman`
   - Workflow：`release.yml`
   - Environment：`production`
2. **Edge Partner Center**：用 @outlook / @live / @hotmail 的 MSA 注册，首次提交完整 listing（截图、logo、隐私政策、权限理由）。**首次必须网页完成**，之后每次更新只需在 Packages 页上传 zip。
3. **分支保护**：若 master 禁止 bot 推送，tag job 会自动退化为「只在远端打 tag」，版本以 tag 为准，不阻塞发布。
4. **Actions 写权限**：Settings → Actions → General → Workflow permissions 选 **Read and write**（否则 tag job 推不回 master、建不了 Release）。

## 7. 第一次怎么跑

```bash
# 1) 本地先验证打包与版本判定（不发任何请求）
npm run package:chrome      # out/vsc-postman-edge-<version>.zip
npm run release:bump        # 看它算出什么版本、什么理由

# 2) 推一个 DRY RUN：Actions → release → Run workflow，dry_run=true
#    产出 vsix + zip，不发市场、不打 tag；检查 job summary 与产物

# 3) 正式发一次：dry_run=false，bump=patch
#    之后每次 push 就按提交类型自动发版；Edge 那一步从 Release 下载 zip 手动上传
```

## 8. 出问题怎么处理

| 现象                         | 含义 / 处理                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| 流水线直接跳过、没有 Release | 这次提交里没有 feat/fix/perf —— 设计如此；要强发用 dispatch + `bump=patch`         |
| `vsce publish` 失败          | Trusted Publishing 策略的 workflow 名 / environment 与本仓库不一致；或该版本已发布 |
| 市场拒收该版本               | manifest 版本与线上重复 —— `version.mjs check` 会提前拦住                          |
| Edge 上传报「版本已存在」    | 版本号没递增，或上次已上传同版本；CI 的版本一致性校验就是为了防这个                |
| 需要撤回                     | VS Code 不能撤回，只能发更高版本；Edge 可在 Partner Center 停止分发                |
| master 推不上去              | 分支保护挡住了 bot；tag 与 Release 仍会生成                                        |

## 9. 与早期方案的不同

唯一实质变化是 **VS Code 发布从 `VSCE_PAT` 换成 GitHub OIDC**：PAT 2026-12-01 退役，不换就会在到期后静默失败。Edge 仍然是「CI 出包 + 人工上传」，与早期判断一致。

## 参考

- [Publishing Extensions / Secure automated publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace)
- [Trusted Publishing for Visual Studio Marketplace](https://developer.microsoft.com/blog/trusted-publishing-visual-studio-marketplace/)
- [Use the REST API to update an extension（Edge，备用参考）](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api)
