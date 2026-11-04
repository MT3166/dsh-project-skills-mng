/**
 * Smoke test for the client half of dsh-project-skills-mng.
 *
 * The plugin is a browser script with no build step: it talks to the module
 * table (`window.__ModuleLoader__`) at load time and receives its framework
 * services through `apply(ctx)`. This test therefore runs the real `client.js`
 * source inside a `node:vm` sandbox with:
 *   - a fake `window.__ModuleLoader__` that captures the module spec,
 *   - a tiny React runtime (element builder, hook store, one-shot scheduler,
 *     synchronous effects) so the panel can actually mount, fetch, click and
 *     re-render,
 *   - a fake `document` that records the injected stylesheet,
 *   - a fake Cordis context that records every registration,
 *   - a fake `fetch` that answers the host API envelope without any I/O.
 *
 * Nothing outside the sandbox is touched.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLIENT_PATH = join(HERE, '..', 'client.js')
const SOURCE = readFileSync(CLIENT_PATH, 'utf8')

const NAMESPACE = 'dsh-project-skills-mng'
const TAB_ID = 'dsh-project-skills-mng/skills'
const PANE_SLOT = 'sidebar.right.pane.tab'
const PAGE_BASE = 'https://desk.example/app/'

/* ---------------------------------------------------------------------- *
 * Tiny React runtime                                                     *
 * ---------------------------------------------------------------------- */

function depsEqual(previous, next) {
  if (previous === next) return true
  if (!Array.isArray(previous) || !Array.isArray(next)) return false
  if (previous.length !== next.length) return false
  for (let index = 0; index < previous.length; index += 1) {
    if (!Object.is(previous[index], next[index])) return false
  }
  return true
}

function createRuntime() {
  const instances = new Map()
  let activeInstance = null
  let rootElement = null
  let needsRender = false
  let lastNodes = []
  let renderedInstances = []

  function requireInstance(hookName) {
    if (activeInstance === null) {
      throw new Error(hookName + ' called outside of a component render')
    }
    return activeInstance
  }

  function makeSetter(instance, index) {
    return (nextValue) => {
      const previous = instance.hooks[index]
      const value = typeof nextValue === 'function' ? nextValue(previous) : nextValue
      if (Object.is(previous, value)) return
      instance.hooks[index] = value
      needsRender = true
    }
  }

  const React = {
    Fragment: Symbol('react.fragment'),

    createElement(type, props, ...children) {
      const normalized = props === null || props === undefined ? {} : { ...props }
      if (children.length === 1) normalized.children = children[0]
      else if (children.length > 1) normalized.children = children
      return { $$element: true, type, props: normalized }
    },

    useState(initialValue) {
      const instance = requireInstance('useState')
      const index = instance.cursor++
      if (!Object.prototype.hasOwnProperty.call(instance.hooks, index)) {
        instance.hooks[index] =
          typeof initialValue === 'function' ? initialValue() : initialValue
      }
      return [instance.hooks[index], makeSetter(instance, index)]
    },

    useReducer(reducer, initialArg) {
      const instance = requireInstance('useReducer')
      const index = instance.cursor++
      if (!Object.prototype.hasOwnProperty.call(instance.hooks, index)) {
        instance.hooks[index] =
          typeof initialArg === 'function' ? initialArg() : initialArg
      }
      return [
        instance.hooks[index],
        (action) => {
          const nextValue = reducer(instance.hooks[index], action)
          if (Object.is(nextValue, instance.hooks[index])) return
          instance.hooks[index] = nextValue
          needsRender = true
        },
      ]
    },

    useEffect(effect, deps) {
      const instance = requireInstance('useEffect')
      const index = instance.cursor++
      if (
        deps !== undefined &&
        instance.deps[index] !== undefined &&
        depsEqual(instance.deps[index], deps)
      ) {
        return
      }
      instance.deps[index] = deps
      instance.effectQueue.push({ index, effect })
    },

    useLayoutEffect() {
      requireInstance('useLayoutEffect').cursor += 1
    },

    useMemo(factory, deps) {
      const instance = requireInstance('useMemo')
      const index = instance.cursor++
      const memo = instance.memo
      if (deps !== undefined && memo[index] !== undefined && depsEqual(memo[index].deps, deps)) {
        return memo[index].value
      }
      const value = factory()
      memo[index] = { deps, value }
      return value
    },

    useCallback(callback, deps) {
      const instance = requireInstance('useCallback')
      const index = instance.cursor++
      const memo = instance.memo
      if (deps !== undefined && memo[index] !== undefined && depsEqual(memo[index].deps, deps)) {
        return memo[index].value
      }
      memo[index] = { deps, value: callback }
      return callback
    },

    useRef(initialValue) {
      const instance = requireInstance('useRef')
      const index = instance.cursor++
      if (!Object.prototype.hasOwnProperty.call(instance.hooks, index)) {
        instance.hooks[index] = { current: initialValue }
      }
      return instance.hooks[index]
    },

    useSyncExternalStore(_subscribe, getSnapshot) {
      requireInstance('useSyncExternalStore').cursor += 1
      return getSnapshot()
    },
  }

  function instanceFor(key, type) {
    let instance = instances.get(key)
    if (instance === undefined || instance.type !== type) {
      if (instance !== undefined) cleanupInstance(instance)
      instance = {
        key,
        type,
        hooks: {},
        deps: {},
        memo: {},
        cursor: 0,
        effectQueue: [],
        cleanups: {},
      }
      instances.set(key, instance)
    }
    return instance
  }

  function cleanupInstance(instance) {
    for (const index of Object.keys(instance.cleanups)) {
      const cleanup = instance.cleanups[index]
      if (typeof cleanup === 'function') {
        try {
          cleanup()
        } catch (error) {
          /* ignore */
        }
      }
    }
    instance.cleanups = {}
  }

  function invoke(type, props, key) {
    const instance = instanceFor(key, type)
    instance.cursor = 0
    instance.effectQueue = []
    renderedInstances.push(instance)
    const previous = activeInstance
    activeInstance = instance
    try {
      return type(props)
    } finally {
      activeInstance = previous
    }
  }

  function runEffects(instance) {
    for (const entry of instance.effectQueue) {
      const cleanup = instance.cleanups[entry.index]
      if (typeof cleanup === 'function') {
        try {
          cleanup()
        } catch (error) {
          /* ignore */
        }
      }
      delete instance.cleanups[entry.index]
      const result = entry.effect()
      if (typeof result === 'function') instance.cleanups[entry.index] = result
    }
    instance.effectQueue = []
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
      const output = invoke(node.type, node.props, key)
      build(output, key + '/out', out)
      return
    }
    if (node.type === React.Fragment) {
      build(node.props.children, key + '/c', out)
      return
    }
    const host = { kind: 'host', type: String(node.type), props: node.props, children: [] }
    out.push(host)
    build(node.props.children, key + '/c', host.children)
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
    for (let round = 0; round < 100; round += 1) {
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

/* ---------------------------------------------------------------------- *
 * DOM-ish helpers over the rendered node tree                            *
 * ---------------------------------------------------------------------- */

function walkNodes(nodes, visit) {
  for (const node of Array.isArray(nodes) ? nodes : [nodes]) {
    if (node === undefined || node === null) continue
    visit(node)
    if (node.kind === 'host') walkNodes(node.children, visit)
  }
}

function textOf(node) {
  if (node === undefined || node === null) return ''
  if (node.kind === 'text') return node.text
  if (node.kind !== 'host') return ''
  return node.children.map(textOf).join('')
}

function hasClass(node, className) {
  if (node === undefined || node === null || node.kind !== 'host') return false
  const value = node.props.className
  if (typeof value !== 'string') return false
  return value.split(/\s+/).includes(className)
}

function findAll(runtime, predicate) {
  const found = []
  walkNodes(runtime.nodes(), (node) => {
    if (predicate(node)) found.push(node)
  })
  return found
}

function findAllByClass(runtime, className) {
  return findAll(runtime, (node) => hasClass(node, className))
}

function findButton(runtime, label) {
  const buttons = findAll(
    runtime,
    (node) => node.kind === 'host' && node.type === 'button' && textOf(node) === label,
  )
  assert.ok(buttons.length > 0, 'expected a button labelled "' + label + '"')
  return buttons[0]
}

function findAllByText(runtime, text) {
  return findAll(runtime, (node) => node.kind === 'host' && textOf(node) === text)
}

function includesText(runtime, fragment) {
  let found = false
  walkNodes(runtime.nodes(), (node) => {
    if (!found && node.kind === 'host' && textOf(node).includes(fragment)) found = true
  })
  return found
}

/* ---------------------------------------------------------------------- *
 * Fake document                                                          *
 * ---------------------------------------------------------------------- */

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

/* ---------------------------------------------------------------------- *
 * Fake Cordis context                                                    *
 * ---------------------------------------------------------------------- */

function createCtx() {
  const env = {
    effectLabels: [],
    disposers: [],
    tabDefinition: null,
    slotRegistrations: [],
    slotInjects: [],
    localeRegistrations: [],
  }

  const ctx = {
    effect(callback, label) {
      env.effectLabels.push(String(label))
      const dispose = callback()
      env.disposers.push(typeof dispose === 'function' ? dispose : () => {})
      return () => {}
    },
    slots: {
      inject(name, callback) {
        env.slotInjects.push(name)
        const dispose = callback()
        if (typeof dispose === 'function') env.disposers.push(dispose)
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

/* ---------------------------------------------------------------------- *
 * Module setup                                                           *
 * ---------------------------------------------------------------------- */

function setup(options = {}) {
  const runtime = createRuntime()
  const documentStub = createDocumentStub()
  const calls = []
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
      let parsed = null
      try {
        parsed = JSON.parse(init.body)
      } catch (error) {
        parsed = null
      }
      calls.push({ url: requestUrl, method, body: parsed })
      if (typeof options.responder !== 'function') {
        throw new Error('unexpected fetch: ' + requestUrl)
      }
      const payload = options.responder(method, parsed)
      return {
        ok: true,
        status: 200,
        async json() {
          return payload
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

  assert.ok(captured.spec, 'window.__ModuleLoader__.load was called')
  const { env, ctx } = createCtx()
  captured.module.apply(ctx)

  const body = env.slotRegistrations[0] !== undefined
    ? env.slotRegistrations[0].component
    : undefined

  return {
    runtime,
    documentStub,
    calls,
    env,
    plugin: captured.module,
    spec: captured.spec,
    body,
  }
}

/* ---------------------------------------------------------------------- *
 * Host stub                                                              *
 * ---------------------------------------------------------------------- */

function createHostStub() {
  const state = {
    list: {
      ok: true,
      cwd: 'D:/proj',
      projectRoot: 'D:/proj',
      counts: { project: 2, global: 1, total: 3, shadowed: 1, broken: 1 },
      tiers: [
        {
          rank: 100,
          scope: 'project',
          id: 'project-dsh',
          rootId: 'project-dsh',
          source: 'project-dsh',
          path: 'D:/proj/.dsh/skills',
          exists: true,
          writable: true,
          skills: [
            {
              name: 'alpha-skill',
              description: 'Alpha does things',
              path: 'D:/proj/.dsh/skills/alpha-skill/SKILL.md',
              rootId: 'project-dsh',
              source: 'project-dsh',
              rank: 100,
              modelInvocable: true,
              userInvocable: false,
              shadowed: false,
              origin: 'managed',
              updatable: true,
              upstream: {
                repo: 'obra/superpowers',
                type: 'github',
                url: 'https://github.com/obra/superpowers',
                skillPath: 'skills/alpha-skill',
                installedAt: '2026-10-01T08:00:00.000Z',
                updatedAt: '2026-10-02T09:30:00.000Z',
                hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
              },
            },
            {
              name: 'beta-skill',
              description: 'Beta duplicate',
              path: 'D:/proj/.agents/skills/beta-skill/SKILL.md',
              rootId: 'project-agents',
              source: 'project-agents',
              rank: 200,
              modelInvocable: true,
              userInvocable: true,
              shadowed: true,
              origin: 'local',
              updatable: false,
              upstream: null,
              shadowedBy: {
                rootId: 'project-dsh',
                path: 'D:/proj/.dsh/skills/beta-skill/SKILL.md',
                name: 'beta-skill',
              },
            },
          ],
        },
        {
          rank: 200,
          scope: 'project',
          id: 'project-agents',
          rootId: 'project-agents',
          source: 'project-agents',
          path: 'D:/proj/.agents/skills',
          exists: false,
          writable: false,
          skills: [],
        },
        {
          rank: 400,
          scope: 'global',
          id: 'global-dsh',
          rootId: 'global-dsh',
          source: 'user-dsh',
          path: 'C:/Users/tester/.dsh/skills',
          exists: true,
          writable: false,
          skills: [],
        },
        {
          rank: 500,
          scope: 'global',
          id: 'global-agents',
          rootId: 'global-agents',
          source: 'user-agents',
          path: 'C:/Users/tester/.agents/skills',
          exists: true,
          writable: true,
          skills: [],
        },
      ],
      errors: [
        {
          rootId: 'project-dsh',
          path: 'D:/proj/.dsh/skills/broken-skill/SKILL.md',
          message: 'missing description',
        },
      ],
      upstreams: [
        { repo: 'obra/superpowers', count: 2 },
        { repo: 'anthropics/skills', count: 1 },
      ],
      missing: [],
    },
  }

  state.respond = (method, payload) => {
    if (method === 'list') return state.list
    if (method === 'read') {
      const rootId =
        typeof payload.rootId === 'string' && payload.rootId !== ''
          ? payload.rootId
          : 'project-dsh'
      const base =
        rootId === 'project-agents'
          ? 'D:/proj/.agents/skills'
          : rootId === 'global-agents'
            ? 'C:/Users/tester/.agents/skills'
            : rootId === 'global-dsh'
              ? 'C:/Users/tester/.dsh/skills'
              : 'D:/proj/.dsh/skills'
      return {
        ok: true,
        name: payload.name,
        path: base + '/' + payload.name + '/SKILL.md',
        rootId: rootId,
        scope: rootId.startsWith('project') ? 'project' : 'global',
        writable: rootId !== 'project-agents' && rootId !== 'global-dsh',
        content: '---\nname: ' + payload.name + '\n---\n\n# ' + payload.name + '\n',
      }
    }
    if (method === 'write') {
      return {
        ok: true,
        name: payload.name,
        rootId: payload.rootId,
        path: 'D:/proj/.dsh/skills/' + payload.name + '/SKILL.md',
        created: true,
      }
    }
    if (method === 'delete') {
      return {
        ok: true,
        name: payload.name,
        rootId: payload.rootId,
        path: 'D:/proj/.dsh/skills/' + payload.name + '/SKILL.md',
        deleted: true,
      }
    }
    if (method === 'toggle') {
      return {
        ok: true,
        name: payload.name,
        path: 'D:/proj/.dsh/skills/' + payload.name + '/SKILL.md',
        rootId: payload.rootId,
        modelInvocable: payload.field === 'model' ? payload.value : true,
        userInvocable: payload.field === 'user' ? payload.value : true,
        content: 'toggled: ' + payload.field + '=' + String(payload.value),
      }
    }
    if (method === 'batch') {
      const items = Array.isArray(payload.items) ? payload.items : []
      return {
        ok: true,
        summary: { total: items.length, succeeded: items.length, failed: 0 },
        results: items.map((item) => ({
          name: item.name,
          rootId: item.rootId,
          ok: true,
        })),
      }
    }
    if (method === 'checkUpdates') {
      return {
        ok: true,
        checkedAt: '2026-11-04T09:00:00.000Z',
        results: [
          {
            name: 'alpha-skill',
            status: 'update-available',
            upstreamHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2',
          },
          { name: 'beta-skill', status: 'up-to-date' },
        ],
        counts: { available: 1, uptodate: 1, unknown: 0 },
      }
    }
    if (method === 'updateSkills') {
      const items = Array.isArray(payload.items) ? payload.items : []
      return {
        ok: true,
        results: items.map((item) => ({
          name: item.name,
          rootId: item.rootId,
          ok: true,
          status: 'updated',
          backupPath: 'D:/proj/.dsh/skills/' + item.name + '.dsh-bak-1',
        })),
        counts: { ok: items.length, failed: 0 },
      }
    }
    return { ok: false, error: { code: 'NOT_FOUND', message: 'no stub for ' + method } }
  }

  return state
}

function panelProps(overrides = {}) {
  return {
    sessionId: 'session-1',
    t: (key) => 'L:' + key,
    ...overrides,
  }
}

/* ---------------------------------------------------------------------- *
 * Static registration tests                                              *
 * ---------------------------------------------------------------------- */

test('client.js loads through the module table as a client plugin', () => {
  const { spec, plugin } = setup()

  assert.equal(spec.id, NAMESPACE)
  assert.ok(plugin !== null && typeof plugin === 'object', 'factory returned the plugin')
  assert.equal(typeof plugin.apply, 'function')
  assert.ok(Array.isArray(plugin.inject), 'inject is a service list')
  for (const service of ['slots', 'locale', 'sidebarRightTabs']) {
    assert.ok(plugin.inject.includes(service), 'inject must list ' + service)
  }
})

test('apply registers the tab type, guide entry and pane body', () => {
  const { env, spec } = setup()

  assert.equal(spec.id, NAMESPACE)

  const tab = env.tabDefinition
  assert.ok(tab !== null, 'sidebarRightTabs.register was called')
  assert.equal(tab.id, TAB_ID)
  assert.equal(tab.kind, TAB_ID)
  assert.equal(typeof tab.title, 'function')
  assert.equal(typeof tab.title('dsh-project-skills-mng://skills'), 'string')

  assert.ok(Array.isArray(tab.guide) && tab.guide.length > 0, 'guide must not be empty')
  const guide = tab.guide[0]
  assert.ok(typeof guide.id === 'string' && guide.id !== '', 'guide entry has a unique id')
  assert.equal(typeof guide.title, 'function')
  assert.equal(typeof guide.title(), 'string')
  assert.equal(typeof guide.order, 'number')
  // The shipped guide body calls `entry.description?.()`, so a guide description
  // must be a zero-arg function returning the text (a plain string crashes).
  assert.equal(typeof guide.description, 'function')
  assert.equal(typeof guide.description(), 'string')
  assert.ok(guide.description().length > 0)

  assert.deepEqual(env.slotInjects, [PANE_SLOT])
  const body = env.slotRegistrations.find((entry) => entry.definition.name === PANE_SLOT)
  assert.ok(body !== undefined, 'the pane body was registered on ' + PANE_SLOT)
  assert.equal(body.definition.key, TAB_ID)
  assert.equal(typeof body.component, 'function')
  assert.equal(body.definition.locale, NAMESPACE)
  assert.equal(typeof body.definition.inject, 'function')

  const injected = body.definition.inject('session-42')
  assert.equal(injected.sessionId, 'session-42')
  assert.equal(typeof injected.translate, 'function')
  assert.equal(typeof injected.translate('list.title'), 'string')

  assert.deepEqual(
    env.localeRegistrations.map((entry) => entry.language).sort(),
    ['en', 'zh'],
  )
  for (const entry of env.localeRegistrations) {
    assert.equal(entry.ns, NAMESPACE)
    assert.equal(typeof entry.dictionary, 'object')
  }
})

test('zh and en dictionaries have identical keys and non-empty strings', () => {
  const { env } = setup()

  const zh = env.localeRegistrations.find((entry) => entry.language === 'zh')
  const en = env.localeRegistrations.find((entry) => entry.language === 'en')
  assert.ok(zh !== undefined && en !== undefined)

  const zhKeys = Object.keys(zh.dictionary).sort()
  const enKeys = Object.keys(en.dictionary).sort()
  assert.deepEqual(enKeys, zhKeys)

  for (const key of zhKeys) {
    assert.equal(typeof zh.dictionary[key], 'string', 'zh[' + key + '] is a string')
    assert.equal(typeof en.dictionary[key], 'string', 'en[' + key + '] is a string')
    assert.ok(zh.dictionary[key].length > 0, 'zh[' + key + '] is not empty')
    assert.ok(en.dictionary[key].length > 0, 'en[' + key + '] is not empty')
  }
})

test('the scoped stylesheet is injected and removed on dispose', () => {
  const { env, documentStub } = setup()

  assert.equal(documentStub.head.children.length, 1, 'exactly one style tag was injected')
  const tag = documentStub.head.children[0]
  assert.equal(tag.tagName, 'STYLE')
  assert.notEqual(tag.getAttribute('data-dsh-project-skills-mng'), null)
  assert.equal(tag.getAttribute('data-plugin-css'), NAMESPACE)
  assert.ok(tag.textContent.includes('.dps-root'), 'styles are scoped under .dps-')

  for (const dispose of env.disposers) dispose()
  assert.equal(documentStub.head.children.length, 0, 'style tag was removed on dispose')
})

/* ---------------------------------------------------------------------- *
 * Panel rendering / interaction tests                                    *
 * ---------------------------------------------------------------------- */

test('without a session id the panel renders an empty state and does not call the host', async () => {
  const host = createHostStub()
  const { runtime, body, calls } = setup({ responder: host.respond })

  runtime.mount(runtime.React.createElement(body, { t: (key) => 'L:' + key }))
  await runtime.settle()

  assert.equal(includesText(runtime, 'L:session.required'), true)
  assert.equal(calls.length, 0, 'no HTTP call is made without a session id')
})

test('the list requests the relative API URL and renders roots, rows and warnings', async () => {
  const host = createHostStub()
  const { runtime, body, calls } = setup({ responder: host.respond })

  runtime.mount(runtime.React.createElement(body, panelProps()))
  await runtime.settle()

  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'list')
  assert.equal(calls[0].url, PAGE_BASE + 'dsh-project-skills-mng/api/list')
  assert.equal(calls[0].body.sessionId, 'session-1')

  const rows = findAllByClass(runtime, 'dps-row')
  assert.equal(rows.length, 2)
  assert.ok(textOf(rows[0]).includes('alpha-skill'))
  assert.ok(textOf(rows[0]).includes('Alpha does things'))
  assert.ok(textOf(rows[1]).includes('beta-skill'))
  assert.ok(textOf(rows[1]).includes('L:shadowed.by'))

  // One section per DSH root, in rank order. The path line only shows up for a
  // tier that is missing or read-only, so a healthy profile stays quiet.
  const tierMeta = findAllByClass(runtime, 'dps-tier-meta')
  assert.equal(tierMeta.length, 2)
  assert.ok(textOf(tierMeta[0]).includes('L:root.missing'))
  assert.ok(textOf(tierMeta[0]).includes('L:root.readonly'))
  assert.equal(textOf(tierMeta[1]).includes('L:root.readonly'), true)
  assert.equal(textOf(tierMeta[1]).includes('L:root.missing'), false)
  const ranks = findAllByClass(runtime, 'dps-rank').map((node) => textOf(node))
  assert.deepEqual(ranks, ['100', '200', '400', '500'])

  // Broken SKILL.md entries show up as a collapsible warning bar.
  assert.equal(findAllByClass(runtime, 'dps-warn').length, 1)
  assert.equal(findAllByClass(runtime, 'dps-warn-list').length, 0, 'collapsed by default')
  findButton(runtime, 'L:warning.expand').props.onClick()
  await runtime.settle()
  assert.equal(findAllByClass(runtime, 'dps-warn-list').length, 1)
  assert.equal(includesText(runtime, 'broken-skill/SKILL.md'), true)

  // Empty group hint.
  assert.equal(includesText(runtime, 'L:group.empty'), true)
})

test('row → detail → toggle → edit → save drives the full round trip', async () => {
  const host = createHostStub()
  const { runtime, body, calls } = setup({ responder: host.respond })

  runtime.mount(runtime.React.createElement(body, panelProps()))
  await runtime.settle()

  findAllByClass(runtime, 'dps-row')[0].props.onClick()
  await runtime.settle()

  const readCall = calls.find((call) => call.method === 'read')
  assert.ok(readCall !== undefined)
  assert.equal(readCall.body.name, 'alpha-skill')
  assert.equal(readCall.body.sessionId, 'session-1')
  assert.equal(includesText(runtime, 'alpha-skill'), true)
  assert.equal(findAllByClass(runtime, 'dps-body').length, 1)
  assert.equal(includesText(runtime, 'L:detail.content'), true)
  assert.equal(includesText(runtime, 'name: alpha-skill'), true)

  // Two invocability switches, model on / user off for alpha.
  const switches = findAllByClass(runtime, 'dps-switch')
  assert.equal(switches.length, 2)
  assert.equal(switches[0].props['data-on'], 'true')
  assert.equal(switches[1].props['data-on'], 'false')

  switches[0].props.onClick()
  await runtime.settle()

  const toggleCall = calls.find((call) => call.method === 'toggle')
  assert.ok(toggleCall !== undefined)
  assert.deepEqual(toggleCall.body, {
    rootId: 'project-dsh',
    name: 'alpha-skill',
    field: 'model',
    value: false,
    sessionId: 'session-1',
  })
  assert.equal(includesText(runtime, 'toggled: model=false'), true)

  const editButton = findButton(runtime, 'L:detail.edit')
  assert.notEqual(editButton.props.disabled, true)
  editButton.props.onClick()
  await runtime.settle()

  const editors = findAllByClass(runtime, 'dps-editor')
  assert.equal(editors.length, 1)
  assert.equal(typeof editors[0].props.value, 'string')
  // The toggle above rewrote the file, so the editor starts from that content.
  assert.equal(editors[0].props.value, 'toggled: model=false')

  editors[0].props.onChange({ target: { value: 'edited content' } })
  await runtime.settle()
  findButton(runtime, 'L:edit.save').props.onClick()
  await runtime.settle()

  const writeCall = calls.find(
    (call) => call.method === 'write' && call.body.content === 'edited content',
  )
  assert.ok(writeCall !== undefined)
  assert.equal(writeCall.body.name, 'alpha-skill')
  assert.equal(writeCall.body.rootId, 'project-dsh')

  // Saving returns to the list and refreshes it.
  assert.equal(findAllByClass(runtime, 'dps-row').length, 2)
  assert.equal(calls.filter((call) => call.method === 'list').length, 2)
})

test('create writes the standard SKILL.md template and opens the editor', async () => {
  const host = createHostStub()
  const { runtime, body, calls } = setup({ responder: host.respond })

  runtime.mount(runtime.React.createElement(body, panelProps()))
  await runtime.settle()

  findButton(runtime, 'L:list.new').props.onClick()
  await runtime.settle()

  // Only writable roots are offered: project-dsh (100) and global-agents (500).
  const selects = findAllByClass(runtime, 'dps-select')
  assert.equal(selects.length, 1)
  const options = selects[0].props.children
  assert.ok(Array.isArray(options))
  // The option list is built inside the vm realm, so compare it as JSON.
  assert.deepEqual(
    JSON.parse(JSON.stringify(options.map((option) => option.props.value))),
    ['project-dsh', 'global-agents'],
  )
  assert.equal(selects[0].props.value, 'project-dsh')

  // Submit stays disabled until the form is valid.
  assert.equal(findButton(runtime, 'L:create.submit').props.disabled, true)

  const inputs = findAllByClass(runtime, 'dps-input')
  assert.equal(inputs.length, 2)
  inputs[0].props.onChange({ target: { value: 'gamma-skill' } })
  await runtime.settle()
  const inputsAfterRename = findAllByClass(runtime, 'dps-input')
  inputsAfterRename[1].props.onChange({ target: { value: 'Gamma does things' } })
  await runtime.settle()

  findButton(runtime, 'L:create.submit').props.onClick()
  await runtime.settle()

  const writeCall = calls.find((call) => call.method === 'write')
  assert.ok(writeCall !== undefined)
  assert.equal(writeCall.body.rootId, 'project-dsh')
  assert.equal(writeCall.body.name, 'gamma-skill')
  assert.ok(writeCall.body.content.startsWith('---\nname: gamma-skill\n'))
  assert.ok(writeCall.body.content.includes('description: Gamma does things\n'))
  assert.ok(writeCall.body.content.includes('# Gamma Skill\n'))
  assert.ok(writeCall.body.content.includes('<describe what this skill does and when to use it>'))

  // Creation lands in the editor with the generated template.
  const editors = findAllByClass(runtime, 'dps-editor')
  assert.equal(editors.length, 1)
  assert.equal(editors[0].props.value, writeCall.body.content)
})

test('a shadowed row reads its own file and stays read-only when its root is', async () => {
  const host = createHostStub()
  const { runtime, body, calls } = setup({ responder: host.respond })

  runtime.mount(runtime.React.createElement(body, panelProps()))
  await runtime.settle()

  findAllByClass(runtime, 'dps-row')[1].props.onClick()
  await runtime.settle()

  // The row's rootId travels with the read, so the duplicate's own body shows.
  const readCall = calls.find((call) => call.method === 'read')
  assert.equal(readCall.body.rootId, 'project-agents')
  assert.equal(includesText(runtime, 'L:detail.mismatch'), false)
  // Editing is off only because that root is read-only, never because of a mismatch.
  assert.equal(findButton(runtime, 'L:detail.edit').props.disabled, true)
  assert.equal(includesText(runtime, 'L:root.readonly'), true)

  findButton(runtime, 'L:detail.delete').props.onClick()
  await runtime.settle()
  assert.equal(includesText(runtime, 'L:confirm.delete'), true)

  findButton(runtime, 'L:confirm.deleteYes').props.onClick()
  await runtime.settle()

  const deleteCall = calls.find((call) => call.method === 'delete')
  assert.ok(deleteCall !== undefined)
  assert.equal(deleteCall.body.name, 'beta-skill')
  assert.equal(deleteCall.body.rootId, 'project-agents')
  assert.equal(calls.filter((call) => call.method === 'list').length, 2)
})

test('a shadowed row in a writable root edits in place through its own rootId', async () => {
  const host = createHostStub()
  host.list.tiers[3].skills.push({
    name: 'delta-skill',
    description: 'Delta duplicate',
    path: 'C:/Users/tester/.agents/skills/delta-skill/SKILL.md',
    rootId: 'global-agents',
    source: 'user-agents',
    rank: 500,
    modelInvocable: true,
    userInvocable: true,
    shadowed: true,
    shadowedBy: {
      rootId: 'global-dsh',
      path: 'C:/Users/tester/.dsh/skills/delta-skill/SKILL.md',
      name: 'delta-skill',
    },
  })
  const { runtime, body, calls } = setup({ responder: host.respond })

  runtime.mount(runtime.React.createElement(body, panelProps()))
  await runtime.settle()

  // Rows: alpha, beta (project) then delta (global).
  const rows = findAllByClass(runtime, 'dps-row')
  assert.equal(rows.length, 3)
  rows[2].props.onClick()
  await runtime.settle()

  const readCall = calls.find((call) => call.method === 'read')
  assert.equal(readCall.body.name, 'delta-skill')
  assert.equal(readCall.body.rootId, 'global-agents')
  assert.equal(includesText(runtime, 'L:detail.mismatch'), false)

  const editButton = findButton(runtime, 'L:detail.edit')
  assert.notEqual(editButton.props.disabled, true)
  editButton.props.onClick()
  await runtime.settle()

  findAllByClass(runtime, 'dps-editor')[0].props.onChange({ target: { value: 'delta body' } })
  await runtime.settle()
  findButton(runtime, 'L:edit.save').props.onClick()
  await runtime.settle()

  const writeCall = calls.find(
    (call) => call.method === 'write' && call.body.content === 'delta body',
  )
  assert.ok(writeCall !== undefined)
  assert.equal(writeCall.body.name, 'delta-skill')
  assert.equal(writeCall.body.rootId, 'global-agents')
})

test('a linked skill shows the link badge and reads through the link', async () => {
  const host = createHostStub()
  host.list.tiers[2].skills.push({
    name: 'linked-skill',
    description: 'Mirrored from the agents home',
    path: 'C:/Users/tester/.dsh/skills/linked-skill/SKILL.md',
    rootId: 'global-dsh',
    source: 'user-dsh',
    rank: 400,
    modelInvocable: true,
    userInvocable: true,
    shadowed: false,
    linked: true,
    realPath: 'C:/Users/tester/.agents/skills/linked-skill/SKILL.md',
  })
  const baseRespond = host.respond
  host.respond = (method, payload) => {
    if (method === 'read' && payload.name === 'linked-skill') {
      return {
        ok: true,
        name: payload.name,
        path: 'C:/Users/tester/.dsh/skills/linked-skill/SKILL.md',
        rootId: 'global-dsh',
        scope: 'global',
        writable: true,
        linked: true,
        realPath: 'C:/Users/tester/.agents/skills/linked-skill/SKILL.md',
        content: '---\nname: linked-skill\n---\n\n# linked-skill\n',
      }
    }
    return baseRespond(method, payload)
  }
  const { runtime, body, calls } = setup({ responder: host.respond })

  runtime.mount(runtime.React.createElement(body, panelProps()))
  await runtime.settle()

  // Rows: alpha, beta (project) then linked-skill (global).
  const rows = findAllByClass(runtime, 'dps-row')
  assert.equal(rows.length, 3)
  assert.ok(textOf(rows[2]).includes('L:badge.linked'))
  const badge = findAllByClass(runtime, 'dps-badge-link')
  assert.equal(badge.length, 1)
  assert.equal(badge[0].props.title, 'C:/Users/tester/.agents/skills/linked-skill/SKILL.md')

  rows[2].props.onClick()
  await runtime.settle()

  const readCall = calls.find((call) => call.method === 'read')
  assert.equal(readCall.body.name, 'linked-skill')
  assert.equal(readCall.body.rootId, 'global-dsh')
  // The detail view explains the link and offers to remove the link, not the file.
  assert.equal(includesText(runtime, 'L:detail.linked'), true)
  findButton(runtime, 'L:detail.delete').props.onClick()
  await runtime.settle()
  assert.equal(includesText(runtime, 'L:confirm.deleteLinked'), true)
  assert.equal(findButton(runtime, 'L:confirm.unlinkYes') !== undefined, true)
})

test('host errors are shown in the panel instead of escaping the render', async () => {
  const { runtime, body } = setup({
    responder: (method) => {
      if (method === 'list') {
        return { ok: false, error: { code: 'INTERNAL', message: 'boom' } }
      }
      return { ok: false, error: { code: 'NOT_FOUND', message: 'no stub' } }
    },
  })

  runtime.mount(runtime.React.createElement(body, panelProps()))
  await runtime.settle()

  assert.equal(includesText(runtime, 'L:error.title'), true)
  assert.equal(includesText(runtime, 'INTERNAL'), true)
  assert.equal(includesText(runtime, 'boom'), true)
})

/* ---------------------------------------------------------------------- *
 * Filters and multi-select batch actions (batch-and-filter feature)      *
 * ---------------------------------------------------------------------- */

// Templates with placeholders so tests can assert the interpolated numbers.
const PARAM_TEMPLATES = {
  'batch.result': 'success={succeeded} failed={failed}',
  'selection.count': 'selected={count}',
  'batch.confirmDelete': 'delete {count}',
  'batch.confirmDeleteLinked': 'delete {count} linked={linked}',
  'batch.confirmMove': 'move {count} to={to}',
  'batch.confirmCopy': 'copy {count} to={to}',
  'batch.failure': '{name};{reason}',
  'shadowed.by': 'shadowed by {path}',
  'error.sourceRemoveFailed': 'source-remove-failed',
  'check.available': '{count} updates available',
  'check.unknown': '{count} unknown',
  'check.reason': '{name}: {reason}',
  'detail.checkUnknown': 'unverified: {reason}',
}

function parameterizedTranslate(key) {
  return Object.prototype.hasOwnProperty.call(PARAM_TEMPLATES, key)
    ? PARAM_TEMPLATES[key]
    : 'L:' + key
}

async function mountPanel(host, overrides = {}) {
  const result = setup({ responder: host.respond })
  result.runtime.mount(
    result.runtime.React.createElement(
      result.body,
      panelProps({ t: parameterizedTranslate, ...overrides }),
    ),
  )
  await result.runtime.settle()
  return result
}

async function typeQuery(runtime, value) {
  const search = findAllByClass(runtime, 'dps-search')
  assert.equal(search.length, 1, 'expected one search input')
  search[0].props.onChange({ target: { value: value } })
  await runtime.settle()
  // The search box is debounced; wait past the debounce window.
  await new Promise((resolve) => setTimeout(resolve, 160))
  await runtime.settle()
}

function visibleNames(runtime) {
  return findAllByClass(runtime, 'dps-name').map((node) => textOf(node))
}

function tierChip(runtime, rootId) {
  const chips = findAllByClass(runtime, 'dps-chip').filter(
    (node) => node.props['data-tier'] === rootId,
  )
  assert.equal(chips.length, 1, 'expected a chip for tier ' + rootId)
  return chips[0]
}

// The filter chips live behind a "筛选" disclosure: opening it is one click on
// the toggle in the search row, and every chip test starts from that state.
async function openFilters(runtime) {
  const toggle = findAllByClass(runtime, 'dps-filter-toggle')
  assert.equal(toggle.length, 1, 'expected one filter toggle')
  if (toggle[0].props['aria-expanded'] !== 'true') {
    toggle[0].props.onClick()
    await runtime.settle()
  }
}

test('the filter chips start folded and open from the toolbar toggle', async () => {
  const host = createHostStub()
  const { runtime } = await mountPanel(host)

  assert.equal(findAllByClass(runtime, 'dps-filter-panel').length, 0)
  assert.equal(findAllByClass(runtime, 'dps-chip').length, 0)
  assert.equal(findAllByClass(runtime, 'dps-filter-toggle')[0].props['aria-expanded'], 'false')

  await openFilters(runtime)
  assert.equal(findAllByClass(runtime, 'dps-filter-panel').length, 1)
  assert.equal(findAllByClass(runtime, 'dps-filter-toggle')[0].props['aria-expanded'], 'true')
  assert.equal(findAllByClass(runtime, 'dps-search').length, 1)
})

function rowCheckboxes(runtime) {
  return findAllByClass(runtime, 'dps-check')
}

function selectedNames(runtime) {
  const checks = rowCheckboxes(runtime)
  const names = findAllByClass(runtime, 'dps-name')
  return checks
    .map((check, index) => (check.props.checked === true ? textOf(names[index]) : null))
    .filter((name) => name !== null)
}

test('filters narrow the visible rows by query and tier', async () => {
  const host = createHostStub()
  const { runtime } = await mountPanel(host)
  await openFilters(runtime)

  assert.deepEqual(visibleNames(runtime), ['alpha-skill', 'beta-skill'])

  await typeQuery(runtime, 'ALPHA')
  assert.deepEqual(visibleNames(runtime), ['alpha-skill'])

  tierChip(runtime, 'project-dsh').props.onClick()
  await runtime.settle()
  assert.deepEqual(visibleNames(runtime), [])
  assert.equal(includesText(runtime, 'L:filter.empty'), true)
})

test('turning a tier chip off hides that tier and its count', async () => {
  const host = createHostStub()
  const { runtime } = await mountPanel(host)
  await openFilters(runtime)

  assert.equal(findAllByClass(runtime, 'dps-group').length, 4)

  tierChip(runtime, 'project-dsh').props.onClick()
  await runtime.settle()

  assert.deepEqual(visibleNames(runtime), [])
  assert.equal(findAllByClass(runtime, 'dps-group').length, 3)
  const ranks = findAllByClass(runtime, 'dps-rank').map((node) => textOf(node))
  assert.deepEqual(ranks, ['200', '400', '500'])
  // The tiers left over still show their one-line empty hint.
  assert.equal(findAllByClass(runtime, 'dps-hint').length >= 3, true)
})

test('the filter bar shows a clear button only when a filter is active', async () => {
  const host = createHostStub()
  const { runtime } = await mountPanel(host)

  assert.equal(findAllByClass(runtime, 'dps-clear').length, 0)

  await typeQuery(runtime, 'beta')
  assert.equal(findAllByClass(runtime, 'dps-clear').length, 1)

  findAllByClass(runtime, 'dps-clear')[0].props.onClick()
  await runtime.settle()
  assert.equal(findAllByClass(runtime, 'dps-clear').length, 0)
  assert.equal(findAllByClass(runtime, 'dps-search')[0].props.value, '')
  assert.deepEqual(visibleNames(runtime), ['alpha-skill', 'beta-skill'])
})

test('selection mode adds checkboxes and an action bar, and Esc exits', async () => {
  const host = createHostStub()
  const { runtime } = await mountPanel(host)

  findButton(runtime, 'L:list.select').props.onClick()
  await runtime.settle()

  assert.equal(rowCheckboxes(runtime).length, 2)
  assert.equal(findAllByClass(runtime, 'dps-actionbar').length, 1)
  assert.equal(includesText(runtime, 'selected=0'), true)
  assert.equal(includesText(runtime, 'L:list.selectExit'), true)

  findAllByClass(runtime, 'dps-row')[0].props.onClick()
  await runtime.settle()
  assert.equal(includesText(runtime, 'selected=1'), true)
  assert.equal(rowCheckboxes(runtime)[0].props.checked, true)
  assert.equal(rowCheckboxes(runtime)[1].props.checked, false)

  findAllByClass(runtime, 'dps-list')[0].props.onKeyDown({
    key: 'Escape',
    preventDefault() {},
  })
  await runtime.settle()

  assert.equal(rowCheckboxes(runtime).length, 0)
  assert.equal(findAllByClass(runtime, 'dps-actionbar').length, 0)
  // Leaving selection mode restores the plain "select" toolbar button.
  assert.equal(findButton(runtime, 'L:list.select') !== undefined, true)
})

test('filtering hidden rows out also removes them from the selection', async () => {
  const host = createHostStub()
  const { runtime } = await mountPanel(host)

  findButton(runtime, 'L:list.select').props.onClick()
  await runtime.settle()
  findAllByClass(runtime, 'dps-row')[0].props.onClick()
  await runtime.settle()
  findAllByClass(runtime, 'dps-row')[1].props.onClick()
  await runtime.settle()
  assert.equal(includesText(runtime, 'selected=2'), true)

  await typeQuery(runtime, 'alpha')
  assert.deepEqual(visibleNames(runtime), ['alpha-skill'])
  assert.equal(includesText(runtime, 'selected=1'), true)

  // Clearing the filter must not resurrect the pruned row.
  findAllByClass(runtime, 'dps-clear')[0].props.onClick()
  await runtime.settle()
  assert.deepEqual(visibleNames(runtime), ['alpha-skill', 'beta-skill'])
  assert.deepEqual(selectedNames(runtime), ['alpha-skill'])
})

test('shift-click extends the selection across the visible row order', async () => {
  const host = createHostStub()
  const { runtime } = await mountPanel(host)

  findButton(runtime, 'L:list.select').props.onClick()
  await runtime.settle()

  findAllByClass(runtime, 'dps-row')[0].props.onClick()
  await runtime.settle()
  findAllByClass(runtime, 'dps-row')[1].props.onClick({ shiftKey: true })
  await runtime.settle()

  assert.equal(includesText(runtime, 'selected=2'), true)
  assert.deepEqual(selectedNames(runtime), ['alpha-skill', 'beta-skill'])
})

test('select-all in a tier covers only the rows the filter leaves visible', async () => {
  const host = createHostStub()
  const { runtime } = await mountPanel(host)

  findButton(runtime, 'L:list.select').props.onClick()
  await runtime.settle()

  await typeQuery(runtime, 'beta')
  assert.deepEqual(visibleNames(runtime), ['beta-skill'])

  const selectAll = findAllByClass(runtime, 'dps-select-all').filter(
    (node) => node.props['data-tier'] === 'project-dsh',
  )
  assert.equal(selectAll.length, 1)
  selectAll[0].props.onClick()
  await runtime.settle()
  assert.deepEqual(selectedNames(runtime), ['beta-skill'])
})

test('deleting the selection posts one batch request and refreshes the list', async () => {
  const host = createHostStub()
  const { runtime, calls } = await mountPanel(host)

  findButton(runtime, 'L:list.select').props.onClick()
  await runtime.settle()
  findAllByClass(runtime, 'dps-row')[0].props.onClick()
  await runtime.settle()
  findAllByClass(runtime, 'dps-row')[1].props.onClick()
  await runtime.settle()

  findButton(runtime, 'L:batch.delete').props.onClick()
  await runtime.settle()
  // Deleting plain skills confirms with the plain copy.
  assert.equal(includesText(runtime, 'delete 2'), true)

  findButton(runtime, 'L:batch.confirm').props.onClick()
  await runtime.settle()

  const batchCall = calls.find((call) => call.method === 'batch')
  assert.ok(batchCall !== undefined, 'the batch endpoint was called')
  assert.deepEqual(JSON.parse(JSON.stringify(batchCall.body)), {
    sessionId: 'session-1',
    action: 'delete',
    items: [
      { name: 'alpha-skill', rootId: 'project-dsh' },
      { name: 'beta-skill', rootId: 'project-agents' },
    ],
  })
  assert.equal(calls.filter((call) => call.method === 'list').length, 2)
  assert.equal(includesText(runtime, 'success=2 failed=0'), true)
})

test('a move keeps the own tier in the target list and always sends conflict skip', async () => {
  const host = createHostStub()
  const { runtime, calls } = await mountPanel(host)

  findButton(runtime, 'L:list.select').props.onClick()
  await runtime.settle()
  findAllByClass(runtime, 'dps-row')[0].props.onClick()
  await runtime.settle()

  const moveSelect = findAll(
    runtime,
    (node) =>
      node.kind === 'host' && node.type === 'select' && node.props['data-action'] === 'move',
  )
  assert.equal(moveSelect.length, 1)

  // The row's own tier stays selectable; the host rejects that item per row.
  const ownTarget = findAll(
    runtime,
    (node) =>
      node.kind === 'host' &&
      node.type === 'option' &&
      node.props['data-target'] === 'project-dsh',
  )
  assert.ok(ownTarget.length >= 1, 'own tier must remain a legal target')

  moveSelect[0].props.onChange({ target: { value: 'project-dsh' } })
  await runtime.settle()
  assert.equal(includesText(runtime, 'move 1 to='), true)

  findButton(runtime, 'L:batch.confirm').props.onClick()
  await runtime.settle()

  const batchCall = calls.find((call) => call.method === 'batch')
  assert.ok(batchCall !== undefined)
  assert.deepEqual(JSON.parse(JSON.stringify(batchCall.body)), {
    sessionId: 'session-1',
    action: 'transfer',
    transferMode: 'move',
    conflict: 'skip',
    target: { rootId: 'project-dsh' },
    items: [{ name: 'alpha-skill', rootId: 'project-dsh' }],
  })
})

test('a partial failure is reported once and can be expanded', async () => {
  const host = createHostStub()
  const baseRespond = host.respond
  host.respond = (method, payload) => {
    if (method === 'batch') {
      return {
        ok: true,
        summary: { total: 3, succeeded: 1, failed: 2 },
        results: [
          { name: 'alpha-skill', rootId: 'project-dsh', ok: true },
          {
            name: 'beta-skill',
            rootId: 'project-agents',
            ok: false,
            code: 'TARGET_EXISTS',
            message: 'target root already has this skill',
          },
          {
            name: 'gamma-moved',
            rootId: 'project-dsh',
            ok: false,
            code: 'SOURCE_REMOVE_FAILED',
            targetPath: 'D:/global/.dsh/skills/gamma-moved/skill.md',
          },
        ],
      }
    }
    return baseRespond(method, payload)
  }
  const { runtime } = await mountPanel(host)

  findButton(runtime, 'L:list.select').props.onClick()
  await runtime.settle()
  findAllByClass(runtime, 'dps-row')[0].props.onClick()
  await runtime.settle()
  findAllByClass(runtime, 'dps-row')[1].props.onClick()
  await runtime.settle()
  findButton(runtime, 'L:batch.delete').props.onClick()
  await runtime.settle()
  findButton(runtime, 'L:batch.confirm').props.onClick()
  await runtime.settle()

  assert.equal(findAllByClass(runtime, 'dps-result').length, 1)
  assert.equal(includesText(runtime, 'success=1 failed=2'), true)
  assert.equal(findAllByClass(runtime, 'dps-failure').length, 0, 'collapsed by default')

  findButton(runtime, 'L:batch.view').props.onClick()
  await runtime.settle()
  assert.equal(findAllByClass(runtime, 'dps-failure').length, 2)
  assert.equal(includesText(runtime, 'beta-skill;'), true)
  assert.equal(includesText(runtime, 'L:code.TARGET_EXISTS'), true)
  assert.equal(includesText(runtime, 'gamma-moved;source-remove-failed'), true)
})

test('a batch request failure becomes a panel error bar, not a crash', async () => {
  const host = createHostStub()
  const baseRespond = host.respond
  host.respond = (method, payload) => {
    if (method === 'batch') {
      return { ok: false, error: { code: 'TOO_MANY_ITEMS', message: 'at most 100' } }
    }
    return baseRespond(method, payload)
  }
  const { runtime } = await mountPanel(host)

  findButton(runtime, 'L:list.select').props.onClick()
  await runtime.settle()
  findAllByClass(runtime, 'dps-row')[0].props.onClick()
  await runtime.settle()
  findButton(runtime, 'L:batch.delete').props.onClick()
  await runtime.settle()
  findButton(runtime, 'L:batch.confirm').props.onClick()
  await runtime.settle()

  assert.equal(includesText(runtime, 'TOO_MANY_ITEMS'), true)
  assert.equal(includesText(runtime, 'at most 100'), true)
})

/* ---------------------------------------------------------------------- *
 * Source display, per-dimension filters, check/update (source feature)   *
 * ---------------------------------------------------------------------- */

function sourceChip(runtime, key) {
  const chips = findAllByClass(runtime, 'dps-chip').filter(
    (node) => node.props['data-source'] === key,
  )
  assert.equal(chips.length, 1, 'expected a source chip for ' + key)
  return chips[0]
}

function cardTexts(runtime, className) {
  return findAllByClass(runtime, className).map((node) => textOf(node))
}

test('the filter bar splits into tier, attribute and source rows', async () => {
  const host = createHostStub()
  const { runtime } = await mountPanel(host)
  await openFilters(runtime)

  assert.equal(findAllByClass(runtime, 'dps-filter-row').length, 3)
  assert.deepEqual(cardTexts(runtime, 'dps-filter-label'), [
    'L:filter.group.tier',
    'L:filter.group.attr',
    'L:filter.group.source',
  ])

  // Tier chips carry the rank, source chips come from list.upstreams plus the
  // local bucket, and only two repositories means no "+N" chip.
  assert.equal(cardTexts(runtime, 'dps-chip').includes('L:root.project-dsh 100'), true)
  assert.equal(sourceChip(runtime, 'obra/superpowers').children.length >= 0, true)
  assert.equal(includesText(runtime, 'L:badge.local'), true)
  assert.equal(findAllByClass(runtime, 'dps-chip-more').length, 0)
})

test('source chips narrow the rows down to that repository', async () => {
  const host = createHostStub()
  const { runtime } = await mountPanel(host)
  await openFilters(runtime)

  assert.deepEqual(visibleNames(runtime), ['alpha-skill', 'beta-skill'])

  sourceChip(runtime, 'obra/superpowers').props.onClick()
  await runtime.settle()
  assert.deepEqual(visibleNames(runtime), ['alpha-skill'])

  sourceChip(runtime, '__local__').props.onClick()
  await runtime.settle()
  // The local bucket keeps only the skills no CLI installed.
  assert.deepEqual(visibleNames(runtime), ['beta-skill'])

  // Choosing the active source again clears the source filter.
  sourceChip(runtime, '__local__').props.onClick()
  await runtime.settle()
  assert.deepEqual(visibleNames(runtime), ['alpha-skill', 'beta-skill'])
})

test('rows show the source badge and mark skills with an available update', async () => {
  const host = createHostStub()
  const { runtime } = await mountPanel(host)

  assert.deepEqual(cardTexts(runtime, 'dps-badge-source'), ['superpowers', 'L:badge.local'])
  assert.equal(findAllByClass(runtime, 'dps-update-dot').length, 0)

  findButton(runtime, 'L:check.button').props.onClick()
  await runtime.settle()

  assert.equal(findAllByClass(runtime, 'dps-update-dot').length, 1)
  assert.equal(includesText(runtime, '1 updates available'), true)
})

test('the detail source section shows the upstream and updates the skill', async () => {
  const host = createHostStub()
  const { runtime, calls } = await mountPanel(host)

  findAllByClass(runtime, 'dps-row')[0].props.onClick()
  await runtime.settle()

  assert.equal(includesText(runtime, 'L:detail.source'), true)
  assert.equal(includesText(runtime, 'obra/superpowers'), true)
  assert.equal(includesText(runtime, 'skills/alpha-skill'), true)
  assert.equal(includesText(runtime, 'aaaaaaaaaa'), true)

  findButton(runtime, 'L:detail.checkUpdate').props.onClick()
  await runtime.settle()
  const check = calls.filter((call) => call.method === 'checkUpdates').pop()
  assert.deepEqual(check.body, { names: ['alpha-skill'], sessionId: 'session-1' })
  assert.equal(includesText(runtime, 'L:detail.checkAvailable'), true)

  findButton(runtime, 'L:detail.update').props.onClick()
  await runtime.settle()
  const update = calls.filter((call) => call.method === 'updateSkills').pop()
  assert.deepEqual(update.body, {
    items: [{ name: 'alpha-skill', rootId: 'project-dsh' }],
    sessionId: 'session-1',
  })
})

test('a LOCAL_CHANGES update failure offers a forced update', async () => {
  const host = createHostStub()
  const baseRespond = host.respond
  let attemppts = 0
  host.respond = (method, payload) => {
    if (method === 'updateSkills' && attemppts === 0) {
      attemppts += 1
      return {
        ok: false,
        error: { code: 'LOCAL_CHANGES', message: 'local files differ' },
      }
    }
    return baseRespond(method, payload)
  }
  const { runtime, calls } = await mountPanel(host)

  findAllByClass(runtime, 'dps-row')[0].props.onClick()
  await runtime.settle()
  findButton(runtime, 'L:detail.update').props.onClick()
  await runtime.settle()

  assert.equal(includesText(runtime, 'L:code.LOCAL_CHANGES'), true)
  assert.equal(findAllByClass(runtime, 'dps-force-confirm').length, 1)

  // The first "force" click only reveals the in-place confirmation, the second
  // one sends the forced update.
  findButton(runtime, 'L:detail.forceYes').props.onClick()
  await runtime.settle()
  assert.equal(includesText(runtime, 'L:detail.forceConfirm'), true)
  findButton(runtime, 'L:detail.forceYes').props.onClick()
  await runtime.settle()
  const forced = calls.filter((call) => call.method === 'updateSkills').pop()
  assert.deepEqual(forced.body, {
    items: [{ name: 'alpha-skill', rootId: 'project-dsh' }],
    sessionId: 'session-1',
    force: true,
  })
})

test('the missing group installs a skill listed only in the manifest', async () => {
  const host = createHostStub()
  host.list = {
    ...host.list,
    missing: [
      {
        name: 'docx',
        upstream: {
          repo: 'anthropics/skills',
          type: 'github',
          url: 'https://github.com/anthropics/skills',
          skillPath: 'skills/docx',
          hash: 'cccccccccccccccccccccccccccccccccccccccc',
        },
      },
    ],
  }
  const { runtime, calls } = await mountPanel(host)

  assert.equal(includesText(runtime, 'L:missing.title'), true)
  assert.equal(findAllByClass(runtime, 'dps-row-missing').length, 1)

  findAllByClass(runtime, 'dps-row-missing')[0]
    .children.find((child) => child !== null && child.type === 'button')
    .props.onClick()
  await runtime.settle()

  const update = calls.filter((call) => call.method === 'updateSkills').pop()
  assert.deepEqual(update.body, { items: [{ name: 'docx' }], sessionId: 'session-1' })
})

test('updating the selection posts one updateSkills request', async () => {
  const host = createHostStub()
  const { runtime, calls } = await mountPanel(host)

  findButton(runtime, 'L:list.select').props.onClick()
  await runtime.settle()
  findAllByClass(runtime, 'dps-row')[0].props.onClick()
  findAllByClass(runtime, 'dps-row')[1].props.onClick()
  await runtime.settle()

  findButton(runtime, 'L:batch.update').props.onClick()
  await runtime.settle()

  const update = calls.filter((call) => call.method === 'updateSkills').pop()
  assert.deepEqual(update.body, {
    items: [
      { name: 'alpha-skill', rootId: 'project-dsh' },
      { name: 'beta-skill', rootId: 'project-agents' },
    ],
    sessionId: 'session-1',
  })
  assert.equal(includesText(runtime, 'success=2 failed=0'), true)
})

test('switching sessions drops the open detail and reloads for the new session', async () => {
  const host = createHostStub()
  const { runtime, body, calls } = await mountPanel(host)

  findAllByClass(runtime, 'dps-row')[0].props.onClick()
  await runtime.settle()
  assert.equal(findAllByClass(runtime, 'dps-detail').length, 1)

  runtime.mount(
    runtime.React.createElement(body, panelProps({ t: parameterizedTranslate, sessionId: 'session-2' })),
  )
  await runtime.settle()

  assert.equal(findAllByClass(runtime, 'dps-detail').length, 0)
  assert.equal(findAllByClass(runtime, 'dps-list').length, 1)
  const listCall = calls.filter((call) => call.method === 'list').pop()
  assert.equal(listCall.body.sessionId, 'session-2')
})

test('a project-lock row shows its source but offers no update controls', async () => {
  const host = createHostStub()
  host.list.tiers[0].skills[0].updatable = false
  const { runtime } = await mountPanel(host)

  findAllByClass(runtime, 'dps-row')[0].props.onClick()
  await runtime.settle()

  const labels = findAll(runtime, (node) => node.kind === 'host' && node.type === 'button').map(textOf)
  assert.equal(labels.includes('L:detail.checkUpdate'), false)
  assert.equal(labels.includes('L:detail.update'), false)
  assert.equal(includesText(runtime, 'L:detail.sourceLocal'), true)
})

test('a batch delete clears the stale update verdicts', async () => {
  const host = createHostStub()
  const { runtime } = await mountPanel(host)

  findButton(runtime, 'L:check.button').props.onClick()
  await runtime.settle()
  assert.equal(findAllByClass(runtime, 'dps-update-dot').length, 1)

  findButton(runtime, 'L:list.select').props.onClick()
  await runtime.settle()
  findAllByClass(runtime, 'dps-row')[0].props.onClick()
  await runtime.settle()
  findButton(runtime, 'L:batch.delete').props.onClick()
  await runtime.settle()
  findButton(runtime, 'L:batch.confirm').props.onClick()
  await runtime.settle()

  assert.equal(findAllByClass(runtime, 'dps-update-dot').length, 0)
  assert.equal(includesText(runtime, 'updates available'), false)
})
