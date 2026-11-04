# 批量管理与筛选 — 设计文档

- 日期：2026-11-04
- 状态：已批准（2026-11-04，用户选择 B / A / 模式化多选 / 四维筛选全选）
- 范围：`dsh-project-skills-mng` 右栏面板的批量操作与筛选能力

## Intent

现阶段面板一次只能处理一个技能：清掉一批废弃技能要逐条删，统一关掉一批的模型调用要逐条点开关，把试验中的项目技能提升到全局层要「读 → 新建 → 删」。同时 4 个发现层加起来常有三四十条，找「所有 M 关闭的」或「所有被覆盖的」只能靠肉眼扫。

目标：让「一次处理一批」和「只看某一类」成为面板的一等能力，不改变技能文件的发现与存储方式。

## Goals

1. **模式化多选**：工具栏「选择」进入选择模式，每行左侧出现 checkbox，底部浮现操作条；`Esc` 退出；支持本层全选/清空、`Shift` 连选。
2. **批量操作**：
   - 删除（二次确认，说明链接条目只会解除链接）；
   - 设置调用开关（M 开/关、U 开/关，四选一）；
   - 移动到另一层；
   - 复制到另一层。
3. **逐条结果**：批量执行后显示「成功 N / 失败 M」，失败项可展开看原因；成功项不弹窗。
4. **筛选**（四维可叠加，纯客户端）：
   - 名称/描述关键字；
   - 层级（4 个发现根，多选）；
   - 只看 M 关闭 / 只看 U 关闭；
   - 只看被覆盖 / 只看链接安装。
5. 筛选结果为空时有明确空态与「清除筛选」。

## Non-goals

- 不做导入/导出（已有讨论的 C 档，本轮不做）。
- 不做撤销（undo）；删除按现有单条语义即时落盘。
- 不做后台任务队列/进度条：批量是同步请求，几十条规模足够。
- 不改变 `list` 返回结构与覆盖判定；筛选完全在客户端做。

## Constraints

- **路径安全不变**：每条批量子项都按 `(rootId, name)` 定位，复用现有 `resolveContained` / `assertContained` / 名称白名单；目标层必须存在或可创建，且必须在四个声明根内。
- **不做事务**：逐条独立执行，单条失败不影响其它条；返回逐条结果，不做全量回滚。
- **层级变更 = 写目标 + 删源**：移动先写目标根、成功后再删源；删除失败时保留目标副本并在结果中标记（避免丢内容）。
- **同名冲突**默认 `skip`（跳过并在结果里报 `TARGET_EXISTS`），可选 `overwrite`（覆盖目标同名技能）。UI 默认 skip。
- **链接条目语义**（`linked: true`，如 `~/.dsh/skills/X -> ~/.agents/skills/X` 的镜像）：
  - 复制 = 复制真实内容到目标层，源不动；
  - 移动到「真实文件所在层」= 只解除该层链接，不复制；
  - 移动到其它层 = 复制真实内容到目标层，再解除源链接（`.agents` 真实包保留）。
- 移动/复制会改变技能对模型的可见层级，确认框里必须直说这一点。

## Approaches（已在对话中选定）

- **A. Host 新增一个 `batch` 聚合方法**（选定）：一次 HTTP，内部逐条复用单条 handler，返回逐条 `ok/code`。
- B. 纯客户端循环调单条 API：改动最小，但 N 条 = N 次 HTTP，且没有统一结果汇总。
- C. 拆成 `deleteMany` / `toggleMany` / `transfer`：语义更细，但三套校验逻辑重复。

选中：**A**，因为批量必然要「部分失败也要有明确逐条原因」，而 A 能用一份校验代码给出这份结果。

## Host API

`POST /dsh-project-skills-mng/api/batch`

```jsonc
{
  "sessionId": "…",
  "action": "delete" | "invocation" | "transfer",
  "items": [{ "name": "demo-skill", "rootId": "project-dsh" }],
  "invocation": { "field": "model" | "user", "value": false },
  "target": { "rootId": "global-dsh" },
  "transferMode": "move" | "copy",
  "conflict": "skip" | "overwrite"
}
```

响应（沿用现有 `{ ok: true, ... }` 顶层展开）：

```jsonc
{
  "ok": true,
  "summary": { "total": 3, "succeeded": 2, "failed": 1 },
  "results": [
    { "name": "a", "rootId": "project-dsh", "ok": true },
    { "name": "b", "rootId": "project-dsh", "ok": true, "targetPath": "C:\\…\\b\\SKILL.md" },
    { "name": "c", "rootId": "project-dsh", "ok": false, "code": "TARGET_EXISTS", "message": "…" }
  ]
}
```

约束与校验：

- `items` 1–100 条；超过返回 `TOO_MANY_ITEMS`。
- `delete` / `invocation` 忽略 `target`/`transferMode`。
- `transfer` 必须有 `target.rootId`，且目标层可写、不等于任意源层；否则 `INVALID_TARGET`。
- 单条失败码沿用单条 API：`INVALID_NAME`、`NOT_FOUND`、`PATH_ESCAPE`、`TARGET_EXISTS`、`INVALID_CONTENT`、`READONLY_ROOT`。
- 顶层 `ok: false` 只用于请求级错误（未知 action、结构性错误），单条失败仍在 `results` 里。

## Client UI

### 工具栏

`技能  [选择]  [刷新]  [新建技能]` → 选择模式下 `[退出选择]` 取代 `[选择]`；下方新增一行筛选条：

```
[🔍 搜索名称或描述]              [层级 ▾]  [M 关闭] [U 关闭] [被覆盖] [链接]
```

- 层级用 4 个可点 chip（点掉即隐藏该层），或复用组头点击？—— 采用独立 chip 行，与「折叠」动作分开。
- 关键字输入 120ms 防抖；筛选为纯客户端，不请求 host。

### 选择模式

- 进入：每行左侧出现 checkbox（`.dps-check`），行点击仍是「打开详情」；点 checkbox 或 shift 点击行切换选中。
- 组头出现「全选本层」快捷状态（半选态用 `indeterminate` 的视觉：横杠）。
- 底部固定操作条：`已选 3 项    [开关 ▾] [移到 ▾] [复制到 ▾] [删除]`，右侧 `取消`。
- 筛选变化时，被隐藏的行自动移出选中集合（避免对看不见的行执行操作）。
- `Esc` 退出并清空选择。

### 结果反馈

- 操作条位置替换为结果条：`成功 2 · 失败 1  [查看]`；`[查看]` 展开失败列表（名称 + 原因）。
- 失败原因文案走 locale（中英各一套 key）。
- 部分失败时列表自动刷新（成功项已落盘）。

### 确认

- 删除：`删除 3 个技能？其中 1 个是链接安装，只会解除该层链接，真实文件保留。`
- 移动：`把 3 个技能从「项目 · .dsh/skills」移到「全局 · .dsh/skills」？移动会改变它们对模型的可见范围。`
- 复制：`复制 2 个技能到「全局 · .agents/skills」？同名条目将跳过。`

## 受影响文件

- `index.js`：`batch` handler + 内部 `runBatch`，复用现有单条实现；`describeRoots` 增加目标层可写判定。
- `client.js`：筛选条、选择模式、操作条、确认/结果组件、locale key、CSS（复用现有 token 与 `.dps-*` 命名，新增 `.dps-check`/`.dps-filterbar`/`.dps-actionbar`）。
- `test/host.test.mjs`：批量删除、批量 toggle、跨层移动（含链接源）、复制、目标已存在 skip/overwrite、超过上限、目标层非法。
- `test/client.smoke.mjs`：选择模式与全选、筛选后隐藏行移出选择、`batch` 请求体、结果条渲染、失败展开。
- `test/preview.mjs` + README/计划文档同步。

## Review Focus

1. 目标层可写性校验是否覆盖「目标层不存在但可创建」与「目标层只读」。
2. 移动时「先写后删」的顺序与失败回退说明是否可接受（不做事务的显式取舍）。
3. 选择集合与筛选联动（隐藏行必须退出选择）。
4. 链接条目的三种语义是否都在 UI 文案里说清楚。
5. 批量上限（100）与单条 256KiB 内容上限叠加时的行为。

## 实现顺序（批准后写入计划）

1. Host `batch` + 单测。
2. Client 筛选条 + 单测。
3. Client 选择模式 + 操作条 + 确认/结果 + 单测。
4. 预览截图复核（light/dark、空筛选结果、部分失败）。
5. 提交 + 安装 + 真实 GUI 验证。

## Decisions after design review（2026-11-04 15:50）

设计评审提出 6 个会导致实现歧义的问题，裁决如下（Host 与 Client 都按此实现）：

1. **移动/复制的单位是整个技能包**，不是单个 `SKILL.md`。目录包 `<name>/` 递归复制（`scripts/`、`references/`、资源文件都在内），`.git` 与 `node_modules` 不随包走；包内符号链接按解析后的内容复制，不复制链接本身。平铺 `<name>.md` 源保持平铺形态。单包上限 32 MiB（超过报 `PACKAGE_TOO_LARGE`），不设进度条。
2. **允许跨层混合选择**。目标层若等于其中某几行自己所在的层，这些行逐条失败（`INVALID_TARGET`），不整单拒绝；确认文案说「选中的 N 项」+ 目标层名。
3. **移动的“写成功、删源失败”** 报 `ok:false` + `code: "SOURCE_REMOVE_FAILED"` + `targetPath`，计入失败数，文案说明副本已写入目标层、需手动清理源条目（不做自动回滚）。
4. **链接的平铺文件**（`<name>.md` 是符号链接）删除时只解除链接、不删真实文件；单条与批量删除一致。
5. **折叠不算“隐藏”**：只有筛选条件变化才把被过滤掉的行移出选中集合；折叠分组保持选中，「本层全选」照常作用于该层未被筛选掉的行；Shift 连选按“当前筛选结果的行顺序”跨组计算。
6. **`conflict: "overwrite"` 本轮只作为 Host 能力**，面板固定发送 `skip`（同名跳过），不提供 UI 控件。
