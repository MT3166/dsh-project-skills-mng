# 批量管理与筛选 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在右栏面板加入模式化多选 + 批量操作（删除 / 调用开关 / 跨层移动 / 跨层复制）与四维筛选（关键字、层级、M/U 关闭、被覆盖/链接标记）。

**Architecture:** Host 侧新增一个 `batch` 聚合方法，一次 HTTP 请求内逐条复用现有单条 handler（`read`/`write`/`delete`/`toggle`），返回逐条 `ok/code` 结果，不做事务。Client 侧完全在已加载的 `list` 数据上做筛选与选择（不新增读取接口），批量时把选中项 `(rootId, name)` 一次性提交给 `batch`，用返回的逐条结果渲染结果条。

**Tech Stack:** Node ESM（host 半边，无依赖，`node:fs/promises` + 自写 frontmatter 读写）、浏览器 module-table 格式的 React 组件（client 半边，React 由宿主模块表提供）、`node:test` 两套测试、Edge headless 截图预览。

**Spec:** `docs/superpowers/specs/2026-11-04-batch-and-filter-design.md`

## Global Constraints

- 包名/路由/tab id 固定为 `dsh-project-skills-mng`，Host 路由 `POST /dsh-project-skills-mng/api/<method>`，响应一律 `{ ok: true, ...result }` 顶层展开；错误 `{ ok: false, error: { code, message } }`。
- 不引入任何运行时依赖；不自建图标字体；不替换 app root 或写 `document.body`。
- 样式只用 `--dsw-alias-*` / `--dsh-font-*` token，选择器限定在 `.dps-` 前缀内。
- 中英文 locale key 必须一一对应，`locale.zh` 与 `locale.en` 键集合相等。
- 所有文件操作必须经过现有 `resolveContained` / `assertContained` / `knownRootReals`；写入用临时文件 + `rename` 原子落盘。
- 名称必须通过 `validateSkillName`（kebab-case）；内容上限 256 KiB，批量条目上限 100。
- 单条失败不得中断整批；顶层 `ok: false` 只用于请求级错误。
- 测试命令：`node --test test/host.test.mjs`、`node --test test/client.smoke.mjs`；改客户端后另跑 `node --check client.js`。

## Review Focus

1. 批量部分失败时，用户能否一眼看出哪条失败、为什么失败（不得只显示「失败 1」）。
2. 目标层不存在 / 只读 / 与源同层时，移动与复制的行为是否可预期（不静默写入错误位置）。
3. 链接安装条目（`~/.dsh/skills/X -> ~/.agents/skills/X`）的移动语义：移入真实文件所在层只解除链接，移入其它层复制真实内容后解除链接，`.agents` 原件必须保留。
4. 筛选与选择的联动：筛选变化后被隐藏的行必须移出选中集合；全选只覆盖当前可见行。
5. 满额批量（100 条）与重复点击：请求进行中所有批量控件禁用，结果条只出现一次。

## File Structure

- `index.js`：Host 半边。新增 `batch` 方法（请求级校验 + 逐条派发），把 `createApi` 的返回改成先构造 `api` 对象再挂 `batch`（方法内需要引用兄弟方法）。新增 `transferSkill` 内部函数（读源 → 冲突判定 → 写目标 → 删源）。
- `client.js`：浏览器半边。在 `createApi` 增加 `batch` 客户端方法；新增 `FilterBar`、`SelectionBar`（操作条 + 确认 + 结果）组件；`ListView` 接收 `filters` / `selection` / `selecting` 等 props 并渲染 checkbox 与过滤后的行；`SkillsPanel` 持有 `filters` / `selection` / `selecting` / `batchState` 状态并负责提交。
- `test/host.test.mjs`：`batch` 的六组行为测试。
- `test/client.smoke.mjs`：筛选、选择、批量请求体、结果条渲染测试。
- `test/preview.mjs`：新增 `list-filtered`、`list-selecting`、`batch-result` 三个预览态。
- `README.md`、`docs/superpowers/specs/2026-11-04-batch-and-filter-design.md`：用法与状态说明。

---

### Task 1: Host `batch` — 删除与调用开关

**Files:**
- Modify: `index.js:529-721`（`createApi`）
- Test: `test/host.test.mjs`

**Interfaces:**
- Consumes: 现有 `api.delete({ sessionId, rootId, name })`、`api.toggle({ sessionId, rootId, name, field, value })`、`ApiError`、`findRoot`、`describeRoots`、`resolveSession`。
- Produces: `api.batch(payload): Promise<{ summary: { total, succeeded, failed }, results: BatchResult[] }>`，其中 `BatchResult = { name: string, rootId: string, ok: boolean, code?: string, message?: string, targetPath?: string, unlinked?: boolean }`；`payload = { sessionId, action: 'delete'|'invocation'|'transfer', items: { name, rootId }[], invocation?: { field: 'model'|'user', value: boolean }, target?: { rootId }, transferMode?: 'move'|'copy', conflict?: 'skip'|'overwrite' }`。

- [ ] **Step 1: 写失败的测试**（追加到 `test/host.test.mjs`）

```js
test('batch delete reports per-item success and failure', async (t) => {
  await withSandbox(t, async ({ host, projectRoot }) => {
    await host.api.write({ sessionId: 'session-1', rootId: 'project-dsh', name: 'one-skill', content: skillDoc('one-skill') })
    await host.api.write({ sessionId: 'session-1', rootId: 'project-dsh', name: 'two-skill', content: skillDoc('two-skill') })
    const out = await host.api.batch({
      sessionId: 'session-1',
      action: 'delete',
      items: [
        { name: 'one-skill', rootId: 'project-dsh' },
        { name: 'two-skill', rootId: 'project-dsh' },
        { name: 'missing-skill', rootId: 'project-dsh' },
      ],
    })
    assert.deepEqual(out.summary, { total: 3, succeeded: 2, failed: 1 })
    assert.equal(out.results[0].ok, true)
    assert.equal(out.results[2].ok, false)
    assert.equal(out.results[2].code, 'SKILL_NOT_FOUND')
    assert.equal(await exists(join(projectRoot, '.dsh/skills/one-skill')), false)
  })
})

test('batch invocation flips the model and user flags', async (t) => {
  await withSandbox(t, async ({ host, projectRoot }) => {
    await host.api.write({ sessionId: 'session-1', rootId: 'project-dsh', name: 'a-skill', content: skillDoc('a-skill') })
    const out = await host.api.batch({
      sessionId: 'session-1',
      action: 'invocation',
      invocation: { field: 'model', value: false },
      items: [{ name: 'a-skill', rootId: 'project-dsh' }],
    })
    assert.deepEqual(out.summary, { total: 1, succeeded: 1, failed: 0 })
    const text = await readFile(join(projectRoot, '.dsh/skills/a-skill/SKILL.md'), 'utf8')
    assert.match(text, /disable-model-invocation: true/)
  })
})
```

再加一条请求级上限测试：

```js
test('batch rejects more than one hundred items', async (t) => {
  await withSandbox(t, async ({ host }) => {
    await assert.rejects(
      host.api.batch({ sessionId: 'session-1', action: 'delete', items: Array.from({ length: 101 }, (_, index) => ({ name: `skill-${index}`, rootId: 'project-dsh' })) }),
      (error) => error.code === 'TOO_MANY_ITEMS',
    )
  })
})
```

（`skillDoc(name)` 与 `exists(path)` 若测试文件里没有，按现有测试风格补两个小 helper：前者返回带 `name`/`description` frontmatter 的字符串，后者用 `fs.stat` 判存在。）

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/host.test.mjs`
Expected: FAIL — `host.api.batch is not a function`

- [ ] **Step 3: 实现请求级校验与派发**

把 `createApi` 改成 `const api = { ...原对象字面量... }`，末尾追加：

```js
const MAX_BATCH_ITEMS = 100

async function runItem(item, run) {
  try {
    const value = await run()
    return { name: item.name, rootId: item.rootId, ok: true, ...(value ?? {}) }
  } catch (error) {
    return {
      name: item.name,
      rootId: item.rootId,
      ok: false,
      code: error instanceof ApiError ? error.code : 'INTERNAL_ERROR',
      message: errorMessage(error),
    }
  }
}

api.batch = async (payload) => {
  const items = payload?.items
  if (!Array.isArray(items) || items.length === 0) throw new ApiError('INVALID_REQUEST', 'items must be a non-empty array')
  if (items.length > MAX_BATCH_ITEMS) throw new ApiError('TOO_MANY_ITEMS', `at most ${MAX_BATCH_ITEMS} items per batch`)
  for (const item of items) {
    if (item === null || typeof item !== 'object') throw new ApiError('INVALID_REQUEST', 'each item needs name and rootId')
    validateSkillName(item.name)
    if (typeof item.rootId !== 'string' || item.rootId === '') throw new ApiError('INVALID_REQUEST', 'each item needs a rootId')
  }
  const action = payload?.action
  if (action !== 'delete' && action !== 'invocation' && action !== 'transfer') {
    throw new ApiError('INVALID_ACTION', 'action must be "delete", "invocation" or "transfer"')
  }
  let run
  if (action === 'delete') {
    run = (item) => api.delete({ sessionId: payload.sessionId, rootId: item.rootId, name: item.name })
  } else if (action === 'invocation') {
    const invocation = payload?.invocation
    if (invocation?.field !== 'model' && invocation?.field !== 'user') throw new ApiError('INVALID_FIELD', 'field must be "model" or "user"')
    if (typeof invocation?.value !== 'boolean') throw new ApiError('INVALID_FIELD', 'value must be a boolean')
    run = (item) =>
      api.toggle({ sessionId: payload.sessionId, rootId: item.rootId, name: item.name, field: invocation.field, value: invocation.value })
  } else {
    run = (item) => transferSkill(item, payload)
  }
  const results = []
  for (const item of items) results.push(await runItem(item, () => run(item)))
  const succeeded = results.filter((result) => result.ok).length
  return { summary: { total: results.length, succeeded, failed: results.length - succeeded }, results }
}

return api
```

`transferSkill` 在本任务里先只抛 `INVALID_ACTION`（Task 2 实现），保证本任务测试通过。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/host.test.mjs`
Expected: 新增两条 PASS，原有 12 条仍 PASS

- [ ] **Step 5: 提交**

```bash
git add index.js test/host.test.mjs
git commit -m "feat(host): add batch delete and invocation operations"
```

---

### Task 2: Host `batch` — 跨层移动 / 复制与链接语义

**Files:**
- Modify: `index.js`（`createApi` 之后新增 `transferSkill`，并补 `MAX_BATCH_ITEMS` 之外的常量）
- Test: `test/host.test.mjs`

**Interfaces:**
- Consumes: `api.read`、`api.write`、`api.delete`、`ensureRootDirectory`、`locateSkillFile`、`isInside`、`realpath`、`describeRoots`、`findRoot`。
- Produces: `async function transferSkill(item, payload)`，抛 `ApiError`，成功时返回 `{ targetPath, unlinked?: true, moved?: true }`。

- [ ] **Step 1: 写失败的测试**

```js
test('batch transfer moves a skill into another tier', async (t) => {
  await withSandbox(t, async ({ host }) => {
    await host.api.write({ sessionId: 'session-1', rootId: 'project-dsh', name: 'move-me', content: skillDoc('move-me') })
    const out = await host.api.batch({
      sessionId: 'session-1',
      action: 'transfer',
      transferMode: 'move',
      target: { rootId: 'global-dsh' },
      items: [{ name: 'move-me', rootId: 'project-dsh' }],
    })
    assert.deepEqual(out.summary, { total: 1, succeeded: 1, failed: 0 })
    assert.equal(out.results[0].ok, true)
    assert.ok(out.results[0].targetPath.includes('.dsh'))
    const list = await host.api.list({ sessionId: 'session-1' })
    const projectTier = list.tiers.find((tier) => tier.rootId === 'project-dsh')
    const globalTier = list.tiers.find((tier) => tier.rootId === 'global-dsh')
    assert.deepEqual(projectTier.skills.map((s) => s.name), [])
    assert.deepEqual(globalTier.skills.map((s) => s.name), ['move-me'])
  })
})

test('batch transfer copies without removing the source', async (t) => { /* copy 后两侧都有 move-me */ })
test('batch transfer skips an existing target unless overwrite is set', async (t) => {
  // 目标层同名存在 → code TARGET_EXISTS；conflict: 'overwrite' → ok
})
test('batch transfer of a linked skill into its real root only unlinks it', async (t) => {
  // makeDirLink 造 global-dsh/X -> global-agents/X，transfer move target global-agents → unlinked:true，真实包仍在
})
test('batch rejects an invalid transfer target', async (t) => {
  // target 缺失 → INVALID_TARGET；target.rootId 不存在 → INVALID_TARGET；
  // target 与源同层 → INVALID_TARGET；目标层只读（把该层目录改成只读或 stub describeRoots 返回 writable:false）→ INVALID_TARGET
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/host.test.mjs`
Expected: FAIL — 现有 `transferSkill` 抛 `INVALID_ACTION` 或函数未定义

- [ ] **Step 3: 实现 `transferSkill`**

```js
async function transferSkill(item, payload) {
  const resolved = await resolveSession(ctx, payload.sessionId)
  const roots = await describeRoots(resolved.projectRoot)
  const allowed = await knownRootReals(roots)
  const source = findRoot(roots, item.rootId)
  const targetId = payload?.target?.rootId
  if (typeof targetId !== 'string' || targetId === '') throw new ApiError('INVALID_TARGET', 'target.rootId is required')
  if (targetId === item.rootId) throw new ApiError('INVALID_TARGET', 'target tier must differ from the source tier')
  const target = findRoot(roots, targetId)
  if (!target.writable) throw new ApiError('INVALID_TARGET', `skill root ${target.path} is not writable`)
  const mode = payload?.transferMode === 'copy' ? 'copy' : 'move'
  const conflict = payload?.conflict === 'overwrite' ? 'overwrite' : 'skip'

  const detail = await api.read({ sessionId: payload.sessionId, rootId: item.rootId, name: item.name })
  // NOTE: read is defined on `api`; transferSkill lives in the same factory scope.
  const targetReal = await ensureRootDirectory(target, allowed)
  const alreadyThere = await locateSkillFile(targetReal, item.name)
  if (alreadyThere !== undefined && conflict === 'skip') {
    throw new ApiError('TARGET_EXISTS', `target root already has a skill named "${item.name}"`)
  }

  // A linked package moved into the root that physically holds its files needs
  // no copy: removing the link is the move.
  let targetPath
  let unlinked = false
  const realRoot = detail.linked === true && typeof detail.realPath === 'string'
    ? await realpath(detail.realPath).catch(() => undefined)
    : undefined
  const samePhysical = realRoot !== undefined && isInside(targetReal, realRoot)
  if (!samePhysical) {
    const written = await api.write({ sessionId: payload.sessionId, rootId: target.id, name: item.name, content: detail.content })
    targetPath = written.path
  }
  if (mode === 'move') {
    const removed = await api.delete({ sessionId: payload.sessionId, rootId: item.rootId, name: item.name })
    unlinked = removed.unlinked === true
    if (samePhysical && targetPath === undefined) targetPath = detail.path
  }
  return { targetPath: targetPath ?? (mode === 'copy' ? detail.path : detail.path), ...(unlinked ? { unlinked: true } : {}), ...(mode === 'move' ? { moved: true } : {}) }
}
```

注意：`transferSkill` 必须定义在 `createApi` 内部（能引用 `api`）；若放在模块级，把 `api` 作为第一个参数传入。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/host.test.mjs`
Expected: 全部 PASS（12 原有 + 2 Task 1 + 5 Task 2）

- [ ] **Step 5: 提交**

```bash
git add index.js test/host.test.mjs
git commit -m "feat(host): batch move and copy across discovery tiers"
```

---

### Task 3: Client — 筛选条

**Files:**
- Modify: `client.js`（`createApi`、`ListView`、`SkillsPanel`、CSS 段、locale 表）
- Test: `test/client.smoke.mjs`

**Interfaces:**
- Consumes: `data.tiers[].{ rootId, label, skills[] }`、`skill.{ name, description, modelInvocable, userInvocable, shadowed, linked }`、`tf(t, key, params)`、`rootLabel(t, { id })`。
- Produces: `ListView` 新增 props `filters: { query: string, tiers: { [rootId]: boolean }, modelOff: boolean, userOff: boolean, shadowed: boolean, linked: boolean }`、`onFiltersChange(next)`；`SkillsPanel` 持有并持久化该状态；`client api.batch(payload)` 方法（Task 4 使用）；CSS class `.dps-filterbar`、`.dps-chip[data-on]`、`.dps-search`。

- [ ] **Step 1: 写失败的测试**（`test/client.smoke.mjs`）

```js
test('filters narrow the visible rows by query and tier', () => {
  const view = mountList({ filters: { query: 'demo', tiers: {}, modelOff: false, userOff: false, shadowed: false, linked: false } })
  const names = view.findAll('.dps-name').map((node) => node.text)
  assert.deepEqual(names, ['demo-skill'])
})
test('turning a tier chip off hides that tier and its count', () => { /* tiers: { 'global-dsh': false } */ })
test('the filter bar shows a clear button only when a filter is active', () => {})
```

（`mountList` 用现有 stub + 迷你 React 挂载方式；若现有测试已有类似 helper，复用它。）

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/client.smoke.mjs`
Expected: FAIL — 过滤未实现，返回全部行

- [ ] **Step 3: 实现筛选**

- `SkillsPanel` 增加 `const [filters, setFilters] = React.useState(defaultFilters())`，`defaultFilters()` 返回 `{ query: '', tiers: {}, modelOff: false, userOff: false, shadowed: false, linked: false }`，在 `refresh` 前后保持不变。
- `ListView` 渲染 `<div className="dps-filterbar">`：`<input className="dps-search" value={filters.query} placeholder={t('filter.search')} onChange={...}/>`；每个 tier 一个 `<button className="dps-chip" data-on={String(filters.tiers[rootId] !== false)}>` 显示 `rootLabel(t, { id: rootId })`；四个标记 chip（`filter.modelOff`/`filter.userOff`/`filter.shadowed`/`filter.linked`）；有任一筛选生效时显示 `<button className="dps-btn dps-btn-quiet">{t('filter.clear')}</button>`。
- 过滤函数：`matchesFilter(skill, tier, filters)` —— query 对 `name` 与 `description` 做大小写不敏感子串匹配；`filters.tiers[rootId] === false` 整层隐藏；`modelOff` 要求 `modelInvocable !== true`；`userOff` 要求 `userInvocable !== true`；`shadowed` 要求 `shadowed === true`；`linked` 要求 `linked === true`。
- 过滤后 `total === 0` 且原来有数据时渲染 `filter.empty` 空态 + 清除按钮，而不是「还没有技能」空态。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/client.smoke.mjs`（以及 `node --check client.js`）
Expected: 新增 3 条 PASS，原 12 条 PASS

- [ ] **Step 5: 提交**

```bash
git add client.js test/client.smoke.mjs
git commit -m "feat(panel): filter skills by query, tier and invocation flags"
```

---

### Task 4: Client — 选择模式与批量操作

**Files:**
- Modify: `client.js`（`ListView` 行渲染改为 `div.dps-row` + checkbox、新增 `SelectionBar`、`SkillsPanel` 状态与提交、locale、CSS）
- Test: `test/client.smoke.mjs`

**Interfaces:**
- Consumes: Task 3 的 `filters`；`props.api.batch(payload)`；`formatError`/`errorText` 现有错误文案映射。
- Produces: `SkillsPanel` 新状态 `selecting: boolean`、`selection: { [key: string]: true }`（key = `` `${rootId}::${name}` ``）、`batchState: null | { running: boolean, summary?: { total, succeeded, failed }, results?: BatchResult[], error?: ApiError }`；组件 `SelectionBar({ t, count, tiers, targets, busy, batch, onToggle, onMove, onCopy, onDelete, onResultToggle })`。

- [ ] **Step 1: 写失败的测试**

```js
test('selection mode adds a checkbox and an action bar', () => {})
test('hidden rows leave the selection when a filter changes', () => {
  // 选中 global 两行 → 关闭 global-dsh 层 chip → 选择计数变 0
})
test('deleting the selection posts one batch request with every selected item', async () => {
  // fetch stub 断言 body = { sessionId, action:'delete', items:[{name,rootId},...] }
})
test('a partial failure is reported in the result bar', () => {
  // batch 返回 { summary:{total:2,succeeded:1,failed:1}, results:[...] → 结果条显示 失败 1 且可展开
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/client.smoke.mjs`
Expected: FAIL — 没有 checkbox / 没有 `batch` 请求

- [ ] **Step 3: 实现**

- 工具栏在「新建技能」左侧加 `[选择]` / `[退出选择]`（`t('list.select')` / `t('list.selectExit')`）。
- 行容器由 `button.dps-row` 改为 `div.dps-row`（`role="button"`、`tabIndex="0"`、`onClick` 打开详情、`onKeyDown` Enter/Space）；进入选择模式时行首插入 `<input type="checkbox" className="dps-check" checked onChange={toggle}/>`，行点击改为切换选中（避免误开详情），仍可双击打开详情。
- 组头在选择模式下显示「本层全选」按钮（`t('selection.allInTier')`），只对当前可见（过滤后）行生效；`Esc` 键退出选择并清空（`onKeyDown` 挂在 `.dps-list` 上）。
- 底部 `.dps-actionbar`：`已选 N 项`（`tf(t,'selection.count',{count})`）+ `<select className="dps-select dps-action">` 三组：调用开关（4 个 option：modelOn/modelOff/userOn/userOff）、移到层（写目标 tier 列表）、复制到层；以及 `删除` 危险按钮、`取消`。选择变化时，若筛选隐藏了某些已选行，从 `selection` 中删除它们（在 `useEffect` 里按可见 key 集合求交）。
- 确认：操作后在 actionbar 位置显示内联确认块（复用 `.dps-confirm` 样式），文案按 spec 的 `batch.confirmDelete` / `confirmDeleteLinked` / `confirmMove` / `confirmCopy`，`确认` 触发提交。
- 提交：`api.batch({ sessionId, action, items, invocation?, target?, transferMode? })`，`running` 时所有控件 `disabled`；成功后 `batchState = { summary, results }`，并调用 `props.onRefresh()` 刷新列表；`Esc` 或「取消」退出选择模式。
- 结果条：`成功 {succeeded} · 失败 {failed}` + `查看` 切换失败列表（`name` + `code`/`message`）；失败列表用 `.dps-failures` 列表项。
- 错误码文案：在现有错误映射里补 `TARGET_EXISTS`、`INVALID_TARGET`、`TOO_MANY_ITEMS`、`DELETE_FAILED` 的 zh/en 文案。
- CSS：`.dps-check`（`accent-color: var(--dsw-alias-brand-primary)`）、`.dps-actionbar`（sticky bottom、`background: var(--dsw-alias-bg-layer-1)`、`border-top: 1px solid var(--dsw-alias-border-l2)`、`padding: 8px 12px`）、`.dps-failures`。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --check client.js` 然后 `node --test test/client.smoke.mjs`
Expected: 全部 PASS（16 条）

- [ ] **Step 5: 提交**

```bash
git add client.js test/client.smoke.mjs
git commit -m "feat(panel): select skills and run batch actions from the panel"
```

---

### Task 5: 预览态、文档与截图复核

**Files:**
- Modify: `test/preview.mjs`、`README.md`、`docs/superpowers/specs/2026-11-04-batch-and-filter-design.md`
- Test: `test/preview.mjs`（渲染能力自检）

**Interfaces:**
- Consumes: Task 3/4 的 props 与 class 名。
- Produces: 预览态 `list-filtered`（搜索 "demo" + 关闭 global-dsh）、`list-selecting`（选中两项 + 底部操作条）、`batch-result`（成功 2 失败 1 展开失败列表）。

- [ ] **Step 1: 加三个预览态**：在 `STATES` 里追加，`capture()` 里对每种状态点按钮/输入框模拟操作后 `settle()`。
- [ ] **Step 2: 生成并截图**

Run: `node test/preview.mjs list-filtered list-selecting batch-result dark`
然后 Edge headless 截图（每个状态独立 `--user-data-dir`）。

Expected: `test/preview-out/list-filtered-light.png` 等文件生成，肉眼确认：筛选条不抢视，chip 有选中态，操作条不遮挡最后一行，失败列表可读。

- [ ] **Step 3: 更新文档**：README 增加「批量与筛选」用法段；设计文档顶部状态改「已实现」并记录与设计的偏差（如有）。
- [ ] **Step 4: 跑全量检查**

Run: `node --test test/host.test.mjs test/client.smoke.mjs` 与 `impeccable.cmd detect --json client.js`
Expected: 全部 PASS，detect 输出 `[]`

- [ ] **Step 5: 提交**

```bash
git add test/preview.mjs README.md docs/superpowers/specs/2026-11-04-batch-and-filter-design.md
git commit -m "docs: preview states and usage notes for batch and filters"
```

---

### Task 6: 安装与真实 GUI 验证

**Files:** 无源码改动（只验证）

- [ ] **Step 1: 重装 bundle**

Run: `plugin_manager action=install_bundle target=D:\XMT\99_Codebase\github\dsh-project-skills-mng`
Expected: `application: "applied"`, `warnings: []`；Host 侧改动需重启 DSH 生效，客户端改动刷新页面生效。

- [ ] **Step 2: 用真实 host 服务验证批量**

用插件的 `skills_manage` 工具建两个临时技能 → 面板批量删除 → `skills_manage list` 确认消失。
Expected: 结果与面板显示一致，`~/.dsh/skills` 的链接条目删除只解除链接。

- [ ] **Step 3: 用户在 GUI 复验**：多选删除、批量关 M、跨层移动一条试验技能、筛选组合；确认后收尾。

## Status (2026-11-04 16:00) — 批量与筛选

- Task 1 host batch（delete/invocation）完成：`68dd7f3`。
- Task 2 host transfer（copy/move、整包复制、链接语义）完成：`fafdd56`、`229fab8`，裁决记录 `95a7e83`。
- Task 3/4 client 筛选 + 多选批量完成：client-dev 交付，lead 复核 `node --check`、两套测试（host 24、client 23）、18 个预览状态；补三处视觉修正（tier chip 不再删除线、退出选择去掉主按钮样式、选择模式底部留白）。
- 仍待：Task 5 文档与截图入库、Task 6 安装重启后的真机验证、整支 fresh review。
