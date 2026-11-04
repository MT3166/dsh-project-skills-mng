/*
 * Design preview: renders the real client.js panel through a tiny React runtime
 * and writes standalone HTML files (real DSH theme tokens + real plugin CSS) so
 * the panel can be screenshotted with a headless browser.
 *
 *   node test/preview.mjs            # -> test/preview-out/*.html
 *
 * This is a development playground, not part of the shipped bundle.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const CLIENT_PATH = join(ROOT, 'client.js')
const OUT_DIR = join(HERE, 'preview-out')
const PAGE_BASE = 'http://127.0.0.1:55267/'
const THEME_PATH =
  process.env.DSH_THEME_CLIENT ??
  join(process.env.TEMP ?? '/tmp', 'dsh-theme', 'node_modules', '@deepseek-ai', 'dsh-client-ui-theme', 'lib', 'client.js')

const SOURCE = readFileSync(CLIENT_PATH, 'utf8')

/* ------------------------------------------------------------------ *
 * Theme tokens (light + dark) extracted from the shipped theme plugin *
 * ------------------------------------------------------------------ */

function cssStringConstant(source, name) {
  const match = source.match(new RegExp('var ' + name + ' = ("(?:[^"\\\\]|\\\\.)*");'))
  if (match === null) throw new Error('missing css constant ' + name)
  return JSON.parse(match[1])
}

function themeCss() {
  let source = ''
  try {
    source = readFileSync(THEME_PATH, 'utf8')
  } catch (error) {
    throw new Error('cannot read the DSH theme bundle at ' + THEME_PATH + ': ' + error.message)
  }
  const platform = cssStringConstant(source, 'design_platform_css_default')
  const base = cssStringConstant(source, 'base_css_default')
  return platform + '\n' + base
}

/* ------------------------------------------------------------------ *
 * Mini React runtime (same contract the smoke tests rely on)          *
 * ------------------------------------------------------------------ */

function createRuntime() {
  let activeInstance = null
  let rootElement = null
  let lastNodes = []
  let needsRender = true
  let renderedInstances = []
  let keyed = new Map()
  let hookIndex = 0
  let instanceSeq = 0

  function current() {
    if (activeInstance === null) throw new Error('hook called outside of a component')
    return activeInstance
  }

  function nextSlot() {
    return hookIndex++
  }

  function scheduleRender() {
    needsRender = true
  }

  function useState(initial) {
    const instance = current()
    const index = nextSlot()
    const slots = instance.slots
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
    return [
      slots[index],
      (value) => {
        const next = typeof value === 'function' ? value(slots[index]) : value
        if (Object.is(next, slots[index])) return
        slots[index] = next
        scheduleRender()
      },
    ]
  }

  function useReducer(reducer, initial, init) {
    const [state, setState] = useState(() => (init === undefined ? initial : init(initial)))
    return [state, (action) => setState((previous) => reducer(previous, action))]
  }

  function depsEqual(previous, next) {
    if (previous === undefined || next === undefined) return false
    if (previous.length !== next.length) return false
    return previous.every((value, index) => Object.is(value, next[index]))
  }

  function useMemo(factory, deps) {
    const instance = current()
    const index = nextSlot()
    const slots = instance.slots
    const stored = slots[index]
    if (stored === undefined || !depsEqual(stored.deps, deps)) {
      slots[index] = { deps, value: factory() }
    }
    return slots[index].value
  }

  function useCallback(callback, deps) {
    return useMemo(() => callback, deps)
  }

  function useRef(initial) {
    const instance = current()
    const index = nextSlot()
    if (!(index in instance.slots)) instance.slots[index] = { current: initial }
    return instance.slots[index]
  }

  function useEffect(effect, deps) {
    const instance = current()
    const index = nextSlot()
    instance.effectQueue.push({ index, effect, deps })
  }

  function useLayoutEffect(effect, deps) {
    useEffect(effect, deps)
  }

  const React = {
    createElement(type, props, ...children) {
      const merged = { ...(props ?? {}) }
      if (children.length === 1) merged.children = children[0]
      else if (children.length > 1) merged.children = children
      return { type, props: merged }
    },
    Fragment: { __fragment: true },
    useState,
    useReducer,
    useMemo,
    useCallback,
    useRef,
    useEffect,
    useLayoutEffect,
  }

  function instanceFor(key, type) {
    let instance = keyed.get(key)
    if (instance === undefined) {
      instance = { seq: instanceSeq++, key, type, slots: {}, cleanups: {}, cursor: 0, effectQueue: [] }
      keyed.set(key, instance)
    }
    return instance
  }

  function runEffects(instance) {
    for (const entry of instance.effectQueue) {
      const previous = instance.cleanups[entry.index]
      const changed =
        previous === undefined ||
        !depsEqual(previous.deps, entry.deps) ||
        previous.deps === undefined
      if (!changed) continue
      if (previous !== undefined && typeof previous.cleanup === 'function') {
        try {
          previous.cleanup()
        } catch (error) {
          /* ignore */
        }
      }
      const result = entry.effect()
      instance.cleanups[entry.index] = {
        deps: entry.deps,
        cleanup: typeof result === 'function' ? result : undefined,
      }
    }
    instance.effectQueue = []
  }

  function invoke(type, props, key) {
    const instance = instanceFor(key, type)
    instance.cursor = 0
    instance.effectQueue = []
    renderedInstances.push(instance)
    const previous = activeInstance
    activeInstance = instance
    hookIndex = 0
    try {
      return type(props)
    } finally {
      activeInstance = previous
    }
  }

  function build(node, key, out) {
    if (node === null || node === undefined || typeof node === 'boolean') return
    if (typeof node === 'string' || typeof node === 'number') {
      out.push({ kind: 'text', text: String(node) })
      return
    }
    if (Array.isArray(node)) {
      node.forEach((child, index) => build(child, key + '/' + index, out))
      return
    }
    if (typeof node !== 'object') return
    if (typeof node.type === 'function') {
      build(invoke(node.type, node.props ?? {}, key), key + '/out', out)
      return
    }
    if (node.type === React.Fragment) {
      build(node.props.children, key + '/c', out)
      return
    }
    const host = { kind: 'host', type: String(node.type), props: node.props ?? {}, children: [] }
    out.push(host)
    build(host.props.children, key + '/c', host.children)
  }

  function renderPass() {
    renderedInstances = []
    const nodes = []
    build(rootElement, 'root', nodes)
    lastNodes = nodes
    for (const instance of renderedInstances) runEffects(instance)
  }

  function flush() {
    let guard = 0
    do {
      needsRender = false
      renderPass()
      guard += 1
      if (guard > 100) throw new Error('the render loop did not settle')
    } while (needsRender)
  }

  function mount(element) {
    rootElement = element
    needsRender = true
    flush()
  }

  async function settle() {
    flush()
    for (let round = 0; round < 200; round += 1) {
      await new Promise((resolve) => setImmediate(resolve))
      if (!needsRender) return
      flush()
    }
    throw new Error('the async render loop did not settle')
  }

  return {
    React,
    mount,
    settle,
    nodes() {
      return lastNodes
    },
  }
}

/* ------------------------------------------------------------------ *
 * Node tree helpers                                                   *
 * ------------------------------------------------------------------ */

function walk(nodes, visit) {
  for (const node of Array.isArray(nodes) ? nodes : [nodes]) {
    if (node === undefined || node === null) continue
    visit(node)
    if (node.kind === 'host') walk(node.children, visit)
  }
}

function textOf(node) {
  if (node === undefined || node === null) return ''
  if (node.kind === 'text') return node.text
  if (node.kind !== 'host') return ''
  return node.children.map(textOf).join('')
}

function hasClass(node, className) {
  const value = node.kind === 'host' ? node.props.className : undefined
  return typeof value === 'string' && value.split(/\s+/).includes(className)
}

function findAll(runtime, predicate) {
  const found = []
  walk(runtime.nodes(), (node) => {
    if (predicate(node)) found.push(node)
  })
  return found
}

function click(runtime, predicate) {
  const target = findAll(runtime, predicate)[0]
  if (target === undefined) throw new Error('nothing to click')
  if (typeof target.props.onClick === 'function') target.props.onClick({})
  else if (typeof target.props.onMouseDown === 'function') target.props.onMouseDown({})
  else throw new Error('the target is not clickable: ' + target.type)
}

/* ------------------------------------------------------------------ *
 * Serialize the virtual tree into HTML                                *
 * ------------------------------------------------------------------ */

const VOID_TAGS = new Set(['input', 'br', 'hr', 'img', 'meta', 'link'])

function escapeText(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeAttr(value) {
  return escapeText(value).replaceAll('"', '&quot;')
}

function serialize(nodes) {
  let out = ''
  for (const node of nodes) {
    if (node.kind === 'text') {
      out += escapeText(node.text)
      continue
    }
    const tag = node.type === 'Fragment' ? null : node.type
    const props = node.props ?? {}
    const attributes = []
    for (const [name, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue
      if (name === 'children' || name.startsWith('on')) continue
      if (name === 'className') attributes.push('class="' + escapeAttr(value) + '"')
      else if (name === 'htmlFor') attributes.push('for="' + escapeAttr(value) + '"')
      else if (name === 'style' && typeof value === 'object') {
        const css = Object.entries(value)
          .map(([key, item]) => key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase()) + ':' + item)
          .join(';')
        attributes.push('style="' + escapeAttr(css) + '"')
      } else if (value === true) attributes.push(name)
      else attributes.push(name + '="' + escapeAttr(value) + '"')
    }
    const open = tag === null ? '' : '<' + tag + (attributes.length > 0 ? ' ' + attributes.join(' ') : '')
    if (tag === null) {
      out += serialize(node.children)
      continue
    }
    if (VOID_TAGS.has(tag)) {
      out += open + '>'
      continue
    }
    out += open + '>' + serialize(node.children) + '</' + tag + '>'
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Mock host payload — modelled on a real profile                       *
 * ------------------------------------------------------------------ */

function skill(name, description, rootId, source, flags = {}) {
  return {
    name,
    description,
    path: 'D:/XMT/99_Codebase/github/dsh-project-skills-mng/' + name + '/SKILL.md',
    rootId,
    source,
    rank: flags.rank ?? 100,
    modelInvocable: flags.modelInvocable ?? true,
    userInvocable: flags.userInvocable ?? true,
    shadowed: flags.shadowed ?? false,
    ...(flags.shadowedBy === undefined ? {} : { shadowedBy: flags.shadowedBy }),
    linked: flags.linked === true,
    ...(flags.realPath === undefined ? {} : { realPath: flags.realPath }),
  }
}

const LIST = {
  ok: true,
  cwd: 'D:\\XMT\\99_Codebase\\github\\dsh-project-skills-mng',
  projectRoot: 'D:\\XMT\\99_Codebase\\github\\dsh-project-skills-mng',
  counts: { project: 2, global: 6, total: 8, shadowed: 2, broken: 1 },
  tiers: [
    {
      rank: 100,
      scope: 'project',
      id: 'project-dsh',
      rootId: 'project-dsh',
      source: 'project-dsh',
      path: 'D:\\XMT\\99_Codebase\\github\\dsh-project-skills-mng\\.dsh\\skills',
      exists: true,
      writable: true,
      skills: [
        skill('demo-skill', '用来验证右栏技能面板的演示技能，包含增删改查与调用开关。', 'project-dsh', 'project-dsh'),
      ],
    },
    {
      rank: 200,
      scope: 'project',
      id: 'project-agents',
      rootId: 'project-agents',
      source: 'project-agents',
      path: 'D:\\XMT\\99_Codebase\\github\\dsh-project-skills-mng\\.agents\\skills',
      exists: false,
      writable: true,
      skills: [
        skill('release-notes', '汇总本仓库每次发布的变更条目，按模块分组。', 'project-agents', 'project-agents', {
          rank: 200,
          userInvocable: false,
          shadowed: true,
          shadowedBy: { rootId: 'project-dsh', path: 'project-dsh' },
        }),
      ],
    },
    {
      rank: 400,
      scope: 'global',
      id: 'global-dsh',
      rootId: 'global-dsh',
      source: 'user-dsh',
      path: 'C:\\Users\\honor\\.dsh\\skills',
      exists: true,
      writable: true,
      skills: [
        skill('brainstorming', '在任何创作之前先做需求澄清与方案发散，产出可批准的设计。', 'global-dsh', 'user-dsh', {
          rank: 400,
          linked: true,
          realPath: 'C:\\Users\\honor\\.agents\\skills\\brainstorming\\SKILL.md',
        }),
        skill('writing-plans', '把已批准的设计拆成可执行的实现计划，写入 docs/superpowers/plans。', 'global-dsh', 'user-dsh', { rank: 400 }),
        skill('impeccable', '设计、重做、审查、打磨前端界面时使用：层级、排版、动效与可访问性。', 'global-dsh', 'user-dsh', {
          rank: 400,
          modelInvocable: false,
        }),
      ],
    },
    {
      rank: 500,
      scope: 'global',
      id: 'global-agents',
      rootId: 'global-agents',
      source: 'user-agents',
      path: 'C:\\Users\\honor\\.agents\\skills',
      exists: true,
      writable: true,
      skills: [
        skill('systematic-debugging', '遇到任何 bug、测试失败或异常行为时，先系统定位再改代码。', 'global-agents', 'user-agents', {
          rank: 500,
          shadowed: true,
          shadowedBy: { rootId: 'global-dsh', path: 'C:\\Users\\honor\\.dsh\\skills\\systematic-debugging' },
        }),
        skill('office', '创建、编辑、检查或转换 Office 文档、表格、演示文稿与 PDF。', 'global-agents', 'user-agents', { rank: 500 }),
        skill('moss-mem', '跨会话的项目记忆：MEMORY.md 与 .moss-mem 的读写、检索与交接。', 'global-agents', 'user-agents', {
          rank: 500,
          userInvocable: false,
        }),
      ],
    },
  ],
  errors: [
    {
      rootId: 'project-dsh',
      path: 'D:\\XMT\\99_Codebase\\github\\dsh-project-skills-mng\\.dsh\\skills\\half-written\\SKILL.md',
      message: 'frontmatter 缺少 description 字段，该技能不会被 DSH 加载。',
    },
  ],
}

let activeList = LIST

const DETAIL_CONTENT = [
  '---',
  'name: demo-skill',
  'description: 用来验证右栏技能面板的演示技能，包含增删改查与调用开关。',
  'whenToUse: 需要确认面板的列表、详情、编辑与调用开关是否正常时。',
  '---',
  '',
  '# demo-skill',
  '',
  '这是仓库内的一个临时 fixture，用来确认插件能把项目级技能识别成 project 分组，',
  '并验证右栏面板的读取、编辑、删除与调用开关。',
  '',
  '## 用法',
  '',
  '1. 打开右栏的「项目管理技能」面板。',
  '2. 点开 demo-skill，检查正文与元信息是否完整。',
  '3. 修改正文后保存，确认技能目录里的 SKILL.md 同步更新。',
].join('\n')

/* ------------------------------------------------------------------ *
 * Harness                                                             *
 * ------------------------------------------------------------------ */

function createDocumentStub() {
  const head = {
    children: [],
    appendChild(node) {
      node.parentNode = head
      head.children.push(node)
      return node
    },
    removeChild(node) {
      const index = head.children.indexOf(node)
      if (index >= 0) head.children.splice(index, 1)
      node.parentNode = null
      return node
    },
  }

  return {
    baseURI: PAGE_BASE,
    head,
    createElement(tagName) {
      const element = {
        tagName: String(tagName).toUpperCase(),
        attributes: {},
        parentNode: null,
        textContent: '',
        setAttribute(name, value) {
          element.attributes[String(name)] = String(value)
        },
        getAttribute(name) {
          const value = element.attributes[String(name)]
          return value === undefined ? null : value
        },
        removeAttribute(name) {
          delete element.attributes[String(name)]
        },
        remove() {
          if (element.parentNode !== null) element.parentNode.removeChild(element)
        },
      }
      return element
    },
    querySelector() {
      return null
    },
  }
}

function createCtx() {
  const env = {
    tabDefinition: null,
    slotRegistrations: [],
    localeRegistrations: [],
  }

  const ctx = {
    effect(callback) {
      const dispose = callback()
      env.disposers = [...(env.disposers ?? []), typeof dispose === 'function' ? dispose : () => {}]
      return () => {}
    },
    slots: {
      inject(name, callback) {
        const dispose = callback()
        if (typeof dispose === 'function') env.disposers = [...(env.disposers ?? []), dispose]
        return () => {}
      },
      register(definition, component) {
        env.slotRegistrations.push({ definition, component })
        return () => {}
      },
    },
    locale: {
      register(ns, language, dictionary) {
        env.localeRegistrations.push({ ns, language, dictionary })
        return () => {}
      },
      bind(ns) {
        return (key) => '[' + ns + ']' + key
      },
    },
    sidebarRightTabs: {
      register(definition) {
        env.tabDefinition = definition
        return () => {}
      },
    },
  }

  return { env, ctx }
}

function setup() {
  const runtime = createRuntime()
  const documentStub = createDocumentStub()
  const captured = {}

  const sandbox = {
    console,
    document: documentStub,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: async (url, init) => {
      const requestUrl = String(url)
      const marker = '/dsh-project-skills-mng/api/'
      const at = requestUrl.indexOf(marker)
      const method = at >= 0 ? requestUrl.slice(at + marker.length) : ''
      let payload = null
      try {
        payload = JSON.parse(init.body)
      } catch (error) {
        payload = null
      }
      const answer = respond(method, payload)
      return {
        ok: true,
        status: 200,
        async json() {
          return answer
        },
      }
    },
    window: {
      __ModuleLoader__: {
        load(spec) {
          captured.spec = spec
          captured.module = spec.factory((specifier) => {
            if (specifier === 'react') return runtime.React
            throw new Error('unexpected require: ' + String(specifier))
          })
        },
      },
    },
  }
  sandbox.globalThis = sandbox

  vm.runInNewContext(SOURCE, sandbox, { filename: CLIENT_PATH })
  const { env, ctx } = createCtx()
  captured.module.apply(ctx)

  return { runtime, documentStub, env, module: captured.module }
}

function respond(method, payload) {
  if (method === 'list') return activeList
  if (method === 'read') {
    const isLinked = payload.name === 'brainstorming'
    return {
      ok: true,
      name: payload.name,
      path: isLinked
        ? 'C:\\Users\\honor\\.dsh\\skills\\brainstorming\\SKILL.md'
        : 'D:\\XMT\\99_Codebase\\github\\dsh-project-skills-mng\\.dsh\\skills\\' + payload.name + '\\SKILL.md',
      rootId: payload.rootId ?? 'project-dsh',
      scope: isLinked ? 'global' : 'project',
      writable: true,
      linked: isLinked,
      ...(isLinked ? { realPath: 'C:\\Users\\honor\\.agents\\skills\\brainstorming\\SKILL.md' } : {}),
      content: DETAIL_CONTENT.replaceAll('demo-skill', payload.name),
    }
  }
  if (method === 'roots') return { ok: true, roots: [] }
  return { ok: true }
}

function emptyList() {
  return {
    ...LIST,
    counts: { project: 0, global: 0, total: 0, shadowed: 0, broken: 0 },
    tiers: LIST.tiers.map((tier) => ({ ...tier, skills: [] })),
    errors: [],
  }
}

function translator(env) {
  const dictionaries = {}
  for (const entry of env.localeRegistrations) {
    dictionaries[entry.language] = entry.dictionary
  }
  const table = dictionaries.zh ?? dictionaries.en ?? {}
  return (key) => (typeof table[key] === 'string' ? table[key] : key)
}

/* ------------------------------------------------------------------ *
 * States                                                              *
 * ------------------------------------------------------------------ */

async function capture(state) {
  activeList = state === 'empty' ? emptyList() : LIST
  const { runtime, documentStub, env } = setup()
  const body = env.slotRegistrations[0].component
  const t = translator(env)
  const React = runtime.React
  const props = {
    sessionId: 'session-preview',
    t,
    useTabInfo: () => ({ tab: { id: 'preview', kind: 'dsh-project-skills-mng/skills', visible: true, navigation: { params: {} } } }),
  }

  runtime.mount(React.createElement(body, props))
  await runtime.settle()

  if (state === 'detail' || state === 'edit') {
    click(runtime, (node) => hasClass(node, 'dps-row') && textOf(node).includes('demo-skill'))
    await runtime.settle()
  }
  if (state === 'detail-linked') {
    click(runtime, (node) => hasClass(node, 'dps-row') && textOf(node).includes('brainstorming'))
    await runtime.settle()
  }
  if (state === 'edit') {
    click(runtime, (node) => node.kind === 'host' && node.type === 'button' && textOf(node).includes(t('detail.edit')))
    await runtime.settle()
  }
  if (state === 'create') {
    click(runtime, (node) => node.kind === 'host' && node.type === 'button' && textOf(node) === t('list.new'))
    await runtime.settle()
  }

  return { html: serialize(runtime.nodes()), documentStub, env }
}

/* ------------------------------------------------------------------ *
 * Page assembly                                                       *
 * ------------------------------------------------------------------ */

function pluginCss(documentStub) {
  const style = documentStub.head.children.find((node) => node.tagName === 'STYLE')
  return style === undefined ? '' : style.textContent
}

function page({ title, css, html, theme }) {
  return `<!doctype html>
<html lang="zh-CN" data-theme="${theme}">
<head>
<meta charset="utf-8">
<title>${escapeText(title)}</title>
<style>${themeCss()}</style>
<style>${css}</style>
<style>
  /* preview chrome — a stand-in for the DSH right sidebar, not plugin code */
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--dsw-alias-bg-base);
    color: var(--dsw-alias-label-primary);
    font-family: var(--dsh-font-family-text-default);
    -webkit-font-smoothing: antialiased;
    padding: 24px;
    display: flex;
    gap: 24px;
    align-items: flex-start;
  }
  .shell {
    width: 360px;
    height: 760px;
    background: var(--dsw-alias-bg-layer-1);
    border: 1px solid var(--dsw-alias-border-l2);
    border-radius: 14px;
    box-shadow: var(--dsw-shadow-lv2, 0 4px 12px 0 #00000005);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .shell-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--dsw-alias-border-l1);
    flex: 0 0 auto;
  }
  .shell-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }
  .shell-title { font-size: 12px; font-weight: 500; color: var(--dsw-alias-label-secondary); }
  .shell-body { flex: 1 1 auto; min-height: 0; display: flex; overflow: hidden; }
  .shell-body > * { flex: 1 1 auto; min-width: 0; }
  .label { font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--dsw-alias-label-tertiary); margin: 0 0 8px; }
</style>
</head>
<body${theme === 'dark' ? ' data-ds-dark-theme' : ''}>
  <div>
    <p class="label">${escapeText(title)}</p>
    <div class="shell">
      <div class="shell-head"><span class="shell-dot"></span><span class="shell-title">右栏 · 项目管理技能</span></div>
      <div class="shell-body">${html}</div>
    </div>
  </div>
</body>
</html>
`
}

/* ------------------------------------------------------------------ *
 * Main                                                                *
 * ------------------------------------------------------------------ */

const STATES = [
  ['list', '列表态'],
  ['detail', '详情态'],
  ['detail-linked', '链接技能详情'],
  ['edit', '编辑态'],
  ['create', '新建态'],
  ['empty', '空态'],
]

mkdirSync(OUT_DIR, { recursive: true })
const capturedCss = pluginCss((await capture('list')).documentStub)
const wanted = process.argv.slice(2)
const states = wanted.length > 0 ? wanted : STATES.map(([state]) => state)

for (const theme of ['light', 'dark']) {
  for (const state of states) {
    const label = STATES.find(([name]) => name === state)?.[1] ?? state
    const shot = await capture(state)
    const file = join(OUT_DIR, state + '-' + theme + '.html')
    writeFileSync(file, page({ title: label + ' · ' + theme, css: capturedCss, html: shot.html, theme }), 'utf8')
    console.log('wrote', file)
  }
}
