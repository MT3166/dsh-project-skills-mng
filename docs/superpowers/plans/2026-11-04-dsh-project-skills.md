# dsh-project-skills Implementation Plan

> **历史记录：** 本计划撰写时的包名为 `dsh-project-skills`；2026-11-04 起插件标识统一为
> `dsh-project-skills-mng`（仓库同名），文中旧名与旧路由均为历史记录，现行标识见代码。

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (the Lead executes this plan natively).

**Goal:** 给 DSH 增加一个右栏 Skills 管理面板：浏览当前会话/项目生效的项目级与全局技能，并新建、编辑、删除、切换可调用性。

**Architecture:** 一个 bundle 包 `dsh-project-skills`。Host 半边（`index.js`）在 host plane 注册 fenced HTTP prefix 路由 `/dsh-project-skills/api`，按会话解析 cwd / agentPreset / skills registry，直接读写技能根目录下的 SKILL.md；Client 半边（`client.js`）通过 `ctx.sidebarRightTabs.register` 注册 tab 类型并向 guide 贡献一张卡片，tab body 通过 `sidebar.right.pane.tab` 槽渲染管理面板。

**Tech Stack:** Node ESM（无依赖、无构建）、React（由浏览器模块表提供）、`@deepseek-ai/dsh-client-ui-sidebar-right` 公共扩展、node:fs/promises。

**Spec:** 本文件即设计规格（brainstorming 已获用户批准，m00237）。

## Global Constraints

- 包名 `dsh-project-skills`，`private: true`，`type: "module"`，无运行时依赖，不引 `@deepseek-ai/*` 运行时包。
- 必须导出 `./icon` 与 `./locale/*.json`；locale 同时有 en.json 与 zh.json（`meta.title`/`meta.description`）。
- `index.js` 只导出 `export function apply(ctx, config)`（可加 `export const inject`），所有注册在 `apply` 内用 `ctx.effect` 并返回清理。
- `client.js` 必须是 `window.__ModuleLoader__.load({ id: '<包名>', factory(require) {...} })` 形式；React 用 `require('react')`。
- 面板只用 `--dsw-alias-*` / `--dsh-*` theme token 着色；不写 `document.body`，不替换 app root。
- 所有写路径必须 realpath 后落在允许的技能根内；frontmatter 写入后回读校验（name kebab-case、description 非空）。
- 卸载插件即可完全移除；不修改 profile 文件（用 `plugin_manager install_bundle`）。

## Host API 契约（Client 与 Host 共享）

`POST <hostRoute>/dsh-project-skills/api/<method>`，JSON body，JSON 响应 `{ ok: true, ... }` / `{ ok: false, error: { code, message } }`。

| method | request | response |
|---|---|---|
| `roots` | `{ sessionId }` | `{ ok, cwd, projectRoot, roots: [{ id, scope: 'project'|'global', dir, label, path, exists, writable }] }` |
| `list` | `{ sessionId }` | `{ ok, cwd, projectRoot, counts: { project, global, total }, groups: [{ scope:'project'|'global', roots:[{ id, path, exists }], skills:[ Skill ] }] }` |
| `read` | `{ sessionId, name }` | `{ ok, skill: Skill, content }` |
| `write` | `{ sessionId, rootId, name, content }` | `{ ok, skill: Skill, created }` |
| `delete` | `{ sessionId, rootId, name }` | `{ ok, deleted: true }` |
| `toggle` | `{ sessionId, rootId, name, field:'model'|'user', value:boolean }` | `{ ok, skill: Skill }` |

`Skill` = `{ name, description, whenToUse?, path, absPath, rootId, scope, source, modelInvocable, userInvocable, shadowedBy? }`。
`shadowedBy` 仅当同名技能在更高优先级根中已存在时出现（列出被覆盖的其余条目）。

`rootId`：`project-dsh`（`<projectRoot>/.dsh/skills`）、`project-agents`（`<projectRoot>/.agents/skills`）、`global-dsh`（`<DSH_HOME>/skills`）、`global-agents`（`<HOME>/.agents/skills`）。
sessionId 缺失或会话不存在时返回 `{ ok:false, error:{ code:'SESSION_NOT_FOUND' } }`，HTTP 仍 200。

## Review Focus

- 会话没有 cwd / 没有 agentPresets 时：面板应退化为全局列表并给出可读提示，而不是空白或 500。
- 路径穿越（`name` 含 `..`、绝对路径、分隔符）：必须拒绝，且不写任何文件。
- 写坏 frontmatter 的旧文件：读列表时跳过并标注 `error`，不能让整个 list 失败。
- 同名技能被项目覆盖：global 行必须显示 `shadowedBy`（否则用户以为全局技能失效）。
- 目录尚不存在时新建：自动创建 `<root>/<name>/SKILL.md`，而不是报错。

---

## File Structure

- `package.json` — bundle + client manifest
- `cordis.patch.yml` — 一行 insert
- `index.js` — Host：会话解析、技能根枚举、SKILL.md 读写、路由
- `client.js` — Client：tab 类型/guide 卡片/面板组件/HTTP 客户端
- `locale/en.json`, `locale/zh.json` — 插件元数据 + 面板文案
- `icon.svg` — 插件图标（自绘）
- `README.md` — 安装与用法
- `fixtures/demo-project/.dsh/skills/demo-skill/SKILL.md` — 验证用测试项目
- `docs/superpowers/plans/2026-11-04-dsh-project-skills.md` — 本计划

## Tasks

### Task 1: Host 半边（index.js）

**Interfaces:**
- Produces: 上表 HTTP 方法；`ctx.webServer.register({ kind:'prefix', path:'/dsh-project-skills/api', handler })`。
- Consumes: `ctx.connection.requestRejection(req)`（fence）、`ctx.sessionQuery.observeSession(sessionId)`、`ctx.workingDirectory.defaultDirectory/ensure`、`ctx.agents.get(sessionId)`、`ctx.get('agentPresets')?.serviceFor/acquireScope`、`ctx.get('skills')`。

- [ ] 解析会话：`obs.projections.values.workingDirectory ?? obs.header.cwd ?? ctx.workingDirectory.defaultDirectory`；live 时 `workingDirectory.ensure`。
- [ ] projectRoot：从 cwd 向上找含 `.git` 的目录，没有则用 cwd。
- [ ] 读技能：对每个根扫 depth1（`<name>/SKILL.md` 或 `<name>.md`），解析 frontmatter（自写 YAML 标量子集），坏文件入 `errors`。
- [ ] 写技能：校验 name 为 kebab-case、目标 realpath 在根内、写入后回读校验；`writeFile` 用临时文件 + rename 保持原子性。
- [ ] delete：只删 `SKILL.md` 所在目录（或平铺 `.md`），且路径在根内。
- [ ] toggle：只改 frontmatter 的 `disable-model-invocation` / `user-invocable`，正文原样保留。
- [ ] 路由：非 POST → 405；fence 失败 → 403；未知 method → 404；异常统一 JSON 500。

### Task 2: Client 半边（client.js）

**Interfaces:**
- Consumes: Host API 上表；`ctx.sidebarRightTabs.register({ id:'dsh-project-skills/skills', kind:'dsh-project-skills', title, guide:[{ id:'skills', order: 40, title, description }] })`；`ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name:'sidebar.right.pane.tab', key:'dsh-project-skills/skills' }, SkillsPanel))`；`ctx.locale.register(NS, { zh, en })`。
- Body props 可用：`useTabInfo()`（`tab.actions.openTab` 等）、`sessionId`。

- [ ] tab 类型 + guide 卡片（点了才打开，符合“常驻入口”）。
- [ ] 面板：顶部项目/全局分组（折叠）、行 = 名称 + 描述 + 来源徽章 + M/U 标记 + 被覆盖标记。
- [ ] 详情/编辑：点击行切换，textarea 编辑全文，保存/取消；保存调 `write` 后刷新。
- [ ] 新建：选根 + 名称 + frontmatter 模板；删除二次确认。
- [ ] 刷新 / 打开目录按钮；空状态与错误状态可读。
- [ ] 文案走 locale；颜色只用 theme token。

### Task 3: 打包、安装、验证

- [ ] `node --check index.js client.js`；`node -e "JSON.parse(...)"` 校验 manifest/locale。
- [ ] `plugin_manager install_bundle target=D:\XMT\99_Codebase\github\dsh-project-skills-mng` → `application: applied`。
- [ ] `cordis_inspect_query`（Client Slots）确认 `dsh-project-skills/skills` 的 tab 类型与 guide 卡片注册。
- [ ] 在 `fixtures/demo-project` 开会话：面板显示 demo-skill 为 project；新建/编辑/删除生效；模型 catalog 能看到新技能。

## Status (2026-11-04 11:15)

- Task 1（Host）done：`index.js` 全部 handler + `skills_manage` 工具；`test/host.test.mjs` 7/7。
- Task 2（Client）done：`client.js` 2147 行；`test/client.smoke.mjs` 10/10；guide entry `order: 10`，`title`/`description` 均为零参函数（guide body 实际调用 `entry.title()` / `entry.description?.()`，写成字符串会让 guide 页崩溃——已修）。
- Task 3（安装/验证）done：`install_bundle` → `application: applied`；pane 槽 occupant `dsh-project-skills/skills` active；`Tool.listTools` 含 `skills_manage`；`test/probe.mjs` 在真实全局技能目录上得到 counts `{project:1, global:44, total:45, shadowed:20, broken:0}`；用户在真实 GUI 中确认 guide 卡片「项目管理技能」与面板 Project/Global 分组正常。
- 未做：`fixtures/demo-project` 独立示例工程（改用仓库内 `.dsh/skills/demo-skill` 实测，模型 catalog 已可见该技能）。

## Status (2026-11-04 15:05) — 四级发现顺序

- 面板不再按「Project / Global」二分，而是复刻 DSH 的四根与 rank：项目 `.dsh/skills`(100)、项目 `.agents/skills`(200)、全局 `~/.dsh/skills`(400)、全局 `~/.agents/skills`(500)，每层一个可折叠分组，组头显示条目数与优先级数字。
- Host `list` 返回值从 `groups[]`（2 组，每组 `roots[]`）改为 `tiers[]`（4 组，每组即一个根，带 `rank/scope/id/rootId/path/exists/writable/skills[]`）；`markShadowing` 不变（仍按 rank 全局排序，rank 小者胜）。
- Client：`patchListSkill`/`writableRoots`/`findRootInfo` 读 `tiers`；组头改为「caret + 层名 + 条目数 + spacer + 优先级 chip」；路径行只在层缺失/只读时出现（健康层保持安静）；列表行去掉来源徽章（层已表达来源），保留 M/U 与「链接」徽章。
- 测试：host 12/12、client 12/12；`test/preview.mjs` 的 mock 同步改四层，`list-light/empty-light/list-dark` 截图复核通过。
