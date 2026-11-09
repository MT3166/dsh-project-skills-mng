/**
 * dsh-project-skills-mng — client half.
 *
 * A single-file "module table consumer" for the DSH Web shell (no build step,
 * no npm dependencies). It contributes:
 *   - one right-sidebar tab type (id `dsh-project-skills-mng/skills`) with a guide
 *     entry, so the panel is only reachable from the sidebar guide page and
 *     never pops open by itself;
 *   - the `sidebar.right.pane.tab` body (the Skills manager panel itself);
 *   - the zh/en locale dictionaries used by the tab title, guide and panel.
 *
 * The panel talks to the host half over the fenced HTTP prefix route
 * `/dsh-project-skills-mng/api/<method>`. That route must be resolved against the
 * *page* base URL (Electron shell pages live on `dsh-app://app/`), never as an
 * absolute URL, otherwise reverse-proxy prefixes produce a 404.
 */

window.__ModuleLoader__.load({
  id: 'dsh-project-skills-mng',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const Fragment = React.Fragment

    const NS = 'dsh-project-skills-mng'
    const TAB_ID = 'dsh-project-skills-mng/skills'
    const TAB_KIND = 'dsh-project-skills-mng/skills'
    const GUIDE_ENTRY_ID = 'dsh-project-skills-mng/skills.guide'
    const PANE_SLOT = 'sidebar.right.pane.tab'
    const API_PATH = 'dsh-project-skills-mng/api/'
    const STYLE_ATTRIBUTE = 'data-dsh-project-skills-mng'
    const STYLE_SELECTOR = 'style[' + STYLE_ATTRIBUTE + ']'
    const STYLE_PLUGIN_NAME = 'dsh-project-skills-mng'
    const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    const TEMPLATE_BODY_HINT = '<describe what this skill does and when to use it>'

    const MONO_FONT =
      'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, "Liberation Mono", monospace'

    /* ------------------------------------------------------------------ *
     * Locale dictionaries                                                 *
     * ------------------------------------------------------------------ */

    // Placeholders use the `{name}` form and are interpolated client-side by
    // `tf()` so a locale may reorder them freely.
    const zh = {
      'tab.title': '技能',
      'guide.title': '项目管理技能',
      'guide.description': '查看、编辑并新建项目与全局目录下的 SKILL.md。',

      'list.title': '技能',
      'list.refresh': '刷新',
      'list.new': '新建技能',

      'tier.priority': 'DSH 发现顺序中的优先级：数字越小越优先，同名技能由此逐级覆盖。',
      'group.empty': '这个目录下还没有技能。',

      'roots.label': '位置',
      'root.exists': '目录存在',
      'root.missing': '目录不存在',
      'root.writable': '可写',
      'root.readonly': '只读',
      'root.project-dsh': '项目 · .dsh/skills',
      'root.project-agents': '项目 · .agents/skills',
      'root.global-dsh': '全局 · .dsh/skills',
      'root.global-agents': '全局 · .agents/skills',

      'shadowed.by': '被「{path}」覆盖',
      'flag.modelOn': '模型可调用',
      'flag.modelOff': '模型不可调用',
      'flag.userOn': '用户可调用',
      'flag.userOff': '用户不可调用',

      'warning.parse': '{count} 个技能文件解析失败',
      'warning.expand': '展开',
      'warning.collapse': '收起',

      'empty.title': '还没有任何技能',
      'empty.hint': '新建一个技能，或把 SKILL.md 放进项目的 .dsh/skills 目录。',
      'empty.cta': '新建第一个技能',

      'detail.back': '返回',
      'detail.edit': '编辑',
      'detail.delete': '删除',
      'detail.content': '内容',
      'detail.path': '路径',
      'detail.source': '来源',
      'detail.modelInvocable': '模型可调用',
      'detail.userInvocable': '用户可调用',
      'detail.linked': '经由链接：{path}',
      'badge.linked': '链接',
      'detail.mismatch':
        '同名技能存在于多个目录，当前正文来自 {path}；为避免写错文件，已禁用编辑。',

      'confirm.delete': '确认删除技能“{name}”？该操作会删除真实的 SKILL.md 文件，且无法撤销。',
      'confirm.deleteLinked': '确认移除这个链接？{path} 里的技能文件会保留。',
      'confirm.unlinkYes': '确认移除',
      'confirm.deleteYes': '确认删除',
      'confirm.cancel': '取消',

      'edit.title': '编辑 {name}',
      'edit.save': '保存',
      'edit.saving': '保存中…',
      'edit.cancel': '取消',
      'edit.hint': '整份 SKILL.md 文本。保存后立即写回磁盘。',
      'edit.content': 'SKILL.md 内容',

      'create.title': '新建技能',
      'create.root': '写入目录',
      'create.name': '名称',
      'create.namePlaceholder': 'my-skill',
      'create.nameInvalid': '名称必须是小写 kebab-case，例如 my-skill',
      'create.description': '描述',
      'create.descriptionPlaceholder': '一句话说明这个技能做什么',
      'create.submit': '创建',
      'create.creating': '创建中…',
      'create.cancel': '取消',
      'create.noRoots': '没有可写的技能目录。',

      'status.loading': '加载中…',
      'error.title': '出错了',
      'error.code': '错误码',
      'error.retry': '重试',
      'error.dismiss': '关闭',
      'session.required': '请在会话中打开这个面板。',

      'list.select': '选择',
      'list.selectExit': '退出选择',
      'list.join': '、',

      'filter.search': '搜索名称或描述',
      'filter.clear': '清除筛选',
      'filter.show': '筛选',
      'filter.hide': '收起筛选',
      'filter.tier': '层级筛选',
      'filter.modelOff': 'M 关闭',
      'filter.userOff': 'U 关闭',
      'filter.shadowed': '被覆盖',
      'filter.linked': '链接安装',
      'filter.empty': '没有技能符合当前筛选',
      'filter.emptyHint': '换个关键字，或清除筛选后再试。',

      'selection.count': '已选 {count} 项',
      'selection.allInTier': '本层全选',
      'selection.noneInTier': '取消本层',
      'selection.cancel': '取消',

      'batch.invocation': '调用开关',
      'batch.modelOn': '允许模型调用',
      'batch.modelOff': '禁止模型调用',
      'batch.userOn': '允许用户调用',
      'batch.userOff': '禁止用户调用',
      'batch.move': '移到',
      'batch.copy': '复制到',
      'batch.delete': '删除',
      'batch.running': '处理中…',
      'batch.confirmDelete': '删除 {count} 个技能？',
      'batch.confirmDeleteLinked':
        '删除 {count} 个技能？其中 {linked} 个是链接安装，只会解除该层链接，真实文件保留。',
      'batch.confirmMove': '把选中的 {count} 项移到「{to}」？移动会改变它们对模型的可见范围。',
      'batch.confirmCopy': '复制选中的 {count} 项到「{to}」？同名条目将跳过。',
      'batch.confirm': '确认',
      'batch.cancel': '取消',
      'batch.result': '成功 {succeeded} · 失败 {failed}',
      'batch.view': '查看',
      'batch.hide': '收起',
      'batch.failure': '{name}：{reason}',
      'batch.noTarget': '没有其它可写的目标层。',

      'code.TARGET_EXISTS': '目标层已存在同名技能',
      'code.INVALID_TARGET': '目标层不可用',
      'code.TOO_MANY_ITEMS': '一次最多处理 100 个技能',
      'code.DELETE_FAILED': '删除失败',
      'code.LOCAL_CHANGES': '本地文件有改动',
      'code.NOT_MANAGED': '该技能没有上游来源',
      'code.BUSY': '另一个更新正在进行，请稍后再试',
      'code.RATE_LIMITED': '上游请求被限流',
      'code.UNSUPPORTED_SOURCE': '不支持该上游来源',
      'code.LOCK_INVALID': '上游清单文件无法解析',
      'code.LOCK_VERSION_UNSUPPORTED': '上游清单版本不受支持',
      'code.PACKAGE_TOO_LARGE': '上游包超过大小限制',
      'error.sourceRemoveFailed':
        '副本已写入目标层，但源条目删除失败，请手动删除源条目。',

      'filter.group.tier': '层级',
      'filter.group.attr': '属性',
      'filter.group.source': '来源',
      'filter.source.local': '本地',
      'filter.source.more': '+{count}',
      'badge.local': '本地',
      'badge.update': '有更新',
      'badge.updateWithHash': '可更新 · {hash}',

      'check.button': '检查更新',
      'check.running': '检查中…',
      'check.available': '{count} 个可更新',
      'check.uptodate': '全部是最新版本',
      'check.unknown': '{count} 个无法确认',
      'check.reasonUnknown': '无法确认原因',
      'check.expand': '查看原因',
      'check.collapse': '收起',
      'check.reason': '{name}：{reason}',
      'check.updateAll': '全部更新',
      'check.updating': '正在更新 {done}/{total}…',
      'bulk.dismiss': '关闭',

      'detail.checkUpdate': '检查更新',
      'detail.update': '更新到此技能',
      'detail.checking': '检查中…',
      'detail.updating': '更新中…',
      'detail.checkAvailable': '有新版本可更新',
      'detail.checkUptodate': '已是最新版本',
      'detail.checkUnknown': '无法确认：{reason}',
      'detail.updateDone': '已更新',
      'detail.installDone': '已安装',
      'detail.sourceRepo': '仓库',
      'detail.sourcePath': '仓库内路径',
      'detail.sourceInstalled': '安装时间',
      'detail.sourceUpdated': '更新时间',
      'detail.sourceHash': '上游哈希',
      'detail.sourceLocal': '本地技能，未由 skills CLI 安装。',
      'detail.forceConfirm':
        '本地文件有改动，更新会覆盖它们（旧目录会保留 .bak 备份）。强制更新？',
      'detail.forceYes': '强制更新',
      'detail.forceCancel': '取消',

      'missing.title': '仅在清单中',
      'missing.note': '清单里有这个技能，但本机还没有安装。',
      'missing.install': '安装',
      'missing.installing': '安装中…',

      'batch.update': '更新选中',
      'batch.updating': '更新中…',

      'detail.updateFailed': '更新失败',
      'missing.installFailed': '安装失败',
    }

    const en = {
      'tab.title': 'Skills',
      'guide.title': 'Project skills',
      'guide.description': 'Browse, edit and create SKILL.md files in project and global roots.',

      'list.title': 'Skills',
      'list.refresh': 'Refresh',
      'list.new': 'New skill',

      'tier.priority':
        'Discovery priority in DSH: lower wins, and a name is shadowed tier by tier.',
      'group.empty': 'No skills in this root yet.',

      'roots.label': 'Location',
      'root.exists': 'present',
      'root.missing': 'missing',
      'root.writable': 'writable',
      'root.readonly': 'read-only',
      'root.project-dsh': 'Project · .dsh/skills',
      'root.project-agents': 'Project · .agents/skills',
      'root.global-dsh': 'Global · .dsh/skills',
      'root.global-agents': 'Global · .agents/skills',

      'shadowed.by': 'Shadowed by {path}',
      'flag.modelOn': 'Model invocable',
      'flag.modelOff': 'Model not invocable',
      'flag.userOn': 'User invocable',
      'flag.userOff': 'User not invocable',

      'warning.parse': '{count} skill file(s) failed to parse',
      'warning.expand': 'Show',
      'warning.collapse': 'Hide',

      'empty.title': 'No skills yet',
      'empty.hint': 'Create a skill, or drop a SKILL.md into the project .dsh/skills root.',
      'empty.cta': 'Create your first skill',

      'detail.back': 'Back',
      'detail.edit': 'Edit',
      'detail.delete': 'Delete',
      'detail.content': 'Content',
      'detail.path': 'Path',
      'detail.source': 'Source',
      'detail.modelInvocable': 'Model invocable',
      'detail.userInvocable': 'User invocable',
      'detail.linked': 'Via link: {path}',
      'badge.linked': 'link',
      'detail.mismatch':
        'A skill with the same name exists in another root; the body comes from {path}. Editing is disabled to avoid overwriting the wrong file.',

      'confirm.delete':
        'Delete skill "{name}"? This removes the real SKILL.md file and cannot be undone.',
      'confirm.deleteLinked': 'Remove this link? The skill files in {path} are kept.',
      'confirm.unlinkYes': 'Remove link',
      'confirm.deleteYes': 'Delete',
      'confirm.cancel': 'Cancel',

      'edit.title': 'Edit {name}',
      'edit.save': 'Save',
      'edit.saving': 'Saving…',
      'edit.cancel': 'Cancel',
      'edit.hint': 'The full SKILL.md text. Saving writes it back to disk immediately.',
      'edit.content': 'SKILL.md content',

      'create.title': 'New skill',
      'create.root': 'Write into',
      'create.name': 'Name',
      'create.namePlaceholder': 'my-skill',
      'create.nameInvalid': 'The name must be lower-case kebab-case, e.g. my-skill',
      'create.description': 'Description',
      'create.descriptionPlaceholder': 'One line explaining what this skill does',
      'create.submit': 'Create',
      'create.creating': 'Creating…',
      'create.cancel': 'Cancel',
      'create.noRoots': 'No writable skill root is available.',

      'status.loading': 'Loading…',
      'error.title': 'Something went wrong',
      'error.code': 'Code',
      'error.retry': 'Retry',
      'error.dismiss': 'Dismiss',
      'session.required': 'Open this panel inside a session.',

      'list.select': 'Select',
      'list.selectExit': 'Exit selection',
      'list.join': ', ',

      'filter.search': 'Search name or description',
      'filter.clear': 'Clear filters',
      'filter.show': 'Filters',
      'filter.hide': 'Hide filters',
      'filter.tier': 'Filter by tier',
      'filter.modelOff': 'M off',
      'filter.userOff': 'U off',
      'filter.shadowed': 'Shadowed',
      'filter.linked': 'Linked',
      'filter.empty': 'No skills match the current filters',
      'filter.emptyHint': 'Try another keyword, or clear the filters.',

      'selection.count': '{count} selected',
      'selection.allInTier': 'Select tier',
      'selection.noneInTier': 'Clear tier',
      'selection.cancel': 'Cancel',

      'batch.invocation': 'Invocability',
      'batch.modelOn': 'Enable model invocation',
      'batch.modelOff': 'Disable model invocation',
      'batch.userOn': 'Enable user invocation',
      'batch.userOff': 'Disable user invocation',
      'batch.move': 'Move to',
      'batch.copy': 'Copy to',
      'batch.delete': 'Delete',
      'batch.running': 'Working…',
      'batch.confirmDelete': 'Delete {count} skill(s)?',
      'batch.confirmDeleteLinked':
        'Delete {count} skill(s)? {linked} of them are installed links: only those links are removed and the real files are kept.',
      'batch.confirmMove':
        'Move the {count} selected item(s) to “{to}”? Moving changes which tier the model sees them from.',
      'batch.confirmCopy': 'Copy the {count} selected item(s) to “{to}”? Same-name entries are skipped.',
      'batch.confirm': 'Confirm',
      'batch.cancel': 'Cancel',
      'batch.result': '{succeeded} succeeded · {failed} failed',
      'batch.view': 'Show',
      'batch.hide': 'Hide',
      'batch.failure': '{name}: {reason}',
      'batch.noTarget': 'No other writable target tier is available.',

      'code.TARGET_EXISTS': 'A skill with this name already exists in the target tier',
      'code.INVALID_TARGET': 'The target tier is not usable',
      'code.TOO_MANY_ITEMS': 'At most 100 skills can be handled at once',
      'code.DELETE_FAILED': 'The delete failed',
      'code.LOCAL_CHANGES': 'Local files have changed',
      'code.NOT_MANAGED': 'This skill has no upstream source',
      'code.BUSY': 'Another update is already running, try again later',
      'code.RATE_LIMITED': 'The upstream request was rate-limited',
      'code.UNSUPPORTED_SOURCE': 'This upstream source is not supported',
      'code.LOCK_INVALID': 'The upstream manifest could not be parsed',
      'code.LOCK_VERSION_UNSUPPORTED': 'The upstream manifest version is not supported',
      'code.PACKAGE_TOO_LARGE': 'The upstream package exceeds the size limit',
      'error.sourceRemoveFailed':
        'The copy was written to the target tier, but the source entry could not be removed; delete it manually.',

      'filter.group.tier': 'Tier',
      'filter.group.attr': 'Attributes',
      'filter.group.source': 'Source',
      'filter.source.local': 'Local',
      'filter.source.more': '+{count}',
      'badge.local': 'Local',
      'badge.update': 'Update available',
      'badge.updateWithHash': 'Update available · {hash}',

      'check.button': 'Check for updates',
      'check.running': 'Checking…',
      'check.available': '{count} update(s) available',
      'check.uptodate': 'Everything is up to date',
      'check.unknown': '{count} could not be verified',
      'check.reasonUnknown': 'Reason unknown',
      'check.expand': 'Show reasons',
      'check.collapse': 'Hide',
      'check.reason': '{name}: {reason}',
      'check.updateAll': 'Update all',
      'check.updating': 'Updating {done}/{total}…',
      'bulk.dismiss': 'Dismiss',

      'detail.checkUpdate': 'Check for updates',
      'detail.update': 'Update this skill',
      'detail.checking': 'Checking…',
      'detail.updating': 'Updating…',
      'detail.checkAvailable': 'An update is available',
      'detail.checkUptodate': 'Up to date',
      'detail.checkUnknown': 'Could not verify: {reason}',
      'detail.updateDone': 'Updated',
      'detail.installDone': 'Installed',
      'detail.sourceRepo': 'Repository',
      'detail.sourcePath': 'Path in repository',
      'detail.sourceInstalled': 'Installed',
      'detail.sourceUpdated': 'Updated',
      'detail.sourceHash': 'Upstream hash',
      'detail.sourceLocal': 'Local skill, not installed by the skills CLI.',
      'detail.forceConfirm':
        'Local files have changed; updating overwrites them (the old directory is kept as a .bak backup). Force update?',
      'detail.forceYes': 'Force update',
      'detail.forceCancel': 'Cancel',

      'missing.title': 'Only in manifest',
      'missing.note': 'The manifest lists this skill, but it is not installed locally.',
      'missing.install': 'Install',
      'missing.installing': 'Installing…',

      'batch.update': 'Update selected',
      'batch.updating': 'Updating…',

      'detail.updateFailed': 'Update failed',
      'missing.installFailed': 'Install failed',
    }

    /* ------------------------------------------------------------------ *
     * Panel styles (theme tokens only, scoped under .dps-)                *
     * ------------------------------------------------------------------ */

    const CSS = `
.dps-root {
  box-sizing: border-box;
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 12px 12px 20px;
  scrollbar-width: thin;
  scrollbar-color: var(--dsw-alias-scrollbar-bg-l1) transparent;
  color: var(--dsw-alias-label-primary);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: 1.5;
}

/* Selection mode floats its action bar over the bottom of the list, so the
   list reserves that room instead of letting the bar cover the last group. */
.dps-list[data-selecting='true'] {
  padding-bottom: 132px;
}
.dps-root *,
.dps-root *::before,
.dps-root *::after { box-sizing: border-box; }
.dps-root button,
.dps-root input,
.dps-root select,
.dps-root textarea { font: inherit; color: inherit; }
.dps-root :focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 1px;
}
.dps-root ::selection { background: var(--dsw-alias-markdown-code-segment-unselected); }

.dps-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ---- toolbar ---------------------------------------------------------- */

.dps-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 8px;
  flex: none;
  min-width: 0;
}
/* Secondary actions travel together so they can wrap below the title instead
   of squeezing the primary action. */
.dps-tools {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  min-width: 0;
}
.dps-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--dsh-content-font-size-secondary, 13px);
  font-weight: 600;
  letter-spacing: -0.005em;
}
.dps-spacer { flex: 1 1 auto; }
.dps-count {
  font-size: var(--dsh-content-font-size-tertiary, 11px);
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.dps-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-size: var(--dsh-content-font-size-tertiary, 11px);
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.12s ease, border-color 0.12s ease, opacity 0.12s ease;
}
.dps-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  border-color: var(--dsw-alias-border-l3);
}
.dps-btn:active:not(:disabled) { background: var(--dsw-alias-interactive-bg-active); }
.dps-btn:disabled { opacity: 0.45; cursor: default; }
.dps-btn.dps-primary:disabled {
  opacity: 1;
  border-color: transparent;
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-tertiary);
}
.dps-btn.dps-primary {
  border-color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-label-primary-foreground);
}
.dps-btn.dps-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); border-color: var(--dsw-alias-button-primary-hover); }
.dps-btn.dps-danger { color: var(--dsw-alias-state-error-primary); }

.dps-link {
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsh-content-font-size-tertiary, 11px);
  cursor: pointer;
}
.dps-link:hover { color: var(--dsw-alias-label-primary); text-decoration: underline; text-underline-offset: 2px; }
.dps-link:disabled { color: var(--dsw-alias-label-tertiary); cursor: default; text-decoration: none; }

/* ---- groups ----------------------------------------------------------- */

.dps-group { display: flex; flex-direction: column; gap: 6px; flex: none; }
.dps-group-head {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  height: 24px;
  padding: 0 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s ease;
}
.dps-group-head:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dps-group-title {
  font-size: var(--dsh-content-font-size-secondary, 13px);
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.dps-group-body { display: flex; flex-direction: column; gap: 8px; }

.dps-caret {
  width: 6px;
  height: 6px;
  flex: none;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(-45deg);
  transition: transform 0.16s ease;
}
.dps-caret[data-open="true"] { transform: rotate(45deg); }

/* ---- discovery tiers -------------------------------------------------- */

.dps-tier-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 0 2px;
}
.dps-root-dot {
  width: 5px;
  height: 5px;
  flex: none;
  border-radius: 50%;
  background: var(--dsw-alias-state-success-primary);
}
.dps-root-dot[data-tone="missing"] { background: var(--dsw-alias-label-dimmed); }
.dps-root-dot[data-tone="readonly"] { background: var(--dsw-alias-state-warn-primary); }
.dps-root-mark { color: var(--dsw-alias-label-tertiary); white-space: nowrap; font-size: 10.5px; }
.dps-rank {
  flex: none;
  padding: 0 4px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 4px;
  background: var(--dsw-alias-markdown-code-block);
  color: var(--dsw-alias-label-tertiary);
  font-family: ${MONO_FONT};
  font-size: 10px;
  line-height: 14px;
  letter-spacing: 0.02em;
}

/* ---- rows ------------------------------------------------------------- */

.dps-rows {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
}
.dps-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  min-width: 0;
  padding: 9px 10px;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s ease;
}
.dps-row + .dps-row { border-top: 1px solid var(--dsw-alias-border-l1); }
.dps-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dps-row:active { background: var(--dsw-alias-interactive-bg-active); }
.dps-row-top { display: flex; align-items: center; gap: 6px; min-width: 0; }
.dps-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ${MONO_FONT};
  font-size: 12px;
  font-weight: 600;
}
.dps-badge {
  flex: none;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--dsw-alias-markdown-code-block);
  color: var(--dsw-alias-label-tertiary);
  font-family: ${MONO_FONT};
  font-size: 10px;
  line-height: 14px;
  white-space: nowrap;
}
.dps-badge.dps-badge-link {
  background: transparent;
  border: 1px dashed var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-tertiary);
}
.dps-flags { display: inline-flex; gap: 4px; margin-left: auto; flex: none; }
.dps-flag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 5px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-markdown-code-block);
  font-family: ${MONO_FONT};
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1;
}
.dps-flag.dps-flag-off {
  border-style: dashed;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  opacity: 0.7;
}
.dps-row-caret {
  width: 5px;
  height: 5px;
  flex: none;
  margin-left: 2px;
  border-right: 1.5px solid var(--dsw-alias-label-tertiary);
  border-bottom: 1.5px solid var(--dsw-alias-label-tertiary);
  transform: rotate(-45deg);
  opacity: 0;
  transition: opacity 0.12s ease;
}
.dps-row:hover .dps-row-caret,
.dps-row:focus-visible .dps-row-caret { opacity: 1; }
.dps-desc {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsh-content-font-size-tertiary, 11.5px);
  line-height: 1.45;
}
.dps-shadow {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-tertiary);
  font-size: var(--dsh-content-font-size-tertiary, 11px);
}
.dps-hint {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: var(--dsh-content-font-size-tertiary, 11px);
  line-height: 1.5;
}

/* ---- load skeletons --------------------------------------------------- */

.dps-skeleton { display: flex; flex-direction: column; gap: 8px; padding-top: 2px; }
.dps-skeleton-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
}
.dps-skeleton-bar {
  height: 8px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-skeleton);
  animation: dps-pulse 1.8s ease-in-out infinite;
}
.dps-skeleton-name { width: 46%; }
.dps-skeleton-desc { width: 82%; height: 7px; }
@keyframes dps-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

/* ---- notices ---------------------------------------------------------- */

.dps-warn {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--dsw-alias-state-warn-tertiary);
  flex: none;
}
.dps-warn-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--dsh-content-font-size-secondary, 12px);
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.dps-warn-list {
  margin: 0;
  padding-left: 14px;
  max-height: 160px;
  overflow: auto;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsh-content-font-size-tertiary, 11px);
  line-height: 1.55;
}

.dps-error {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-interactive-bg-hover-danger);
  flex: none;
}
.dps-error-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dps-error-title { font-size: var(--dsh-content-font-size-secondary, 12px); font-weight: 600; color: var(--dsw-alias-state-error-primary); }
.dps-error-code { font-family: ${MONO_FONT}; font-size: 10.5px; color: var(--dsw-alias-label-tertiary); }
.dps-error-message {
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsh-content-font-size-secondary, 12px);
  overflow-wrap: anywhere;
}
.dps-error .dps-btn { height: 24px; padding: 0 8px; font-size: var(--dsh-content-font-size-tertiary, 11px); }

/* ---- empty ------------------------------------------------------------ */

.dps-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  padding: 24px 14px;
  border: 1px dashed var(--dsw-alias-border-l2);
  border-radius: 12px;
  text-align: center;
  color: var(--dsw-alias-label-secondary);
}
.dps-empty p { margin: 0; }
.dps-empty-title { font-size: var(--dsh-content-font-size-secondary, 13px); font-weight: 600; color: var(--dsw-alias-label-primary); }
.dps-empty .dps-btn { margin-top: 8px; }

/* ---- detail / edit / create ------------------------------------------ */

.dps-detail,
.dps-edit,
.dps-create { display: flex; flex-direction: column; gap: 10px; min-height: 0; flex: 1 1 auto; }
.dps-detail-name {
  margin: 2px 0 0;
  font-family: ${MONO_FONT};
  font-size: 15px;
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.dps-detail-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: var(--dsh-content-font-size-tertiary, 11px);
}
.dps-mono {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ${MONO_FONT};
  font-size: 10.5px;
  color: var(--dsw-alias-label-tertiary);
}
.dps-invoc {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
}
.dps-invoc-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  font-size: var(--dsh-content-font-size-secondary, 12px);
  color: var(--dsw-alias-label-secondary);
}
.dps-invoc-row + .dps-invoc-row { border-top: 1px solid var(--dsw-alias-border-l1); }
.dps-invoc-row .dps-switch { margin-left: auto; }

.dps-switch {
  position: relative;
  width: 34px;
  height: 20px;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-active);
  cursor: pointer;
  transition: background-color 0.16s ease;
}
.dps-switch::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--dsw-alias-switch-thumb);
  box-shadow: var(--dsw-shadow-lv1);
  transition: transform 0.16s ease;
}
.dps-switch[data-on="true"] { background: var(--dsw-alias-brand-primary); }
.dps-switch[data-on="true"]::after {
  background: var(--dsw-alias-label-primary-foreground);
  transform: translateX(14px);
}
.dps-switch:disabled { opacity: 0.45; cursor: default; }

.dps-section { display: flex; flex-direction: column; gap: 6px; min-height: 0; }
.dps-section-title {
  font-size: var(--dsh-content-font-size-tertiary, 11px);
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--dsw-alias-label-secondary);
}
.dps-body {
  margin: 0;
  padding: 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-markdown-code-block);
  color: var(--dsw-alias-label-primary);
  font-family: ${MONO_FONT};
  font-size: var(--dsh-content-font-size-secondary, 12px);
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 52vh;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--dsw-alias-scrollbar-bg-l1) transparent;
}

.dps-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.dps-actions .dps-btn.dps-danger {
  border-color: transparent;
  background: var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-label-primary-foreground);
}
.dps-actions .dps-btn.dps-danger:hover:not(:disabled) {
  border-color: transparent;
  background: var(--dsw-alias-state-error-primary);
  opacity: 0.88;
}
.dps-confirm {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-interactive-bg-hover-danger);
}
.dps-confirm p { margin: 0; font-size: var(--dsh-content-font-size-secondary, 12px); }

.dps-editor {
  width: 100%;
  min-height: 320px;
  flex: 1 1 auto;
  padding: 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-markdown-code-block);
  color: var(--dsw-alias-label-primary);
  font-family: ${MONO_FONT};
  font-size: var(--dsh-content-font-size-secondary, 12px);
  line-height: 1.65;
  tab-size: 2;
  resize: vertical;
}
.dps-editor:hover { border-color: var(--dsw-alias-border-l3); }

.dps-field { display: flex; flex-direction: column; gap: 5px; }
.dps-label {
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsh-content-font-size-tertiary, 11px);
  font-weight: 600;
}
.dps-input,
.dps-select {
  width: 100%;
  height: 32px;
  padding: 0 9px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}
.dps-input:hover:not(:disabled),
.dps-select:hover:not(:disabled) { border-color: var(--dsw-alias-border-l3); }
.dps-input::placeholder { color: var(--dsw-alias-label-tertiary); }
.dps-select { padding-right: 6px; }
.dps-input:focus-visible,
.dps-select:focus-visible,
.dps-editor:focus-visible {
  outline: none;
  border-color: var(--dsw-alias-state-business-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-business-primary) 16%, transparent);
}
.dps-invalid {
  color: var(--dsw-alias-state-error-primary);
  font-size: var(--dsh-content-font-size-tertiary, 11px);
}
.dps-input[aria-invalid="true"] { border-color: var(--dsw-alias-state-error-primary); }
.dps-field-note {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-tertiary);
  font-family: ${MONO_FONT};
  font-size: 10.5px;
}

/* Filters ---------------------------------------------------------------- */

.dps-filterbar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.dps-filter-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dps-filter-head .dps-search {
  flex: 1 1 auto;
  min-width: 0;
  width: auto;
}
.dps-filter-toggle {
  flex: 0 0 auto;
  gap: 5px;
}
.dps-filter-toggle[data-open='true'] {
  border-color: var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-primary);
}
.dps-filter-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--dsw-alias-state-business-primary);
}
.dps-filter-panel {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding-top: 2px;
}
.dps-search {
  box-sizing: border-box;
  width: 100%;
  height: 30px;
  padding: 0 9px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-size: var(--dsh-content-font-size-secondary, 13px);
}
.dps-search::placeholder { color: var(--dsw-alias-label-tertiary); }
.dps-search:focus-visible {
  outline: none;
  border-color: var(--dsw-alias-state-business-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-business-primary) 16%, transparent);
}
.dps-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}
.dps-chip {
  height: 23px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsh-content-font-size-tertiary, 11px);
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.12s ease, opacity 0.12s ease;
}
.dps-chip:hover:not(:disabled) { border-color: var(--dsw-alias-border-l3); }
/* A tier chip switches a discovery layer on or off; a flag chip narrows the
   rows down to one property. "On" is the common case, so it reads as a plain
   selectable pill rather than an alarm, and "off" fades instead of striking
   through (a struck-through layer name looked like a broken label). */
.dps-chip[data-tier][data-on='true'] {
  border-color: transparent;
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
}
.dps-chip[data-tier][data-on='false'] {
  border-color: var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-tertiary);
  opacity: 0.75;
}
.dps-chip:not([data-tier])[data-on='true'] {
  border-color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-interactive-bg-hover-accent);
  color: var(--dsw-alias-brand-primary);
}
.dps-chip:not([data-tier])[data-on='false'] { opacity: 0.55; }
.dps-chip:disabled { cursor: default; opacity: 0.45; }
.dps-clear { margin-left: auto; flex: 0 0 auto; }

/* Selection -------------------------------------------------------------- */

.dps-check {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  margin: 2px 0 0;
  accent-color: var(--dsw-alias-brand-primary);
  cursor: pointer;
}
.dps-row {
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
}
.dps-row-main {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.dps-row[data-selected='true'] {
  background: var(--dsw-alias-interactive-bg-hover-accent);
}
.dps-select-all {
  flex: 0 0 auto;
  height: 21px;
  padding: 0 7px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsh-content-font-size-tertiary, 11px);
  cursor: pointer;
}
.dps-select-all:hover:not(:disabled) {
  border-color: var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-primary);
}
.dps-select-all:disabled { cursor: default; opacity: 0.45; }

.dps-actionbar {
  position: sticky;
  bottom: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
  padding: 9px 10px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
.dps-actionbar-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.dps-action-head {
  flex: 0 0 auto;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsh-content-font-size-secondary, 12px);
}
.dps-actionbar .dps-select {
  width: auto;
  min-width: 0;
  height: 28px;
  flex: 0 1 auto;
  font-size: var(--dsh-content-font-size-tertiary, 11px);
}
.dps-busy {
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsh-content-font-size-secondary, 12px);
}
.dps-result {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: var(--dsh-content-font-size-secondary, 12px);
}
.dps-result-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.dps-failures {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 0;
  padding-left: 16px;
  color: var(--dsw-alias-state-error-primary);
  font-size: var(--dsh-content-font-size-tertiary, 11px);
}
.dps-failure { overflow-wrap: anywhere; }

/* Per-dimension filter rows: tier / attributes / source. */
.dps-filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.dps-filter-label {
  flex: 0 0 auto;
  color: var(--dsw-alias-label-tertiary);
  font-size: var(--dsh-content-font-size-tertiary, 11px);
}
@container (max-width: 340px) {
  .dps-filter-label { flex-basis: 100%; }
}

/* Source badge on a row and the "update available" dot. */
.dps-badge-source { color: var(--dsw-alias-label-secondary); }
.dps-update-dot {
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--dsw-alias-state-business-primary);
}
.dps-row-missing { cursor: default; }
.dps-row-missing .dps-name,
.dps-row-missing .dps-desc { opacity: 0.55; }
.dps-row-missing .dps-btn { margin-left: auto; }
.dps-group-missing .dps-group-head { cursor: default; }

/* Check-for-updates result strip under the toolbar. */
.dps-check-strip {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  padding: 6px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  font-size: var(--dsh-content-font-size-tertiary, 11px);
}
.dps-check-text { color: var(--dsw-alias-label-secondary); }
.dps-check-unknown { color: var(--dsw-alias-label-tertiary); }
.dps-check-details {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 4px 0 0;
  padding-left: 18px;
  color: var(--dsw-alias-label-secondary);
}
.dps-check-details li { overflow-wrap: anywhere; }

/* Detail "source" section. */
.dps-source {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dps-source-row {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0 10px;
}
.dps-source-key { color: var(--dsw-alias-label-tertiary); }
.dps-source-value { overflow-wrap: anywhere; }
.dps-check-line { color: var(--dsw-alias-state-business-primary); }
.dps-force-confirm { border-color: var(--dsw-alias-state-warn-tertiary); }

@media (prefers-reduced-motion: reduce) {
  .dps-root *,
  .dps-root *::before,
  .dps-root *::after {
    animation: none !important;
    transition: none !important;
  }
}

`

    /* ------------------------------------------------------------------ *
     * Small helpers                                                       *
     * ------------------------------------------------------------------ */

    function keyOnlyTranslate(key) {
      return typeof key === 'string' ? key : ''
    }

    // `ctx.locale.bind(ns)` is the supported way to obtain a translator; when
    // the service is unavailable (e.g. in a smoke test) fall back to identity.
    function bindTranslate(localeService) {
      if (localeService !== null && localeService !== undefined) {
        try {
          if (typeof localeService.bind === 'function') {
            const bound = localeService.bind(NS)
            if (typeof bound === 'function') return bound
          }
        } catch (error) {
          /* fall through to the identity translator */
        }
      }
      return keyOnlyTranslate
    }

    // Interpolate `{name}` placeholders without depending on locale service
    // features we cannot rely on across DSH versions.
    function tf(translate, key, params) {
      let text
      try {
        text = translate(key)
      } catch (error) {
        text = undefined
      }
      if (typeof text !== 'string' || text === '') text = key
      if (params === undefined || params === null) return text
      let out = text
      for (const name of Object.keys(params)) {
        out = out.split('{' + name + '}').join(String(params[name]))
      }
      return out
    }

    function pickTranslate(props) {
      if (props !== null && props !== undefined) {
        if (typeof props.t === 'function') return props.t
        if (typeof props.translate === 'function') return props.translate
      }
      return keyOnlyTranslate
    }

    function readTabInfo(props) {
      if (props === null || props === undefined) return undefined
      if (typeof props.useTabInfo !== 'function') return undefined
      try {
        const info = props.useTabInfo()
        return info !== null && typeof info === 'object' ? info : undefined
      } catch (error) {
        return undefined
      }
    }

    function pickSessionId(props, tabInfo) {
      if (props !== null && props !== undefined) {
        if (typeof props.sessionId === 'string' && props.sessionId !== '') {
          return props.sessionId
        }
      }
      if (tabInfo !== null && tabInfo !== undefined) {
        const tab = tabInfo.tab
        if (tab !== null && tab !== undefined) {
          const navigation = tab.navigation
          if (
            navigation !== null &&
            navigation !== undefined &&
            typeof navigation.sessionId === 'string' &&
            navigation.sessionId !== ''
          ) {
            return navigation.sessionId
          }
        }
        if (typeof tabInfo.sessionId === 'string' && tabInfo.sessionId !== '') {
          return tabInfo.sessionId
        }
      }
      return undefined
    }

    function isKebabCase(value) {
      return typeof value === 'string' && KEBAB_CASE.test(value)
    }

    function titleFromName(name) {
      return String(name)
        .split('-')
        .filter((part) => part !== '')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    }

    // The host validates that the frontmatter `name` equals the requested
    // name, so the template must embed the exact value the panel sent.
    function skillTemplate(name, description) {
      const flattened = String(description)
        .replace(/\s*\r?\n\s*/g, ' ')
        .trim()
      return (
        '---\n' +
        'name: ' + name + '\n' +
        'description: ' + flattened + '\n' +
        '---\n' +
        '\n' +
        '# ' + titleFromName(name) + '\n' +
        '\n' +
        TEMPLATE_BODY_HINT + '\n'
      )
    }

    function patchListSkill(data, name, rootId, patch) {
      if (data === null || data === undefined) return data
      if (!Array.isArray(data.tiers)) return data
      return {
        ...data,
        tiers: data.tiers.map((tier) => {
          if (tier === null || typeof tier !== 'object') return tier
          if (!Array.isArray(tier.skills)) return tier
          return {
            ...tier,
            skills: tier.skills.map((skill) => {
              if (skill === null || typeof skill !== 'object') return skill
              if (skill.name !== name || skill.rootId !== rootId) return skill
              return { ...skill, ...patch }
            }),
          }
        }),
      }
    }

    function writableRoots(data) {
      const out = []
      if (data === null || data === undefined || !Array.isArray(data.tiers)) return out
      for (const tier of data.tiers) {
        if (tier === null || typeof tier !== 'object') continue
        if (tier.writable !== true) continue
        out.push({
          id: typeof tier.rootId === 'string' ? tier.rootId : tier.id,
          source: tier.source,
          path: tier.path,
          exists: tier.exists === true,
          writable: true,
          rank: tier.rank,
          scope: tier.scope,
        })
      }
      return out
    }

    function findRootInfo(data, rootId) {
      if (data === null || data === undefined || !Array.isArray(data.tiers)) return undefined
      for (const tier of data.tiers) {
        if (tier === null || typeof tier !== 'object') continue
        const id = typeof tier.rootId === 'string' ? tier.rootId : tier.id
        if (id !== rootId) continue
        return {
          id,
          source: tier.source,
          path: tier.path,
          exists: tier.exists === true,
          writable: tier.writable === true,
          rank: tier.rank,
          scope: tier.scope,
        }
      }
      return undefined
    }

    function rootLabel(translate, root) {
      if (root !== null && root !== undefined) {
        const label = tf(translate, 'root.' + String(root.id))
        if (label !== 'root.' + String(root.id)) return label
      }
      return root !== null && root !== undefined && typeof root.id === 'string'
        ? root.id
        : ''
    }

    // Compact path label for the root chips: "~/.dsh/skills" for anything
    // under the user's home, otherwise the two innermost segments. The full
    // path stays in the chip's title attribute.
    const HOME_SEGMENT = /^(?:[A-Za-z]:)?[\\/](?:Users|home)[\\/][^\\/]+/i

    function shortRootPath(path) {
      const text = typeof path === 'string' ? path : ''
      const match = text.match(HOME_SEGMENT)
      const rest = match === null ? text : text.slice(match[0].length)
      const segments = rest.split(/[\\/]+/).filter((segment) => segment !== '')
      const tail = segments.slice(-2).join('/')
      if (match !== null) return '~/' + tail
      if (segments.length <= 2) return text
      return tail
    }

    function shadowLabel(translate, shadowedBy) {
      if (shadowedBy !== null && shadowedBy !== undefined) {
        if (typeof shadowedBy.rootId === 'string' && shadowedBy.rootId !== '') {
          const label = rootLabel(translate, { id: shadowedBy.rootId })
          if (label !== '') return label
        }
        if (typeof shadowedBy.path === 'string' && shadowedBy.path !== '') {
          return shortRootPath(shadowedBy.path)
        }
      }
      return ''
    }

    function createRootPath(roots, rootId) {
      const list = Array.isArray(roots) ? roots : []
      for (const root of list) {
        if (root !== null && root !== undefined && root.id === rootId) {
          return typeof root.path === 'string' ? root.path : ''
        }
      }
      return ''
    }

    function rootSource(data, rootId, fallback) {
      const root = findRootInfo(data, rootId)
      if (root !== null && root !== undefined && typeof root.source === 'string') {
        return root.source
      }
      return typeof fallback === 'string' && fallback !== '' ? fallback : String(rootId)
    }

    /* ------------------------------------------------------------------ *
     * Filters and selection helpers                                       *
     * ------------------------------------------------------------------ */

    function tierRootId(tier) {
      if (tier === null || tier === undefined) return ''
      if (typeof tier.rootId === 'string' && tier.rootId !== '') return tier.rootId
      return typeof tier.id === 'string' ? tier.id : String(tier.id)
    }

    // A row's own root is authoritative: a shadowed duplicate can sit in an
    // earlier tier while still belonging to its own root.
    function skillRootId(skill, fallback) {
      if (
        skill !== null &&
        skill !== undefined &&
        typeof skill.rootId === 'string' &&
        skill.rootId !== ''
      ) {
        return skill.rootId
      }
      return typeof fallback === 'string' ? fallback : ''
    }

    // Tier chips start "on": a root id missing from `tiers` is visible, so
    // only an explicit `false` hides a tier. The source row is exclusive: a
    // set `source` narrows the list to that repository bucket, `null` shows all.
    function defaultFilters() {
      return {
        query: '',
        tiers: {},
        source: null,
        modelOff: false,
        userOff: false,
        shadowed: false,
        linked: false,
      }
    }

    const LOCAL_SOURCE_KEY = '__local__'

    // Every row resolves to exactly one source bucket: its upstream repository,
    // or the local bucket for skills that were not installed by the CLI.
    function sourceKeyOf(skill) {
      if (skill === null || skill === undefined || typeof skill !== 'object') {
        return LOCAL_SOURCE_KEY
      }
      if (skill.origin === 'local') return LOCAL_SOURCE_KEY
      const upstream = skill.upstream
      if (
        upstream !== null &&
        upstream !== undefined &&
        typeof upstream === 'object' &&
        typeof upstream.repo === 'string' &&
        upstream.repo !== ''
      ) {
        return upstream.repo
      }
      return LOCAL_SOURCE_KEY
    }

    function sourceFilterActive(filters) {
      if (filters === null || filters === undefined) return false
      return typeof filters.source === 'string' && filters.source !== ''
    }

    // True when a filter hides individual rows (search text, a flag chip or a
    // source chip). A tier chip alone only hides whole tiers, so empty tiers
    // stay visible with their one-line hint instead of vanishing.
    function rowFilterActive(filters) {
      if (filters === null || filters === undefined) return false
      if (typeof filters.query === 'string' && filters.query.trim() !== '') return true
      if (sourceFilterActive(filters)) return true
      return (
        filters.modelOff === true ||
        filters.userOff === true ||
        filters.shadowed === true ||
        filters.linked === true
      )
    }

    function filterActive(filters) {
      if (filters === null || filters === undefined) return false
      if (rowFilterActive(filters)) return true
      const tiers = filters.tiers
      if (tiers !== null && tiers !== undefined && typeof tiers === 'object') {
        for (const rootId of Object.keys(tiers)) {
          if (tiers[rootId] === false) return true
        }
      }
      return false
    }

    function skillKey(skill, rootId) {
      const root =
        typeof rootId === 'string' && rootId !== ''
          ? rootId
          : skill !== null && skill !== undefined && typeof skill.rootId === 'string'
            ? skill.rootId
            : ''
      const name =
        skill !== null && skill !== undefined && typeof skill.name === 'string'
          ? skill.name
          : ''
      return root + '::' + name
    }

    function matchesFilters(skill, rootId, filters) {
      if (filters === null || filters === undefined) return true
      const tiers = filters.tiers
      if (tiers !== null && tiers !== undefined && tiers[rootId] === false) return false
      const sources = filters.source
      if (typeof sources === 'string' && sources !== '' && sourceKeyOf(skill) !== sources) {
        return false
      }
      const query = typeof filters.query === 'string' ? filters.query.trim().toLowerCase() : ''
      if (query !== '') {
        const name = typeof skill.name === 'string' ? skill.name.toLowerCase() : ''
        const description =
          typeof skill.description === 'string' ? skill.description.toLowerCase() : ''
        if (!name.includes(query) && !description.includes(query)) return false
      }
      if (filters.modelOff === true && skill.modelInvocable === true) return false
      if (filters.userOff === true && skill.userInvocable === true) return false
      if (filters.shadowed === true && skill.shadowed !== true) return false
      if (filters.linked === true && skill.linked !== true) return false
      return true
    }

    // Returns every visible tier with its filtered rows. A tier switched off
    // by its chip disappears completely, including its count.
    function filteredTiers(data, filters) {
      const output = []
      if (data === null || data === undefined || !Array.isArray(data.tiers)) return output
      const off =
        filters !== null && filters !== undefined && filters.tiers !== null && filters.tiers !== undefined
          ? filters.tiers
          : {}
      for (const tier of data.tiers) {
        if (tier === null || typeof tier !== 'object') continue
        const rootId = tierRootId(tier)
        if (off[rootId] === false) continue
        const skills = Array.isArray(tier.skills) ? tier.skills : []
        const visible = []
        for (const skill of skills) {
          if (skill === null || typeof skill !== 'object') continue
          if (matchesFilters(skill, rootId, filters)) visible.push(skill)
        }
        output.push({ tier: tier, rootId: rootId, skills: visible, total: skills.length })
      }
      return output
    }

    function visibleSelectionKeys(shownTiers) {
      const keys = {}
      const list = Array.isArray(shownTiers) ? shownTiers : []
      for (const entry of list) {
        for (const skill of entry.skills) {
          keys[skillKey(skill, skillRootId(skill, entry.rootId))] = true
        }
      }
      return keys
    }

    // Resolves the selection map against the list payload in discovery order,
    // which keeps the batch request stable (tier rank, then row order).
    function selectedSkillEntries(data, selection) {
      const entries = []
      if (data === null || data === undefined || !Array.isArray(data.tiers)) return entries
      if (selection === null || selection === undefined) return entries
      for (const tier of data.tiers) {
        if (tier === null || typeof tier !== 'object') continue
        const tierRoot = tierRootId(tier)
        const skills = Array.isArray(tier.skills) ? tier.skills : []
        for (const skill of skills) {
          if (skill === null || typeof skill !== 'object') continue
          const rootId = skillRootId(skill, tierRoot)
          if (selection[skillKey(skill, rootId)] !== true) continue
          entries.push({ skill: skill, rootId: rootId })
        }
      }
      return entries
    }

    const CODE_TEXT_KEYS = {
      TARGET_EXISTS: 'code.TARGET_EXISTS',
      INVALID_TARGET: 'code.INVALID_TARGET',
      TOO_MANY_ITEMS: 'code.TOO_MANY_ITEMS',
      DELETE_FAILED: 'code.DELETE_FAILED',
      SOURCE_REMOVE_FAILED: 'error.sourceRemoveFailed',
      LOCAL_CHANGES: 'code.LOCAL_CHANGES',
      NOT_MANAGED: 'code.NOT_MANAGED',
      BUSY: 'code.BUSY',
      RATE_LIMITED: 'code.RATE_LIMITED',
      UNSUPPORTED_SOURCE: 'code.UNSUPPORTED_SOURCE',
      LOCK_INVALID: 'code.LOCK_INVALID',
      LOCK_VERSION_UNSUPPORTED: 'code.LOCK_VERSION_UNSUPPORTED',
      PACKAGE_TOO_LARGE: 'code.PACKAGE_TOO_LARGE',
    }

    // A batch result carries a structured code; prefer the localized copy and
    // fall back to the host message so a new code is never swallowed.
    function codeText(translate, code, fallback) {
      if (typeof code === 'string' && Object.prototype.hasOwnProperty.call(CODE_TEXT_KEYS, code)) {
        const key = CODE_TEXT_KEYS[code]
        const text = tf(translate, key)
        if (text !== key) return text
      }
      if (typeof fallback === 'string' && fallback !== '') return fallback
      return typeof code === 'string' ? code : ''
    }

    // Check results carry either a string or `{ code, message }` in `error`.
    function failureReason(translate, failure) {
      if (failure === null || failure === undefined) return ''
      if (typeof failure === 'string') return failure
      if (typeof failure !== 'object') return ''
      return codeText(translate, failure.code, failure.message)
    }

    function shortRepo(repo) {
      if (typeof repo !== 'string' || repo === '') return ''
      const parts = repo.split('/')
      return parts[parts.length - 1]
    }

    function shortHash(hash) {
      if (typeof hash !== 'string') return ''
      return hash.length > 10 ? hash.slice(0, 10) : hash
    }

    // Renders an ISO timestamp as a compact local date-time without depending
    // on Intl locale plumbing inside the panel.
    function formatWhen(value) {
      if (typeof value !== 'string' || value === '') return ''
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return value
      const pad = (number) => (number < 10 ? '0' + number : String(number))
      return (
        date.getFullYear() +
        '-' +
        pad(date.getMonth() + 1) +
        '-' +
        pad(date.getDate()) +
        ' ' +
        pad(date.getHours()) +
        ':' +
        pad(date.getMinutes())
      )
    }

    /* ------------------------------------------------------------------ *
     * HTTP layer                                                          *
     * ------------------------------------------------------------------ */

    class PanelError extends Error {
      constructor(code, message) {
        super(typeof message === 'string' && message !== '' ? message : String(code))
        this.name = 'PanelError'
        this.code = typeof code === 'string' && code !== '' ? code : 'ERROR'
      }
    }

    function asPanelError(error) {
      if (error instanceof PanelError) return error
      if (error !== null && typeof error === 'object') {
        if (error.name === 'AbortError' || error.code === 'ABORT_ERR') {
          return new PanelError('ABORTED', 'request aborted')
        }
        if (typeof error.message === 'string') return new PanelError('NETWORK', error.message)
      }
      return new PanelError('NETWORK', String(error))
    }

    // A cancelled request is not a user-visible failure: return null and let
    // the caller drop the state update.
    function toFailure(error) {
      const failure = asPanelError(error)
      return failure.code === 'ABORTED' ? null : failure
    }

    function hostBaseUrl() {
      try {
        if (
          typeof document !== 'undefined' &&
          document !== null &&
          typeof document.baseURI === 'string' &&
          document.baseURI !== ''
        ) {
          return document.baseURI
        }
      } catch (error) {
        /* keep looking */
      }
      try {
        if (typeof location !== 'undefined' && location !== null && typeof location.href === 'string') {
          return location.href
        }
      } catch (error) {
        /* keep looking */
      }
      return 'http://localhost/'
    }

    // Directory form of a page URL: strip query/hash, guarantee a trailing `/`
    // so relative resolution cannot climb out of the app directory.
    function directoryBase(base) {
      let url
      try {
        url = new URL(base)
      } catch (error) {
        url = new URL('http://localhost/')
      }
      url.search = ''
      url.hash = ''
      if (!url.pathname.endsWith('/')) url.pathname = url.pathname + '/'
      return url
    }

    function hostRouteUrl(path) {
      const relative = String(path).replace(/^\/+/, '')
      return new URL(relative, directoryBase(hostBaseUrl()))
    }

    function createApi(sessionId) {
      async function call(method, payload, signal) {
        const body = payload === undefined || payload === null
          ? { sessionId: sessionId }
          : { ...payload, sessionId: sessionId }

        let response
        try {
          const init = {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }
          if (signal !== undefined && signal !== null) init.signal = signal
          response = await fetch(hostRouteUrl(API_PATH + method).href, init)
        } catch (error) {
          throw asPanelError(error)
        }

        let parsed = null
        try {
          parsed = await response.json()
        } catch (error) {
          parsed = null
        }

        const hostError =
          parsed !== null && typeof parsed === 'object' && parsed.error !== null
            ? parsed.error
            : undefined
        const ok = parsed !== null && typeof parsed === 'object' && parsed.ok === true

        if (!response.ok || parsed === null || !ok) {
          const code =
            hostError !== undefined && typeof hostError.code === 'string' && hostError.code !== ''
              ? hostError.code
              : response.ok
                ? 'BAD_RESPONSE'
                : 'HTTP_' + response.status
          const message =
            hostError !== undefined && typeof hostError.message === 'string'
              ? hostError.message
              : 'HTTP ' + response.status
          throw new PanelError(code, message)
        }

        // The host spreads the result next to `ok`, so the payload fields are
        // top-level: `{ok:true, ...result}`. Return the whole envelope.
        return parsed
      }

      return {
        call,
        roots(signal) {
          return call('roots', undefined, signal)
        },
        list(signal) {
          return call('list', undefined, signal)
        },
        read(name, rootId, signal) {
          const payload = { name: name }
          // A shadowed skill shares its name with a higher-ranked one, so the
          // root the row belongs to is sent along to read that very file.
          if (rootId !== undefined && rootId !== null) payload.rootId = rootId
          return call('read', payload, signal)
        },
        write(rootId, name, content, signal) {
          return call('write', { rootId: rootId, name: name, content: content }, signal)
        },
        remove(rootId, name, signal) {
          return call('delete', { rootId: rootId, name: name }, signal)
        },
        toggle(rootId, name, field, value, signal) {
          return call(
            'toggle',
            { rootId: rootId, name: name, field: field, value: value },
            signal,
          )
        },
        batch(payload, signal) {
          return call('batch', payload, signal)
        },
        checkUpdates(payload, signal) {
          return call('checkUpdates', payload !== undefined ? payload : {}, signal)
        },
        updateSkills(payload, signal) {
          return call('updateSkills', payload, signal)
        },
      }
    }

    /* ------------------------------------------------------------------ *
     * Presentational pieces                                               *
     * ------------------------------------------------------------------ */

    function Flag(props) {
      return h(
        'span',
        {
          className: 'dps-flag' + (props.on ? '' : ' dps-flag-off'),
          title: props.title,
        },
        props.label,
      )
    }

    function ErrorBar(props) {
      const t = props.t
      const error = props.error
      const code =
        error !== null && error !== undefined && typeof error.code === 'string'
          ? error.code
          : 'ERROR'
      const message =
        error !== null && error !== undefined && typeof error.message === 'string'
          ? error.message
          : ''
      const head = h(
        'div',
        { className: 'dps-error-head' },
        h('span', { className: 'dps-error-title' }, t('error.title')),
        h('span', { className: 'dps-error-code', title: t('error.code') }, code),
        h('span', { className: 'dps-spacer' }),
        typeof props.onRetry === 'function'
          ? h(
              'button',
              { type: 'button', className: 'dps-link', onClick: props.onRetry },
              t('error.retry'),
            )
          : null,
        typeof props.onDismiss === 'function'
          ? h(
              'button',
              {
                type: 'button',
                className: 'dps-link',
                title: t('error.dismiss'),
                'aria-label': t('error.dismiss'),
                onClick: props.onDismiss,
              },
              '\u00d7',
            )
          : null,
      )
      return h(
        'div',
        { className: 'dps-error', role: 'alert' },
        head,
        message !== '' ? h('div', { className: 'dps-error-message' }, message) : null,
      )
    }

    // Search, tier chips and flag chips. Purely presentational: the panel owns
    // the filter object so the debounced query and the selection pruning live
    // in one place.
    function FilterBar(props) {
      const t = props.t
      const filters = props.filters
      const busy = props.busy === true
      const active = filterActive(filters)
      const tiers = Array.isArray(props.tiers) ? props.tiers : []
      const sources = Array.isArray(props.sources) ? props.sources : []
      // Above four repositories the extra chips fold behind a "+N" chip.
      const [showAllSources, setShowAllSources] = React.useState(false)

      const tierChips = []
      for (const entry of tiers) {
        const rootId = entry.rootId
        const on = filters.tiers[rootId] !== false
        const rank = entry.tier !== null && entry.tier !== undefined ? entry.tier.rank : ''
        tierChips.push(
          h(
            'button',
            {
              type: 'button',
              className: 'dps-chip',
              key: 'chip-' + rootId,
              'data-tier': rootId,
              'data-on': String(on),
              title: typeof entry.tier.path === 'string' ? entry.tier.path : '',
              disabled: busy,
              'aria-pressed': String(on),
              onClick: () =>
                props.onFiltersChange({
                  ...filters,
                  tiers: { ...filters.tiers, [rootId]: !on },
                }),
            },
            rootLabel(t, { id: rootId }) + (rank === '' ? '' : ' ' + String(rank)),
          ),
        )
      }

      const flagChips = []
      const flags = [
        ['modelOff', 'filter.modelOff'],
        ['userOff', 'filter.userOff'],
        ['shadowed', 'filter.shadowed'],
        ['linked', 'filter.linked'],
      ]
      for (const flag of flags) {
        const name = flag[0]
        const on = filters[name] === true
        flagChips.push(
          h(
            'button',
            {
              type: 'button',
              className: 'dps-chip',
              key: 'flag-' + name,
              'data-flag': name,
              'data-on': String(on),
              disabled: busy,
              'aria-pressed': String(on),
              onClick: () => props.onFiltersChange({ ...filters, [name]: !on }),
            },
            t(flag[1]),
          ),
        )
      }

      const shownSources = showAllSources ? sources : sources.slice(0, 4)
      const sourceChips = []
      for (const source of shownSources) {
        const key = source.key
        const selected = typeof filters.source === 'string' && filters.source !== ''
        const on = !selected || filters.source === key
        sourceChips.push(
          h(
            'button',
            {
              type: 'button',
              className: 'dps-chip',
              key: 'source-' + key,
              'data-source': key,
              'data-on': String(on),
              title: typeof source.title === 'string' ? source.title : key,
              disabled: busy,
              'aria-pressed': String(on),
              onClick: () =>
                props.onFiltersChange({
                  ...filters,
                  source: filters.source === key ? null : key,
                }),
            },
            source.label,
          ),
        )
      }
      if (!showAllSources && sources.length > 4) {
        sourceChips.push(
          h(
            'button',
            {
              type: 'button',
              className: 'dps-chip dps-chip-more',
              key: 'source-more',
              'data-more': 'sources',
              disabled: busy,
              onClick: () => setShowAllSources(true),
            },
            tf(t, 'filter.source.more', { count: sources.length - 4 }),
          ),
        )
      }

      const row = (labelKey, groupLabel, children) =>
        h(
          'div',
          { className: 'dps-filter-row' },
          h('span', { className: 'dps-filter-label' }, t(labelKey)),
          h('div', { className: 'dps-chips', role: 'group', 'aria-label': groupLabel }, children),
        )

      return h(
        'div',
        { className: 'dps-filterbar', 'data-open': String(props.open === true) },
        h(
          'div',
          { className: 'dps-filter-head' },
          h('input', {
            className: 'dps-search',
            type: 'search',
            value: props.queryValue,
            placeholder: t('filter.search'),
            'aria-label': t('filter.search'),
            disabled: busy,
            onChange: (event) => props.onQueryChange(event.target.value),
          }),
          h(
            'button',
            {
              type: 'button',
              className: 'dps-btn dps-filter-toggle',
              'data-open': String(props.open === true),
              'aria-expanded': String(props.open === true),
              disabled: busy,
              onClick: props.onToggleOpen,
            },
            active ? h('span', { className: 'dps-filter-dot', 'aria-hidden': 'true' }) : null,
            t(props.open === true ? 'filter.hide' : 'filter.show'),
          ),
        ),
        props.open === true
          ? h(
              'div',
              { className: 'dps-filter-panel' },
              row('filter.group.tier', t('filter.tier'), tierChips),
              row('filter.group.attr', t('filter.group.attr'), flagChips),
              row('filter.group.source', t('filter.group.source'), sourceChips),
            )
          : null,
        active
          ? h(
              'button',
              {
                type: 'button',
                className: 'dps-link dps-clear',
                disabled: busy,
                onClick: props.onClear,
              },
              t('filter.clear'),
            )
          : null,
      )
    }

    // The bottom bar of the list while selection mode is active: selection
    // count, the three batch operations, the inline confirmation and the batch
    // result summary all share one place so the panel never opens a modal.
    function SelectionBar(props) {
      const t = props.t
      const entries = Array.isArray(props.entries) ? props.entries : []
      const count = entries.length
      const batch = props.batch
      const running = batch !== null && batch !== undefined && batch.running === true
      const updating = props.updating === true
      const hasSummary =
        batch !== null &&
        batch !== undefined &&
        batch.summary !== null &&
        batch.summary !== undefined
      const disabled = running || updating || count === 0
      const pending = props.pending
      const targets = Array.isArray(props.targets) ? props.targets : []
      const parts = []

      if (
        batch !== null &&
        batch !== undefined &&
        batch.summary !== null &&
        batch.summary !== undefined
      ) {
        const summary = batch.summary
        const succeeded = typeof summary.succeeded === 'number' ? summary.succeeded : 0
        const failed = typeof summary.failed === 'number' ? summary.failed : 0
        const failures = Array.isArray(batch.results)
          ? batch.results.filter(
              (item) => item !== null && item !== undefined && item.ok !== true,
            )
          : []
        parts.push(
          h(
            'div',
            { className: 'dps-result', role: 'status', key: 'result' },
            h(
              'div',
              { className: 'dps-result-row' },
              h('span', null, tf(t, 'batch.result', { succeeded: succeeded, failed: failed })),
              failures.length > 0
                ? h(
                    'button',
                    { type: 'button', className: 'dps-link', onClick: props.onToggleFailures },
                    batch.expanded === true ? t('batch.hide') : t('batch.view'),
                  )
                : null,
              h('span', { className: 'dps-spacer' }),
              h(
                'button',
                { type: 'button', className: 'dps-link', onClick: props.onExit },
                t('selection.cancel'),
              ),
            ),
            batch.expanded === true && failures.length > 0
              ? h(
                  'ul',
                  { className: 'dps-failures' },
                  failures.map((item, index) =>
                    h(
                      'li',
                      { className: 'dps-failure', key: 'failure-' + String(index) },
                      tf(t, 'batch.failure', {
                        name: typeof item.name === 'string' ? item.name : '',
                        reason: codeText(t, item.code, item.message),
                      }),
                    ),
                  ),
                )
              : null,
          ),
        )
      }

      if (batch !== null && batch !== undefined && batch.error !== null && batch.error !== undefined) {
        parts.push(
          h(ErrorBar, {
            key: 'batch-error',
            t: t,
            error: batch.error,
            onDismiss: props.onDismissError,
          }),
        )
      }

      if (running) {
        parts.push(
          h('div', { className: 'dps-busy', key: 'busy', role: 'status' }, t('batch.running')),
        )
      }
      if (updating) {
        parts.push(
          h('div', { className: 'dps-busy', key: 'updating', role: 'status' }, t('batch.updating')),
        )
      }

      if (pending !== null && pending !== undefined) {
        parts.push(
          h(
            'div',
            { className: 'dps-confirm', key: 'confirm' },
            h('p', null, pending.message),
            h(
              'div',
              { className: 'dps-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dps-btn dps-danger',
                  disabled: running,
                  onClick: props.onConfirm,
                },
                t('batch.confirm'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dps-btn',
                  disabled: running,
                  onClick: props.onCancelConfirm,
                },
                t('batch.cancel'),
              ),
            ),
          ),
        )
      } else if (!hasSummary) {
        const targetOptions = targets.map((target) =>
          h(
            'option',
            {
              value: target.rootId,
              key: 'target-' + target.rootId,
              'data-target': target.rootId,
            },
            target.label,
          ),
        )
        parts.push(
          h(
            'div',
            { className: 'dps-actionbar-row', key: 'controls' },
            h('span', { className: 'dps-action-head' }, tf(t, 'selection.count', { count: count })),
            h(
              'select',
              {
                className: 'dps-select dps-action',
                value: '',
                'aria-label': t('batch.invocation'),
                'data-action': 'invocation',
                disabled: disabled,
                onChange: (event) => {
                  const value = event.target.value
                  if (value === '') return
                  const pieces = value.split(':')
                  props.onInvocation(pieces[0], pieces[1] === 'on')
                },
              },
              h('option', { value: '' }, t('batch.invocation')),
              h('option', { value: 'model:on' }, t('batch.modelOn')),
              h('option', { value: 'model:off' }, t('batch.modelOff')),
              h('option', { value: 'user:on' }, t('batch.userOn')),
              h('option', { value: 'user:off' }, t('batch.userOff')),
            ),
            h(
              'select',
              {
                className: 'dps-select dps-action',
                value: '',
                'aria-label': t('batch.move'),
                'data-action': 'move',
                title: targets.length === 0 ? t('batch.noTarget') : '',
                disabled: disabled || targets.length === 0,
                onChange: (event) => {
                  const value = event.target.value
                  if (value === '') return
                  props.onMove(value)
                },
              },
              h('option', { value: '' }, t('batch.move')),
              targetOptions,
            ),
            h(
              'select',
              {
                className: 'dps-select dps-action',
                value: '',
                'aria-label': t('batch.copy'),
                'data-action': 'copy',
                title: targets.length === 0 ? t('batch.noTarget') : '',
                disabled: disabled || targets.length === 0,
                onChange: (event) => {
                  const value = event.target.value
                  if (value === '') return
                  props.onCopy(value)
                },
              },
              h('option', { value: '' }, t('batch.copy')),
              targetOptions,
            ),
            h('span', { className: 'dps-spacer' }),
            h(
              'button',
              {
                type: 'button',
                className: 'dps-btn',
                disabled: disabled,
                onClick: props.onUpdate,
              },
              t('batch.update'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dps-btn dps-danger',
                disabled: disabled,
                onClick: props.onDelete,
              },
              t('batch.delete'),
            ),
          ),
        )
      }

      return h('div', { className: 'dps-actionbar', 'data-count': String(count) }, parts)
    }

    function ListView(props) {
      const t = props.t
      const data = props.data
      const loading = props.loading === true
      const error = props.error
      const filters =
        props.filters !== null && props.filters !== undefined ? props.filters : defaultFilters()
      const selecting = props.selecting === true
      const selection =
        props.selection !== null && props.selection !== undefined ? props.selection : {}
      const batch = props.batch
      const batchRunning = batch !== null && batch !== undefined && batch.running === true
      const busy = props.busy === true || batchRunning
      const [collapsed, setCollapsed] = React.useState({
        project: false,
        global: false,
      })
      const [warningOpen, setWarningOpen] = React.useState(false)
      // The filter chips are tall in a narrow sidebar, so they start folded
      // behind the "筛选" button and only open when the user asks for them.
      const [filterOpen, setFilterOpen] = React.useState(false)

      const active = filterActive(filters)
      const shown = filteredTiers(data, filters)
      let visibleTotal = 0
      for (const entry of shown) visibleTotal += entry.skills.length

      // Resolve the selection against the visible rows only: this keeps the
      // count honest during the render before the pruning effect runs.
      const selectedEntries = []
      for (const entry of shown) {
        for (const skill of entry.skills) {
          const entryRoot = skillRootId(skill, entry.rootId)
          if (selection[skillKey(skill, entryRoot)] === true) {
            selectedEntries.push({ skill: skill, rootId: entryRoot })
          }
        }
      }

      const counts =
        data !== null && data !== undefined && data.counts !== null && data.counts !== undefined
          ? data.counts
          : null
      const total = counts !== null && typeof counts.total === 'number' ? counts.total : null

      const checks = props.checks !== null && props.checks !== undefined ? props.checks : null
      const checking = checks !== null && checks.checking === true
      const updating = props.updating === true
      const bulkUpdate =
        props.bulkUpdate !== null && props.bulkUpdate !== undefined ? props.bulkUpdate : null
      const bulkRunning = bulkUpdate !== null && bulkUpdate.running === true
      const bulkDone = bulkRunning && typeof bulkUpdate.done === 'number' ? bulkUpdate.done : 0
      const bulkTotal = bulkRunning && typeof bulkUpdate.total === 'number' ? bulkUpdate.total : 0
      const checkResults = checks !== null && Array.isArray(checks.results) ? checks.results : []
      const checkCounts =
        checks !== null && checks.counts !== null && checks.counts !== undefined
          ? checks.counts
          : null
      // Latest check verdict by skill name: rows only need "update available?".
      const checkByName = {}
      for (const result of checkResults) {
        if (result !== null && typeof result === 'object' && typeof result.name === 'string') {
          checkByName[result.name] = result
        }
      }
      const checkIssues = checkResults.filter(
        (result) =>
          result !== null &&
          typeof result === 'object' &&
          (result.status === 'unknown' || result.status === 'failed' || result.error !== undefined),
      )

      // Source chips come from the lock files (list.upstreams) plus a local
      // bucket for skills that no CLI installed.
      const sourceChips = []
      if (data !== null && data !== undefined) {
        for (const upstream of Array.isArray(data.upstreams) ? data.upstreams : []) {
          if (upstream === null || typeof upstream !== 'object') continue
          if (typeof upstream.repo !== 'string' || upstream.repo === '') continue
          sourceChips.push({
            key: upstream.repo,
            label: shortRepo(upstream.repo) || upstream.repo,
            title: upstream.repo,
            count: typeof upstream.count === 'number' ? upstream.count : 0,
          })
        }
      }
      sourceChips.push({
        key: LOCAL_SOURCE_KEY,
        label: t('badge.local'),
        title: t('badge.local'),
        count: 0,
      })

      const toolbar = h(
        'div',
        { className: 'dps-toolbar' },
        h('span', { className: 'dps-title' }, t('list.title')),
        h(
          'div',
          { className: 'dps-tools' },
          h(
            'button',
            {
              type: 'button',
              className: 'dps-btn',
              'data-action': 'check',
              disabled: loading || busy || checking || data === null || total === 0,
              onClick: props.onCheck,
            },
            checking ? t('check.running') : t('check.button'),
          ),
          h(
            'button',
            {
              type: 'button',
              // Selection mode is a state, not the page's primary action: the
              // filled button belongs to "new skill" only.
              className: 'dps-btn',
              disabled: loading || busy || data === null || total === 0,
              onClick: props.onToggleSelecting,
            },
            selecting ? t('list.selectExit') : t('list.select'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dps-btn',
              disabled: loading || busy,
              onClick: props.onRefresh,
            },
            loading ? t('status.loading') : t('list.refresh'),
          ),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dps-btn dps-primary',
            disabled: data === null || loading || busy,
            onClick: props.onCreate,
          },
          t('list.new'),
        ),
      )

      const parts = [toolbar]

      if (error !== null && error !== undefined) {
        parts.push(
          h(ErrorBar, {
            key: 'error',
            t: t,
            error: error,
            onRetry: props.onRefresh,
          }),
        )
      }

      if (checks !== null) {
        if (checks.error !== null && checks.error !== undefined) {
          parts.push(
            h(ErrorBar, {
              key: 'check-error',
              t: t,
              error: checks.error,
              onRetry: props.onCheck,
              onDismiss: props.onDismissCheck,
            }),
          )
        } else if (checkCounts !== null) {
          const available =
            typeof checkCounts.available === 'number' ? checkCounts.available : 0
          const unknown = typeof checkCounts.unknown === 'number' ? checkCounts.unknown : 0
          const strip = [
            h(
              'span',
              { className: 'dps-check-text', key: 'text' },
              available > 0
                ? tf(t, 'check.available', { count: available })
                : t('check.uptodate'),
            ),
            unknown > 0
              ? h(
                  'span',
                  { className: 'dps-check-unknown', key: 'unknown' },
                  tf(t, 'check.unknown', { count: unknown }),
                )
              : null,
            available > 0
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dps-link',
                    key: 'update-all',
                    disabled: checking || updating === true || bulkRunning,
                    onClick: props.onUpdateAll,
                  },
                  bulkRunning
                    ? tf(t, 'check.updating', {
                        done: String(bulkDone),
                        total: String(bulkTotal),
                      })
                    : t('check.updateAll'),
                )
              : null,
            h('span', { className: 'dps-spacer', key: 'spacer' }),
            checkIssues.length > 0
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dps-link',
                    key: 'details',
                    onClick: props.onToggleCheckDetails,
                  },
                  checks.expanded === true ? t('check.collapse') : t('check.expand'),
                )
              : null,
          ]
          parts.push(
            h('div', { className: 'dps-check-strip', key: 'check-strip', role: 'status' }, strip),
          )
          if (checks.expanded === true && checkIssues.length > 0) {
            parts.push(
              h(
                'ul',
                { className: 'dps-check-details', key: 'check-details' },
                checkIssues.map((result, index) => {
                  const reason = failureReason(t, result.error)
                  return h(
                    'li',
                    { key: 'issue-' + String(index) },
                    reason === ''
                      ? result.name
                      : tf(t, 'check.reason', { name: result.name, reason: reason }),
                  )
                }),
              ),
            )
          }
        }
      }

      if (bulkUpdate !== null && bulkUpdate.running !== true) {
        const bulkSummary =
          bulkUpdate.summary !== null && typeof bulkUpdate.summary === 'object'
            ? bulkUpdate.summary
            : null
        const bulkFailed =
          Array.isArray(bulkUpdate.results) === true
            ? bulkUpdate.results.filter((result) => result.ok === false)
            : []
        if (bulkSummary !== null) {
          parts.push(
            h(
              'div',
              { className: 'dps-check-strip', key: 'bulk-strip', role: 'status' },
              h(
                'span',
                { className: 'dps-check-text' },
                tf(t, 'batch.result', {
                  succeeded: String(bulkSummary.succeeded),
                  failed: String(bulkSummary.failed),
                }),
              ),
              h('span', { className: 'dps-spacer' }),
              bulkFailed.length > 0
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'dps-link',
                      onClick: props.onToggleBulkDetails,
                    },
                    bulkUpdate.expanded === true ? t('batch.hide') : t('batch.view'),
                  )
                : null,
              h(
                'button',
                {
                  type: 'button',
                  className: 'dps-link',
                  onClick: props.onDismissBulk,
                },
                t('bulk.dismiss'),
              ),
            ),
          )
        }
        if (bulkUpdate.expanded === true && bulkFailed.length > 0) {
          parts.push(
            h(
              'ul',
              { className: 'dps-check-details', key: 'bulk-details' },
              bulkFailed.map((result, index) => {
                const reason = failureReason(t, result)
                return h(
                  'li',
                  { key: 'bulk-' + String(index) },
                  h(
                    'span',
                    null,
                    reason === ''
                      ? result.name
                      : tf(t, 'check.reason', { name: result.name, reason: reason }),
                  ),
                  typeof result.code === 'string' && result.code === 'LOCAL_CHANGES'
                    ? h(
                        'button',
                        {
                          type: 'button',
                          className: 'dps-link',
                          onClick: () => props.onForceBulk(result.name),
                        },
                        t('detail.forceYes'),
                      )
                    : null,
                )
              }),
            ),
          )
        }
      }

      if (data === null && loading) {
        parts.push(
          h(
            'div',
            { className: 'dps-skeleton', key: 'loading', 'aria-busy': 'true' },
            h('span', { className: 'dps-sr-only' }, t('status.loading')),
            [0, 1, 2].map((index) =>
              h(
                'div',
                { className: 'dps-skeleton-row', key: String(index) },
                h('span', { className: 'dps-skeleton-bar dps-skeleton-name' }),
                h('span', { className: 'dps-skeleton-bar dps-skeleton-desc' }),
              ),
            ),
          ),
        )
      }

      if (data !== null && data !== undefined) {
        const failures = Array.isArray(data.errors) ? data.errors : []
        if (failures.length > 0) {
          const warningHead = h(
            'div',
            { className: 'dps-warn-head' },
            h('span', null, tf(t, 'warning.parse', { count: failures.length })),
            h('span', { className: 'dps-spacer' }),
            h(
              'button',
              {
                type: 'button',
                className: 'dps-link',
                onClick: () => setWarningOpen((open) => !open),
              },
              warningOpen ? t('warning.collapse') : t('warning.expand'),
            ),
          )
          parts.push(
            h(
              'div',
              { className: 'dps-warn', key: 'warning', role: 'status' },
              warningHead,
              warningOpen
                ? h(
                    'ul',
                    { className: 'dps-warn-list' },
                    failures.map((failure, index) =>
                      h(
                        'li',
                        {
                          key: String(index),
                          title: typeof failure.path === 'string' ? failure.path : '',
                        },
                        (typeof failure.path === 'string' ? failure.path : '') +
                          (typeof failure.message === 'string' ? ': ' + failure.message : ''),
                      ),
                    ),
                  )
                : null,
            ),
          )
        }

        if (total !== 0) {
          const tierEntries = []
          if (Array.isArray(data.tiers)) {
            for (const tier of data.tiers) {
              if (tier === null || typeof tier !== 'object') continue
              tierEntries.push({ tier: tier, rootId: tierRootId(tier) })
            }
          }
          parts.push(
            h(FilterBar, {
              key: 'filters',
              t: t,
              filters: filters,
              tiers: tierEntries,
              sources: sourceChips,
              busy: loading || busy,
              queryValue: props.queryValue,
              onQueryChange: props.onQueryChange,
              onFiltersChange: props.onFiltersChange,
              onClear: props.onClearFilters,
              open: filterOpen,
              onToggleOpen: () => setFilterOpen((open) => !open),
            }),
          )
        }

        if (total === 0) {
          parts.push(
            h(
              'div',
              { className: 'dps-empty', key: 'empty' },
              h('p', { className: 'dps-empty-title' }, t('empty.title')),
              h('p', { className: 'dps-hint' }, t('empty.hint')),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dps-btn dps-primary',
                  onClick: props.onCreate,
                },
                t('empty.cta'),
              ),
            ),
          )
        } else if (rowFilterActive(filters) && visibleTotal === 0) {
          parts.push(
            h(
              'div',
              { className: 'dps-empty', key: 'filter-empty' },
              h('p', { className: 'dps-empty-title' }, t('filter.empty')),
              h('p', { className: 'dps-hint' }, t('filter.emptyHint')),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dps-btn',
                  onClick: props.onClearFilters,
                },
                t('filter.clear'),
              ),
            ),
          )
        } else {
          for (const entry of shown) {
            // A row filter is on: a tier with no matching row is noise. A tier
            // switched off by its chip is already absent from `shown`.
            if (rowFilterActive(filters) && entry.skills.length === 0) continue
            const rootId = entry.rootId
            const tier = entry.tier
            const isCollapsed = collapsed[rootId] === true
            const exists = tier.exists === true
            const writable = tier.writable === true
            const rank = typeof tier.rank === 'number' ? tier.rank : null
            const fullPath = typeof tier.path === 'string' ? tier.path : ''
            const marks = []
            if (!exists) marks.push(t('root.missing'))
            if (!writable) marks.push(t('root.readonly'))
            const allSelected =
              entry.skills.length > 0 &&
              entry.skills.every(
                (skill) =>
                  selection[skillKey(skill, skillRootId(skill, rootId))] === true,
              )
            const toggleCollapse = () =>
              setCollapsed((previous) => ({
                ...previous,
                [rootId]: !previous[rootId],
              }))

            const body = isCollapsed
              ? null
              : h(
                  'div',
                  { className: 'dps-group-body' },
                  marks.length === 0
                    ? null
                    : h(
                        'div',
                        {
                          className: 'dps-tier-meta',
                          key: 'meta',
                          title: fullPath,
                        },
                        h('span', {
                          className: 'dps-root-dot',
                          'data-tone': !exists ? 'missing' : 'readonly',
                          'aria-hidden': 'true',
                        }),
                        h('span', { className: 'dps-root-mark' }, marks.join(' \u00b7 ')),
                      ),
                  entry.skills.length === 0
                    ? h('p', { className: 'dps-hint' }, t('group.empty'))
                    : h(
                        'div',
                        { className: 'dps-rows' },
                        entry.skills.map((skill, skillIndex) => {
                          const rowRootId = skillRootId(skill, rootId)
                          const key = skillKey(skill, rowRootId)
                          const rowSelected = selecting && selection[key] === true
                          const upstream =
                            skill.upstream !== null && typeof skill.upstream === 'object'
                              ? skill.upstream
                              : null
                          const managedRepo =
                            upstream !== null &&
                            typeof upstream.repo === 'string' &&
                            upstream.repo !== ''
                          const sourceLabel = managedRepo ? shortRepo(upstream.repo) : t('badge.local')
                          const sourceTitle = managedRepo
                            ? upstream.repo +
                              (typeof upstream.skillPath === 'string' && upstream.skillPath !== ''
                                ? ' \u00b7 ' + upstream.skillPath
                                : '')
                            : t('badge.local')
                          const check = checkByName[skill.name]
                          const updateAvailable =
                            check !== undefined && check.status === 'update-available'
                          const activate = (event) => {
                            if (busy) return
                            if (selecting) {
                              props.onToggleSelect(skill, rowRootId, {
                                shift:
                                  event !== null &&
                                  event !== undefined &&
                                  event.shiftKey === true,
                              })
                            } else {
                              props.onOpenSkill(skill)
                            }
                          }
                          return h(
                            'div',
                            {
                              className: 'dps-row',
                              key: 'skill-' + String(skillIndex),
                              role: 'button',
                              tabIndex: busy ? -1 : 0,
                              'data-selected': String(rowSelected),
                              onClick: activate,
                              onDoubleClick: selecting
                                ? () => {
                                    if (!busy) props.onOpenSkill(skill)
                                  }
                                : undefined,
                              onKeyDown: (event) => {
                                const key0 = event.key
                                if (key0 !== 'Enter' && key0 !== ' ' && key0 !== 'Spacebar') return
                                if (typeof event.preventDefault === 'function') event.preventDefault()
                                activate()
                              },
                            },
                            selecting
                              ? h('input', {
                                  className: 'dps-check',
                                  type: 'checkbox',
                                  checked: rowSelected,
                                  disabled: busy,
                                  'aria-label': skill.name,
                                  onClick: (event) => {
                                    if (
                                      event !== null &&
                                      event !== undefined &&
                                      typeof event.stopPropagation === 'function'
                                    ) {
                                      event.stopPropagation()
                                    }
                                  },
                                  onChange: () => {
                                    if (!busy) props.onToggleSelect(skill, rootId)
                                  },
                                })
                              : null,
                            h(
                              'div',
                              { className: 'dps-row-main' },
                              h(
                                'span',
                                { className: 'dps-row-top' },
                                h(
                                  'span',
                                  { className: 'dps-name', title: skill.name },
                                  skill.name,
                                ),
                                h(
                                  'span',
                                  {
                                    className: 'dps-badge dps-badge-source',
                                    title: sourceTitle,
                                  },
                                  sourceLabel,
                                ),
                                skill.linked === true
                                  ? h(
                                      'span',
                                      {
                                        className: 'dps-badge dps-badge-link',
                                        title:
                                          typeof skill.realPath === 'string'
                                            ? skill.realPath
                                            : '',
                                      },
                                      t('badge.linked'),
                                    )
                                  : null,
                                updateAvailable
                                  ? h('span', {
                                      className: 'dps-update-dot',
                                      title:
                                        typeof check.upstreamHash === 'string' &&
                                        check.upstreamHash !== ''
                                          ? tf(t, 'badge.updateWithHash', {
                                              hash: shortHash(check.upstreamHash),
                                            })
                                          : t('badge.update'),
                                    })
                                  : null,
                                h(
                                  'span',
                                  { className: 'dps-flags' },
                                  h(Flag, {
                                    label: 'M',
                                    on: skill.modelInvocable === true,
                                    title:
                                      skill.modelInvocable === true
                                        ? t('flag.modelOn')
                                        : t('flag.modelOff'),
                                  }),
                                  h(Flag, {
                                    label: 'U',
                                    on: skill.userInvocable === true,
                                    title:
                                      skill.userInvocable === true
                                        ? t('flag.userOn')
                                        : t('flag.userOff'),
                                  }),
                                  h('span', {
                                    className: 'dps-row-caret',
                                    'aria-hidden': 'true',
                                  }),
                                ),
                              ),
                              typeof skill.description === 'string' && skill.description !== ''
                                ? h('span', { className: 'dps-desc' }, skill.description)
                                : null,
                              skill.shadowed === true
                                ? h(
                                    'span',
                                    {
                                      className: 'dps-shadow',
                                      title:
                                        skill.shadowedBy !== null &&
                                        skill.shadowedBy !== undefined &&
                                        typeof skill.shadowedBy.path === 'string'
                                          ? skill.shadowedBy.path
                                          : '',
                                    },
                                    tf(t, 'shadowed.by', {
                                      path: shadowLabel(t, skill.shadowedBy),
                                    }),
                                  )
                                : null,
                            ),
                          )
                        }),
                      ),
                )

            parts.push(
              h(
                'section',
                { className: 'dps-group', key: 'tier-' + rootId },
                h(
                  'div',
                  {
                    className: 'dps-group-head',
                    role: 'button',
                    tabIndex: 0,
                    'aria-expanded': String(!isCollapsed),
                    onClick: toggleCollapse,
                    onKeyDown: (event) => {
                      const key0 = event.key
                      if (key0 !== 'Enter' && key0 !== ' ' && key0 !== 'Spacebar') return
                      if (typeof event.preventDefault === 'function') event.preventDefault()
                      toggleCollapse()
                    },
                  },
                  h('span', {
                    className: 'dps-caret',
                    'data-open': String(!isCollapsed),
                    'aria-hidden': 'true',
                  }),
                  h(
                    'span',
                    {
                      className: 'dps-group-title',
                      title: fullPath,
                    },
                    rootLabel(t, { id: rootId }),
                  ),
                  h('span', { className: 'dps-count' }, String(entry.skills.length)),
                  h('span', { className: 'dps-spacer' }),
                  selecting
                    ? h(
                        'button',
                        {
                          type: 'button',
                          className: 'dps-select-all',
                          'data-tier': rootId,
                          disabled: busy || entry.skills.length === 0,
                          onClick: (event) => {
                            if (
                              event !== null &&
                              event !== undefined &&
                              typeof event.stopPropagation === 'function'
                            ) {
                              event.stopPropagation()
                            }
                            if (busy) return
                            props.onToggleTierSelect(
                              rootId,
                              entry.skills.map((skill) => ({
                                skill: skill,
                                rootId: skillRootId(skill, rootId),
                              })),
                            )
                          },
                        },
                        allSelected ? t('selection.noneInTier') : t('selection.allInTier'),
                      )
                    : null,
                  rank === null
                    ? null
                    : h(
                        'span',
                        { className: 'dps-rank', title: t('tier.priority') },
                        String(rank),
                      ),
                ),
                body,
              ),
            )
          }

          const missingRows = Array.isArray(data.missing) ? data.missing : []
          if (missingRows.length > 0) {
            parts.push(
              h(
                'section',
                { className: 'dps-group dps-group-missing', key: 'missing' },
                h(
                  'div',
                  { className: 'dps-group-head dps-missing-head' },
                  h('span', { className: 'dps-group-title' }, t('missing.title')),
                  h('span', { className: 'dps-count' }, String(missingRows.length)),
                  h('span', { className: 'dps-spacer' }),
                ),
                h(
                  'div',
                  { className: 'dps-group-body' },
                  h(
                    'div',
                    { className: 'dps-rows' },
                    missingRows.map((item, index) => {
                      const missing = item !== null && typeof item === 'object' ? item : {}
                      const upstream =
                        missing.upstream !== null && typeof missing.upstream === 'object'
                          ? missing.upstream
                          : null
                      const repo =
                        upstream !== null && typeof upstream.repo === 'string'
                          ? upstream.repo
                          : ''
                      return h(
                        'div',
                        {
                          className: 'dps-row dps-row-missing',
                          key: 'missing-' + String(index),
                          'data-missing': 'true',
                        },
                        h(
                          'div',
                          { className: 'dps-row-main' },
                          h(
                            'span',
                            { className: 'dps-row-top' },
                            h(
                              'span',
                              { className: 'dps-name', title: String(missing.name) },
                              String(missing.name),
                            ),
                            repo === ''
                              ? null
                              : h(
                                  'span',
                                  {
                                    className: 'dps-badge dps-badge-source',
                                    title:
                                      repo +
                                      (upstream !== null &&
                                      typeof upstream.skillPath === 'string' &&
                                      upstream.skillPath !== ''
                                        ? ' \u00b7 ' + upstream.skillPath
                                        : ''),
                                  },
                                  shortRepo(repo),
                                ),
                          ),
                          upstream !== null &&
                          typeof upstream.skillPath === 'string' &&
                          upstream.skillPath !== ''
                            ? h('span', { className: 'dps-desc' }, upstream.skillPath)
                            : null,
                        ),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'dps-btn',
                            disabled: busy || props.updating === true,
                            onClick: () => props.onInstall(item),
                          },
                          t('missing.install'),
                        ),
                      )
                    }),
                  ),
                ),
              ),
            )
          }
        }
      }

      if (selecting) {
        parts.push(
          h(SelectionBar, {
            key: 'selection',
            t: t,
            entries: selectedEntries,
            targets: props.targets,
            batch: batch,
            pending: props.pending,
            updating: props.updating,
            onInvocation: props.onInvocation,
            onMove: props.onMove,
            onCopy: props.onCopy,
            onUpdate: props.onUpdate,
            onDelete: props.onDelete,
            onConfirm: props.onConfirm,
            onCancelConfirm: props.onCancelConfirm,
            onToggleFailures: props.onToggleFailures,
            onExit: props.onExitSelection,
            onDismissError: props.onDismissBatchError,
          }),
        )
      }

      return h(
        'div',
        {
          className: 'dps-list',
          // The bottom action bar floats over the list while selection mode is
          // on, so the list reserves room for it instead of hiding its last row.
          'data-selecting': String(selecting),
          onKeyDown: (event) => {
            if (event.key !== 'Escape' || !selecting) return
            if (typeof event.preventDefault === 'function') event.preventDefault()
            props.onExitSelection()
          },
        },
        parts,
      )
    }

    function DetailView(props) {
      const t = props.t
      const skill = props.skill
      const detail = props.detail
      const busy = props.busy === true
      const [confirming, setConfirming] = React.useState(false)

      const loading = detail === null || detail === undefined || detail.loading === true
      const failure =
        detail !== null && detail !== undefined && detail.error !== undefined
          ? detail.error
          : null
      const content =
        detail !== null && detail !== undefined && typeof detail.content === 'string'
          ? detail.content
          : ''
      const path =
        detail !== null && detail !== undefined && typeof detail.path === 'string'
          ? detail.path
          : typeof skill.path === 'string'
            ? skill.path
            : ''
      const rootId =
        detail !== null && detail !== undefined && typeof detail.rootId === 'string'
          ? detail.rootId
          : skill.rootId
      const writable =
        detail !== null && typeof detail === 'object' ? detail.writable === true : false
      const mismatch =
        detail !== null && detail !== undefined ? detail.mismatch === true : false
      const modelOn =
        detail !== null && detail !== undefined
          ? detail.modelInvocable === true
          : skill.modelInvocable === true
      const userOn =
        detail !== null && detail !== undefined
          ? detail.userInvocable === true
          : skill.userInvocable === true

      // Source metadata lives on the row and is re-read with the detail so a
      // freshly updated skill shows its new hash without a list refresh.
      const [forceConfirm, setForceConfirm] = React.useState(false)
      const upstream =
        detail !== null &&
        detail !== undefined &&
        detail.upstream !== null &&
        detail.upstream !== undefined
          ? detail.upstream
          : skill.upstream !== null && skill.upstream !== undefined
            ? skill.upstream
            : null
      // Only the global tier's locks can be updated by this plugin, so a project
      // lock row shows its source but never a check/update action.
      const updatable =
        detail !== null && detail !== undefined && detail.updatable !== undefined
          ? detail.updatable === true
          : skill.updatable !== false
      const managed = upstream !== null && typeof upstream === 'object' && updatable
      const upstreamRepo = managed && typeof upstream.repo === 'string' ? upstream.repo : ''
      const upstreamPath = managed && typeof upstream.skillPath === 'string' ? upstream.skillPath : ''
      const upstreamHash = managed && typeof upstream.hash === 'string' ? upstream.hash : ''
      const installedAt = managed && typeof upstream.installedAt === 'string' ? upstream.installedAt : ''
      const updatedAt = managed && typeof upstream.updatedAt === 'string' ? upstream.updatedAt : ''
      const checkResult = props.checkResult
      const checkStatus =
        checkResult !== null && checkResult !== undefined ? checkResult.status : null
      const checking = props.checking === true
      const updating = props.updating === true
      const updateFailure = props.updateError
      const localChanges =
        updateFailure !== null &&
        updateFailure !== undefined &&
        updateFailure.code === 'LOCAL_CHANGES'

      const sourceRow = (key, label, value, mono) =>
        h(
          'div',
          { className: 'dps-source-row', key: key },
          h('span', { className: 'dps-source-key' }, label),
          h(
            'span',
            {
              className: mono ? 'dps-source-value dps-mono' : 'dps-source-value',
              title: value,
            },
            value,
          ),
        )

      const sourceRows = []
      if (upstreamRepo !== '') sourceRows.push(sourceRow('repo', t('detail.sourceRepo'), upstreamRepo))
      if (upstreamPath !== '') sourceRows.push(sourceRow('path', t('detail.sourcePath'), upstreamPath, true))
      if (installedAt !== '')
        sourceRows.push(sourceRow('installed', t('detail.sourceInstalled'), formatWhen(installedAt)))
      if (updatedAt !== '')
        sourceRows.push(sourceRow('updated', t('detail.sourceUpdated'), formatWhen(updatedAt)))
      if (upstreamHash !== '')
        sourceRows.push(sourceRow('hash', t('detail.sourceHash'), shortHash(upstreamHash), true))

      let checkLine = null
      if (checkStatus === 'update-available') {
        checkLine = h('p', { className: 'dps-hint dps-check-line' }, t('detail.checkAvailable'))
      } else if (checkStatus === 'up-to-date') {
        checkLine = h('p', { className: 'dps-hint dps-check-line' }, t('detail.checkUptodate'))
      } else if (checkStatus === 'unknown') {
        checkLine = h(
          'p',
          { className: 'dps-hint dps-check-line' },
          tf(t, 'detail.checkUnknown', {
            reason: failureReason(t, checkResult.error) || t('check.reasonUnknown'),
          }),
        )
      }

      const sourceActions = []
      if (managed) {
        sourceActions.push(
          h(
            'button',
            {
              type: 'button',
              className: 'dps-btn',
              key: 'check-skill',
              disabled: checking || updating || busy || loading,
              onClick: () => props.onCheckSkill(skill.name),
            },
            checking ? t('check.running') : t('detail.checkUpdate'),
          ),
        )
        sourceActions.push(
          h(
            'button',
            {
              type: 'button',
              className: 'dps-btn dps-primary',
              key: 'update-skill',
              disabled: updating || checking || busy || loading,
              onClick: () => {
                setForceConfirm(false)
                props.onUpdateSkill(skill)
              },
            },
            updating ? t('detail.updating') : t('detail.update'),
          ),
        )
      }

      let updateBlock = null
      if (localChanges) {
        updateBlock = h(
          'div',
          { className: 'dps-confirm dps-force-confirm' },
          h(
            'p',
            null,
            forceConfirm
              ? t('detail.forceConfirm')
              : failureReason(t, updateFailure) || t('detail.updateFailed'),
          ),
          forceConfirm
            ? h(
                'div',
                { className: 'dps-actions' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dps-btn dps-danger',
                    disabled: updating,
                    onClick: () => {
                      setForceConfirm(false)
                      props.onUpdateSkill(skill, true)
                    },
                  },
                  t('detail.forceYes'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dps-btn',
                    disabled: updating,
                    onClick: () => setForceConfirm(false),
                  },
                  t('detail.forceCancel'),
                ),
              )
            : h(
                'div',
                { className: 'dps-actions' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dps-btn dps-danger',
                    disabled: updating,
                    onClick: () => setForceConfirm(true),
                  },
                  t('detail.forceYes'),
                ),
              ),
        )
      } else if (updateFailure !== null && updateFailure !== undefined) {
        updateBlock = h(ErrorBar, { t: t, error: updateFailure, onDismiss: props.onDismissUpdate })
      }

      const sourceSection = h(
        'div',
        { className: 'dps-section' },
        h('div', { className: 'dps-section-title' }, t('detail.source')),
        managed
          ? h('div', { className: 'dps-source' }, sourceRows)
          : h('p', { className: 'dps-hint' }, t('detail.sourceLocal')),
        managed ? checkLine : null,
        managed ? h('div', { className: 'dps-actions' }, sourceActions) : null,
        updateBlock,
      )

      const toolbar = h(
        'div',
        { className: 'dps-toolbar' },
        h(
          'button',
          { type: 'button', className: 'dps-btn', onClick: props.onBack },
          t('detail.back'),
        ),
        h('span', { className: 'dps-spacer' }),
        h(
          'button',
          {
            type: 'button',
            className: 'dps-btn',
            disabled: loading || !writable || mismatch || busy,
            onClick: props.onEdit,
          },
          t('detail.edit'),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dps-btn dps-danger',
            disabled: loading || !writable || busy,
            onClick: () => setConfirming(true),
          },
          t('detail.delete'),
        ),
      )

      const meta = h(
        'div',
        { className: 'dps-detail-meta' },
        typeof skill.source === 'string'
          ? h('span', { className: 'dps-badge' }, skill.source)
          : null,
        skill.linked === true
          ? h('span', { className: 'dps-badge dps-badge-link' }, t('badge.linked'))
          : null,
        h('code', { className: 'dps-mono', title: path }, path),
        !writable && detail !== null && detail !== undefined
          ? h('span', { className: 'dps-hint' }, t('root.readonly'))
          : null,
      )

      const toggles = h(
        'div',
        { className: 'dps-invoc' },
        h(
          'div',
          { className: 'dps-invoc-row' },
          h('span', null, t('detail.modelInvocable')),
          h(
            'button',
            {
              type: 'button',
              role: 'switch',
              'aria-checked': String(modelOn),
              'aria-label': t('detail.modelInvocable'),
              className: 'dps-switch',
              'data-on': String(modelOn),
              disabled: loading || !writable || busy,
              onClick: () => props.onToggle('model', !modelOn),
            },
          ),
        ),
        h(
          'div',
          { className: 'dps-invoc-row' },
          h('span', null, t('detail.userInvocable')),
          h(
            'button',
            {
              type: 'button',
              role: 'switch',
              'aria-checked': String(userOn),
              'aria-label': t('detail.userInvocable'),
              className: 'dps-switch',
              'data-on': String(userOn),
              disabled: loading || !writable || busy,
              onClick: () => props.onToggle('user', !userOn),
            },
          ),
        ),
      )

      let bodyNode
      if (loading) {
        bodyNode = h('p', { className: 'dps-hint' }, t('status.loading'))
      } else if (failure !== null) {
        bodyNode = h(ErrorBar, { t: t, error: failure })
      } else {
        bodyNode = h('pre', { className: 'dps-body' }, content)
      }

      return h(
        'div',
        { className: 'dps-detail' },
        toolbar,
        h('h2', { className: 'dps-detail-name' }, skill.name),
        meta,
        detail !== null && detail !== undefined && detail.linked === true && typeof detail.realPath === 'string'
          ? h('p', { className: 'dps-hint' }, tf(t, 'detail.linked', { path: detail.realPath }))
          : null,
        mismatch && path !== ''
          ? h('p', { className: 'dps-hint' }, tf(t, 'detail.mismatch', { path: path }))
          : null,
        toggles,
        sourceSection,
        h(
          'div',
          { className: 'dps-section' },
          h('div', { className: 'dps-section-title' }, t('detail.content')),
          bodyNode,
        ),
        confirming
          ? h(
              'div',
              { className: 'dps-confirm' },
              h(
                'p',
                null,
                detail !== null && detail !== undefined && detail.linked === true
                  ? tf(t, 'confirm.deleteLinked', {
                      path: typeof detail.realPath === 'string' ? detail.realPath : '',
                    })
                  : tf(t, 'confirm.delete', { name: skill.name }),
              ),
              h(
                'div',
                { className: 'dps-actions' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dps-btn dps-danger',
                    disabled: busy,
                    onClick: () => {
                      setConfirming(false)
                      props.onDelete()
                    },
                  },
                  detail !== null && detail !== undefined && detail.linked === true
                    ? t('confirm.unlinkYes')
                    : t('confirm.deleteYes'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dps-btn',
                    disabled: busy,
                    onClick: () => setConfirming(false),
                  },
                  t('confirm.cancel'),
                ),
              ),
            )
          : null,
      )
    }

    function EditView(props) {
      const t = props.t
      const edit = props.edit
      const saving = edit.saving === true
      const failure = edit.error !== undefined ? edit.error : null

      return h(
        'div',
        { className: 'dps-edit' },
        h(
          'div',
          { className: 'dps-toolbar' },
          h('span', { className: 'dps-title' }, tf(t, 'edit.title', { name: edit.skill.name })),
          h('span', { className: 'dps-spacer' }),
          h(
            'button',
            {
              type: 'button',
              className: 'dps-btn',
              disabled: saving,
              onClick: props.onCancel,
            },
            t('edit.cancel'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dps-btn dps-primary',
              disabled: saving,
              onClick: props.onSave,
            },
            saving ? t('edit.saving') : t('edit.save'),
          ),
        ),
        saving ? h('p', { className: 'dps-hint' }, t('edit.saving')) : null,
        failure !== null ? h(ErrorBar, { t: t, error: failure }) : null,
        h('p', { className: 'dps-hint' }, t('edit.hint')),
        h('textarea', {
          className: 'dps-editor',
          value: edit.draft,
          spellCheck: false,
          'aria-label': t('edit.content'),
          disabled: saving,
          onChange: (event) => props.onChangeDraft(event.target.value),
        }),
      )
    }

    function CreateView(props) {
      const t = props.t
      const create = props.create
      const roots = Array.isArray(props.roots) ? props.roots : []
      const creating = create.creating === true
      const failure = create.error !== undefined ? create.error : null
      const name = typeof create.name === 'string' ? create.name : ''
      const description = typeof create.description === 'string' ? create.description : ''
      const nameInvalid = name !== '' && !isKebabCase(name)
      const showNameInvalid = create.nameTouched === true && name !== '' && !isKebabCase(name)
      const canSubmit =
        !creating &&
        roots.length > 0 &&
        typeof create.rootId === 'string' &&
        create.rootId !== '' &&
        isKebabCase(name) &&
        description.trim() !== ''

      return h(
        'div',
        { className: 'dps-create' },
        h(
          'div',
          { className: 'dps-toolbar' },
          h('span', { className: 'dps-title' }, t('create.title')),
          h('span', { className: 'dps-spacer' }),
          h(
            'button',
            {
              type: 'button',
              className: 'dps-btn',
              disabled: creating,
              onClick: props.onCancel,
            },
            t('create.cancel'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dps-btn dps-primary',
              disabled: !canSubmit,
              onClick: props.onSubmit,
            },
            creating ? t('create.creating') : t('create.submit'),
          ),
        ),
        creating ? h('p', { className: 'dps-hint' }, t('create.creating')) : null,
        failure !== null ? h(ErrorBar, { t: t, error: failure }) : null,
        roots.length === 0
          ? h('p', { className: 'dps-hint' }, t('create.noRoots'))
          : h(
              Fragment,
              null,
              h(
                'label',
                { className: 'dps-field' },
                h('span', { className: 'dps-label' }, t('create.root')),
                h(
                  'select',
                  {
                    className: 'dps-select',
                    value: create.rootId,
                    disabled: creating,
                    onChange: (event) => props.onChange({ rootId: event.target.value }),
                  },
                  roots.map((root) =>
                    h('option', { key: root.id, value: root.id }, rootLabel(t, root)),
                  ),
                ),
                h(
                  'span',
                  { className: 'dps-field-note', title: createRootPath(roots, create.rootId) },
                  createRootPath(roots, create.rootId),
                ),
              ),
              h(
                'label',
                { className: 'dps-field' },
                h('span', { className: 'dps-label' }, t('create.name')),
                h('input', {
                  className: 'dps-input',
                  type: 'text',
                  value: name,
                  spellCheck: false,
                  placeholder: t('create.namePlaceholder'),
                  disabled: creating,
                  'aria-invalid': String(nameInvalid),
                  onChange: (event) => props.onChange({ name: event.target.value }),
                  onBlur: () => props.onChange({ nameTouched: true }),
                }),
                showNameInvalid
                  ? h('span', { className: 'dps-invalid' }, t('create.nameInvalid'))
                  : null,
              ),
              h(
                'label',
                { className: 'dps-field' },
                h('span', { className: 'dps-label' }, t('create.description')),
                h('input', {
                  className: 'dps-input',
                  type: 'text',
                  value: description,
                  spellCheck: false,
                  placeholder: t('create.descriptionPlaceholder'),
                  disabled: creating,
                  onChange: (event) => props.onChange({ description: event.target.value }),
                }),
              ),
            ),
      )
    }

    /* ------------------------------------------------------------------ *
     * Panel (single state machine: list | detail | edit | create)          *
     * ------------------------------------------------------------------ */

    function SkillsPanel(props) {
      const t = pickTranslate(props)
      const tabInfo = readTabInfo(props)
      const tabSignal =
        tabInfo !== null && tabInfo !== undefined && tabInfo.tab !== null && tabInfo.tab !== undefined
          ? tabInfo.tab.signal
          : undefined
      const sessionId = pickSessionId(props, tabInfo)

      const aliveRef = React.useRef(true)
      const abortRef = React.useRef(undefined)
      if (abortRef.current === undefined) abortRef.current = new AbortController()

      const api = React.useMemo(() => createApi(sessionId), [sessionId])

      const [phase, setPhase] = React.useState({ name: 'list' })
      const [listState, setListState] = React.useState({
        data: null,
        loading: sessionId !== undefined,
        error: null,
      })
      const [detailState, setDetailState] = React.useState(null)
      const [editState, setEditState] = React.useState(null)
      const [createState, setCreateState] = React.useState(null)
      const [actionError, setActionError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)

      // Filters: `queryDraft` feeds the input immediately while `filters.query`
      // follows 120 ms later, so typing stays responsive without filtering on
      // every keystroke.
      const [queryDraft, setQueryDraft] = React.useState('')
      const [filters, setFilters] = React.useState(defaultFilters)
      const queryTimerRef = React.useRef(undefined)

      // Selection mode: a plain map keyed by `rootId::name`.
      const [selecting, setSelecting] = React.useState(false)
      const [selection, setSelection] = React.useState({})
      const [pending, setPending] = React.useState(null)
      const [batch, setBatch] = React.useState(null)

      // Update check: `checks` is null until a check runs. `updating` covers
      // both the detail button and the selection action so every control can
      // disable while a download is in flight. `updateError` belongs to the
      // open detail only (LOCAL_CHANGES drives the force confirm).
      const [checks, setChecks] = React.useState(null)
      const [updating, setUpdating] = React.useState(false)
      const [updateError, setUpdateError] = React.useState(null)

      React.useEffect(() => {
        aliveRef.current = true
        return () => {
          aliveRef.current = false
        }
      }, [])

      React.useEffect(() => {
        return () => {
          const controller = abortRef.current
          if (controller !== undefined && controller !== null) {
            try {
              if (!controller.signal.aborted) controller.abort()
            } catch (error) {
              /* ignore */
            }
          }
        }
      }, [])

      // Follow the tab lifetime so a fetch cannot outlive the pane.
      React.useEffect(() => {
        if (tabSignal === undefined || tabSignal === null) return undefined
        if (typeof tabSignal.addEventListener !== 'function') return undefined
        const controller = abortRef.current
        const onAbort = () => {
          try {
            if (!controller.signal.aborted) controller.abort()
          } catch (error) {
            /* ignore */
          }
        }
        if (tabSignal.aborted === true) {
          onAbort()
          return undefined
        }
        tabSignal.addEventListener('abort', onAbort)
        return () => {
          if (typeof tabSignal.removeEventListener === 'function') {
            tabSignal.removeEventListener('abort', onAbort)
          }
        }
      }, [tabSignal])

      const loadList = React.useCallback(async () => {
        if (sessionId === undefined) return
        setListState((previous) => ({
          data: previous.data,
          loading: true,
          error: null,
        }))
        try {
          const data = await api.list(abortRef.current.signal)
          if (!aliveRef.current) return
          setListState({ data: data, loading: false, error: null })
        } catch (error) {
          const failure = toFailure(error)
          if (failure === null || !aliveRef.current) return
          setListState((previous) => ({
            data: previous.data,
            loading: false,
            error: failure,
          }))
        }
      }, [api, sessionId])

      React.useEffect(() => {
        if (sessionId === undefined) return
        loadList()
      }, [sessionId, loadList])

      // Switching sessions invalidates every row, detail and pending edit: without
      // this reset an open detail would keep showing session A's skill while its
      // delete/update posts to session B.
      const previousSessionRef = React.useRef(sessionId)
      React.useEffect(() => {
        if (previousSessionRef.current === sessionId) return
        previousSessionRef.current = sessionId
        abortRef.current.abort()
        abortRef.current = new AbortController()
        setPhase({ name: 'list' })
        setDetailState(null)
        setEditState(null)
        setCreateState(null)
        setActionError(null)
        setSelecting(false)
        setSelection({})
        setPending(null)
        setBatch(null)
        setChecks(null)
        setUpdateError(null)
        setBusy(false)
      }, [sessionId])

      // Clear a pending search timer when the panel unmounts.
      React.useEffect(
        () => () => {
          if (queryTimerRef.current !== undefined) {
            clearTimeout(queryTimerRef.current)
            queryTimerRef.current = undefined
          }
        },
        [],
      )

      // The tiers and rows the current filters leave visible. The selection is
      // pruned against this view whenever the filters change.
      const shownTiers = React.useMemo(
        () => filteredTiers(listState.data, filters),
        [listState.data, filters],
      )

      const visibleSelection = React.useMemo(
        () => visibleSelectionKeys(shownTiers),
        [shownTiers],
      )

      React.useEffect(() => {
        const keys = Object.keys(selection)
        if (keys.length === 0) return
        let changed = false
        const next = {}
        for (const key of keys) {
          if (visibleSelection[key] === true) next[key] = true
          else changed = true
        }
        if (!changed) return
        setSelection(next)
      }, [selection, visibleSelection])

      // Flat visible row order: shift ranges follow this list, across groups,
      // and ignore whether a group happens to be collapsed.
      const visibleOrder = React.useMemo(() => {
        const order = []
        for (const entry of shownTiers) {
          for (const skill of entry.skills) {
            order.push({
              skill: skill,
              rootId: entry.rootId,
              key: skillKey(skill, entry.rootId),
            })
          }
        }
        return order
      }, [shownTiers])

      const anchorRef = React.useRef(undefined)

      const chosenEntries = React.useMemo(
        () => selectedSkillEntries(listState.data, selection),
        [listState.data, selection],
      )

      // Every writable tier is a legal target. A row that already lives in the
      // target tier stays selectable: the item is still sent and the host
      // rejects it with INVALID_TARGET, so the client does not pre-filter.
      const transferTargets = React.useMemo(() => {        const targets = []
        const tiers =
          listState.data !== null &&
          listState.data !== undefined &&
          Array.isArray(listState.data.tiers)
            ? listState.data.tiers
            : []
        for (const tier of tiers) {
          if (tier === null || typeof tier !== 'object') continue
          if (tier.writable !== true) continue
          const rootId = tierRootId(tier)
          targets.push({ rootId: rootId, label: rootLabel(t, { id: rootId }) })
        }
        return targets
      }, [listState.data, t])

      // Check verdict by skill name, used by rows and by the open detail.
      const checkByName = React.useMemo(() => {
        const map = {}
        if (checks === null || checks === undefined || !Array.isArray(checks.results)) return map
        for (const result of checks.results) {
          if (
            result !== null &&
            typeof result === 'object' &&
            typeof result.name === 'string'
          ) {
            map[result.name] = result
          }
        }
        return map
      }, [checks])

      const exitSelection = React.useCallback(() => {
        // Never drop the panel while a batch is in flight: its result would be
        // lost and the user could not read partial failures.
        if (batch !== null && batch !== undefined && batch.running === true) return
        setSelecting(false)
        setSelection({})
        setPending(null)
        setBatch(null)
        anchorRef.current = undefined
      }, [batch])

      const toggleSelecting = React.useCallback(() => {
        if (selecting) {
          exitSelection()
          return
        }
        setActionError(null)
        setSelection({})
        setPending(null)
        setBatch(null)
        anchorRef.current = undefined
        setSelecting(true)
      }, [exitSelection, selecting])

      const toggleSkill = React.useCallback(
        (skill, rootId, options) => {
          const key = skillKey(skill, rootId)
          const shift =
            options !== null && options !== undefined && options.shift === true
          const anchor = anchorRef.current
          if (shift && typeof anchor === 'string') {
            const from = visibleOrder.findIndex((item) => item.key === anchor)
            const to = visibleOrder.findIndex((item) => item.key === key)
            if (from >= 0 && to >= 0) {
              const start = Math.min(from, to)
              const end = Math.max(from, to)
              setSelection((previous) => {
                const next = { ...previous }
                for (let index = start; index <= end; index += 1) {
                  next[visibleOrder[index].key] = true
                }
                return next
              })
              return
            }
          }
          anchorRef.current = key
          setSelection((previous) => {
            const next = { ...previous }
            if (next[key] === true) delete next[key]
            else next[key] = true
            return next
          })
        },
        [visibleOrder],
      )

      const toggleTier = React.useCallback((rootId, items) => {
        const visible = Array.isArray(items) ? items : []
        if (visible.length === 0) return
        setSelection((previous) => {
          const next = { ...previous }
          const everySelected = visible.every(
            (item) => next[skillKey(item.skill, skillRootId(item.skill, item.rootId ?? rootId))] === true,
          )
          for (const item of visible) {
            const key = skillKey(item.skill, skillRootId(item.skill, item.rootId ?? rootId))
            if (everySelected) delete next[key]
            else next[key] = true
          }
          return next
        })
      }, [])

      const changeQuery = React.useCallback((value) => {
        const next = typeof value === 'string' ? value : ''
        setQueryDraft(next)
        if (queryTimerRef.current !== undefined) clearTimeout(queryTimerRef.current)
        queryTimerRef.current = setTimeout(() => {
          queryTimerRef.current = undefined
          setFilters((previous) => ({ ...previous, query: next }))
        }, 120)
      }, [])

      const changeFilters = React.useCallback((next) => {
        setFilters(next !== null && next !== undefined ? next : defaultFilters())
      }, [])

      const clearFilters = React.useCallback(() => {
        if (queryTimerRef.current !== undefined) {
          clearTimeout(queryTimerRef.current)
          queryTimerRef.current = undefined
        }
        setQueryDraft('')
        setFilters(defaultFilters())
      }, [])

      const runBatch = React.useCallback(
        async (payload) => {
          const entries = selectedSkillEntries(listState.data, selection)
          if (entries.length === 0) return
          const items = entries.map((entry) => ({
            name: entry.skill.name,
            rootId: entry.rootId,
          }))
          setActionError(null)
          setPending(null)
          setBatch({ running: true, summary: null, results: [], error: null, expanded: false })
          try {
            const result = await api.batch({ ...payload, items: items }, abortRef.current.signal)
            if (!aliveRef.current) return
            const summary =
              result.summary !== null && result.summary !== undefined
                ? result.summary
                : { total: items.length, succeeded: items.length, failed: 0 }
            setBatch({
              running: false,
              summary: summary,
              results: Array.isArray(result.results) ? result.results : [],
              error: null,
              expanded: false,
            })
            setSelection({})
            anchorRef.current = undefined
            // Deleting or moving rows makes the previous update verdicts stale, and
            // verdicts are keyed by name so a re-created skill would inherit a dot.
            if (payload.action === 'delete' || payload.action === 'transfer') setChecks(null)
            await loadList()
          } catch (error) {
            const failure = toFailure(error)
            if (failure === null || !aliveRef.current) return
            setBatch({
              running: false,
              summary: null,
              results: [],
              error: failure,
              expanded: false,
            })
          }
        },
        [api, listState.data, selection, loadList],
      )

      const beginDelete = React.useCallback(() => {
        if (chosenEntries.length === 0) return
        let linked = 0
        for (const entry of chosenEntries) {
          if (entry.skill.linked === true) linked += 1
        }
        const message =
          linked > 0
            ? tf(t, 'batch.confirmDeleteLinked', {
                count: chosenEntries.length,
                linked: linked,
              })
            : tf(t, 'batch.confirmDelete', { count: chosenEntries.length })
        setPending({ action: 'delete', message: message, payload: { action: 'delete' } })
      }, [chosenEntries, t])

      const beginTransfer = React.useCallback(
        (kind, rootId) => {
          if (chosenEntries.length === 0) return
          const targetLabel = rootLabel(t, { id: rootId })
          const message =
            kind === 'move'
              ? tf(t, 'batch.confirmMove', {
                  count: chosenEntries.length,
                  to: targetLabel,
                })
              : tf(t, 'batch.confirmCopy', {
                  count: chosenEntries.length,
                  to: targetLabel,
                })
          setPending({
            action: kind,
            message: message,
            payload: {
              action: 'transfer',
              transferMode: kind === 'move' ? 'move' : 'copy',
              conflict: 'skip',
              target: { rootId: rootId },
            },
          })
        },
        [chosenEntries, t],
      )

      const confirmPending = React.useCallback(() => {
        const current = pending
        if (current === null || current === undefined) return
        setPending(null)
        runBatch(current.payload)
      }, [pending, runBatch])

      const cancelPending = React.useCallback(() => {
        setPending(null)
      }, [])

      const runInvocation = React.useCallback(
        (field, value) => {
          if (field !== 'model' && field !== 'user') return
          runBatch({
            action: 'invocation',
            invocation: { field: field, value: value === true },
          })
        },
        [runBatch],
      )

      const toggleFailures = React.useCallback(() => {
        setBatch((previous) =>
          previous === null || previous === undefined
            ? previous
            : { ...previous, expanded: previous.expanded !== true },
        )
      }, [])

      const dismissBatchError = React.useCallback(() => {
        setBatch((previous) =>
          previous === null || previous === undefined
            ? previous
            : { ...previous, error: null },
        )
      }, [])

      const resetViews = () => {
        setDetailState(null)
        setEditState(null)
        setCreateState(null)
      }

      const backToList = React.useCallback(() => {
        setPhase({ name: 'list' })
        setActionError(null)
        setUpdateError(null)
        resetViews()
        loadList()
      }, [loadList])

      const openDetail = React.useCallback(
        async (skill) => {
          // The row's own root travels with the read, so a shadowed duplicate
          // shows its own file and can be edited in place. `mismatch` stays as a
          // defensive flag for hosts that ignore the rootId hint.
          const rowRoot = findRootInfo(listState.data, skill.rootId)
          const rowWritable =
            rowRoot !== null && rowRoot !== undefined ? rowRoot.writable === true : undefined
          setActionError(null)
          // Opening a skill from selection mode leaves selection mode behind.
          setSelecting(false)
          setSelection({})
          setPending(null)
          setBatch(null)
          setUpdateError(null)
          anchorRef.current = undefined
          setPhase({ name: 'detail', skill: skill })
          setDetailState({
            loading: true,
            error: null,
            content: '',
            path: typeof skill.path === 'string' ? skill.path : '',
            rootId: skill.rootId,
            readRootId: skill.rootId,
            writable: false,
            linked: skill.linked === true,
            realPath: typeof skill.realPath === 'string' ? skill.realPath : '',
            modelInvocable: skill.modelInvocable === true,
            userInvocable: skill.userInvocable === true,
            mismatch: false,
          })
          try {
            const result = await api.read(skill.name, skill.rootId, abortRef.current.signal)
            if (!aliveRef.current) return
            const mismatch = result.rootId !== skill.rootId
            setDetailState({
              loading: false,
              error: null,
              content: typeof result.content === 'string' ? result.content : '',
              path:
                typeof result.path === 'string'
                  ? result.path
                  : typeof skill.path === 'string'
                    ? skill.path
                    : '',
              rootId: skill.rootId,
              readRootId: result.rootId,
              writable: mismatch ? rowWritable === true : result.writable === true,
              linked: result.linked === true || skill.linked === true,
              realPath:
                typeof result.realPath === 'string'
                  ? result.realPath
                  : typeof skill.realPath === 'string'
                    ? skill.realPath
                    : '',
              modelInvocable: skill.modelInvocable === true,
              userInvocable: skill.userInvocable === true,
              mismatch: mismatch,
            })
          } catch (error) {
            const failure = toFailure(error)
            if (failure === null || !aliveRef.current) return
            setDetailState((previous) =>
              previous === null
                ? previous
                : { ...previous, loading: false, error: failure },
            )
          }
        },
        [api, listState.data],
      )

      // ---- skills-CLI source: check updates / update -------------------

      const runCheck = React.useCallback(
        async (names) => {
          const scoped = Array.isArray(names) ? names.filter((name) => typeof name === 'string') : []
          setChecks((previous) =>
            previous === null || previous === undefined
              ? { checking: true, results: [], counts: null, error: null, expanded: false }
              : { ...previous, checking: true, error: null },
          )
          try {
            const payload = scoped.length > 0 ? { names: scoped } : {}
            const result = await api.checkUpdates(payload, abortRef.current.signal)
            if (!aliveRef.current) return
            setChecks((previous) => ({
              checking: false,
              checkedAt: typeof result.checkedAt === 'string' ? result.checkedAt : null,
              results: Array.isArray(result.results) ? result.results : [],
              counts:
                result.counts !== null && result.counts !== undefined ? result.counts : null,
              error: null,
              expanded:
                previous !== null && previous !== undefined && previous.expanded === true,
            }))
          } catch (error) {
            const failure = toFailure(error)
            if (failure === null || !aliveRef.current) return
            setChecks((previous) => {
              const base =
                previous === null || previous === undefined
                  ? { checking: false, results: [], counts: null, expanded: false }
                  : previous
              return { ...base, checking: false, error: failure }
            })
          }
        },
        [api],
      )

      const toggleCheckDetails = React.useCallback(() => {
        setChecks((previous) =>
          previous === null || previous === undefined
            ? previous
            : { ...previous, expanded: previous.expanded !== true },
        )
      }, [])

      const dismissCheck = React.useCallback(() => {
        setChecks(null)
      }, [])

      // Shared by the detail button, the missing row and the selection bar.
      // Returns the first result so a detail update can distinguish
      // LOCAL_CHANGES (offer force) from a hard failure.
      const updateItems = React.useCallback(
        async (items, force) => {
          if (!Array.isArray(items) || items.length === 0) return null
          setUpdating(true)
          setUpdateError(null)
          try {
            const payload = { items: items }
            if (force === true) payload.force = true
            const result = await api.updateSkills(payload, abortRef.current.signal)
            if (!aliveRef.current) return null
            const results = Array.isArray(result.results) ? result.results : []
            await loadList()
            setChecks(null)
            return {
              results: results,
              counts:
                result.counts !== null && result.counts !== undefined ? result.counts : null,
            }
          } catch (error) {
            const failure = toFailure(error)
            if (failure === null || !aliveRef.current) return null
            setUpdateError(failure)
            return null
          } finally {
            if (aliveRef.current) setUpdating(false)
          }
        },
        [api, loadList],
      )

      const runUpdateSkill = React.useCallback(
        async (skill, force) => {
          if (phase.name !== 'detail' || detailState === null) return
          const rootId = detailState.rootId
          const outcome = await updateItems(
            [{ name: skill.name, rootId: rootId }],
            force === true,
          )
          if (outcome === null || !aliveRef.current) return
          const first = outcome.results.length > 0 ? outcome.results[0] : null
          if (first !== null && first.ok === true) {
            setUpdateError(null)
            // Re-read the row so the detail shows the new content and hash.
            await openDetail({ ...skill, rootId: rootId })
            return
          }
          if (first !== null && first.ok === false) {
            setUpdateError(
              new PanelError(
                typeof first.code === 'string' ? first.code : 'UPDATE_FAILED',
                typeof first.message === 'string' ? first.message : t('detail.updateFailed'),
              ),
            )
          }
        },
        [detailState, openDetail, phase.name, t, updateItems],
      )

      const runUpdateSelected = React.useCallback(async () => {
        const entries = selectedSkillEntries(listState.data, selection)
        if (entries.length === 0) return
        setActionError(null)
        const items = entries.map((entry) => ({
          name: entry.skill.name,
          rootId: entry.rootId,
        }))
        setBatch(null)
        const outcome = await updateItems(items, false)
        if (outcome === null || !aliveRef.current) return
        const counts = outcome.counts !== null && outcome.counts !== undefined ? outcome.counts : {}
        const succeeded = typeof counts.ok === 'number' ? counts.ok : 0
        const failed = typeof counts.failed === 'number' ? counts.failed : 0
        setBatch({
          running: false,
          summary: { total: items.length, succeeded: succeeded, failed: failed },
          results: outcome.results,
          error: null,
          expanded: failed > 0,
        })
        setSelection({})
        anchorRef.current = undefined
      }, [listState.data, selection, updateItems])

      // Bulk update from the check strip: one click updates every skill the
      // last check marked as available. Requests are chunked so the panel can
      // show progress instead of freezing on one long request, and forcing is
      // left per row for skills whose local files differ.
      const BULK_CHUNK = 3
      const [bulkUpdate, setBulkUpdate] = React.useState(null)

      const runUpdateAll = React.useCallback(async () => {
        const results =
          checks !== null && checks !== undefined && Array.isArray(checks.results)
            ? checks.results
            : []
        const names = []
        for (const result of results) {
          if (
            result !== null &&
            typeof result === 'object' &&
            result.status === 'update-available' &&
            typeof result.name === 'string' &&
            result.name !== ''
          ) {
            names.push(result.name)
          }
        }
        if (names.length === 0) return
        setActionError(null)
        setBulkUpdate({
          running: true,
          done: 0,
          total: names.length,
          summary: null,
          results: [],
          expanded: false,
        })
        const collected = []
        let done = 0
        try {
          for (let index = 0; index < names.length; index += BULK_CHUNK) {
            const chunk = names.slice(index, index + BULK_CHUNK)
            const result = await api.updateSkills(
              { items: chunk.map((name) => ({ name: name })) },
              abortRef.current.signal,
            )
            if (!aliveRef.current) return
            if (Array.isArray(result.results)) {
              for (const entry of result.results) collected.push(entry)
            }
            done += chunk.length
            setBulkUpdate((previous) =>
              previous === null ? previous : { ...previous, done: done },
            )
          }
          await loadList()
          if (!aliveRef.current) return
          const failed = collected.filter((entry) => entry.ok === false).length
          setChecks(null)
          setBulkUpdate({
            running: false,
            done: names.length,
            total: names.length,
            summary: {
              total: collected.length,
              succeeded: collected.length - failed,
              failed: failed,
            },
            results: collected,
            expanded: failed > 0,
          })
        } catch (error) {
          const failure = toFailure(error)
          if (failure === null || !aliveRef.current) return
          setBulkUpdate(null)
          setUpdateError(failure)
        }
      }, [api, checks, loadList])

      const forceBulkItem = React.useCallback(
        async (name) => {
          if (typeof name !== 'string' || name === '') return
          const outcome = await updateItems([{ name: name }], true)
          if (outcome === null || !aliveRef.current) return
          setBulkUpdate((previous) => {
            if (previous === null) return previous
            const merged = Array.isArray(previous.results) ? previous.results.slice() : []
            for (const entry of outcome.results) {
              const at = merged.findIndex((existing) => existing.name === entry.name)
              if (at >= 0) merged[at] = entry
              else merged.push(entry)
            }
            const failed = merged.filter((entry) => entry.ok === false).length
            return {
              ...previous,
              summary: {
                total: merged.length,
                succeeded: merged.length - failed,
                failed: failed,
              },
              results: merged,
              expanded: failed > 0,
            }
          })
        },
        [updateItems],
      )

      const toggleBulkDetails = React.useCallback(() => {
        setBulkUpdate((previous) =>
          previous === null ? previous : { ...previous, expanded: previous.expanded !== true },
        )
      }, [])

      const dismissBulk = React.useCallback(() => {
        setBulkUpdate(null)
      }, [])

      const installMissing = React.useCallback(
        async (item) => {
          const name =
            item !== null && item !== undefined && typeof item.name === 'string'
              ? item.name
              : ''
          if (name === '') return
          setActionError(null)
          const outcome = await updateItems([{ name: name }], false)
          if (outcome === null || !aliveRef.current) return
          const first = outcome.results.length > 0 ? outcome.results[0] : null
          if (first !== null && first.ok === false) {
            setActionError(
              new PanelError(
                typeof first.code === 'string' ? first.code : 'INSTALL_FAILED',
                typeof first.message === 'string'
                  ? first.message
                  : t('missing.installFailed'),
              ),
            )
          }
        },
        [t, updateItems],
      )

      const startEdit = React.useCallback(() => {
        const skill = phase.name === 'detail' ? phase.skill : null
        if (skill === null || detailState === null) return
        if (detailState.loading === true || detailState.error !== null) return
        if (detailState.writable !== true || detailState.mismatch === true) return
        setActionError(null)
        setEditState({
          skill: { ...skill, rootId: detailState.rootId },
          draft: typeof detailState.content === 'string' ? detailState.content : '',
          saving: false,
          error: null,
        })
        setPhase({ name: 'edit', skill: skill })
      }, [detailState, phase])

      const saveEdit = React.useCallback(async () => {
        const current = editState
        if (current === null) return
        setEditState({ ...current, saving: true, error: null })
        try {
          await api.write(
            current.skill.rootId,
            current.skill.name,
            current.draft,
            abortRef.current.signal,
          )
          if (!aliveRef.current) return
          setDetailState(null)
          setEditState(null)
          setPhase({ name: 'list' })
          await loadList()
        } catch (error) {
          const failure = toFailure(error)
          if (failure === null || !aliveRef.current) return
          setEditState((previous) =>
            previous === null ? previous : { ...previous, saving: false, error: failure },
          )
        }
      }, [api, editState, loadList])

      const cancelEdit = React.useCallback(() => {
        setActionError(null)
        setPhase({ name: 'list' })
        setEditState(null)
        loadList()
      }, [loadList])

      const deleteSkill = React.useCallback(async () => {
        if (phase.name !== 'detail' || detailState === null) return
        const skill = phase.skill
        const rootId = detailState.rootId
        setBusy(true)
        setActionError(null)
        try {
          await api.remove(rootId, skill.name, abortRef.current.signal)
          if (!aliveRef.current) return
          setPhase({ name: 'list' })
          resetViews()
          await loadList()
        } catch (error) {
          const failure = toFailure(error)
          if (failure === null || !aliveRef.current) return
          setActionError(failure)
        } finally {
          if (aliveRef.current) setBusy(false)
        }
      }, [api, detailState, phase, loadList])

      const toggleField = React.useCallback(
        async (field, value) => {
          if (phase.name !== 'detail' || detailState === null) return
          const skill = phase.skill
          const rootId = detailState.rootId
          setBusy(true)
          setActionError(null)
          try {
            const result = await api.toggle(
              rootId,
              skill.name,
              field,
              value,
              abortRef.current.signal,
            )
            if (!aliveRef.current) return
            const modelInvocable = result.modelInvocable === true
            const userInvocable = result.userInvocable === true
            setDetailState((previous) =>
              previous === null
                ? previous
                : {
                    ...previous,
                    modelInvocable: modelInvocable,
                    userInvocable: userInvocable,
                    content:
                      typeof result.content === 'string' ? result.content : previous.content,
                    // The toggle rewrote this row's own file, so its content is
                    // now what the detail shows: a name shadowing is resolved.
                    path:
                      typeof result.path === 'string' ? result.path : previous.path,
                    readRootId:
                      typeof result.rootId === 'string' ? result.rootId : previous.readRootId,
                    mismatch: false,
                  },
            )
            setListState((previous) =>
              previous.data === null
                ? previous
                : {
                    ...previous,
                    data: patchListSkill(previous.data, skill.name, rootId, {
                      modelInvocable: modelInvocable,
                      userInvocable: userInvocable,
                    }),
                  },
            )
          } catch (error) {
            const failure = toFailure(error)
            if (failure === null || !aliveRef.current) return
            setActionError(failure)
          } finally {
            if (aliveRef.current) setBusy(false)
          }
        },
        [api, detailState, phase],
      )

      const openCreate = React.useCallback(() => {
        const roots = writableRoots(listState.data)
        setActionError(null)
        setCreateState({
          name: '',
          description: '',
          rootId: roots.length > 0 ? roots[0].id : '',
          creating: false,
          error: null,
          nameTouched: false,
        })
        setPhase({ name: 'create' })
      }, [listState.data])

      const cancelCreate = React.useCallback(() => {
        setActionError(null)
        setCreateState(null)
        setPhase({ name: 'list' })
      }, [])

      const updateCreate = React.useCallback((patch) => {
        setCreateState((previous) =>
          previous === null ? previous : { ...previous, ...patch, error: null },
        )
      }, [])

      const submitCreate = React.useCallback(async () => {
        const current = createState
        if (current === null) return
        const name = typeof current.name === 'string' ? current.name.trim() : ''
        const description =
          typeof current.description === 'string' ? current.description.trim() : ''
        if (!isKebabCase(name) || description === '' || current.rootId === '') {
          setCreateState((previous) =>
            previous === null
              ? previous
              : { ...previous, nameTouched: true, error: null },
          )
          return
        }

        const content = skillTemplate(name, description)
        const rootId = current.rootId
        setCreateState((previous) =>
          previous === null ? previous : { ...previous, creating: true, error: null },
        )
        try {
          const result = await api.write(rootId, name, content, abortRef.current.signal)
          if (!aliveRef.current) return
          const root = findRootInfo(listState.data, rootId)
          const skill = {
            name: name,
            description: description,
            path: typeof result.path === 'string' ? result.path : '',
            rootId: rootId,
            source: rootSource(listState.data, rootId, String(rootId)),
            modelInvocable: true,
            userInvocable: true,
            shadowed: false,
          }
          setCreateState(null)
          setActionError(null)
          setEditState({ skill: skill, draft: content, saving: false, error: null })
          setPhase({ name: 'edit', skill: skill })
          await loadList()
        } catch (error) {
          const failure = toFailure(error)
          if (failure === null || !aliveRef.current) return
          setCreateState((previous) =>
            previous === null
              ? previous
              : { ...previous, creating: false, error: failure },
          )
        }
      }, [api, createState, listState.data, loadList])

      const updateDraft = React.useCallback((value) => {
        setEditState((previous) =>
          previous === null
            ? previous
            : { ...previous, draft: String(value), error: null },
        )
      }, [])

      if (sessionId === undefined) {
        return h(
          'div',
          { className: 'dps-root', 'data-dsh-project-skills-mng-panel': '' },
          h(
            'div',
            { className: 'dps-empty' },
            h('p', null, t('session.required')),
            h('p', { className: 'dps-hint' }, t('list.title')),
          ),
        )
      }

      let view
      if (phase.name === 'create' && createState !== null) {
        view = h(CreateView, {
          t: t,
          create: createState,
          roots: writableRoots(listState.data),
          onChange: updateCreate,
          onSubmit: submitCreate,
          onCancel: cancelCreate,
        })
      } else if (phase.name === 'edit' && editState !== null) {
        view = h(EditView, {
          t: t,
          edit: editState,
          onChangeDraft: updateDraft,
          onSave: saveEdit,
          onCancel: cancelEdit,
        })
      } else if (phase.name === 'detail' && phase.skill) {
        view = h(DetailView, {
          t: t,
          skill: phase.skill,
          detail: detailState,
          busy: busy,
          checking: checks !== null && checks !== undefined && checks.checking === true,
          updating: updating,
          checkResult: checkByName[phase.skill.name],
          updateError: updateError,
          onBack: backToList,
          onEdit: startEdit,
          onDelete: deleteSkill,
          onToggle: toggleField,
          onCheckSkill: (name) => runCheck([name]),
          onUpdateSkill: runUpdateSkill,
          onDismissUpdate: () => setUpdateError(null),
        })
      } else {
        view = h(ListView, {
          t: t,
          data: listState.data,
          loading: listState.loading,
          error: listState.error,
          busy: busy,
          filters: filters,
          queryValue: queryDraft,
          selecting: selecting,
          selection: selection,
          batch: batch,
          pending: pending,
          updating: updating,
          checks: checks,
          bulkUpdate: bulkUpdate,
          targets: transferTargets,
          onUpdateAll: runUpdateAll,
          onToggleBulkDetails: toggleBulkDetails,
          onDismissBulk: dismissBulk,
          onForceBulk: forceBulkItem,
          onRefresh: loadList,
          onCreate: openCreate,
          onOpenSkill: openDetail,
          onCheck: () => runCheck(),
          onInstall: installMissing,
          onUpdate: runUpdateSelected,
          onToggleCheckDetails: toggleCheckDetails,
          onDismissCheck: dismissCheck,
          onToggleSelecting: toggleSelecting,
          onQueryChange: changeQuery,
          onFiltersChange: changeFilters,
          onClearFilters: clearFilters,
          onToggleSelect: toggleSkill,
          onToggleTierSelect: toggleTier,
          onExitSelection: exitSelection,
          onInvocation: runInvocation,
          onMove: (rootId) => beginTransfer('move', rootId),
          onCopy: (rootId) => beginTransfer('copy', rootId),
          onDelete: beginDelete,
          onConfirm: confirmPending,
          onCancelConfirm: cancelPending,
          onToggleFailures: toggleFailures,
          onDismissBatchError: dismissBatchError,
        })
      }

      return h(
        'div',
        { className: 'dps-root', 'data-dsh-project-skills-mng-panel': '' },
        actionError !== null
          ? h(ErrorBar, {
              t: t,
              error: actionError,
              onDismiss: () => setActionError(null),
            })
          : null,
        view,
      )
    }

    /* ------------------------------------------------------------------ *
     * Scoped stylesheet                                                   *
     * ------------------------------------------------------------------ */

    function injectStyle() {
      if (typeof document === 'undefined' || document === null) return () => {}
      let existing = null
      try {
        if (typeof document.querySelector === 'function') {
          existing = document.querySelector(STYLE_SELECTOR)
        }
      } catch (error) {
        existing = null
      }
      if (existing !== null && existing !== undefined && existing.parentNode) {
        existing.parentNode.removeChild(existing)
      }
      const tag = document.createElement('style')
      tag.setAttribute(STYLE_ATTRIBUTE, '')
      tag.setAttribute('data-plugin-css', STYLE_PLUGIN_NAME)
      tag.textContent = CSS
      const head = document.head
      if (head === undefined || head === null) return () => {}
      head.appendChild(tag)
      return () => {
        if (tag.parentNode) tag.parentNode.removeChild(tag)
      }
    }

    /* ------------------------------------------------------------------ *
     * Plugin entry                                                        *
     * ------------------------------------------------------------------ */

    return {
      inject: ['slots', 'locale', 'sidebarRightTabs'],
      apply(ctx) {
        if (ctx === null || ctx === undefined) return
        const localeService = ctx.locale
        const t = bindTranslate(localeService)

        ctx.effect(() => {
          const disposers = []
          if (localeService !== null && localeService !== undefined) {
            if (typeof localeService.register === 'function') {
              const offZh = localeService.register(NS, 'zh', zh)
              if (typeof offZh === 'function') disposers.push(offZh)
              const offEn = localeService.register(NS, 'en', en)
              if (typeof offEn === 'function') disposers.push(offEn)
            }
          }
          return () => {
            for (const dispose of disposers) {
              try {
                dispose()
              } catch (error) {
                /* keep disposing the rest */
              }
            }
          }
        }, NS + ':locale')

        ctx.effect(() => injectStyle(), NS + ':style')

        const tabs = ctx.sidebarRightTabs
        if (tabs !== null && tabs !== undefined && typeof tabs.register === 'function') {
          ctx.effect(
            () =>
              tabs.register({
                id: TAB_ID,
                kind: TAB_KIND,
                priority: 'extension',
                title: () => tf(t, 'tab.title'),
                guide: [
                  {
                    id: GUIDE_ENTRY_ID,
                    order: 10,
                    // The guide renders `entry.title()` / `entry.description?.()`,
                    // so both must be zero-arg functions, never strings.
                    title: () => tf(t, 'guide.title'),
                    description: () => tf(t, 'guide.description'),
                  },
                ],
              }),
            NS + ':tab-type',
          )
        }

        const slots = ctx.slots
        if (slots !== null && slots !== undefined && typeof slots.register === 'function') {
          ctx.effect(
            () =>
              slots.inject(PANE_SLOT, () =>
                slots.register(
                  {
                    name: PANE_SLOT,
                    key: TAB_ID,
                    locale: NS,
                    inject: (sessionId) => ({
                      sessionId: typeof sessionId === 'string' ? sessionId : undefined,
                      translate: t,
                    }),
                  },
                  SkillsPanel,
                ),
              ),
            NS + ':pane',
          )
        }
      },
    }
  },
})
