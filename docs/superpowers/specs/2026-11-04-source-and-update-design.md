# 技能来源与更新（source & update）设计

日期：2026-11-04
状态：待用户批准（已过 builder check，裁决见文末）
相关：`docs/superpowers/specs/2026-11-04-batch-and-filter-design.md`、`docs/superpowers/plans/2026-11-04-batch-and-filter.md`

## Intent

右栏面板现在能浏览、编辑、增删、筛选、批量管理四层技能，但看不出一个技能**从哪来**，也没法把它**更新到上游最新版**。

用户的原话（m02889）：

> skills的4个加载权重，m关闭 u关闭这些不是一个维度的筛选，不能笼统地放在一行，其次，我们管理skills还需要管理skills的来源，比如 brainstorming 来源于 obra/superpowers，我们需要对这种非本地的skills支持更新。

所以两件事：

1. 筛选条按维度拆行；来源成为独立维度。
2. 面板能识别“这个技能来自哪个 GitHub 仓库的哪个路径”，并支持检查更新 / 就地更新，写入范围只限由 `skills` CLI 安装的技能。

## 当前事实（已勘察 + builder check 校正）

### 清单文件

- `skills` CLI（vercel-labs，`npx skills`，本机 v1.7.0）把**全局**安装清单写在
  `~/.agents/.skill-lock.json`（`version: 3`，`XDG_STATE_HOME` 可覆盖目录）。
  条目字段：`source`（`owner/repo` 或 git URL）、`sourceType`（`github` | `git`）、`sourceUrl`、
  `skillPath`（技能目录或根 `SKILL.md`）、`skillFolderHash`、`installedAt`、`updatedAt`，可选的 `ref`（分支）。
  文件顶层还有 `dismissed`、`lastSelectedAgents`——我们不解释、但必须原样保留。
- **项目级**清单是另一个格式：`<projectRoot>/skills-lock.json`，`version: 1`。条目用
  `computedHash`（不是 `skillFolderHash`），没有 `installedAt` / `updatedAt`；`sourceType: 'local'` 时
  `source` 是相对清单目录的路径（要 resolve 成绝对路径）。CLI 读全局清单时若 `version < 3` 直接当空清单——
  所以面板对不认识的版本要**明确报不支持**，不能瞎合并。
- **哈希是混合格式**：全局 27 条里 26 条是 40 位 git tree sha，`moss-mem` 是 64 位 sha256
  （`sourceType: git`）。CLI 的判断顺序是：`sourceType === 'github' && /^[0-9a-f]{40}$/i.test(hash)`
  → 比上游 git tree sha；否则 → 比「上游目录内容的 sha256」。**面板必须照这个分支走，且永远不回写另一种格式的哈希。**
- **根级技能**：`darwin-skill`、`huashu-nuwa` 的 `skillPath` 就是 `SKILL.md`，CLI 去掉文件名后
  folderPath 为空 → 用仓库根 tree 的 sha、安装的是整个仓库目录。`huashu-nuwa` 磁盘上 40.7 MiB，就是整仓。

### 本机数据

- 27 条清单：`obra/superpowers` 14、`anthropics/skills` 6、`mattpocock/skills` 3、
  `pbakaus/impeccable` 1、`alchaincyf/darwin-skill` 1、`alchaincyf/nuwa-skill` 1、
  `git@github.com:MT3166/morrow_skills.git` 1。
- 与磁盘不一致的两类，面板如实显示但不修补：
  - 已安装、不在清单：`hermes-desktop-plugins`、`kanban`、`reverse-engineer-anything`（本地技能）；
  - 在清单、本机没有：`docx`、`pdf`、`pptx`、`xlsx`、`frontend-design`、`doc-coauthoring`。
- `~/.dsh/skills/*` 是 20 个目录链接，指向 `~/.agents/skills/*` 的真实目录；因此同一个技能会同时出现在
  400 与 500 两层（400 因 rank 优先级胜出并“覆盖”500）。更新写的是**真实目录**，链接自然继续有效。
- 运行时生成物会造成“假漂移”：`moss-mem` 清单哈希正好等于它 6 个上游文件的 sha256，而本地目录多出了
  `scripts/__pycache__/memory_manager.cpython-312.pyc`。

### CLI 取上游的方式

GitHub REST：`GET /repos/{owner}/{repo}` 取默认分支（有 `ref` 时用 `ref`）→
`GET /git/trees/{branch}?recursive=1` 取 tree；文件可走 `raw.githubusercontent.com`；API 不可用时回退
`git clone`。`GITHUB_TOKEN` / `GH_TOKEN` 可提高限额。技能之间通过相对路径互相引用是**跨技能**的
（如 `../using-superpowers/references/…`），但那些被引用的技能本身也是独立安装的兄弟目录，所以
**只解出本技能目录是够的**；真正的包内引用（`../requesting-code-review/code-reviewer.md`）也都在本技能目录里。

## Goals

1. 每个技能（行、详情）标明来源：仓库、仓库内路径、安装时间、上次更新时间、上游哈希；本地技能明确标「本地」。
2. 筛选条按维度分行：**层级**（100/200/400/500）、**属性**（M 关闭 / U 关闭 / 被覆盖 / 链接安装）、**来源**（按仓库筛选，含「本地」）。
3. 「检查更新」：一次请求拿到已托管技能的上游状态（有更新 / 已最新 / 未知）。
4. 「更新」：单条与批量，把上游技能目录整体替换到本地，并同步清单 `skillFolderHash` / `updatedAt`，保留其余字段与哈希格式。
5. 更新前检测本地改动：与「上次同步快照」不一致时默认拒绝（`LOCAL_CHANGES`），显式 `force` 才覆盖，且留备份。
6. 清单里存在但本机缺失的技能，作为「仅在清单中」分组展示，可直接安装（走同一套更新流程）。

## Non-goals

- 不做技能市场浏览/搜索/安装新技能（那是 `skills add` 与 skillhub 的事）。
- 不管理其它 agent 的副本目录（`.claude/skills` 等），只按 `.agents/skills` 这一份真实目录。
- 不做版本固定、切分支、回滚到任意历史版本；只认已有的 `GITHUB_TOKEN`/`GH_TOKEN`，不做交互式登录。
- 不改 `dismissed` / `lastSelectedAgents`，不把插件变成第二个安装器。

## Anti-goals

- 更新把本地手工改动悄悄覆盖。
- 更新后清单与磁盘不一致（哈希格式被改写、时间戳/路径写错），让日后的 `skills update` 打架。
- 面板假报「已最新」：检查失败必须显示未知/错误。

## Constraints

- 宿主半边零依赖 ESM：`node:fs`、`node:path`、`node:os`、`node:crypto`、`node:child_process`、全局 `fetch`。
- 网络只走 https；github 源只允许 `github.com`；`git` 源只允许 `git@github.com:` 或 `https://github.com/`；
  其它一律 `UNSUPPORTED_SOURCE`。
- 解包/写入防目录穿越：tar 条目与目标路径 realpath 后必须落在临时目录 / 技能根内。
- 体积：**下载压缩包上限 64 MiB，解出内容上限按技能类型给**——普通技能 32 MiB，`skillPath === 'SKILL.md'`
  的根级技能 128 MiB（`huashu-nuwa` 实测 40.7 MiB）。超限报 `PACKAGE_TOO_LARGE`。
- 清单写入：先写 `<lock>.tmp` 再 rename；写前备份 `<lock>.bak`；解析失败或版本不认识 → 拒绝写入并报 `LOCK_INVALID` / `LOCK_VERSION_UNSUPPORTED`。
- 备份/暂存目录一律**点号开头并放在技能根内**（`.dsh-bak-<ts>`、`.dsh-stage-<ts>`）：`scanRoot` 只跳过点号开头的名字，
  放外面会变成幽灵技能行；放在同一磁盘也避免 `rename` 跨卷 `EXDEV`。
- 面板样式只用 `--dsw-alias-*` / `--dsh-font-*` token；中英 locale 键必须相等。

## Approaches

| | 做法 | 取舍 |
| --- | --- | --- |
| **A** | 面板调官方 `npx skills update -g <name>` 子进程 | 语义最权威，但依赖 npx 与网络、拿不到逐条进度、CLI 不在 PATH 时体验断裂 |
| **B（选定）** | 插件自己实现：GitHub API 查 tree / 算目录哈希 → 拉 tar.gz（或 `git clone`）→ 只解出该技能目录 → 原子替换 → 同步清单 | 面板内逐条结果、无外部依赖；代价是复刻哈希与清单语义，需要测试兜住 |
| C | 只展示来源 + 复制更新命令，手动执行 | 最小最安全，但用户明确要「支持更新」，不算完成 |

选 B。理由：用户要的是在面板里管理来源并更新；B 是唯一能给出逐条状态、又不要求机器上装好 CLI 的方案。

## 用户裁决（m02962）

| 问题 | 决定 |
| --- | --- |
| `~/.dsh/skills/X -> ~/.agents/skills/X` 造成同一技能在 400/500 两层各一行 | **合并成一行**：显示在 400（链接层）并带「链接」徽章；500 层里 realPath 相同的同名行隐藏。计数按可见行算。 |
| 本地生成物造成的假漂移 | **忽略生成物**：比较哈希时跳过 `__pycache__`、`*.pyc`、`.DS_Store`、`Thumbs.db`、`*.log`。 |
| 项目级 `skills-lock.json` 的更新 | **全局先行**：本期只对全局清单做检查/更新；项目清单只读展示来源，更新下期再做。 |

合并规则落点：`list` 在 `annotateLinks` 之后按 `realPath` 去重（同一真实目录只保留 rank 最小的一行，即链接行），
被隐藏的 500 行不进入 `tiers[].skills`，也不进 `counts`；`updateSkills` 仍按 realpath 去重，语义不变。

## Design

### Host（`index.js`）

新字段避开既有命名：`list` 里现有的 `source` 是「层级来源」（`project-dsh` 等），新数据一律叫 **`upstream`**。

- `readLocks(projectRoot)`：读全局（`XDG_STATE_HOME/skills/.skill-lock.json` 或 `~/.agents/.skill-lock.json`，
  要求 `version === 3`）与项目（`<projectRoot>/skills-lock.json`，`version === 1`）两份清单；
  返回 `{global: {path, entries}, project: {path, entries}, warnings[]}`。
  不认识的版本 → 该项为 `null` + warning，不参与合并。
  **项目清单本期只读**（只用来展示来源，不参与更新，也不写回）。
- `list` 每行新增：
  - `upstream: {repo, type, url, skillPath, installedAt, updatedAt, hash, ref?} | null`
  - `origin: 'managed' | 'local'`（更新能力只看全局清单；项目清单来的行标 `origin: 'managed'` 但 `updatable: false`）
  - 顶层新增 `missing: [{name, upstream}]`（清单有、磁盘没有的），`upstreams: [{repo, count}]`（给来源筛选）。
  项目清单条目优先于全局清单（按名字覆盖展示）。
  **镜像合并**：`annotateLinks` 之后按 `realPath` 去重，同一真实目录只保留 rank 最小的一行（即 400 链接行），
  被隐藏的 500 行不进入 `tiers[].skills` 与 `counts`。
- `checkUpdates` `{sessionId, names?}`：
  - 需要查的 = 选中名字的并集，缺省为所有 managed；
  - 按仓库聚合，每仓库 1 次 repos + 1 次 recursive tree（有 `ref` 用 `ref`）；
  - 每条判定：
    - `sourceType === 'github'` 且哈希是 40 位 hex → 比 tree 里技能目录的 sha（`skillPath` 去掉 `SKILL.md`
      尾段；剩余为空则用仓库根 tree 的 sha）；
    - 否则 → 下载该目录内容算 sha256（与 CLI 的 `computeSkillFolderHash` 同规则：`collectFiles` 跳过
      `.git`/`node_modules`，按 `localeCompare` 排序，逐个 update(relativePath)+update(content)）；
    - 相等 → `up-to-date`，不等 → `update-available`，取不到 → `unknown` + `error.code`；
  - 结果 `{checkedAt, results: [{name, status, upstreamHash, error?}], rateLimit?}`，进程内缓存 5 分钟；
  - token：`GITHUB_TOKEN` 或 `GH_TOKEN`。
- `updateSkills` `{sessionId, items: [{name, rootId}], force?}`（沿用 batch 的 items 形状，不用裸 names）：
  1. 解析条目 → 清单；无来源 → `NOT_MANAGED`；`missing` 条目没有本地目录，跳过快照校验直接安装；
  2. 本地快照校验：本地目录 sha256（同 CLI 规则 + 忽略集 `__pycache__`、`*.pyc`、`.DS_Store`、`Thumbs.db`、`*.log`）
     与插件状态文件 `~/.agents/.skill-update-state.json` 里的快照比较；不一致且 `force !== true` → `LOCAL_CHANGES`；
     无快照（首次）→ 以当前内容建立基线并视为“无改动”；
  3. 下载：github 走 `codeload.github.com/{owner}/{repo}/tar.gz/{ref|default}`，`git` 源走
     `git clone --depth 1 --branch <ref> <url>`（`execFile`，60 s 超时）；只解出 `skillPath` 目录；
  4. 校验 `SKILL.md` 存在、frontmatter 合法、条目路径在临时根内、体积上限；
  5. 替换：旧目录 `rename` 到 `<技能根>/.dsh-bak-<ts>`，新目录 `rename` 就位；失败回滚并清理 stage；
     每个技能只保留最近 2 个备份，更老的删掉；
  6. 写清单：只改该条目的 `skillFolderHash`（**保持原有长度/算法格式**：40 位仍写 tree sha，64 位仍写 sha256）
     与 `updatedAt`；写 `.bak` 后 tmp+rename；
  7. 更新插件状态文件里的快照（`{name: {localHash, syncedAt}}`）；
  8. 结果 `{name, rootId, ok, status: 'updated'|'installed'|'up-to-date'|'skipped', backupPath?, code?, message?}`。
- 并发：进程内 mutex，第二个请求 `BUSY`。
- 去重：批量里同一真实路径（400 链接行与 500 真实行）只处理一次，第二项返回 `{ok:true, status:'skipped', message:'already updated in this batch'}`。
- 安全：`name` 过 kebab 白名单；目标目录过 `resolveContained`；`sourceUrl` 白名单 host；tar 条目逐条校验；
  `skillPath` 里不允许 `..`。

### Client（`client.js`）

- **筛选条三行**：每行 `div.dps-filter-row` + 行首 `span.dps-filter-label`（层级 / 属性 / 来源）：
  - 层级行：四个 chip，文案带权重数字（`项目 · .dsh/skills 100`）；
  - 属性行：M 关闭 / U 关闭 / 被覆盖 / 链接安装；
  - 来源行：按 `upstreams` 生成 chip（`obra/superpowers` 等 + 「本地」），超过 4 个仓库时折进 `+N`；
  - 窄面板用容器查询（`.dps-root { container-type: inline-size }` + `@container (max-width: 340px)`）把标签换行到上方。
- **行**：名字后加来源徽章 `dps-badge dps-badge-source`（仓库短名或「本地」）；有更新时在 caret 之前加
  `dps-update-dot`（10px 圆点，`title` 写上游哈希）。
- **详情**：新增「来源」区块（复用现成的 `detail.source` locale 键）——仓库名、仓库内路径、安装/更新时间（本地化）、
  上游哈希短值；按钮「检查更新」「更新到此技能」；`LOCAL_CHANGES` 失败后就地展开「强制更新（保留 .bak）」二次确认；
  本地技能显示「本地技能，未由 skills CLI 安装」。
- **工具栏**：加「检查更新」按钮，结果 `N 个可更新` 徽标；检查中禁用；`unknown` 的原因放在结果条里可展开。
- **「仅在清单中」分组**：`list.missing` 非空时出现在最后一组，行灰显、只有「安装」动作（走 `updateSkills`）。
- **选择模式**：底部操作条加「更新」下拉（更新选中）；`BUSY` 时所有按钮禁用并显示忙碌说明。
- 文案全走 locale（zh/en 齐全）。

### 数据流

```
list ──► 两份 lock + 四根扫描 ──► 行带 upstream/origin + missing/upstreams
checkUpdates ──► 每仓库 2 次 GitHub API ──► 40 位比 tree sha，其余下载算 sha256 ──► 5 分钟缓存
updateSkills ──► codeload tar.gz / git clone ──► 临时目录 ──► 快照校验 ──► 原子替换 + 备份 ──► 写 lock 与状态
```

### 测试

- host（`test/host.test.mjs`，`createApi(ctx, deps)` 注入 `fetchImpl` / `gitImpl`）：
  - lock 解析：全局/项目两层、`computedHash` 字段、坏 JSON、版本不认识、未知字段原样保留；
  - `checkUpdates`：40 位命中/不命中、64 位走下载哈希、根级 `skillPath` 用根 tree、限流 403、非 github `unknown`；
  - `updateSkills`：tar 只解 skillPath、穿越条目被拒、`LOCAL_CHANGES` 默认拒绝、`force` 覆盖且留点号备份、
    `missing` 安装、清单哈希格式保持（40→40）、其它字段不变、`NOT_MANAGED`、超限、`BUSY`、批量按 realpath 去重；
  - tar 生成用 `node:zlib` + 手写 tar header，不引依赖。
- client：三行筛选、来源 chip、来源徽章、详情来源区块、检查更新结果条、批量更新请求体、`LOCAL_CHANGES` 强制路径、locale 键相等。
- `test/preview.mjs`：新增 `list-sources`、`detail-source`、`check-result`、`list-missing` 状态。

## Builder check 裁决（已并入上文）

必须修正的（已改文档）：混合哈希分支；项目清单 v1 是 `computedHash` 且要版本门；根级 `skillPath` 用根 tree；
32 MiB 上限卡死根级技能（改为下载 64 MiB / 解出按类型）；新字段改名 `upstream` 避免与层级 `source` 冲突；
备份与暂存用点号前缀（避免幽灵行与 `EXDEV`）；首次运行建立基线 + 生成物忽略集 + `localeCompare` 排序；
尊重可选 `ref`；`updateSkills` 用 `{name, rootId}` 并按 realpath 去重；`missing` 条目归组；`force` 要有 UI 入口；
窄面板用容器查询。

我的裁决（无需用户确认）：更新圆点在 caret 之前；复用 `detail.source` 键；每个技能保留最近 2 个备份；
`BUSY` 在客户端显示为禁用 + 一行忙碌说明；只解本技能目录是够的（跨技能引用由兄弟技能各自安装解析）。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 写坏 `.skill-lock.json` | `.bak` + tmp+rename；解析/版本失败不写 |
| 覆盖本地改动 | 快照比对默认拒绝，`force` 才覆盖且留备份 |
| 哈希格式被改写导致与 CLI 打架 | 按条目原有长度决定写回哪一种哈希 |
| GitHub 限流（无 token 60 次/小时） | 每仓库 2 请求 + 5 分钟缓存 + `RATE_LIMITED` 明确报错 |
| tar 穿越 / 超大 | 逐条目 realpath 校验 + 分级体积上限 |
| 私有仓库 / ssh 源 | 只支持已有凭据，逐条报错不影响其它条目 |

## Review Focus

1. 清单写入是否严格保留未知字段与哈希格式，是否原子、是否可能半写。
2. 替换是否「先备份再换、失败回滚」，备份名是否点号前缀且不产生幽灵行。
3. 网络与解包是否可能写到技能根之外（tar 条目、`skillPath`、符号链接）。
4. 哈希比较分支是否与 CLI 一致（40 位比 tree、其余比内容 sha256、根级用根 tree、排序规则）。
5. 检查更新是否可能把失败误报成「已最新」。
