# 老仓库切换与代码迁移计划

> 目标仓库：`demo/vsce-postman`（`https://github.com/bingcoder/vsce-postman.git`）
> 代码来源：`demo/vsc-postman-new`（2.0.0）
> 本文只描述步骤，**尚未执行任何仓库操作**。

---

## 0. 一句话方案

先把 `vsc-postman-new` 的 2.0 改动落成一个提交（否则没有可搬运的"树"），再在老仓库从 `master` 切 `upgrade/v2`，用 **两次提交** 完成切换：第一次纯删除旧实现，第二次用 `git read-tree` 把新仓库的树**逐字节精确导入**；然后通过"干净克隆构建 + 真实 1.1.0 升级验证"两道闸门，再合并 `master` 并打 `v2.0.0` tag。发布到市场是独立的后续步骤。

---

## 1. 现状核查（已核实）

### 1.1 老仓库

| 项 | 事实 |
| --- | --- |
| 分支 | 本地只有 `master`；远端有 `master`、`2.0.0` |
| 顶点 | `master` = `origin/master` = `260c936`（完全同步） |
| 工作区 | 干净（无未提交改动、无未跟踪文件） |
| 跟踪文件 | 38 个 |
| Tag | 无 |
| 远端 | 可访问，`git ls-remote` 正常返回 |
| `core.autocrlf` | `input`（不会发生 CRLF 转换，`read-tree` 安全） |
| 已跟踪产物 | `build/`、`dist/` 被纳入版本库（新仓库是忽略的） |
| 问题 | 根 `package.json` 的 `repository/homepage/bugs` 指向 `breaking-point/vsce-postman`，与实际远端 `bingcoder/vsce-postman` 不一致 |

### 1.2 关键发现：市场上跑的是 1.1.0，仓库里是 1.0.0

- 本机已安装扩展：`breaking-point.vsc-postman@1.1.0`
- 仓库 `master` 的 `package.json` 是 `1.0.0`，且远端 `master` 也是 `260c936`
- 结论：**1.1.0 是从"未提交到仓库的状态"发布出去的**（工作区版本号改过但没 commit，或发布后没推）
- 影响：① 仓库里不存在 1.1.0 的源码快照，无法为它打 tag；② **但 1.1.0 的存储结构与 1.0.0 相同**，迁移逻辑不用分版本
- 已从已安装的 1.1.0 确认面板保存的字段：`name / url / method / headers / body` + `createTime`

### 1.3 新仓库

| 项 | 事实 |
| --- | --- |
| HEAD | `82ca76c feat: init`，树里只有 **129** 个文件 |
| 当前 2.0 改动 | 134 个文件，**29 个文件改动还在暂存区，尚未 commit** |

> ⚠️ 这是本计划最容易被忽略的前置条件：`git fetch` 能拿到的只有提交过的树。**不先提交，`read-tree` 导入的是 0.1.1 那份旧代码。**
>
> 若不想在新仓库留提交，就必须改用"rsync 拷贝 + 排除清单"的方案 A（见 §4）。

### 1.4 两个会直接卡住迁移的缺陷（P0）

**P0-1：`src-vsc/media/activity.svg` 根本没入库**

```
$ git ls-files src-vsc/media
（空）
$ git check-ignore -v src-vsc/media/activity.svg
src-vsc/.gitignore:3:media
```

- 扩展清单里 `viewsContainers.activitybar[0].icon = media/activity.svg`，构建脚本 `build-vsc.mjs:33` 要 `cp src-vsc/media`
- 现状能构建成功，是因为文件还在本地磁盘；**任何干净克隆都会在 `npm run build:vsc` 直接失败**
- 必须修：删掉 `src-vsc/.gitignore` 里的 `media`（那是从旧模板继承的规则），把 `activity.svg` 入库

**P0-2：迁移逻辑会丢请求体**

已确认 1.1.0 保存的历史条目包含 `body`：

```js
// 1.1.0 build/bundle.js（压缩后）
.postMessage({type:"requestSave",value:JSON.stringify({...n,createTime:+new Date})})
// 表单字段：name / url / method / headers / body
```

而当前 `src-vsc/migrate.ts` 只处理 `name/url/method/headers/createTime`，`RequestDraft` 一律写成 `bodyMode: 'none'`、`bodyText: ''` → 用户迁移后请求体丢失。

需要在迁移前补上映射规则：

| 1.x `body` | 2.0 映射 |
| --- | --- |
| 空 / 缺省 | `bodyMode: 'none'`, `bodyText: ''` |
| 能 `JSON.parse` 成对象 | `bodyMode: 'json'`, `bodyText` = 原文 |
| 其它非空字符串 | `bodyMode: 'text'`, `bodyText` = 原文 |
| GET/HEAD 的 body | 保持同上（1.x 里 GET 的 body 其实是 query，2.0 允许保留文本，不擅自改 URL） |

并补 `smoke:migrate` 用例（含"有 body"的条目）。

---

## 2. 迁移前准备（都在 `vsc-postman-new` 里做）

### P0 修正（预计 1–2 小时）

1. `src-vsc/.gitignore` 删除 `media` 一行；`git add src-vsc/media/activity.svg`
2. `src-vsc/migrate.ts` 增加 `body` 映射；`scripts/migrate-smoke/run.mjs` 增加对应断言
3. 在 `build-vsc.mjs` 组装前加一个存在性断言（`src-vsc/media/activity.svg` 缺失直接报错并提示），避免同类问题再次静默通过
4. （可选）`src-vsc/.gitignore` 里的 `out` 已无用，可一并删掉

### 提交 2.0 基线（必须）

```bash
cd demo/vsc-postman-new
npm run version:check && npm run lint && npm run build:vsc && npm run smoke:migrate   # 全绿再提交
git add -A
git commit -m "feat: 2.0 基线（npm 化、扩展身份对齐、1.x 历史迁移）"
```

> 这样做还有个附带好处：`vsc-postman-new` 有了可回退的 2.0 基线，后面老仓库出问题不怕丢。

---

## 3. 分支与标签策略（老仓库）

```bash
cd demo/vsce-postman

# 1) 先同步，确认没有远端新提交
git fetch --all --tags --prune
git status                      # 必须干净
git rev-parse master origin/master   # 必须两个相同：260c936

# 2) 归档 1.x 代码，长期保留，不合并、不删除
git branch archive/1.x master
git tag -a v1.0.0-legacy -m "1.x 最后一个仓库内版本（市场 1.1.0 无对应提交）" master
git push origin archive/1.x v1.0.0-legacy

# 3) 从 master 切升级分支
git switch -c upgrade/v2 master
```

设计说明：

- **不删 `origin/2.0.0`**：仓库可能已被 fork，删分支会让别人的引用悬空。PR 描述里标注"该分支的 2.0 尝试已被本次重写取代"即可。
- **不打 `v1.1.0` tag**：仓库里没有 1.1.0 的源码，打了就是假 tag。在 CHANGELOG 里用文字说明"1.1.0 发布于仓库外"。
- `archive/1.x` 是给"合错了要整棵回退"用的，平时不碰。

---

## 4. 迁移方式：三选一，推荐 B

### 方案 A：rsync 拷贝 + 排除清单

```bash
cd demo/vsce-postman
rsync -av --delete \
  --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='dist-vsc' \
  --exclude='dist-chrome' --exclude='.npm-cache' --exclude='*.vsix' \
  /Users/liujian/demo/vsc-postman-new/ ./
```

- 优点：不依赖新仓库提交状态；排除规则一眼看懂
- 缺点：`--delete` 会连 `.git` 以外一切清掉，排除规则漏一项就会误删；产物必须严格靠 `git status` 复核

### 方案 B：`git fetch` + `read-tree` 精确导入（推荐）

```bash
cd demo/vsce-postman
git remote add vsc-new /Users/liujian/demo/vsc-postman-new
git fetch vsc-new master --no-tags

# ---- C1：删除 1.x 实现（纯删除，便于 review）----
git rm -r --ignore-unmatch --quiet \
  panel build dist src \
  webpack.config.js .eslintrc.json .yarnrc tsconfig.json \
  vsc-extension-quickstart.md .vscodeignore global.d.ts yarn.lock
git rm --ignore-unmatch --quiet \
  media/rocket.svg media/panelIcon.dark.svg media/panelIcon.light.svg media/icon.png \
  .vscode/settings.json .vscode/extensions.json
git commit -m "chore: 移除 1.x 实现（antd panel / webpack / TreeView）"

# ---- C2：导入 2.0 树（index + 工作区精确替换）----
git read-tree -u --reset vsc-new/master
git commit -m "feat: 引入 2.0 工程（共享 UI + Webview + Chrome）"

git remote remove vsc-new
```

- 优点：C2 提交的树**逐字节等于**新仓库树，事后 `git diff vsc-new/master` 必然为空，杜绝手抄误差
- 前提：新仓库已提交（§2）
- 安全点：`read-tree -u --reset` 只影响**已跟踪**文件与 index，不会动 `node_modules/`、`dist*/` 这些未跟踪目录
- 注意：它不会提示就覆盖已修改的文件，所以执行前必须 `git status` 干净

### 方案 C：一把梭（不推荐）

`git rm -r .` + 全量拷贝 + 单个 commit。最快，但历史不可读、review 无从下手、出错难定位。

### 推荐

**B**。额外好处：如果哪天有人问"迁移有没有漏文件"，一条 `git diff` 就能自证。

---

## 5. 逐文件处置清单

### 5.1 删除（旧实现，共 30 个）

> 30 + 覆盖 8 = 38，正好等于老仓库全部跟踪文件，可作为"无遗漏"的自检等式。

| 路径 | 原因 |
| --- | --- |
| `src/extension.ts`、`src/provider/side.ts`、`src/commands/history.ts`、`src/global.d.ts` | 旧 TreeView 宿主实现 |
| `panel/`（9 个文件，含 `panel/yarn.lock`） | 旧 antd 4 面板子工程 |
| `build/bundle.js`、`build/index.html` | 旧面板产物（新仓库不跟踪产物） |
| `dist/extension.js`、`dist/extension.js.map` | 旧 webpack 产物 |
| `webpack.config.js`、`tsconfig.json`、`.eslintrc.json`、`.yarnrc`、`yarn.lock` | 旧构建链 |
| `global.d.ts`、`vsc-extension-quickstart.md`、`.vscodeignore` | 旧模板遗留 |
| `media/rocket.svg`、`media/panelIcon.dark.svg`、`media/panelIcon.light.svg` | 旧图标，新清单用 `src-vsc/media/activity.svg` |
| `media/icon.png` | 与 `public/icon.png` **sha 完全相同**（`37bc549f…`），构建时由 `public/` 复制进 `dist-vsc/media/` |
| `.vscode/settings.json` | 指向 `out/` 与旧 problem matcher，已过期；`.vscode/extensions.json` 改为由新文件覆盖 |

### 5.2 被覆盖（同名但内容/语义变化，8 个）

| 路径 | 变化 |
| --- | --- |
| `package.json` | **语义变了**：旧的=扩展清单；新的=前端/构建包。扩展清单移到 `src-vsc/package.json` |
| `README.md` | 换成新仓库版本（去掉 Deprecated） |
| `CHANGELOG.md` | 换成新版本（含 2.0.0 / 迁移条目） |
| `.gitignore` | 换成新版本（忽略 `dist*/`、`*.vsix`、`.npm-cache/`） |
| `.vscode/launch.json` | 指向 `${workspaceFolder}/dist-vsc` |
| `.vscode/tasks.json` | 改为 `npm run build:vsc` / `watch:vsc` |
| `.vscode/extensions.json` | 推荐项更新为 `dbaeumer.vscode-eslint` + `esbenp.prettier-vscode`，去掉 `eamodio.tsl-problem-matcher` |
| `LICENSE` | **由 §11 决策 1 决定是否覆盖** |
| `media/icon.png` | 删除旧路径，改由 `public/icon.png` → `dist-vsc/media/icon.png` |

### 5.3 新增（约 130 个）

- 共享 UI：`src/`（约 60）、`index.html`、`sidebar.html`、`vite.config.ts`、`vite-plugins/`、`tsconfig.*`、`eslint.config.js`、`.prettierrc`、`.prettierignore`、`components.json`、`public/`
- 扩展宿主：`src-vsc/`（含 `migrate.ts`、`workspace.ts`、`l10n/`、`media/activity.svg`、`package.json`、`package-lock.json`）
- Chrome：`src-chrome/`（本期不发，只入库）
- 脚本：`scripts/build-vsc.mjs`、`package-vsix.sh`、`version.mjs`、`migrate-smoke/`、`chrome-*.mjs`
- 文档：`docs/`、`agent.md`、`notion-design-system.md`、`UPGRADE-PLAN.md`（见 §11 决策 2）
- 锁文件：`package-lock.json`、`src-vsc/package-lock.json`、`.env.example`

---

## 6. 提交切分（4 个）

| # | 类型 | 内容 | 预期 diff |
| --- | --- | --- | --- |
| C1 | `chore: 移除 1.x 实现（antd panel / webpack / TreeView）` | §5.1 全部删除 | 纯删除 |
| C2 | `feat: 引入 2.0 工程（共享 UI + Webview + Chrome）` | §5.2 覆盖 + §5.3 新增 | 纯新增/覆盖 |
| C3 | `docs: 仓库级文档对齐（LICENSE / CHANGELOG / 迁移说明）` | 依 §11 决策 1、2 调整 | 小 |
| C4 | `ci: 构建校验 workflow`（可选） | `.github/workflows/ci.yml`（install ×2 → lint → build:vsc → smoke:migrate → package:vsix，产物 artifact） | 新文件 |

> C1/C2 分开的价值：reviewer 能先确认"旧东西删干净了"，再确认"新东西加全了"；出问题时也能单独 revert 其中一步。

---

## 7. 验收闸门（全绿才允许合并）

### Gate 1 · 树一致性

```bash
cd demo/vsce-postman
git diff --stat vsc-new/master    # read-tree 方式：必须为空
git ls-tree -r --name-only HEAD | wc -l   # 预期 134 + P0 修正后的增量
```

### Gate 2 · 干净克隆从零构建（**专治 P0-1**）

```bash
git clone -b upgrade/v2 . /tmp/gate2 && cd /tmp/gate2
npm ci
npm --prefix src-vsc ci
npm run version:check
npm run lint
npm run build:vsc
npm run smoke:migrate
npm run package:vsix
```

> 如果 `src-vsc/media` 没入库，这一步会在 `cp src-vsc/media` 直接失败。本地构建过不代表干净克隆能过，这一步不能省。

### Gate 3 · 产物比对

```bash
unzip -l /tmp/gate2/vsc-postman-2.0.0.vsix | sort > /tmp/a.txt
unzip -l /Users/liujian/demo/vsc-postman-new/vsc-postman-2.0.0.vsix | sort > /tmp/b.txt
diff /tmp/a.txt /tmp/b.txt     # 预期仅时间戳/顺序差异
```

### Gate 4 · 真实升级验证（最关键，覆盖 P0-2）

1. 本机保留已装的 `breaking-point.vsc-postman@1.1.0`
2. 用 1.1.0 发 2–3 个请求（至少一条带 `body` 和自定义 `headers`），产生历史
3. `code --install-extension /tmp/gate2/vsc-postman-2.0.0.vsix --force`
4. 打开侧边栏，逐项检查：
   - 历史条目出现，名称/URL/method 正确
   - **headers 正确还原成 KV 行**
   - **body 正确还原（JSON 条目应以 JSON 模式打开）**
   - 条目状态显示为"从旧版本导入"
5. 检查 `globalState`：`vsc-postman:migrated-legacy-history === true`，`vsc-postman:state` 里历史条数正确
6. `Developer: Reload Window` 后复查：**不应重复导入**
7. 回滚验证（可选）：卸载 2.0.0、重装 1.1.0，确认旧历史仍在（因为迁移不删旧配置）

### Gate 5 · 扩展 ID 与版本

```bash
code --list-extensions --show-versions | grep postman
# 预期：breaking-point.vsc-postman@2.0.0   ← ID 必须和 1.1.0 完全一致
```

---

## 8. 合并与发布

```bash
# 推送分支
git push -u origin upgrade/v2

# 走 PR（若 master 有保护规则）或本地合并
git switch master
git merge --no-ff upgrade/v2 -m "merge: vsc-postman 2.0（重写，保留扩展 ID breaking-point.vsc-postman）"
git push origin master

# 合并后打 tag（tag 打在 master 上，便于 Release 页引用）
git tag -a v2.0.0 -m "vsc-postman 2.0.0"
git push origin v2.0.0
```

发布到市场是**独立动作**，不在本计划内：

- 先 `vsce publish --pre-release`（或不发布，只挂 GitHub Release 附件）
- 确认无误再发 stable
- 注意：`vsce publish` 不可撤回，只能发更高版本覆盖

---

## 9. 回滚方案

| 时点 | 回滚动作 | 影响面 |
| --- | --- | --- |
| 迁移中（未 commit） | `git reset --hard master` | 无 |
| 已 commit 未推 | `git reset --hard v1.0.0-legacy` | 无 |
| 已推分支未合 | `git push origin --delete upgrade/v2` | 无 |
| 已合 master 未发布 | `git revert -m 1 <merge-commit>` 或 `git reset --hard v1.0.0-legacy && git push -f`（后者需 master 未保护） | 仓库 |
| 已发布市场 | 不可撤回；只能发 2.0.1 | 用户 |
| 用户数据 | 老配置 `vscPostman.history` 迁移时**不删除**，回装 1.1.0 数据仍在 | 用户 |

---

## 10. 风险清单

| # | 风险 | 触发条件 | 缓解 |
| --- | --- | --- | --- |
| R1 | 导入的是 0.1.1 旧树 | 新仓库未提交就 fetch | §2 强制先提交；Gate 1 `git diff` 校验 |
| R2 | 干净克隆构建失败 | `src-vsc/media` 未入库 | P0-1 + Gate 2 |
| R3 | 迁移丢请求体 | 未补 `body` 映射 | P0-2 + Gate 4 第 4 步 |
| R4 | `read-tree` 覆盖本地改动 | 执行前工作区不干净 | 执行前 `git status` 必须为空 |
| R5 | `rsync --delete` 误删 | 排除规则漏项 | 选方案 B，或先 `--dry-run` |
| R6 | 覆盖安装后变成两个插件 | `publisher`/`name` 写错 | Gate 5 校验 ID；`src-vsc/package.json` 已固定 `breaking-point` / `vsc-postman` |
| R7 | master 有保护规则推不上去 | 分支保护 | 走 PR；或临时调整规则 |
| R8 | 老用户 VS Code < 1.90 收不到更新 | 市场按引擎版本过滤 | 已在 CHANGELOG/README 标注；如需覆盖更多用户再评估降版本 |
| R9 | 1.1.0 无源码快照 | 仓库缺 1.1.0 提交 | 只影响叙事，不影响数据；CHANGELOG 文字说明即可 |

---

## 11. 需要你拍板的 8 个决策

| # | 决策 | 结论（已确认） |
| --- | --- | --- |
| 1 | **LICENSE 版权行** | 保留老仓库 `Copyright (c) 2021 breaking-point`；`vsc-postman-new` 的 `LICENSE` 已改回该文本（与老仓库 sha 一致） |
| 2 | **`UPGRADE-PLAN.md` 位置** | 已移到 `docs/upgrade-plan.md`，随仓库入库 |
| 3 | **`.vscode/extensions.json`** | 保留并更新为 `dbaeumer.vscode-eslint` + `esbenp.prettier-vscode`；`.vscode/settings.json` 删除 |
| 4 | **`agent.md` / `notion-design-system.md`** | 入库 |
| 5 | **迁移方式** | 方案 B（`read-tree` 精确导入） |
| 6 | **提交粒度** | C1–C3（删 / 加 / 文档），CI 可选 |
| 7 | **`origin/2.0.0` 分支** | 保留，PR 里注明废弃 |
| 8 | **master 保护** | 若受保护就走 PR；否则本地 `--no-ff` 合并 |

---

## 12. 执行顺序与工时

| 阶段 | 内容 | 估时 |
| --- | --- | --- |
| 0 | §2 P0 修正 + 新仓库提交基线 | 1–2 h |
| 1 | 分支/tag/归档（§3） | 10 min |
| 2 | 两次提交完成迁移（§4–§6） | 30 min |
| 3 | Gate 1–3 自动校验 | 20 min |
| 4 | Gate 4 真实 1.1.0 升级验证 | 30–60 min |
| 5 | Gate 5 + 合并 + tag | 20 min |
| **合计** | | **约半天**（不含市场发布与审核） |

---

## 13. 迁移完成后立即要做的事（备忘）

- [ ] 删掉老仓库根目录遗留的 `breaking-point` 链接（`repository/homepage/bugs` 已由新 `package.json` 覆盖为 `bingcoder/vsce-postman`）
- [ ] 确认 `dist-vsc/`、`dist/`、`dist-chrome/`、`node_modules/`、`.npm-cache/`、`*.vsix` 都在 `.gitignore` 里，且 `git status` 干净
- [ ] 在 GitHub Release 里同时挂 `vsc-postman-2.0.0.vsix`
- [ ] 更新市场页正文（取自 `dist-vsc/README.md`）
- [ ] 后续若要发 Chrome/Edge：补 `scripts/package-chrome.mjs`（见 `docs/release-plan.md` P2）
