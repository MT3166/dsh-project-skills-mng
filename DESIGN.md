---
name: dsh-project-skills-mng — 右栏技能面板
description: DSH 右栏里"当前会话生效了哪些技能"的可见解析顺序面板；克制的工具界面，扁平分层，全量主题变量。
colors:
  ink-strong: "var(--dsw-alias-label-primary)"
  ink: "var(--dsw-alias-label-secondary)"
  ink-faint: "var(--dsw-alias-label-tertiary)"
  ink-disabled: "var(--dsw-alias-label-dimmed)"
  ink-on-solid: "var(--dsw-alias-label-primary-foreground)"
  sheet: "var(--dsw-alias-bg-layer-1)"
  rail: "var(--dsw-alias-interactive-bg-active)"
  rail-hover: "var(--dsw-alias-interactive-bg-hover)"
  well: "var(--dsw-alias-markdown-code-block)"
  hairline: "var(--dsw-alias-border-l2)"
  hairline-strong: "var(--dsw-alias-border-l3)"
  hairline-faint: "var(--dsw-alias-border-l1)"
  brand: "var(--dsw-alias-brand-primary)"
  brand-wash: "var(--dsw-alias-interactive-bg-hover-accent)"
  accent: "var(--dsw-alias-state-business-primary)"
  danger: "var(--dsw-alias-state-error-primary)"
  danger-wash: "var(--dsw-alias-interactive-bg-hover-danger)"
  warn: "var(--dsw-alias-state-warn-primary)"
  warn-wash: "var(--dsw-alias-state-warn-tertiary)"
  ok: "var(--dsw-alias-state-success-primary)"
typography:
  screen-title:
    fontFamily: "inherit"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.5
  group-title:
    fontFamily: "inherit"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.5
  row-name:
    fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Monospace"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "inherit"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: "inherit"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "inherit"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1
  code-meta:
    fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Monospace"
    fontSize: "10.5px"
    fontWeight: 400
    lineHeight: 1
rounded:
  hairline: "4px"
  control: "6px"
  field: "8px"
  card: "10px"
  panel: "12px"
  pill: "999px"
spacing:
  xxs: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  xxl: "20px"
components:
  button-default:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink-strong}"
    rounded: "{rounded.field}"
    height: "28px"
    padding: "0 10px"
    typography: "{typography.label}"
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.ink-on-solid}"
    rounded: "{rounded.field}"
    height: "28px"
    padding: "0 10px"
    typography: "{typography.label}"
  button-danger:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.danger}"
    rounded: "{rounded.field}"
    height: "28px"
    padding: "0 10px"
    typography: "{typography.label}"
  button-danger-solid:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.ink-on-solid}"
    rounded: "{rounded.field}"
    height: "28px"
    padding: "0 10px"
    typography: "{typography.label}"
  chip:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "23px"
    padding: "0 8px"
    typography: "{typography.label}"
  chip-selected:
    backgroundColor: "{colors.brand-wash}"
    textColor: "{colors.brand}"
    rounded: "{rounded.pill}"
    height: "23px"
    padding: "0 8px"
    typography: "{typography.label}"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink-strong}"
    rounded: "{rounded.field}"
    height: "32px"
    padding: "0 9px"
    typography: "{typography.body}"
  search:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink-strong}"
    rounded: "{rounded.field}"
    height: "30px"
    padding: "0 9px"
    typography: "{typography.body}"
  row-card:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink-strong}"
    rounded: "{rounded.card}"
  rank-tag:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink-faint}"
    rounded: "{rounded.hairline}"
    padding: "1px 5px"
    typography: "{typography.code-meta}"
---

# Design System: dsh-project-skills-mng

## Overview

**Creative North Star: "The Visible Precedence"**

面板的全部视觉工作只有一个目的：把 DSH 内部那套**不可见的解析顺序**变成可见的。四个技能根、rank 数字、同名覆盖、链接镜像——这些不是设置项，而是事实，界面的责任是把这些事实排得比装饰更清楚。因此这套系统里没有强调色块、没有插图、没有渐变：颜色只承担三件事，标示**层级/位置**（墨色深浅与 hairline 粗细）、标示**状态**（business 蓝＝可更新/焦点、warn＝可写性问题、error＝失败、success＝根存在）、标示**可交互**（品牌黑或 accent 蓝）。任何一处颜色都来自 DSH 主题变量，因此面板在浅色与深色主题下与侧边栏、对话框、设置页共享同一个世界。

密度是这套系统的第二身份。右栏宽度由用户拖动决定，通常只有 280–420px；一屏能看见多少条技能，直接决定这个面板是否值得打开。于是系统采用「一行一个技能」的紧凑行卡（9px 10px 内边距、名称 12px 等宽、描述 2 行截断），分组头 24px 高，工具栏全部是 28px 的小按钮，筛选 chip 折叠在「筛选」按钮之后。装饰性留白被压到最小，但**结构间隙**（分组之间 8px、面板内 10px）始终保留，因为它承担的是"这是另一个解析层"的语义。

质感上是「轻巧而确切」：控件矮、边框 1px、圆角 8px、没有渐变、没有彩色光晕，唯一的阴影是 sticky 操作条贴底时的分离阴影与开关滑块的 1 级阴影。这不是极简主义表演——每一个边框都在划分可读的区块，每一个间距都在表达分组归属。

**Key Characteristics:**
- 单栏、单页、无模态；所有反馈就地显示（检查结果条、批量结果条、确认区都嵌在流程里）。
- 四种字重：600（标题/组名/技能名）、500（按钮/chip 选中/提示头）、400（正文/元信息）、等宽 400（路径/哈希/rank）。
- 等宽字体只用于**代码与标识**（技能名、rank、根路径、哈希、仓库路径、正文预览），不用于普通文案。
- 深色与浅色主题共用同一套变量名，不写任何 fallback 以外的颜色字面量（`color-mix` 的光晕是唯一例外，且只以主题变量为基色）。

## Colors

整套色板是 DSH 主题角色的薄薄一层映射：墨色三档做信息层级，hairline 三档做区块划分，三个语义色做状态，品牌色做"这一行/这一个按钮是主动作"。

### Primary

- **Active Ink** (`var(--dsw-alias-brand-primary)` / `var(--dsw-alias-label-primary-foreground)` on solid)：主动作按钮（新建技能、保存、确认更新）的实心填充与其反白文字；同时是开关「开」态与多选 checkbox 的选中色。全屏出现面积通常小于 5%。
- **Business Accent** (`var(--dsw-alias-state-business-primary)`)：焦点环（2px outline + 3px 40% 透明混合光晕）、可更新小圆点、筛选生效小圆点。它承担"这里有一件需要注意但无害的事"，绝不用于装饰。

### Secondary

- **Signature Wash** (`var(--dsw-alias-interactive-bg-hover-accent)`)：仅用于"被用户选中"的语义——筛选 chip 选中、被选中的技能行、复选框行高亮。它把品牌色稀释成背景，让选中状态可读而不刺眼。

### Neutral

- **Ink Strong** (`var(--dsw-alias-label-primary)`)：标题、组名、技能名、正文主信息。正文与浅色背景的对比度由主题保证 ≥ 4.5:1。
- **Ink** (`var(--dsw-alias-label-secondary)`)：描述文字、元信息值、按钮文字、chip 未选中文字。
- **Ink Faint** (`var(--dsw-alias-label-tertiary)`)：计数、rank、路径、被覆盖说明、占位符、分组标记。**仅用于可被跳过的次要信息**，不承载唯一必读内容。
- **Ink Disabled** (`var(--dsw-alias-label-dimmed)`)：目录不存在的小圆点、禁用态文字补充。
- **Sheet** (`var(--dsw-alias-bg-layer-1)`)：行卡背景、按钮底、输入框底、sticky 操作条底。面板自身不铺底色，直接落在右栏表面上。
- **Well** (`var(--dsw-alias-markdown-code-block)`)：等宽内容的底——rank 标签、M/U 标记、SKILL.md 正文预览、编辑器。它比 Sheet 略深一档，暗示"这是原始文本，不是界面文案"。
- **Rail** (`var(--dsw-alias-interactive-bg-active)`)：选中 chip 的填充、禁用 primary 按钮的底、开关「关」态的轨道。
- **Rail Hover** (`var(--dsw-alias-interactive-bg-hover)`)：行悬停、分组头悬停、次按钮悬停底。
- **Hairline** (`var(--dsw-alias-border-l2)`)：卡片外框、输入框边框、按钮边框——所有"控件轮廓"。
- **Hairline Strong** (`var(--dsw-alias-border-l3)`)：悬停时加强的轮廓、链接徽章的虚线边。
- **Hairline Faint** (`var(--dsw-alias-border-l1)`)：卡内行与行之间的分隔、警告/错误区的外框。

### Tertiary

- **Danger** (`var(--dsw-alias-state-error-primary)`) + **Danger Wash** (`var(--dsw-alias-interactive-bg-hover-danger)`)：删除按钮的文字色与实心态、内联确认区（删除确认、强制更新确认）的底色。警告/错误条的边框与底色一并使用 hairline-faint，避免整块泛红。
- **Warn** (`var(--dsw-alias-state-warn-primary)`) + **Warn Wash** (`var(--dsw-alias-state-warn-tertiary)`)：目录只读状态点、解析失败提示条的底色。注意：`state-warn-tertiary` 是**背景** token，绝不能当文字色。
- **Ok** (`var(--dsw-alias-state-success-primary)`)：目录存在且可写的状态点（5px 圆点），全屏仅此一处。

### Named Rules

**The Theme-Only Rule.** 颜色值一律写成 `var(--dsw-alias-*)` 或 `var(--dsw-shadow-*)`；唯一的字面量是 `transparent` 与以变量为基色的 `color-mix(...)`。任何 hex、rgb、hsl 都是缺陷——面板必须同时活在浅色、深色两套主题里。

**The Wash Is For Selection Rule.** 品牌色稀释成背景（`interactive-bg-hover-accent`）只用来表示"用户选了它"；状态色稀释成背景只用来表示"这里有错误/警告"。二者不混用，用户据此能分辨"我的选择"与"系统的告警"。

## Typography

**Body Font:** 继承 DSH 界面字体（`inherit`，不引入任何 webfont）
**Label/Mono Font:** `ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, "Liberation Mono", monospace`——仅限代码与标识

**Character:** 一套界面字体承担全部叙述，等宽字体只作为"这是原始数据"的标记出现。这种分工让面板在窄栏里保持安静：用户眼睛扫过时，等宽的东西是需要精确读取的，正文的东西是可以跳读的。

### Hierarchy

- **Screen Title** (600, 13px, 1.5)：工具栏里的「技能」标题，与它右侧的按钮同处一行。
- **Group Title** (600, 13px, 1.5)：四个解析层的标题（如「项目 · .dsh/skills」），前面是 6px 的折叠三角，后面跟计数与 rank。
- **Row Name** (等宽 600, 12px, 1.5)：技能名。等宽 + 600 让它在一堆中文描述里像"标识符"一样被识别，而不是像标题。
- **Body** (400, `--dsh-content-font-size-secondary` ≈13px, 1.5)：面板正文基准；输入框、搜索框、编辑区使用同一字号。
- **Meta** (400, `--dsh-content-font-size-tertiary` ≈11–11.5px, 1.45)：描述（最多 2 行）、被覆盖说明、警告明细、失败原因、检查结果文字。
- **Label** (500, 11px, 1)：按钮文字、chip 文字——矮控件里的文字需要靠 500 字重维持可读性。
- **Code Meta** (等宽 400, 10–10.5px)：rank 标签、M/U 标记、来源徽章、路径与哈希。最小可读尺寸 9.5px（M/U 标记），不再往下。

### Named Rules

**The Mono Means Data Rule.** 等宽字体只用于技能名、rank、路径、哈希、仓库内路径、SKILL.md 原文与其编辑器。界面句子、按钮、说明文字一律不切换到等宽——"看起来技术"不是使用等宽的理由。

**The Two-Trim Rule.** 技能名与路径单行省略（`text-overflow: ellipsis` + 完整值放 `title`），描述固定 2 行截断。任何一行都不允许把右栏撑出横向滚动。

## Layout

面板是一张纵向流：工具栏 → 提示/结果条（可叠加，出现即占位）→ 筛选头（搜索框 + 「筛选」按钮）→ 筛选面板（折叠）→ 四个解析层分组 → （可选）「仅在清单中」分组 → 多选时的 sticky 操作条。

- **容器**：`.dps-root` 是全高 flex 列，`padding: 12px 12px 20px`，`gap: 10px`，滚动由容器自身承担（`overflow: auto`，细滚动条）。
- **分组**：`.dps-group` 之间 6px，组头 24px 高、4px 内缩，组体与组头之间 6px，行卡之间在组体里 8px。
- **行卡**：整组行共用一个 `border-radius: 10px` 的外框，行与行之间只用 1px `border-l1` 分隔，行内 `padding: 9px 10px`。这是"一张卡片里排多行"，不是"多条卡片"。
- **工具栏**：`flex-wrap: wrap`；标题在左，「检查更新 / 选择 / 刷新」收进 `.dps-tools`（右对齐、6px 间距），「新建技能」作为唯一的 primary 始终在最右。
- **窄容器**：`container-type: inline-size`，`@container (max-width: 340px)` 下筛选行的标签换行成独立一行，chip 组继续自然换行。
- **密度基线**：默认状态下一屏（约 700px 高）至少能看到 8–10 条技能行；任何新增控件都要证明它换来了更多可操作信息。

## Elevation & Depth

**扁平 + 色调分层，无装饰性投影。** 深度由三层颜色（右栏表面 → Sheet → Well）与三档 hairline 表达，而不是阴影。全系统只有两处阴影，都是功能性的：

- **Sticky 分离**：多选操作条贴住面板底部时用 `border-top` 与 Sheet 底色分离；当它覆盖内容时才需要阴影，且只允许主题的 1 级阴影。
- **开关滑块**：`box-shadow: var(--dsw-shadow-lv1)`——物理语义（一个会被拖动的圆钮）需要一点点厚度，这是"轻巧而确切"里唯一的实体暗示。

### Named Rules

**The One Border Rule.** 一个区块只有一种轮廓：要么 1px 边框，要么底色差，不要既加边框又加深色底再叠阴影（ghost card）。

**The No Glow Rule.** 光晕只属于焦点态（`0 0 0 3px` + 16% 主题色 `color-mix`），不得用于悬停、强调或装饰。

## Shapes

- **圆角阶梯**：4px（rank 标签、徽章、文字链接的焦点环）→ 6px（组头、`本层全选` 小按钮、折叠三角的命中区）→ 8px（按钮、输入框、搜索框、检查结果条）→ 10px（行卡外框、正文预览、编辑器、确认区）→ 12px（空态虚线框）→ 999px（chip、开关轨道）。
- **边框**：控件用实线 1px；"链接安装"徽章与「关闭态」M/U 标记用**虚线**——虚线在本系统里始终表示"这不是实体，是引用/被关闭"。
- **折叠三角**：6–7px 的 `border-right` + `border-bottom` 旋转 45°，是面板里唯一的图形符号（不用图标字体、不用 emoji、不用 SVG 库）。
- **状态点**：5px 圆点（目录状态、筛选生效）与 10px 圆点（可更新）两档，用尺寸而不是颜色区分严重度。

## Components

组件整体语气：**轻巧而确切**——矮、有边框、有底色但不重，悬停只做背景与边框的 0.12s 微调。

### Buttons

- **Shape:** 8px 圆角，28px 高，`0 10px` 内边距，1px `border-l2`，Sheet 底。
- **Primary:** 品牌色实心 + 反白文字；悬停换成 `button-primary-hover`；禁用时不是降透明度，而是变成 `Rail` 底 + `Ink Faint` 文字（"不可用"要看起来像不可用，而不是像一个淡淡的可用按钮）。
- **Danger:** 默认是 `Sheet` 底 + 红字（低风险破坏性操作）；进入确认区后的「确认删除/确认移除」才是红色实心 + 反白文字（高风险）。
- **Ghost / Text:** `.dps-link` 无边框无底色，11px `Ink` 文字，悬停转 `Ink Strong` 并加 2px offset 下划线。用于「全部更新」「展开」「收起」「查看原因」等次级动作。
- **Hover / Focus:** 背景 `Rail Hover` + 边框 `Hairline Strong`；`:active` 用 `Rail`；`:focus-visible` 用 2px `Business Accent` outline（offset 1px）。

### Chips

- **Style:** 999px 药丸，23px 高，1px `Hairline`，透明底，11px `Ink` 文字。
- **State:** 两层语义——层级 chip（`data-tier`）选中时是 `Rail` 底 + `Ink Strong` + 500 字重（"这一层是开着的"），未选中时边框变 `border-l1`、文字转 `Ink Faint`、整体 0.75 透明度；属性/来源 chip 选中时是 `Brand Wash` 底 + `Brand` 文字 + 品牌色边框（"我收窄到这个条件"），未选中 0.55 透明度。**选中永不使用删除线**（曾因删除线看起来像损坏的标签而废弃）。

### Cards / Containers

- **Corner Style:** 行卡 10px，空态 12px（虚线）。
- **Background:** Sheet；等宽内容区换 Well。
- **Shadow Strategy:** 无（见 Elevation & Depth）。
- **Border:** 1px `Hairline` 外框，1px `Hairline Faint` 行分隔。
- **Internal Padding:** 行 `9px 10px`；提示条/结果条 `6–8px 10px`；预览与编辑器 `12px`。

### Inputs / Fields

- **Style:** 32px 高（搜索框 30px），8px 圆角，1px `Hairline`，Sheet 底，13px 正文。
- **Focus:** 去掉默认 outline，改 1px `Business Accent` 边框 + 3px 16% 同色光晕；悬停时边框升到 `Hairline Strong`。
- **Error / Disabled:** `aria-invalid="true"` 时边框转 `Danger`，并配一行 11px `Danger` 文字说明；禁用态用 0.45 透明度（仅限非 primary 控件）。
- **编辑器**：SKILL.md 用 Well 底 + 等宽 12px / 1.65 行高 + `tab-size: 2`，最小高 320px，可纵向拖拽；这是唯一"内容即文本"的组件。

### Navigation

面板内没有多页导航，只有三态视图切换：**列表 → 详情 → 编辑/新建**。切换靠左上角一个「返回」按钮（28px，与其它按钮同形），不使用面包屑、不使用 tab 栏——右栏宽度不够同时容纳导航与内容。

### Signature Components

**Tier Group（解析层分组）**：24px 组头 = 6px 折叠三角 + 13px 600 组名 + 11px 计数 + 右对齐的 rank 小标签（等宽 10px，Well 底）。组体顶部可有一行 5px 状态点 + 10.5px 说明（「目录不存在」「只读」）。这是"可见的解析顺序"最重要的一次表达：**组名说位置，计数说多少，rank 数字说优先级**。

**Row Card（技能行）**：单行 9px 10px，第一行是 `技能名（等宽 12px 600） + 来源徽章 + 链接徽章 + 可更新圆点 … M/U 标记（右对齐，18px 方块）+ 悬停箭头`，第二行是 2 行截断的描述，第三行（可选）是 11px `Ink Faint` 的被覆盖说明。多选模式下左侧插入 14px checkbox，整行 `Brand Wash` 高亮。

**Status Strip（结果条）**：检查更新结果、批量结果、解析失败警告共用一个形态——单行 `row + wrap`、`6px 10px` 内边距、8px 圆角、1px `Hairline`，文字 11px `Ink`，右侧跟文字链接动作（「全部更新」「查看」「关闭」）。**绝不允许**用纵向 flex 让它撑成空框（旧的 `column` + `spacer` 组合曾把它撑高到 120px）。

**Confirm Block（内联确认区）**：`Danger Wash` 或 `Warn Wash` 底 + `Hairline Faint` 外框 + 10px 圆角 + 10px 内边距，文字 12px，底部一行「确认（实心红）/ 取消」。删除确认的文案必须写明**影响范围**（删哪个文件、链接是否保留），不做成模态。

**Switch（调用开关）**：34×20 药丸轨道 + 14px 圆钮，关态轨道 `Rail`、开态 `Brand`，圆钮带 1 级阴影并在 0.16s 内平移 14px。它出现在详情页的两行 `模型可调用 / 用户可调用` 里，永远与文字标签左对齐配对。

## Do's and Don'ts

### Do:

- **Do** 用 `var(--dsw-alias-*)` 主题变量写每一个颜色，让面板在浅色/深色下都落在 DSH 自己的世界里。
- **Do** 把 rank 数字、根路径、层级名原样呈现（100/200/400/500、`项目 · .dsh/skills`），层级是事实不是设置。
- **Do** 用「一行一个技能」的紧凑行卡，行内 `padding: 9px 10px`、名称 12px 等宽、描述 2 行截断。
- **Do** 让所有反馈就地出现（结果条、确认区、错误块），并在出现时明确写出影响范围与失败原因。
- **Do** 在悬停时只做 `0.12s` 的背景与边框变化；焦点态统一用 2px `Business Accent` outline 或 3px 同色光晕。
- **Do** 给每个只靠颜色表达的状态配一段文字或 `title`（可更新圆点有 `可更新 · <hash>`，目录状态点有「目录不存在 / 只读」）。

### Don't:

- **Don't** 引入任何与 DSH 右栏不同的字体、色板、圆角或间距体系——包括给"技能"这类概念发明新的强调色。
- **Don't** 写死 hex/rgb 颜色，或把背景 token（如 `state-warn-tertiary`）当文字色使用（曾把检查条文字写成背景色，导致几乎不可读）。
- **Don't** 用纵向 flex + spacer 撑开单行状态条，也不要给状态条加阴影——它是流程里的一条线，不是一张卡片。
- **Don't** 用模态弹窗处理批量结果、删除确认或检查更新：面板宽度不够，打断会让用户失去上下文。
- **Don't** 用删除线表示"这一层被关掉"，也不要用纯色块代替文字说明覆盖关系。
- **Don't** 为了好看牺牲单屏条目数：新增任何一行控件都必须证明它换来了更多可操作信息。
