# 技能来源与更新 · 实施计划

Design: `docs/superpowers/specs/2026-11-04-source-and-update-design.md`
Date: 2026-11-04
Execution: Native（Lead 执行 host；client 半边交给 client-dev 并行）

## Goal

面板按维度拆开筛选行（层级 / 属性 / 来源），显示每个技能的来源（仓库 + 路径 + 时间 + 哈希），
支持「检查更新」与「更新（单条/批量）」，只对由 `skills` CLI 安装、且出现在全局清单里的技能生效；
清单里有、磁盘上没有的技能单独成组、可直接安装。项目级清单本期只读展示。

## Architecture

- Host（`index.js`）：`readLocks` → `list` 增补 `upstream`/`origin`/`updatable`/`missing`/`upstreams` 并做镜像合并；
  `checkUpdates` 用 GitHub REST（可注入 `fetchImpl`）；`updateSkills` 用 codeload tar.gz 或 `git clone`（可注入 `gitImpl`），
  快照校验 + 点号备份 + 原子替换 + 清单写回；单进程 mutex 防并发。
- Client（`client.js`）：筛选条三行；来源徽章/更新圆点；详情「来源」区块；工具栏「检查更新」；
  「仅在清单中」分组；选择模式底部「更新选中」；`force` 二次确认；全部文案走 locale。
- 状态文件 `~/.agents/.skill-update-state.json`：`{version:1, skills:{[name]:{localHash, syncedAt}}}`。

## Tech Stack

Node ESM（`node:fs/promises`、`node:path`、`node:crypto`、`node:zlib`、`node:child_process`、全局 `fetch`）；
React 由宿主模块表提供；无新增依赖。

## Global Constraints

- Host 不 import `@deepseek-ai/*`；客户端不 require 它们。
- 路径安全：`resolveContained`（已存在）；tar 条目与 `skillPath` 逐条校验；`sourceUrl` 只允许 github.com。
- 清单写入：`.bak` + tmp + rename，保留未知字段与哈希格式（40 位仍 40 位）。
- 备份/暂存目录点号前缀，放在技能根内；每个技能保留最新 2 个备份。
- locale zh/en 键集必须相等；样式只用 `--dsw-alias-*` / `--dsh-font-*` token。

## File Structure

| 文件 | 责任 |
| --- | --- |
| `index.js` | host：lock 解析、GitHub 客户端、哈希、tar 解包、更新流程、API 方法 |
| `client.js` | 筛选三行、来源展示、检查更新与更新 UI、missing 分组、locale |
| `test/host.test.mjs` | lock/check/update 的 RED→GREEN |
| `test/client.smoke.mjs` | 筛选三行、来源徽章、检查结果、批量更新、force 路径 |
| `test/preview.mjs` | `list-sources`、`detail-source`、`check-result`、`list-missing` |
| `README.md` | 能力说明、来源与更新用法、安全边界 |
| `docs/superpowers/plans/2026-11-04-source-and-update.md` | 本计划 + 状态 |

## Task 1 — Host：清单解析与 list 增补

Interfaces:
- `readLocks(projectRoot)` → `{global, project, warnings}`；`global.entries[name] = {source, sourceType, sourceUrl, skillPath, hash, installedAt, updatedAt, ref?}`。
- `list` 行新增 `upstream`、`origin`、`updatable`；顶层 `missing`、`upstreams`、`locks`。
- 镜像合并：同 `realPath` 只保留 rank 最小行。

Steps:
1. RED：`test/host.test.mjs` 用 `withSandbox` 造 `agentsHome`，写入 `.skill-lock.json`（v3，含 40 位与 64 位各一条、未知字段 `dismissed`），断言 `list` 行有 `upstream.repo`、未知字段不影响；再写 v1 项目清单断言 `updatable:false`；再造 `~/.dsh/skills/X` → `.agents/skills/X` 链接，断言只出现一行且 `linked:true`、`counts.total` 减一。
2. GREEN：实现 `readLocks`、`matchUpstream(name)`、镜像合并、顶层字段。
3. 跑 `node --test test/host.test.mjs`。

## Task 2 — Host：checkUpdates

Interfaces:
- `checkUpdates({sessionId, names?})` → `{checkedAt, results:[{name, status, upstreamHash, error?}], counts}`。
- `createApi(ctx, deps)` 接受 `deps.fetchImpl`；默认全局 `fetch`。

Steps:
1. RED：假 `fetchImpl` 返回 repos + tree JSON（40 位目录、根级 `skillPath:'SKILL.md'`），断言 40 位命中 → `up-to-date`、不命中 → `update-available`；64 位条目走下载内容 sha256（假 fetch 返回文件内容，断言按 `localeCompare` 排序后 sha256）；403 限流 → `unknown` + `RATE_LIMITED`；非 github `sourceType:'git'` 且 40 位 → `unknown`。
2. GREEN：`githubRequest`（token、限流头、5 分钟缓存）、`gitTreeSha`、`folderSha256`。
3. 跑测试。

## Task 3 — Host：updateSkills

Interfaces:
- `updateSkills({sessionId, items:[{name, rootId}], force?})` → `{results:[{name, rootId, ok, status, backupPath?, code?, message?}], counts}`。
- `deps.gitImpl(args, cwd?)` 用于 ssh/git 源；默认 `execFile('git', …)`。

Steps:
1. RED：
   - codeload tar.gz（测试里用 `node:zlib` + 手写 tar 生成）只解出 `skillPath`、写入真实目录、返回 `status:'updated'` 与 `backupPath` 且旧内容在 `.dsh-bak-*`；
   - 清单里该条目哈希更新为新 tree sha、`updatedAt` 变化、`dismissed` 等未知字段保留、其它条目不变；
   - 本地改动 + 无 `force` → `LOCAL_CHANGES`；带 `force` → 覆盖；
   - `missing` 条目（磁盘无目录）→ `status:'installed'`；
   - 恶意 tar 条目 `../evil` → 拒绝且不写根外；
   - 两个 item 指向同一 realPath → 第二次 `skipped`；
   - 并发第二次调用 → `BUSY`。
2. GREEN：`snapshotHash`（忽略集）、`readState`/`writeState`、`downloadTarball`、`extractTarGz`（手写 tar 解析）、`installExtracted`（备份/替换/回滚/清理旧备份）、`writeLockEntry`。
3. 跑测试（含既有 24 条）。

## Task 4 — Client：筛选三行、来源、检查更新、更新、missing

Interfaces：消费 Task 1–3 的响应；`api.checkUpdates()`、`api.updateSkills()`。

Steps:
1. 筛选条改成三行（层级 / 属性 / 来源），locale 新增 `filter.group.*`。
2. 行加 `dps-badge-source`、`dps-update-dot`；`origin==='local'` 显示「本地」。
3. 详情加「来源」区块 + 「检查更新」「更新」按钮 + `LOCAL_CHANGES` 后出现「强制更新」确认。
4. 工具栏「检查更新」+ 结果条（`N 个可更新` / 全部最新 / 失败原因）。
5. `list.missing` 渲染「仅在清单中」分组（灰显行 + 「安装」）。
6. 选择模式操作条加「更新选中」。
7. locale zh/en 各 +N 键且相等；smoke 测试覆盖上述渲染与请求体。

## Task 5 — 预览、文档、提交

- `test/preview.mjs` 增 4 个状态并截图复核（light/dark）。
- `impeccable detect --json client.js` → `[]`。
- README 增「来源与更新」章节、截图、测试计数。
- 提交（host 与 client 分开提交）。

## Task 6 — 安装与真机验证

- `plugin_manager install_bundle`（link 已装则替换）→ 重启 DSH → 面板四步：
  1. 筛选三行各自可用；来源 chip 能筛到 `obra/superpowers`；
  2. `brainstorming` 详情显示来源、点「检查更新」有结果；
  3. 对一个确实有更新的技能点「更新」，确认文件与清单变化；
  4. 「仅在清单中」组可安装 `docx`。

## Review Focus

1. 清单写回是否保住未知字段与哈希格式，是否原子。
2. tar 解包与 `skillPath` 是否会写出技能根。
3. 快照比较是否与 CLI 规则一致（忽略集、排序）。
4. 镜像合并后计数/批量去重是否一致。
5. 检查更新的失败是否可能误报「已最新」。

## Status

- [ ] Task 1
- [ ] Task 2
- [ ] Task 3
- [ ] Task 4
- [ ] Task 5
- [ ] Task 6
