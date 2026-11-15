# Notion Design System

> 适用于 Vite + React + TypeScript + shadcn/ui + Lucide React 项目的 Notion 风格 UI 规范。
> 设计关键词：极简、低对比度、内容优先、充足留白、弱边框、柔和灰阶。
> 说明：本文是面向项目实现的参考设计规范，并非 Notion 官方 Design System。

## 1. 设计原则

- **内容优先**：减少装饰性元素，让文本和业务内容成为视觉中心。
- **低对比度**：以柔和灰阶构建层级，避免大面积纯黑和高饱和色。
- **弱边框**：优先通过留白、背景色和排版区分区域。
- **克制的圆角与阴影**：小圆角为主，普通卡片默认不使用阴影。
- **轻量交互**：Hover、Focus、Active 状态应清晰但不过度抢眼。
- **一致性**：颜色、间距、字体、圆角和图标尺寸通过 Design Tokens 管理。

## 2. 技术约定

| 项目     | 选择              | 说明                       |
| -------- | ----------------- | -------------------------- |
| 构建工具 | Vite              | 开发与构建                 |
| UI 框架  | React             | 组件开发                   |
| 语言     | TypeScript        | 开启严格类型检查           |
| UI 组件  | shadcn/ui         | 本地源码组件，可二次修改   |
| 图标     | lucide-react      | 统一线性图标风格           |
| 样式     | Tailwind CSS      | shadcn/ui 样式基础         |
| 业务样式 | CSS / CSS Modules | 复杂业务样式可使用原生 CSS |
| 路由     | React Router      | 页面路由                   |
| 状态管理 | Zustand           | 全局状态                   |
| 请求     | Axios             | 统一请求封装               |

> shadcn/ui 依赖 Tailwind CSS。建议保留 Tailwind 作为组件样式基础，同时允许业务模块使用 CSS Modules 或普通 CSS。

## 3. 色彩规范

### 3.1 Light Theme

| Token                  | 色值      | 用途             |
| ---------------------- | --------- | ---------------- |
| `--background`         | `#FFFFFF` | 页面背景         |
| `--sidebar-background` | `#F7F7F5` | 侧边栏背景       |
| `--surface`            | `#FFFFFF` | 卡片、弹层等表面 |
| `--foreground`         | `#37352F` | 主文字           |
| `--muted-foreground`   | `#787774` | 次级文字         |
| `--subtle-foreground`  | `#9B9A97` | 辅助文字、占位符 |
| `--border`             | `#E9E9E7` | 默认边框、分割线 |
| `--surface-hover`      | `#EFEFED` | Hover 背景       |
| `--surface-selected`   | `#E8E8E6` | 选中背景         |
| `--primary`            | `#37352F` | 主要操作         |
| `--primary-foreground` | `#FFFFFF` | 主要操作文字     |

### 3.2 Dark Theme

| Token                  | 色值      | 用途           |
| ---------------------- | --------- | -------------- |
| `--background`         | `#191919` | 页面背景       |
| `--sidebar-background` | `#202020` | 侧边栏背景     |
| `--surface`            | `#252525` | 卡片、弹层表面 |
| `--foreground`         | `#E6E6E5` | 主文字         |
| `--muted-foreground`   | `#9B9A97` | 次级文字       |
| `--border`             | `#373737` | 边框、分割线   |
| `--surface-hover`      | `#2C2C2C` | Hover 背景     |

### 3.3 色彩使用原则

- 主文字使用柔和深灰 `#37352F`，避免纯黑 `#000000`。
- 次级信息使用 `#787774`，辅助信息使用 `#9B9A97`。
- 页面大面积使用白色和浅灰色。
- 品牌色和状态色仅用于需要强调的操作或状态。
- Dark Theme 应单独维护语义 Token，不要简单反转 Light Theme 颜色。

## 4. 字体与排版

### 4.1 字体栈

```css
font-family:
  -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
```

### 4.2 字体层级

| 类型     | 字号 | 字重 | 行高 |
| -------- | ---: | ---: | ---: |
| 页面标题 | 30px |  700 |  1.3 |
| H1       | 26px |  700 | 1.35 |
| H2       | 22px |  600 |  1.4 |
| H3       | 18px |  600 |  1.5 |
| 正文     | 15px |  400 |  1.7 |
| 辅助文本 | 13px |  400 |  1.5 |
| Caption  | 12px |  400 |  1.4 |

### 4.3 排版原则

- 正文优先保证可读性，建议行高 `1.6–1.75`。
- 标题通过字号、字重和上下间距建立层级。
- 同一页面尽量控制字体层级数量，避免频繁改变字号。
- 长文阅读区域应限制最大宽度，避免单行过长。

## 5. 间距规范

采用 4px 基础间距体系。

| Token      | 数值 | 使用场景             |
| ---------- | ---: | -------------------- |
| `space-1`  |  4px | 图标与文字           |
| `space-2`  |  8px | 按钮内部、小元素间距 |
| `space-3`  | 12px | 列表项、紧凑分组     |
| `space-4`  | 16px | 卡片内部、常规间距   |
| `space-5`  | 20px | 内容分组             |
| `space-6`  | 24px | 区块间距             |
| `space-8`  | 32px | 页面区块             |
| `space-12` | 48px | 大区块间距           |

原则：

- 组件内部优先使用 8px、12px、16px。
- 页面区块之间优先使用 24px、32px。
- 通过留白分组，避免滥用分割线和卡片边框。

## 6. 圆角、边框与阴影

### 6.1 圆角

| 组件               | 圆角 |
| ------------------ | ---: |
| Button             |  5px |
| Input              |  5px |
| Sidebar Item       |  4px |
| Card               |  6px |
| Dropdown / Popover |  6px |
| Dialog / Modal     |  8px |

### 6.2 边框

默认边框：

```css
border: 1px solid #e9e9e7;
```

边框应保持低对比度。非必要情况下，不要给每个内容块都添加边框。

### 6.3 阴影

普通卡片默认无阴影。弹层可使用轻量阴影：

```css
--shadow-popover: 0 4px 12px rgba(15, 15, 15, 0.08), 0 1px 3px rgba(15, 15, 15, 0.04);
```

## 7. 组件规范

### 7.1 Button

| 类型        | 样式                         |
| ----------- | ---------------------------- |
| Primary     | 深灰背景、白色文字           |
| Secondary   | 浅灰背景、深灰文字           |
| Outline     | 透明或白色背景、弱边框       |
| Ghost       | 无边框、Hover 时显示浅灰背景 |
| Destructive | 仅在危险操作时使用状态色     |

建议：

- 默认高度 32px；紧凑场景可使用 28px，大尺寸操作可使用 36px。
- 默认圆角 5px。
- 图标与文字间距建议 6–8px。
- Hover 使用轻微背景变化，不使用明显发光效果。

### 7.2 Input

- 默认白色或透明背景。
- 使用弱边框，圆角 5px。
- Placeholder 使用辅助文字颜色。
- Focus 时突出边框或显示轻量 Focus Ring。
- 禁止使用过重的阴影或高饱和描边。

### 7.3 Sidebar

- 浅灰背景，建议宽度 240px。
- 菜单项高度建议 30–34px。
- 默认图标和文字使用次级文字颜色。
- Hover 使用浅灰背景。
- Active 使用略深的浅灰背景，并适当提高文字字重。
- 菜单分组标题使用 11–12px 辅助文字。
- 避免每个菜单项都使用独立卡片样式。

### 7.4 Card

- 默认白色背景。
- 边框可选，优先根据内容分组需要决定是否使用。
- 圆角 6px。
- 内边距建议 16px。
- 默认无阴影。
- 标题、描述、状态和辅助信息之间保持明确层级。

### 7.5 Dialog / Popover / Dropdown

- 背景使用 `--surface`。
- 边框使用 `--border`。
- 圆角 6–8px。
- 使用轻量弹层阴影。
- 菜单项 Hover 使用 `--surface-hover`。
- 弹层内容与触发元素之间保持适当间距。

### 7.6 Table / Database

- 表头文字使用次级文字颜色。
- 行分割线使用弱边框。
- 行 Hover 使用浅灰背景。
- 单元格避免过多装饰。
- 数字、日期、状态等字段保持对齐一致。
- 需要强调的状态使用小面积状态色，不要给整行添加高饱和背景。

## 8. 图标规范

统一使用 `lucide-react`。

| 属性         | 规范      |
| ------------ | --------- |
| 默认尺寸     | 16px      |
| 小图标       | 14px      |
| 标准图标     | 20px      |
| 大图标       | 24px      |
| Stroke Width | 1.8–2     |
| 默认颜色     | `#787774` |
| Hover 颜色   | `#37352F` |

示例：

```tsx
import {
  Search,
  Settings,
  FileText,
  Plus,
  MoreHorizontal,
} from "lucide-react";

<Search size={16} strokeWidth={1.8} />
<Settings size={16} strokeWidth={1.8} />
<FileText size={16} strokeWidth={1.8} />
```

使用原则：

- 同一功能区域内统一图标尺寸和线条粗细。
- 优先选择语义明确的图标。
- 不要混用填充风格差异明显的图标集。
- 图标按钮应提供 Tooltip 或可访问名称。

## 9. 动效与交互

- Hover / Focus / Active 反馈轻量、快速。
- 常规颜色过渡建议 `120ms–180ms`。
- 位移和缩放应克制，避免明显弹跳。
- 弹层出现可使用轻微淡入，不应影响操作效率。
- 支持键盘 Focus 状态。
- 尊重 `prefers-reduced-motion`，为减少动态效果的用户关闭非必要动画。

示例：

```css
.interactive {
  transition:
    background-color 150ms ease,
    color 150ms ease,
    border-color 150ms ease;
}

.interactive:hover {
  background-color: var(--surface-hover);
}

@media (prefers-reduced-motion: reduce) {
  .interactive {
    transition: none;
  }
}
```

## 10. Design Tokens 示例

建议将主题变量放在 `src/styles/tokens.css`，再由全局样式和 shadcn/ui 组件引用。

```css
:root {
  /* Background */
  --background: #ffffff;
  --sidebar-background: #f7f7f5;
  --surface: #ffffff;
  --surface-hover: #efefed;
  --surface-selected: #e8e8e6;

  /* Text */
  --foreground: #37352f;
  --muted-foreground: #787774;
  --subtle-foreground: #9b9a97;

  /* Border */
  --border: #e9e9e7;
  --input: #e9e9e7;

  /* Accent */
  --primary: #37352f;
  --primary-foreground: #ffffff;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;

  /* Shadow */
  --shadow-popover: 0 4px 12px rgba(15, 15, 15, 0.08), 0 1px 3px rgba(15, 15, 15, 0.04);

  /* Typography */
  --font-size-xs: 12px;
  --font-size-sm: 13px;
  --font-size-base: 15px;
  --font-size-lg: 18px;

  /* Layout */
  --sidebar-width: 240px;
  --content-max-width: 900px;
}

.dark {
  --background: #191919;
  --sidebar-background: #202020;
  --surface: #252525;
  --surface-hover: #2c2c2c;
  --surface-selected: #333333;

  --foreground: #e6e6e5;
  --muted-foreground: #9b9a97;
  --subtle-foreground: #777672;

  --border: #373737;
  --input: #373737;

  --primary: #e6e6e5;
  --primary-foreground: #191919;
}
```

> 注意：如果使用 shadcn/ui 的 CSS Variables 模式，应将这些语义变量映射到项目当前 shadcn 版本所使用的变量（例如 `--background`、`--foreground`、`--card`、`--popover`、`--primary`、`--border`、`--input`、`--ring`），避免只定义变量却没有接入组件主题。

## 11. 推荐项目目录

```text
src/
├── components/
│   ├── ui/                 # shadcn 原始组件
│   ├── common/             # Notion 风格业务通用组件
│   └── layout/             # Sidebar、Header、PageLayout
├── hooks/
├── layouts/
├── pages/
├── router/
├── services/
├── stores/
├── types/
├── lib/
│   └── utils.ts
└── styles/
    ├── tokens.css          # 设计变量
    ├── globals.css         # 全局基础样式
    └── theme.css           # 主题切换与适配
```

## 12. AI Coding Agent 执行约束

将以下规则提供给 Claude Code、Codex 等 AI Coding Agent：

1. 新增页面和组件必须遵守本规范，不得自行引入另一套视觉风格。
2. 优先复用 `components/ui` 中的 shadcn 组件，不重复造基础组件。
3. 业务通用组件放在 `components/common`，不要直接修改 shadcn 原始组件来满足单一页面需求。
4. 颜色必须优先使用 Design Tokens，禁止在业务组件中大量散落硬编码颜色。
5. 间距优先使用 4px 倍数体系。
6. 默认不使用明显阴影、渐变、大面积高饱和色和过度圆角。
7. 图标统一使用 `lucide-react`，默认 16px、`strokeWidth={1.8}`。
8. 所有交互状态必须覆盖 Default、Hover、Focus、Active、Disabled。
9. 页面必须考虑响应式布局和键盘可访问性。
10. 新增或修改主题变量时，必须同时检查 Light 和 Dark 两种主题。
11. 如需求与规范冲突，先说明冲突点，再按明确的产品需求执行。
12. 不要为了追求“像 Notion”而牺牲信息层级、可读性和操作效率。

## 13. 参考资源

- Notion 官网：https://www.notion.so/
- shadcn/ui：https://ui.shadcn.com/
- Lucide：https://lucide.dev/icons/
- TweakCN：https://tweakcn.com/
- Vite：https://vite.dev/

## 14. 设计验收清单

- [ ] 页面背景、侧边栏和内容区层级清晰。
- [ ] 主次文字颜色符合灰阶规范。
- [ ] 字号、字重和行高统一。
- [ ] 间距遵循 4px 基础体系。
- [ ] 圆角和边框保持克制。
- [ ] 普通卡片没有不必要的阴影。
- [ ] 图标统一使用 Lucide。
- [ ] Hover、Focus、Active、Disabled 状态完整。
- [ ] Light / Dark 主题均可正常使用。
- [ ] 页面在桌面和移动端布局合理。
- [ ] 颜色和尺寸优先引用 Design Tokens。
- [ ] 没有未经设计确认的大面积渐变、装饰性插画或高饱和色。

---

**核心原则：** 用排版、留白和灰阶建立层次，而不是依靠边框、阴影和颜色堆叠视觉效果。
