# Agent 指南：vsc-postman 工作台

> 面向 AI Coding Agent（Claude Code、Codex 等）的项目上下文文档。
> 汇总本项目的**技术栈约定**与 **Notion 风格 UI 规范**，新增页面与组件必须遵守。
> 设计规范的完整版见 [notion-design-system.md](./notion-design-system.md)。

---

## 1. 项目简介

一个 HTTP 接口调试工作台（Postman/Apifox 式工作流），可运行在 Web、VS Code Webview 与浏览器扩展三种运行时。左侧边栏管理集合与请求历史，主区域发送请求并查看响应。请求通道与存储均为可替换适配器，页面代码不感知运行环境。

核心设计原则：**用排版、留白和灰阶建立层次，而不是依靠边框、阴影和颜色堆叠视觉效果。**

---

## 2. 技术栈

| 项目       | 选择                       | 说明                                                                           |
| ---------- | -------------------------- | ------------------------------------------------------------------------------ |
| 构建工具   | Vite 7                     | 开发与构建；`base: './'` 相对路径产物，适配 Webview/扩展                       |
| UI 框架    | React 19                   | 函数组件 + Hooks                                                               |
| 语言       | TypeScript                 | `strict` 开启；`noUnusedLocals` / `noUnusedParameters` 开启                    |
| 路径别名   | `@/*` → `./src/*`          | 在 `vite.config.ts` 与 `tsconfig.app.json` 中配置                              |
| UI 组件    | shadcn/ui-style 本地源码   | `src/components/ui`，**可二次修改**，不依赖 npm 包                             |
| 底层组件库 | `@base-ui/react`           | shadcn 组件底层基于 Base UI（非 Radix），注意 API 差异                         |
| Slot       | `@radix-ui/react-slot`     | 仅用于 `asChild` 合并样式到子元素                                              |
| 样式       | Tailwind CSS v4            | 通过 `@tailwindcss/vite` 插件接入；**无 tailwind.config**，主题用 CSS `@theme` |
| 图标       | lucide-react               | 统一线性图标风格                                                               |
| 路由       | React Router 7             | HashRouter（`createHashRouter`），适配无 History API 的容器                    |
| 状态管理   | Zustand                    | 全局 store，`src/stores`                                                       |
| 请求       | Axios                      | 统一请求封装（HTTP 调试通道为可替换 Transport）                                |
| 类名合并   | `clsx` + `tailwind-merge`  | `cn()` 工具，`src/lib/utils.ts`                                                |
| 变体       | `class-variance-authority` | Button / Select 等 cva 变体                                                    |
| 包管理     | npm                       | Node 20.19+ / 22.12+                                                           |

### 关键约束

- **不要**把 shadcn 组件当 npm 黑盒：它们是 `src/components/ui` 下的本地源码，可直接改。
- **不要**为单一页面需求修改 `components/ui` 原始组件，业务通用组件放 `components/common`。
- 底层是 **Base UI**（`@base-ui/react`），不是 Radix。`asChild` 用 Radix Slot；其它交互用 Base UI 的 `render` prop / `data-*` 状态属性（如 `data-active`、`data-pressed`、`data-highlighted`、`data-checked`）。
- Tailwind v4 无配置文件，所有设计令牌在 `src/styles/globals.css` 的 `:root` / `.dark` / `@theme inline` 中维护。

---

## 3. 目录结构

```text
src/
├── components/
│   ├── ui/                 # shadcn 本地组件（可二次修改）
│   ├── common/             # Notion 风格业务通用组件
│   ├── layout/             # AppLayout、Sidebar 外壳
│   ├── sidebar/            # 集合树、历史列表、搜索
│   └── http/               # 请求编辑器、响应查看器、保存弹窗
├── hooks/                  # use-theme 等
├── lib/                    # utils(cn)、format、clipboard、theme、id、runtime
├── pages/                  # vsc-postman / settings / components
├── router/                 # HashRouter 路由
├── services/
│   ├── vsc-postman/        # Transport 协议与多运行时实现
│   ├── bridge/             # VS Code Webview RPC + 宿主通知
│   └── storage/            # 可替换持久化适配器
├── stores/                 # Zustand stores
├── styles/
│   └── globals.css         # 设计令牌 + 全局样式（单一来源）
└── types/                  # http / env / vscode 类型
```

---

## 4. 命令

```bash
npm install
npm run dev          # 开发服务器
npm run build        # tsc -b && vite build（含类型检查）
npm run lint         # eslint .
npm run format       # prettier --write .
```

> 提交前确保 `npm run build` 与 `npm run lint` 均通过。`build` 会执行 `tsc -b`，类型错误会中断构建。

---

## 5. Notion 风格 UI 规范

设计关键词：**极简、低对比度、内容优先、充足留白、弱边框、柔和灰阶、克制圆角与阴影。**

### 5.1 设计原则

- 内容优先：减少装饰性元素，让文本和业务内容成为视觉中心。
- 低对比度：以柔和灰阶构建层级，避免大面积纯黑和高饱和色。
- 弱边框：优先通过留白、背景色和排版区分区域。
- 克制的圆角与阴影：小圆角为主，普通卡片默认不使用阴影。
- 轻量交互：Hover / Focus / Active 清晰但不过度抢眼。
- 一致性：颜色、间距、字体、圆角通过 Design Tokens 管理。

### 5.2 色彩令牌（已实现于 `src/styles/globals.css`）

**Light Theme**

| Token                                    | 色值      | 用途                                  |
| ---------------------------------------- | --------- | ------------------------------------- |
| `--background`                           | `#FFFFFF` | 页面背景                              |
| `--sidebar`                              | `#F7F7F5` | 侧边栏背景                            |
| `--surface`                              | `#FFFFFF` | 卡片、弹层表面                        |
| `--foreground`                           | `#37352F` | 主文字（柔和深灰，**禁用纯黑 #000**） |
| `--muted-foreground`                     | `#787774` | 次级文字                              |
| `--subtle-foreground`                    | `#9B9A97` | 辅助文字、占位符                      |
| `--border` / `--input`                   | `#E9E9E7` | 默认边框、分割线                      |
| `--surface-hover` (`--muted`/`--accent`) | `#EFEFED` | Hover 背景                            |
| `--surface-selected`                     | `#E8E8E6` | 选中背景                              |
| `--primary`                              | `#37352F` | 主要操作                              |
| `--primary-foreground`                   | `#FFFFFF` | 主要操作文字                          |

**Dark Theme**（单独维护语义令牌，不简单反转 Light）

| Token                                | 色值      |
| ------------------------------------ | --------- |
| `--background`                       | `#191919` |
| `--sidebar`                          | `#202020` |
| `--surface` / `--card` / `--popover` | `#252525` |
| `--surface-hover`                    | `#2C2C2C` |
| `--surface-selected`                 | `#333333` |
| `--foreground`                       | `#E6E6E5` |
| `--muted-foreground`                 | `#9B9A97` |
| `--subtle-foreground`                | `#777672` |
| `--border` / `--input`               | `#373737` |

> 令牌通过 `@theme inline` 映射为 Tailwind 工具类：`bg-background`、`text-foreground`、`bg-muted`、`text-muted-foreground`、`text-subtle-foreground`、`bg-surface-hover`、`bg-surface-selected`、`shadow-popover` 等。

### 5.3 字体与排版

字体栈：

```css
-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
```

| 类型     | 字号 | 字重 |     行高 |
| -------- | ---: | ---: | -------: |
| 页面标题 | 30px |  700 |      1.3 |
| H1       | 26px |  700 |     1.35 |
| H2       | 22px |  600 |      1.4 |
| H3       | 18px |  600 |      1.5 |
| 正文     | 15px |  400 | 1.6–1.75 |
| 辅助文本 | 13px |  400 |      1.5 |
| Caption  | 12px |  400 |      1.4 |

- 正文行高偏宽松，保证可读性（`body { line-height: 1.6 }`）。
- 长文阅读区限制最大宽度，避免单行过长。

### 5.4 间距

4px 基础间距体系：`4 / 8 / 12 / 16 / 20 / 24 / 32 / 48px`。

- 组件内部优先 8 / 12 / 16px。
- 页面区块之间优先 24 / 32px。
- 通过留白分组，避免滥用分割线和卡片边框。

### 5.5 圆角（克制的小圆角）

| 组件                      | 圆角 | Tailwind 类  |
| ------------------------- | ---: | ------------ |
| Button / Input            |  6px | `rounded-md` |
| Sidebar Item              |  4px | `rounded-sm` |
| Card / Dropdown / Popover |  6px | `rounded-md` |
| Dialog / Modal            |  8px | `rounded-lg` |

> 已在 `@theme inline` 中设定：`--radius-sm: 4px`、`--radius-md: 6px`、`--radius-lg: 8px`。
> **禁止**使用 `rounded-full`（胶囊）作为按钮 / 输入 / 分段控件外观。`rounded-full` 仅用于状态点指示器（`size-1.5` 的小圆点）和细下划线指示器。

### 5.6 边框与阴影

- 默认边框：`1px solid #E9E9E7`，保持低对比度。非必要不给内容块加边框。
- **普通卡片默认无阴影**。已移除所有 `shadow-sm` / `shadow-md` / `shadow-2xl`。
- 弹层（Popover / Dropdown / Dialog / Tooltip）使用轻量阴影令牌：
  ```css
  --shadow-popover: 0 4px 12px rgba(15, 15, 15, 0.08), 0 1px 3px rgba(15, 15, 15, 0.04);
  ```
  工具类：`shadow-popover`。

### 5.7 组件规范

- **Button**：默认高 32px（`h-8`），紧凑 28px（`h-7`），大尺寸 36px（`h-9`），icon 32px（`size-8`）；圆角 `rounded-md`；图标与文字间距 8px。变体：Primary（深灰背景白字）/ Secondary（浅灰）/ Outline（弱边框）/ Ghost（无边框，Hover 浅灰）/ Destructive（仅危险操作）。
- **Input / Textarea**：白/透明背景，弱边框，圆角 `rounded-md`，placeholder 用 `text-subtle-foreground`，Focus 时轻量 Ring（`ring-ring/30`）。
- **Sidebar**：宽 240px，浅灰背景；菜单项 30–34px 高，圆角 `rounded-sm`；默认图标文字用 `muted-foreground`，Hover 用 `bg-sidebar-accent`，Active 略深并提高字重；分组标题 11–12px 辅助文字。
- **Card**：白底，圆角 `rounded-md`，内边距 16px（`p-4`），默认无阴影；标题 H3 18px/600。
- **Dialog / Popover / Dropdown**：背景 `--surface`，边框 `--border`，圆角 6–8px，`shadow-popover`；菜单项 Hover 用 `--surface-hover`。
- **Table / Database**：表头次级文字色，行分割线弱边框，行 Hover 浅灰，状态用小面积状态色（不给整行高饱和背景）。

### 5.8 图标

统一 `lucide-react`。

| 属性         | 规范                                               |
| ------------ | -------------------------------------------------- |
| 默认尺寸     | 16px（Button 内 SVG 由 `[&_svg]:size-4` 强制统一） |
| 小图标       | 14px                                               |
| 标准图标     | 20px                                               |
| Stroke Width | 1.8–2                                              |
| 默认颜色     | `#787774`（`text-muted-foreground`）               |
| Hover 颜色   | `#37352F`（`text-foreground`）                     |

```tsx
import { Search, Settings, FileText, Plus } from 'lucide-react'

;<Search size={16} strokeWidth={1.8} />
```

> 同一功能区统一图标尺寸与线宽；图标按钮必须提供 `aria-label` 或 Tooltip。

### 5.9 动效与交互

- Hover / Focus / Active 反馈轻量快速，颜色过渡 `120–180ms`（项目用 `duration-150`）。
- 位移与缩放克制，避免弹跳；弹层用轻微淡入。
- 支持键盘 Focus；尊重 `prefers-reduced-motion`（已在 `globals.css` 中收敛动效）。

---

## 6. AI Coding Agent 执行约束

1. 新增页面与组件**必须遵守本规范**，不得引入另一套视觉风格。
2. 优先复用 `components/ui` 中的 shadcn 组件，不重复造基础组件。
3. 业务通用组件放 `components/common`，不要为单一页面改 `components/ui` 原始组件。
4. 颜色**必须优先使用 Design Tokens**（`bg-muted`、`text-muted-foreground`、`border-border` 等），禁止散落硬编码颜色。
5. 间距优先使用 4px 倍数体系。
6. 默认**不使用**明显阴影、渐变、大面积高饱和色和过度圆角。
7. 图标统一 `lucide-react`，默认 16px、`strokeWidth={1.8}`。
8. 所有交互状态必须覆盖 Default / Hover / Focus / Active / Disabled。
9. 页面必须考虑响应式布局与键盘可访问性。
10. 新增或修改主题变量时，必须**同时检查 Light 与 Dark**两种主题。
11. 如需求与规范冲突，先说明冲突点，再按明确的产品需求执行。
12. 不要为了追求“像 Notion”而牺牲信息层级、可读性和操作效率。
13. 新增或修改代码时遵守第 7 节注释规范：**能不写就不写，要写就一行说清为什么**。

---

## 7. 注释规范

原则：**注释只写代码本身表达不了的信息；读代码就能知道的一律不写。**

### 7.1 必须删除

- 复述函数名 / 变量名 / 类型的注释，如 `/** 滚动视口引用。 */`、`// 设置页`。
- 描述 JSX 结构或标记层级的注释，如 `{/* 底部操作条 */}`、`{/* 移动端：抽屉式侧边栏 */}`。
- 过时的历史沿革与自我说明，如“与原固定宽度一致”“不再放 logo”；
  只有**当前代码为什么长这样**才是有效信息。
- i18n 词典、CSS 变量分组里的分类小标题（`// 通用`、`/* Background */`）。
- 注释掉的死代码与 TODO 占位。

### 7.2 必须保留（极简写法）

- 不写就会踩坑的取舍与反直觉实现：为什么用 A 不用 B、看似多余的判断在防什么。
- 约束型约定：`timeoutMs <= 0` 表示不限、`total` 未知时为 0、multipart 不带 `Content-Type`。
- 跨文件 / 跨运行时的一致性要求，如宿主侧与 `src/lib/sse.ts` 的判定必须一致。
- 语法强制非空块时的忽略原因（`catch {}` 的 `no-empty`）。

### 7.3 写法

- 一律中文；单条注释控制在 1 行，多行 JSDoc 优先压成单行 `/** ... */`。
- 对外导出的 API 用 `/** */`（编辑器悬浮可见），函数内部逻辑用 `//`。
- 不用 `====` / `----` 分隔线式注释；不写注释来解释命名——先改名。
- 收紧注释后必须跑 `npm run lint`（`no-empty` 会让空 `catch` 报错）与 `npm run build`。

---

## 8. 验收清单

- [ ] 页面背景、侧边栏和内容区层级清晰。
- [ ] 主次文字颜色符合灰阶规范（`#37352F` / `#787774` / `#9B9A97`）。
- [ ] 字号、字重和行高统一。
- [ ] 间距遵循 4px 基础体系。
- [ ] 圆角克制（4/6/8px），无胶囊按钮。
- [ ] 普通卡片没有不必要的阴影；弹层用 `shadow-popover`。
- [ ] 图标统一 Lucide。
- [ ] Hover / Focus / Active / Disabled 状态完整。
- [ ] Light / Dark 主题均可正常使用。
- [ ] 颜色和尺寸优先引用 Design Tokens。
- [ ] 没有未经设计确认的大面积渐变、装饰性插画或高饱和色。
- [ ] 注释只留必要信息：无复述命名、无 JSX 结构说明、无分类小标题，多行 JSDoc 已压成单行。

---

## 9. 相关文档

- [notion-design-system.md](./notion-design-system.md) — 完整设计规范参考
- [README.md](./README.md) — 项目说明、HTTP 调试与多运行时架构
- [docs/architecture.md](./docs/architecture.md) — VS Code 桥接协议与扩展宿主接入
