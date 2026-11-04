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
    }

    /* ------------------------------------------------------------------ *
     * Panel styles (theme tokens only, scoped under .dps-)                *
     * ------------------------------------------------------------------ */

    const CSS = `
.dps-root {
  box-sizing: border-box;
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
  gap: 8px;
  flex: none;
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

    function ListView(props) {
      const t = props.t
      const data = props.data
      const loading = props.loading === true
      const error = props.error
      const [collapsed, setCollapsed] = React.useState({
        project: false,
        global: false,
      })
      const [warningOpen, setWarningOpen] = React.useState(false)

      const counts =
        data !== null && data !== undefined && data.counts !== null && data.counts !== undefined
          ? data.counts
          : null

      const toolbar = h(
        'div',
        { className: 'dps-toolbar' },
        h('span', { className: 'dps-title' }, t('list.title')),
        h('span', { className: 'dps-spacer' }),
        h(
          'button',
          {
            type: 'button',
            className: 'dps-btn',
            disabled: loading || props.busy === true,
            onClick: props.onRefresh,
          },
          loading ? t('status.loading') : t('list.refresh'),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dps-btn dps-primary',
            disabled: data === null || loading || props.busy === true,
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

        const tiers = Array.isArray(data.tiers) ? data.tiers : []
        const total = counts !== null && typeof counts.total === 'number' ? counts.total : null
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
        }

        for (const tier of tiers) {
          // The empty card already explains the situation; zero-count tiers
          // would only repeat "no skills yet" four times.
          if (total === 0) break
          if (tier === null || typeof tier !== 'object') continue
          const rootId = typeof tier.rootId === 'string' ? tier.rootId : String(tier.id)
          const isCollapsed = collapsed[rootId] === true
          const skills = Array.isArray(tier.skills) ? tier.skills : []
          const exists = tier.exists === true
          const writable = tier.writable === true
          const rank = typeof tier.rank === 'number' ? tier.rank : null
          const fullPath = typeof tier.path === 'string' ? tier.path : ''
          const marks = []
          if (!exists) marks.push(t('root.missing'))
          if (!writable) marks.push(t('root.readonly'))

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
                skills.length === 0
                  ? h('p', { className: 'dps-hint' }, t('group.empty'))
                  : h(
                      'div',
                      { className: 'dps-rows' },
                      skills.map((skill, skillIndex) =>
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'dps-row',
                            key: 'skill-' + String(skillIndex),
                            onClick: () => props.onOpenSkill(skill),
                          },
                          h(
                            'span',
                            { className: 'dps-row-top' },
                            h(
                              'span',
                              { className: 'dps-name', title: skill.name },
                              skill.name,
                            ),
                            skill.linked === true
                              ? h(
                                  'span',
                                  {
                                    className: 'dps-badge dps-badge-link',
                                    title:
                                      typeof skill.realPath === 'string' ? skill.realPath : '',
                                  },
                                  t('badge.linked'),
                                )
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
                      ),
                    ),
              )

          parts.push(
            h(
              'section',
              { className: 'dps-group', key: 'tier-' + rootId },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dps-group-head',
                  'aria-expanded': String(!isCollapsed),
                  onClick: () =>
                    setCollapsed((previous) => ({
                      ...previous,
                      [rootId]: !previous[rootId],
                    })),
                },
                h('span', {
                  className: 'dps-caret',
                  'data-open': String(!isCollapsed),
                  'aria-hidden': 'true',
                }),
                h('span', {
                  className: 'dps-group-title',
                  title: fullPath,
                }, rootLabel(t, { id: rootId })),
                h('span', { className: 'dps-count' }, String(skills.length)),
                h('span', { className: 'dps-spacer' }),
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
      }

      return h('div', { className: 'dps-list' }, parts)
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

      const resetViews = () => {
        setDetailState(null)
        setEditState(null)
        setCreateState(null)
      }

      const backToList = React.useCallback(() => {
        setPhase({ name: 'list' })
        setActionError(null)
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
          onBack: backToList,
          onEdit: startEdit,
          onDelete: deleteSkill,
          onToggle: toggleField,
        })
      } else {
        view = h(ListView, {
          t: t,
          data: listState.data,
          loading: listState.loading,
          error: listState.error,
          busy: busy,
          onRefresh: loadList,
          onCreate: openCreate,
          onOpenSkill: openDetail,
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
