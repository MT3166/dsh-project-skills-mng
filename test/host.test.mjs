/**
 * Host-half tests without a running DSH: one fake host context, one fake HTTP
 * request/response pair, and a throwaway project + global skill home.
 *
 * Run: node --test test/
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, readFile, writeFile, stat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const API = '/dsh-project-skills/api/'

function createHost({ projectDir }) {
  let handler
  const registrations = []
  const ctx = {
    logger: { warn() {}, info() {}, error() {} },
    get(name) {
      if (name === 'sessionQuery') {
        return {
          async observeSession(sessionId) {
            if (sessionId !== 'session-1') throw new Error('not found')
            return { projections: { values: { workingDirectory: projectDir } }, header: { cwd: projectDir } }
          },
        }
      }
      return undefined
    },
    effect(fn) {
      registrations.push(fn())
      return () => {}
    },
    webServer: {
      register(entry) {
        handler = entry.handler
        return () => {}
      },
    },
    connection: { requestRejection: () => undefined },
  }
  return { ctx, call: (method, payload, { sessionId = 'session-1' } = {}) => request(handler, method, { ...payload, sessionId }) }
}

function request(handler, method, payload) {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = new EventEmitter()
    req.method = 'POST'
    req.url = API + method
    req.destroy = () => {}
    const res = {
      statusCode: 0,
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value
      },
      end(body) {
        resolvePromise({ status: this.statusCode, body: JSON.parse(body) })
      },
    }
    handler(req, res).catch(rejectPromise)
    req.emit('data', Buffer.from(JSON.stringify(payload), 'utf8'))
    req.emit('end')
  })
}

const SKILL = `---
name: demo-skill
description: A demo skill used by the plugin tests.
---

# Demo

Body.

## Steps

1. Do the thing.
`

async function withSandbox(run) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-project-skills-'))
  const projectDir = join(root, 'project')
  const dshHome = join(root, 'dsh-home')
  const agentsHome = join(root, 'agents-home')
  await mkdir(join(projectDir, '.git'), { recursive: true })
  await mkdir(dshHome, { recursive: true })
  await mkdir(agentsHome, { recursive: true })
  const previous = { DSH_HOME: process.env.DSH_HOME, DSH_AGENTS_HOME: process.env.DSH_AGENTS_HOME }
  process.env.DSH_HOME = dshHome
  process.env.DSH_AGENTS_HOME = agentsHome
  const previousHandler = globalThis.__dshProjectSkillsTest
  try {
    const { apply } = await import('../index.js')
    const { ctx, call } = createHost({ projectDir })
    apply(ctx)
    await run({ call, projectDir, dshHome, agentsHome })
  } finally {
    process.env.DSH_HOME = previous.DSH_HOME
    process.env.DSH_AGENTS_HOME = previous.DSH_AGENTS_HOME
    globalThis.__dshProjectSkillsTest = previousHandler
    await rm(root, { recursive: true, force: true })
  }
}

test('list groups project and global roots and marks shadowing', async () => {
  await withSandbox(async ({ call, projectDir, dshHome }) => {
    await mkdir(join(projectDir, '.dsh', 'skills', 'demo-skill'), { recursive: true })
    await writeFile(join(projectDir, '.dsh', 'skills', 'demo-skill', 'SKILL.md'), SKILL)
    await mkdir(join(dshHome, 'skills'), { recursive: true })
    await writeFile(join(dshHome, 'skills', 'global-skill.md'), SKILL.replaceAll('demo-skill', 'global-skill'))
    await writeFile(join(dshHome, 'skills', 'demo-skill.md'), SKILL)

    const response = await call('list', {})
    assert.equal(response.status, 200)
    const { body } = response
    assert.equal(body.ok, true)
    assert.equal(body.projectRoot, projectDir)
    assert.deepEqual(body.counts, { project: 1, global: 2, total: 3, shadowed: 1, broken: 0 })

    const project = body.groups[0]
    const global = body.groups[1]
    assert.equal(project.scope, 'project')
    assert.equal(project.skills[0].name, 'demo-skill')
    assert.equal(project.skills[0].shadows.length, 1)
    assert.equal(project.skills[0].shadows[0].rootId, 'global-dsh')

    const shadowed = global.skills.find((skill) => skill.name === 'demo-skill')
    assert.equal(shadowed.shadowed, true)
    assert.equal(shadowed.shadowedBy.rootId, 'project-dsh')
  })
})

test('write creates a SKILL.md and read returns it', async () => {
  await withSandbox(async ({ call, projectDir }) => {
    const response = await call('write', { rootId: 'project-dsh', name: 'fresh-skill', content: SKILL.replaceAll('demo-skill', 'fresh-skill') })
    assert.equal(response.status, 200)
    assert.equal(response.body.ok, true)
    assert.equal(response.body.created, true)

    const file = join(projectDir, '.dsh', 'skills', 'fresh-skill', 'SKILL.md')
    assert.match(await readFile(file, 'utf8'), /name: fresh-skill/)

    const read = await call('read', { name: 'fresh-skill' })
    assert.equal(read.body.ok, true)
    assert.match(read.body.content, /# Demo/)

    const list = await call('list', {})
    assert.ok(list.body.groups[0].skills.some((skill) => skill.name === 'fresh-skill'))
  })
})

test('toggle rewrites invocation flags and keeps the body', async () => {
  await withSandbox(async ({ call, projectDir }) => {
    await mkdir(join(projectDir, '.dsh', 'skills', 'demo-skill'), { recursive: true })
    await writeFile(join(projectDir, '.dsh', 'skills', 'demo-skill', 'SKILL.md'), SKILL)

    const disabled = await call('toggle', { rootId: 'project-dsh', name: 'demo-skill', field: 'model', value: false })
    assert.equal(disabled.body.ok, true)
    assert.equal(disabled.body.modelInvocable, false)
    assert.match(disabled.body.content, /disable-model-invocation: true/)
    assert.match(disabled.body.content, /## Steps/)

    const enabled = await call('toggle', { rootId: 'project-dsh', name: 'demo-skill', field: 'model', value: true })
    assert.equal(enabled.body.ok, true)
    assert.equal(enabled.body.modelInvocable, true)
    assert.doesNotMatch(enabled.body.content, /disable-model-invocation/)

    const hidden = await call('toggle', { rootId: 'project-dsh', name: 'demo-skill', field: 'user', value: false })
    assert.equal(hidden.body.userInvocable, false)
    assert.match(hidden.body.content, /user-invocable: false/)
  })
})

test('delete removes the package directory', async () => {
  await withSandbox(async ({ call, projectDir }) => {
    const directory = join(projectDir, '.dsh', 'skills', 'demo-skill')
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'SKILL.md'), SKILL)

    const response = await call('delete', { rootId: 'project-dsh', name: 'demo-skill' })
    assert.equal(response.body.ok, true)
    await assert.rejects(stat(directory))
    assert.equal((await call('read', { name: 'demo-skill' })).body.error.code, 'SKILL_NOT_FOUND')
  })
})

test('rejects traversal names and mismatched frontmatter', async () => {
  await withSandbox(async ({ call }) => {
    for (const name of ['../escape', 'a/b', 'UPPER', '']) {
      const response = await call('write', { rootId: 'project-dsh', name, content: SKILL })
      assert.equal(response.body.ok, false)
      assert.equal(response.body.error.code, 'INVALID_NAME')
    }
    const mismatch = await call('write', { rootId: 'project-dsh', name: 'other-name', content: SKILL })
    assert.equal(mismatch.body.error.code, 'NAME_MISMATCH')
    const broken = await call('write', { rootId: 'project-dsh', name: 'broken', content: 'no frontmatter here' })
    assert.equal(broken.body.error.code, 'INVALID_CONTENT')
  })
})

test('missing root reports a writable-by-parent root', async () => {
  await withSandbox(async ({ call, projectDir }) => {
    const response = await call('roots', {})
    assert.equal(response.body.ok, true)
    const root = response.body.roots.find((candidate) => candidate.id === 'project-agents')
    assert.equal(root.exists, false)
    assert.equal(root.writable, true)
    assert.equal(response.body.cwd, projectDir)
  })
})

test('unknown sessions are reported as data, not a transport failure', async () => {
  await withSandbox(async ({ call }) => {
    const response = await call('list', {}, { sessionId: 'nope' })
    assert.equal(response.status, 200)
    assert.equal(response.body.ok, false)
    assert.equal(response.body.error.code, 'SESSION_NOT_FOUND')
  })
})
