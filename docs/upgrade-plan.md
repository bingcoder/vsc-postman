# vsc-postman 老仓库升级改造方案

> 目标：把 `vsc-postman-new`（新版实现）升级进老仓库 `vsce-postman`，**保留老仓库的 git 地址与扩展身份**，让它继续作为发布渠道。
> 本文只做方案，不改代码。
> 注：本文是 2.0 升级期的方案存档；文中 `src-chrome` / `dist-chrome` / `build:chrome` 等路径与命令在后续重构中已统一改名为 `src-extension` / `dist-extension` / `build:extension`，历史表述保持原样。

---

## 0. 结论先行

| 决策 | 结论（已确认） |
| --- | --- |
| 代码来源 | 以 `vsc-postman-new` 为唯一基线，老仓库的 `src/panel/build` 直接退役 |
| git 仓库 | 继续用 `https://github.com/bingcoder/vsce-postman.git`（老仓库），不新建仓库 |
| 扩展身份 | **沿用老 `publisher: breaking-point` + `name: vsc-postman`**，原地升级而非新装 |
| 最低 VS Code | **1.90**，不为兼容老版本降低门槛 |
| 命令 ID | **不做别名**，直接切到 `vsc-postman.*`，在 CHANGELOG 中标注 |
| 版本号 | **新项目所有版本从 2.0.0 开始**（根 / `src-vsc` / `src-chrome` 三处统一） |
| 包管理 | **pnpm → npm**（移除 pnpm-lock，改用 package-lock，脚本与文档全部改 `npm run`） |
| Chrome/Edge | **本期不发**，只保留代码与构建能力 |
| 改造顺序 | **先只改 `vsc-postman-new` 本地**，老仓库 `vsce-postman` 暂不动 |
| 历史数据 | 必须一次性迁移：老 `vscPostman.history`（workspace 配置）→ 新 `vsc-postman:state`（globalState） |
| 工作量 | 约 3–5 个工作日（不含市场审核；含迁移与回归） |

---

## 1. 现状盘点

### 1.1 老仓库 `demo/vsce-postman`

| 项 | 现状 |
| --- | --- |
| 远端 | `https://github.com/bingcoder/vsce-postman.git`，分支 `master` + `origin/2.0.0` |
| 版本 | `1.0.0` |
| 身份 | `name: vsc-postman` / `publisher: breaking-point` / `displayName: vsc-postman` |
| 引擎 | `vscode ^1.55.0` |
| 架构 | 原生 `TreeDataProvider` 侧边栏 + `WebviewPanel`；扩展宿主用 webpack 打成 `dist/extension.js`；面板是独立子包 `panel/`（React 17 + antd 4 + axios），产物 `build/bundle.js` |
| 数据 | 历史存 workspace 配置 `vscPostman.history`，元素是**JSON 字符串**：`{name,url,method,headers,createTime,updateTime}` |
| 命令 | `vscPostman.new` / `vscPostmanHistory.{click,newWindow,delete,refresh}` |
| README | 当前写着 ⚠️ Deprecated，让用户用官方插件 |
| 其它 | 有 `origin/2.0.0` 分支（曾用过 Vite + Monaco 的 2.0 尝试，已被这次的新版取代） |

### 1.2 新仓库 `vsc-postman-new`

| 项 | 现状 |
| --- | --- |
| 版本 | 根 `0.1.1`；扩展清单 `vsc-postman-extension` / `publisher: local` |
| 引擎 | `vscode ^1.90.0` |
| 技术栈 | React 19 + TS 5.9 + Vite 7 + Tailwind 4 + shadcn(Base UI) + zustand + CodeMirror 6 |
| 架构 | 一套 UI 三端复用：Web / Chrome MV3 / VS Code Webview；VS Code 侧是 `WebviewView` 侧边栏 + 多个 `WebviewPanel` 编辑器标签 + postMessage RPC 桥 |
| 数据 | `globalState`：`vsc-postman:state`（zustand persist 信封：`collections/history/historyLimit`）、`vsc-postman:app`（语言等） |
| 能力 | 7 种方法、4 种 Body（含 multipart 文件流式上传）、SSE、集合管理、历史去重、导入导出、中英双语、跟随主题 |
| 构建 | `npm run build`（Web）→ `dist/`；`npm run build:vsc` → 编译 `src-vsc` 并把 `dist/` 拷进 `dist-vsc/media/`；`npm run package:vsix` 出 vsix |
| 依赖 | 根 `package-lock.json` **+** `src-vsc/` 独立第二套依赖（两套安装） |
| 现状缺口 | 无 `.github/` CI；`src-vsc/package.json` 的 `publisher` 还是 `local`；`repository` 缺失；根 `package.json` 是 `vite-shadcn-starter` 占位名 |

### 1.3 两边最关键的 5 个冲突点

1. **目录布局不同**：老仓库扩展根在仓库根（`dist/extension.js` 可 F5）；新仓库在 `src-vsc/` 编译、组装到 `dist-vsc/`。
2. **扩展身份不同**：老 `breaking-point/vsc-postman` 是市场里的既有 ID；新的是 `local/vsc-postman-extension`，直接搬会变成两个互不相干的插件，老用户收不到升级。
3. **数据不兼容**：`workspace.getConfiguration('vscPostman.history')` vs `globalState` 信封，必须迁移。
4. **VS Code 版本门槛提高**：1.55 → 1.90。低于 1.90 的用户**不会**自动收到更新（市场按引擎版本过滤），这点必须提前接受。
5. **UI 体系整体替换**：antd 4 → shadcn/Tailwind，老 `panel/` 不可能"增量改"，只能退役。

---

## 2. 总体原则

1. **以新仓库为代码基线**，老仓库只保留"身份、历史、发布权"。
2. **旧代码整体退役**，不做双轨并存（避免两套 UI、两套数据结构长期维护）。
3. **一次大切换 + 一个过渡版本**：先在一个 `upgrade/v*` 分支上把新代码跑通、迁数据、本地打包验证，再合入 `master` 并打 tag。
4. **迁移可重入**：迁移脚本只跑一次并落标记；失败时不影响新用户；旧配置保留不删，给回滚留退路。
5. **改动原子化提交**：目录搬迁、身份对齐、数据迁移、文档/CI 分成独立 commit，方便 review 和回滚。

---

## 3. 目标仓库结构

```
vsce-postman/                     # 老仓库根 = 扩展工程根（沿用新仓库布局）
├── index.html / sidebar.html     # Web UI 两个入口
├── vite.config.ts
├── tsconfig*.json / eslint / prettier / components.json
├── package.json                  # 根：脚本与前端依赖（不含 vscode 清单）
├── package-lock.json
├── src/                          # 共享 React UI（原 vsc-postman-new/src，不动）
├── src-chrome/                   # Chrome MV3（保留，本期不发也不碍事）
├── src-vsc/                      # 扩展宿主 TS + 扩展清单 package.json
├── scripts/                      # build-vsc.mjs / package-vsix.sh / 后续 version.mjs
├── dist/                         # 构建产物（gitignore）
├── dist-vsc/                     # 扩展组装产物（gitignore，vsix 源）
├── dist-chrome/                  # Chrome 产物（gitignore）
├── docs/                         # architecture / privacy / release-plan
├── .vscode/                      # 保留但改 launch：extensionDevelopmentPath 指向 dist-vsc
└── 退役：panel/  build/  src/（老的 extension.ts、provider/、commands/）
```

**为什么保留 `dist-vsc` 布局而不是搬回仓库根**：新仓库的 `build-vsc.mjs`、`package-vsix.sh`、`launch.json`、`.vscodeignore`、README/CHANGELOG 拷贝逻辑全部围绕 `dist-vsc` 设计，改回根目录要动 5 处构建脚本且更容易把 `src/` 和扩展产物混在一起。收益低、风险高，不建议。

---

## 4. 分阶段实施计划

### V0 · 准备与占位（0.5 天，不改功能）

1. 在**老仓库**新建分支 `upgrade/v2`（从 `master` 切），所有改造在此分支完成。
2. 老仓库 `master` 先打一个保护 tag：`git tag v1.0.0-last-legacy && git push --tags`，保证随时能回到 1.0.0。
3. 确认 `origin/2.0.0` 分支不再需要（已被本次新版取代），先不删，只在 PR 说明里标注废弃。
4. 在**新仓库**（工作目录）做一次"发布前体检"，记录当前基线：
   - `npm install && npm --prefix src-vsc install`
   - `npm run lint && npm run build && npm run build:vsc && npm run package:vsix`
   - F5 跑 `dist-vsc/`，走一遍：新建请求 → 保存到集合 → 历史 → 设置 → 导出存储。
   - 结果记成一份 `BASELINE.md`（贴进 PR 描述即可），后续每一步都和它对比回归。

> ✅ 产出：老仓库分支、保护 tag、新仓库可复现的构建基线。

### V1 · 代码搬迁（1 天）

在老仓库 `upgrade/v2` 分支上：

1. **删除老实现**（用 `git rm` 保留历史可追溯）：
   - `src/extension.ts`、`src/provider/`、`src/commands/`、`src/global.d.ts`
   - `panel/`（独立子包，整个删掉）
   - `build/`（老产物，删掉并加进 `.gitignore`）
   - `webpack.config.js`、`.eslintrc.json`、`.yarnrc`、`tsconfig.json`、`vsc-extension-quickstart.md`
2. **拷入新实现**：把 `vsc-postman-new` 的以下内容整体拷到老仓库根（**排除** `node_modules/`、`dist*/`、`.git/`、`package-lock.json` 需保留新的）：
   - `src/`、`src-vsc/`、`src-chrome/`、`scripts/`、`docs/`、`vite-plugins/`、`public/`
   - `index.html`、`sidebar.html`、`vite.config.ts`、`tsconfig*.json`、`eslint.config.js`、`.prettierrc`、`.prettierignore`、`components.json`、`.env.example`
   - `package.json`、`package-lock.json`、`.gitignore`、`.vscode/`
   - `README.md`、`CHANGELOG.md`、`LICENSE` 先按 V2 的规则处理（见下）
3. 老仓库 **保留**：`.git/`、`LICENSE`（确认版权人一致即可）、`media/rocket.svg` 之类旧图标按需保留或删（新清单用 `src-vsc/media/activity.svg` + `public/icon.png`）。
4. `src-vsc/*.ts` 里没有任何指向新仓库名的硬编码（已确认：路径都基于 `extensionPath`），无需改路径常量；但 `scripts/build-vsc.mjs` 里 `npm` 的调用方式保留。
5. 首次提交信息建议：`refactor: 用 vsc-postman-new 重写扩展（退役 antd panel 与 TreeView）`。

> ⚠️ 注意：**不要**在同一次提交里混入身份改动和数据迁移，否则 review 和回滚都很难。

### V2 · 扩展身份与元数据对齐（0.5 天）

目标：市场里仍是**同一个插件**，用户看到的是"vsc-postman 升级"，不是"多装了一个"。

| 文件 | 老值 | 新值（建议） |
| --- | --- | --- |
| `src-vsc/package.json` → `name` | `vsc-postman-extension` | `vsc-postman`（与老一致） |
| `src-vsc/package.json` → `publisher` | `local` | `breaking-point` |
| `src-vsc/package.json` → `displayName` | `vsc-postman` | `vsc-postman`（不变） |
| `src-vsc/package.json` → `version` | `0.1.1` | `2.0.0`（重大重写，走主版本） |
| `src-vsc/package.json` → `repository` | 无 | `https://github.com/bingcoder/vsce-postman` |
| `src-vsc/package.json` → `engines.vscode` | `^1.90.0` | 保持 `^1.90.0`（见风险 R2） |
| 根 `package.json` → `name` | `vite-shadcn-starter` | `vsc-postman`（或 `vsc-postman-workspace`） |
| 根 `package.json` → `version` | `0.1.1` | `2.0.0`（后续由 `version.mjs` 统一） |

**命令 ID 的处理（重要）**：老命令是 `vscPostman.new` 等，新命令是 `vsc-postman.open` 等。
- 用户侧影响：老用户自定义的快捷键（`keybindings.json`）会失效，任务/工作区里的 `runCommand` 会失效。
- 建议：**不兼容旧命令**（新命令更规范），但：
  - 在 `CHANGELOG` 的 `2.0.0` 条目里明确写出"命令 ID 已变更"；
  - 可选：注册 5 个旧命令 ID 作为 **aliases**（内部转调新实现，`when` 不暴露到面板），保留一个版本后再删。成本约 20 行，建议做。

**视图/侧边栏标题**：老 `viewsContainers` id 是 `vsc-postman`、view id 是 `vsc-postman-side`；新的是 `vsc-postman.sidebar`。同样属于"用户可见的行为变化"，不需要兼容，但要写进 CHANGELOG。

**README / CHANGELOG**：
- 根 `README.md` 用 `src-vsc/README.md` 的扩展专版内容（新仓库 `build-vsc.mjs` 已经这么做了，直接沿用）。
- `CHANGELOG.md` 追加：
  ```
  ## [2.0.0] - <date>
  ### 新增
  - 全新 UI（React 19 + Tailwind），集合管理、历史去重、导入导出、中英双语、跟随主题
  - SSE 事件流调试、multipart 文件流式上传（无大小上限）、7 种请求方法
  - 侧边栏改为 WebviewView，请求以编辑器标签形式打开
  ### 破坏性变更
  - 最低 VS Code 版本从 1.55 提升到 1.90（低版本用户不会自动升级）
  - 命令 ID 由 `vscPostman.*` 改为 `vsc-postman.*`（旧快捷键需重新绑定）
  - 数据存储从工作区配置 `vscPostman.history` 迁移到扩展 `globalState`（首次启动自动迁移，旧配置保留不删）
  ### 移除
  - 旧 antd 面板、原生 TreeView 历史列表
  ```
- 根 `README.md` 里的 Deprecated 警告删掉。

> ✅ 产出：`src-vsc/package.json` 身份与老仓库一致，`displayName`/`publisher`/`name` 三元组 = 市场现有 ID。

### V3 · 历史数据迁移（1 天，最需要测试的一步）

老数据形态：

```ts
// workspace 配置，元素是 JSON 字符串
vscPostman.history: string[] = [
  '{"name":"查用户","url":"https://api.example.com/users","method":"get","headers":"{\\"Authorization\\":\\"Bearer x\\"}","createTime":1700000000000,"updateTime":1700000000001}',
  ...
]
```

新数据形态：

```ts
// globalState['vsc-postman:state']（zustand persist 信封）
{ state: { collections: [], history: HistoryEntry[], historyLimit: 50 }, version: 0 }
// HistoryEntry: { id, method, url, status, durationMs, error?, at, request: RequestDraft, requestKey? }
```

实施要点：

1. **落点**：在 `src-vsc/extension.ts` 的 `activate` 里、`WorkspaceModel` 构造之后加一个 `migrateLegacyHistory(context, model)`（新文件 `src-vsc/migrate.ts`）。
2. **触发条件**：`context.globalState.get('vsc-postman:migrated-legacy-history')` 不为 `true` 才执行；执行完（无论成功/失败/无数据）都写 `true`，保证只跑一次、幂等。
3. **读取来源**：`vscode.workspace.getConfiguration('vscPostman').get<string[]>('history')`。
   - 注意：这是 **workspace 级配置**，用户可能删了 `.vscode/settings.json` 就取不到；取不到就跳过，不报错。
4. **转换规则**：
   - `method`：老数据可能小写（`get`）或大写（`GET`），统一 `toUpperCase()`。
   - `headers`：老是 JSON 字符串（可能非法），`JSON.parse` 失败就丢弃该字段，不阻断整条迁移。
   - `history[].at` = `createTime || updateTime || Date.now()`。
   - `status` = `null`、`durationMs` = `0`、`error` = 可选"从旧版导入"标记（用于 UI 区分，如不需要则省略）。
   - `request` 用老数据最小重建成 `RequestDraft`：`{ id: 'legacy-'+createTime, name, method, url, headers: 解析后的对象（转换成新 kv 行） }`。**headers 的 kv 结构要以 `src/types/http.ts` 的 `KvRow` 为准**，实现时按实际字段映射。
   - 反过来，如果新代码的 draft 里 headers 就是 `Record<string,string>` 或 kv 数组，按实际类型写映射（实现前先读 `src/types/http.ts`）。
5. **去重与上限**：迁移后按 `at` 倒序，`slice(0, HISTORY_LIMIT)`；老 `createTime` 相同的条目用 `Map` 去重。
6. **写回方式**：优先走 `model.applyFromWebview({ state })` 或直接 `context.globalState.update('vsc-postman:state', JSON.stringify(envelope))`，**不要**在 webview 未就绪时广播；迁移完让 `model.reload()` 重新读一次。
7. **旧配置不删**：`vscPostman.history` 原样保留，仅在 README/CHANGELOG 提示"可手动清理"。这样万一 2.0.0 有严重问题，用户回退 1.0.0 数据还在。
8. **测试矩阵**：
   - 有 3 条合法老数据 →
   - 有 1 条 `headers` 是非 JSON 字符串 →
   - 有 1 条 `method` 小写 →
   - 配置为空数组 / 配置 key 不存在 / `vscPostman.history` 是 `null` →
   - 连续激活两次（幂等，不重复导入）→
   - 迁移后手动删 `vsc-postman:state` 再激活（不应再次导入，因为已落 `migrated` 标记）→
   - 迁移后新发一个请求（历史追加正常、去重正常）。

> ✅ 产出：`src-vsc/migrate.ts` + 单测（见 V5 的测试建议）+ 手工验证矩阵记录。

### V4 · 构建 / 调试 / 打包链路改造（0.5 天）

1. **F5 调试**：沿用新仓库 `.vscode/launch.json`（`extensionDevelopmentPath=${workspaceFolder}/dist-vsc`，`preLaunchTask: build vsc`），**问题**：老用户习惯"根目录就是扩展"。需要在 README/PR 里写清楚"F5 前先 `npm run build:vsc`"，任务已配好 `preLaunchTask`，实际体验不受影响。
2. **打包**：沿用 `scripts/package-vsix.sh`，但：
   - `vsce` 全局依赖改为 `npx @vscode/vsce`（避免"未找到 vsce"）；
   - `--allow-missing-repository` 判断保留（`repository` 已在 V2 补上，走不带该开关的分支）；
   - `-o` 输出改为 `./vsc-postman-<version>.vsix`，并在 `.gitignore` 里加 `*.vsix`（新仓库已有）。
3. **版本号单一来源**：现在版本号在 3 处（根 `package.json`、`src-vsc/package.json`、`src-chrome/manifest.json`）。建议按 `docs/release-plan.md` 的 P1 做 `scripts/version.mjs`（`version:check` / `version:set` / `version:bump`），本期至少先加 `version:check` 并在 `package-vsix.sh` 里前置断言。
4. **两套依赖**：`src-vsc/` 有独立 `package-lock.json`（只有 `@types/node`、`@types/vscode`、`typescript`），安装必须 `npm install` + `npm --prefix src-vsc install` 两次。可以：
   - 方案 A（推荐，低风险）：保留两套依赖，在 README/CI 里写清楚；
   - 方案 B（可选，后续）：改成 npm workspace，`src-vsc` 作为 workspace 包，合并成一个 lockfile。收益一般，本期不做。
5. **Node/npm 版本约束**：本地是 Node 20.20 + npm 10.34，Vite 7 / Tailwind 4 都要求 Node ≥ 20。在 `package.json` 加 `"engines": { "node": ">=20" }` 和 `"packageManager": "npm@10"`，避免别人用 Node 18 构建出怪问题。

### V5 · 验证与回归（1 天）

**构建层（必做）**

```bash
# 老仓库 upgrade/v2 分支
npm install
npm --prefix src-vsc install
npm run lint
npm run build          # Web UI 产物 dist/
npm run build:vsc      # 扩展产物 dist-vsc/
npm run package:vsix   # 出 vsc-postman-2.0.0.vsix
```

**安装层（必做）**

```bash
code --install-extension ./vsc-postman-2.0.0.vsix --force
# 确认：扩展 ID 仍是 breaking-point.vsc-postman；市场页仍可"更新"
```

**功能回归清单（在 VS Code 里逐项过）**

| # | 场景 | 预期 |
| --- | --- | --- |
| 1 | 活动栏图标 → 侧边栏 | 显示集合与历史，中英文跟随 VS Code 语言 |
| 2 | 新建请求 → 填 URL → 发送 | 响应出现，状态码/耗时/大小正确 |
| 3 | 保存请求到集合 | 侧边栏出现；重启后仍在 |
| 4 | 再次点击同一请求 | 打开同一个标签（去重），不重复开 |
| 5 | 历史列表点击 → 重放 | 正确回填到新标签 |
| 6 | 连续两次相同请求 | 历史只保留一条 |
| 7 | `form-data` 选文件发送 | 宿主弹选择框；上传成功 |
| 8 | SSE 地址 | 事件逐条出现，取消后保留已收事件 |
| 9 | 复制请求 / 删除请求 / 移动集合 | 行为符合 README |
| 10 | 导出存储 | 打开临时 `storage.json`，内容含 `vsc-postman:state` |
| 11 | 切换深浅色 | 跟随 VS Code 主题 |
| 12 | **V3 迁移矩阵**（见上） | 老历史全部出现在新历史里 |

**回滚预案**

- 代码：`master` 有 `v1.0.0-last-legacy` tag；`upgrade/v2` 出问题直接不合并。
- 市场：vsce 已发布的版本**不可撤回**，只能用更高版本覆盖。所以**先用 `--dry-run` 或先发 `2.0.0-beta.1`**（`vsce publish --pre-release` 或手动装 vsix 验证），确认无误再发 stable。
- 数据：老 `vscPostman.history` 保留不删，用户回退 1.0.0 时数据还在。

### V6 · 提交策略与发布（0.5 天）

**提交拆分（建议 5 个 commit，方便 review）**

1. `chore: 引入新工程骨架（退役 antd panel / TreeView）` —— 纯目录搬迁 + 构建配置
2. `feat: 对齐扩展身份（publisher/name/命令别名）`
3. `feat: 迁移旧版历史数据到 globalState`
4. `docs: README/CHANGELOG/LICENSE 更新，去除 Deprecated 标记`
5. `ci: 发布流水线（可选，见 §6）`

**发布前的小检查**

- [ ] `src-vsc/package.json` 里 `private: true` 要去掉（否则 vsce 可能拒绝或产生奇怪行为）
- [ ] `publisher` 是真实 publisher（`breaking-point` 是否仍是你的 Azure DevOps publisher ID，需确认）
- [ ] `LICENSE` 版权人一致
- [ ] `media/icon.png` 是仓库内相对路径（`icon: media/icon.png` 由 `build-vsc.mjs` 拷进 `dist-vsc/media/`，已满足）
- [ ] `CHANGELOG.md` 有 `2.0.0` 条目
- [ ] `README.md` 里没有指向 `OWNER` 的占位链接（新仓库 `src-vsc/README.md` 目前是 `github.com/OWNER/vsc-postman`，**必须替换成 `bingcoder/vsce-postman`**）
- [ ] **老仓库根 `package.json` 的 `repository` / `homepage` / `bugs` 当前都指向 `breaking-point/vsce-postman`，但实际远端是 `bingcoder/vsce-postman`**，迁移时一并改正（否则市场页 "Repository" 链接会 404）

---

## 5. 工作分解与排期

| 阶段 | 内容 | 估时 | 依赖 |
| --- | --- | --- | --- |
| V0 | 分支、tag、新仓库基线体检 | 0.5d | — |
| V1 | 目录搬迁、旧代码退役 | 1d | V0 |
| V2 | 身份/元数据/命令别名/CHANGELOG | 0.5d | V1 |
| V3 | 历史数据迁移 + 测试矩阵 | 1d | V1 |
| V4 | 构建/打包/版本号链路 | 0.5d | V1 |
| V5 | 完整回归 + vsix 实装验证 | 1d | V2–V4 |
| V6 | 提交拆分、PR、发布 | 0.5d | V5 |
| **合计** | | **约 5 个工作日** | |

如果本期不发 Chrome/Edge，`src-chrome/` 和 `docs/store-listing-*` 可以一起合入但**不构建、不发**，不额外增加工期。

---

## 6. 可选：CI / 自动发布

新仓库现在**没有** `.github/`，`docs/release-plan.md` 里已经有完整设计。本期建议只做"构建校验"，不做自动发布：

- `.github/workflows/ci.yml`：`push` 到 `master` / PR 时跑 `npm install` → `npm --prefix src-vsc install` → `npm run lint` → `npm run build:vsc` → `npm run package:vsix`，产物 upload-artifact。
- 自动发布（`vsce publish`）留到 2.0.0 人工发布成功之后再谈；且注意 2026-12-01 后 Azure PAT 退役，要改 Trusted Publishing。

---

## 7. 风险清单

| # | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| R1 | 老用户已装 1.0.0，市场按 `engines.vscode` 过滤 | VS Code < 1.90 的用户**收不到 2.0.0**，也不会报错，只是永远停在 1.0.0 | 在 README/市场页首屏写明最低 1.90；如需覆盖老版本，把 `engines` 降到 1.85 并去掉 `l10n` 之外的 1.90 API（需评估，见 R2） |
| R2 | 新代码是否真的用到了 1.90+ API | 若实际不需要，可把门槛降到 1.85/1.80，覆盖更多用户 | 构建时用 `@types/vscode@1.85` 试编译一次，报错的地方再评估 |
| R3 | 历史数据迁移把用户数据弄坏 | 用户丢历史，口碑风险 | 迁移只读旧配置、不删旧配置；转换失败**单条跳过**不整体失败；先 beta 发一版 |
| R4 | **`vsce publish` 不可撤回** | 发错只能更高版本覆盖 | 先 `--pre-release` 或手装 vsix；CI `dry-run` 默认开 |
| R5 | 扩展 ID 不一致导致"变成新插件" | 老用户看不到升级，等于重启炉灶 | V2 必须**先改 `src-vsc/package.json` 的 `name`+`publisher`**，再打包验证 `vsce ls`/安装后 ID |
| R6 | `src-vsc` 第二套依赖漏装 | 构建随机失败 | README/CI 明确两条 `npm install`；或后续改 workspace |
| R7 | `npm` 不存在（新仓库脚本硬编码 `npm`） | `build:vsc` 直接挂 | `package.json` 加 `packageManager`；README 写明前置要求 |
| R8 | 新版 `index.html` 里有内联 `<script>`（主题防闪烁） | 该脚本会被 Webview CSP 拦掉，但不白屏 | 已核实：`src-vsc/html.ts` 注入 `script-src ${webview.cspSource}`（无 nonce/hash/unsafe-inline），**内联主题脚本会被拦**；但 `src/main.tsx` 里有 `initializeTheme()` 兜底，所以功能不受影响，只是首屏可能闪一下主题。迁移时二选一：①把主题初始化挪到外链脚本；②直接删掉内联脚本，只留 `initializeTheme()`（推荐，最小改动） |
| R8b | `dist/index.html` 里的 `modulepreload` 链接 | 若漏改写会 404（但不致命） | 已用正则实测：`html.ts` 的 `(src\|href)="\.\/(assets/…)"` 会**同时命中 `modulepreload` 的 `href`**，无需额外处理。保留此条仅作迁移后复核项 |
| R9 | 工作区很空时 F5 找不到扩展 | 开发体验差 | `launch.json` + `preLaunchTask` 已配好；README 写明 |
| R10 | 老 `origin/2.0.0` 分支存在历史尝试 | 混淆 | PR 说明里标注废弃；不删分支，避免影响任何人的 fork |

---

## 8. 决策点（已确认）

1. ~~**扩展 ID**~~ → **确认继续用 `breaking-point` + `vsc-postman`**。
2. ~~**VS Code 最低版本**~~ → **确认 1.90**，不降低门槛。
3. ~~**命令 ID**~~ → **不做别名**，直接切换，CHANGELOG 标注破坏性变更。
4. ~~**Chrome/Edge**~~ → **本期不发**，代码与构建保留。
5. ~~**git 历史**~~ → 待开始 V0/V1 时再决定；建议"一次性大提交 + 保护 tag"。
6. ~~**发布节奏**~~ → 版本号直接 `2.0.0`；发布时是否先 beta 再定。

---

## 9. 下一步

决策已确认，当前进度见文末「执行进度」；V3 历史数据迁移已完成，下一步是在老仓库 `upgrade/v2` 分支上做 V1 搬迁。

---

## 10. 执行进度（2026-11-15）

本轮只改 `vsc-postman-new` 本地，未触碰 `demo/vsce-postman`。

### 已完成（新仓库 `vsc-postman-new`）

| 项 | 状态 | 落点 |
| --- | --- | --- |
| 版本号统一 2.0.0 | ✅ | 根 `package.json`、`src-vsc/package.json`、`src-chrome/manifest.json` |
| 扩展身份对齐 | ✅ | `name: vsc-postman`、`publisher: breaking-point`、去掉 `private`、补 `repository` |
| 根包元数据 | ✅ | `name: vsc-postman`、`repository/bugs/homepage` → `bingcoder/vsce-postman`、`engines.node >= 20.19` |
| pnpm → npm | ✅ | 删除两个 `pnpm-lock.yaml`，生成 `package-lock.json`（根 + `src-vsc`）；`build-vsc.mjs`、`package-vsix.sh`、`.vscode/tasks.json`、l10n 提示、全部文档改 `npm run` |
| 版本一致性守护 | ✅ | `scripts/version.mjs` + `npm run version:check` / `version:set`，构建与打包前置校验 |
| vsix 打包链路 | ✅ | 全局 `vsce` 缺失时自动 `npx --yes`；产物 `vsc-postman-2.0.0.vsix`，ID 校验为 `breaking-point.vsc-postman` |
| 文档改口径 | ✅ | README / CHANGELOG / agent.md / docs / 两个扩展 README；`OWNER` 占位全部替换 |
| V3 历史数据迁移 | ✅ | 新增 `src-vsc/migrate.ts`（activate 时一次性并入）、`WorkspaceModel.mergeHistory()`、`npm run smoke:migrate` 冒烟测试 |

### 已验证

- `npm run lint` ✅
- `npm run build` ✅
- `npm run build:vsc` ✅
- `npm run build:chrome` ✅（仅验证构建，本期不发布）
- `npm run package:vsix` ✅ → `vsc-postman-2.0.0.vsix`，manifest `Id=vsc-postman Version=2.0.0 Publisher=breaking-point`
- `npm run version:check` ✅
- `npm run smoke:migrate` ✅（5 条合法/异常数据转换、幂等、与已有数据合并、上限裁剪）

### 未做（下一轮）

1. **V1 老仓库搬迁**：尚未在 `demo/vsce-postman` 执行（按要求暂不动）。
2. **本地 vsix 实装**：`code --install-extension` 被沙箱拦在 `~/.vscode/extensions` 写入，需在无沙箱环境重试。当前本机已存在 `breaking-point.vsc-postman@1.1.0`，覆盖安装后应保持在 `breaking-point.vsc-postman` 这个 ID 上。
3. **1.x 面板风格 history 的 `headers` 字段**：老面板保存时可能把 headers 存成 JSON 字符串，迁移已兼容；若线上样本出现其它形状，按 `smoke:migrate` 的用例补充。
