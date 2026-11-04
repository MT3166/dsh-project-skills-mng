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
import { symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const API = '/dsh-project-skills/api/'

function createHost({ projectDir }) {
  let handler
  const registrations = []
  const tools = []
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
      if (name === 'tools') {
        return {
          register(definition) {
            tools.push(definition)
            return () => {}
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
  return { ctx, tools, call: (method, payload, { sessionId = 'session-1' } = {}) => request(handler, method, { ...payload, sessionId }) }
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
    const { ctx, call, tools } = createHost({ projectDir })
    apply(ctx)
    await run({ call, projectDir, dshHome, agentsHome, tools })
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

test('read can address a shadowed skill through its own rootId', async () => {
  await withSandbox(async ({ call, projectDir, dshHome }) => {
    await mkdir(join(projectDir, '.dsh', 'skills', 'demo-skill'), { recursive: true })
    await writeFile(join(projectDir, '.dsh', 'skills', 'demo-skill', 'SKILL.md'), SKILL)
    await mkdir(join(dshHome, 'skills'), { recursive: true })
    await writeFile(
      join(dshHome, 'skills', 'demo-skill.md'),
      SKILL.replace('Body.', 'Global body.'),
    )

    const winner = await call('read', { name: 'demo-skill' })
    assert.equal(winner.body.rootId, 'project-dsh')
    assert.match(winner.body.content, /Body\./)

    const shadowed = await call('read', { name: 'demo-skill', rootId: 'global-dsh' })
    assert.equal(shadowed.body.ok, true)
    assert.equal(shadowed.body.rootId, 'global-dsh')
    assert.equal(shadowed.body.scope, 'global')
    assert.match(shadowed.body.content, /Global body\./)

    const unknown = await call('read', { name: 'demo-skill', rootId: 'nope' })
    assert.equal(unknown.body.error.code, 'ROOT_UNKNOWN')
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

test('write updates an existing flat skill file in place', async () => {
  await withSandbox(async ({ call, projectDir }) => {
    const skillsDir = join(projectDir, '.dsh', 'skills')
    await mkdir(skillsDir, { recursive: true })
    const flat = join(skillsDir, 'flat-skill.md')
    await writeFile(flat, SKILL.replaceAll('demo-skill', 'flat-skill'))

    const response = await call('write', {
      rootId: 'project-dsh',
      name: 'flat-skill',
      content: SKILL.replaceAll('demo-skill', 'flat-skill').replace('Body.', 'Updated body.'),
    })
    assert.equal(response.body.ok, true)
    assert.equal(response.body.created, false)
    assert.equal(response.body.path.toLowerCase(), flat.toLowerCase())
    assert.match(await readFile(flat, 'utf8'), /Updated body\./)
    // A flat skill must not be split into a `<name>/` package directory.
    await assert.rejects(stat(join(skillsDir, 'flat-skill')))
  })
})

test('the model-facing tool maps create/update onto the write operation', async () => {
  await withSandbox(async ({ projectDir, tools }) => {
    assert.equal(tools.length, 1)
    const tool = tools[0]
    assert.equal(tool.name, 'skills_manage')

    const created = await tool.execute(
      { action: 'create', rootId: 'project-dsh', name: 'tool-skill', content: SKILL.replaceAll('demo-skill', 'tool-skill') },
      { agent: { id: 'session-1' } },
    )
    assert.equal(created.created, true)
    assert.match(await readFile(join(projectDir, '.dsh', 'skills', 'tool-skill', 'SKILL.md'), 'utf8'), /name: tool-skill/)

    const updated = await tool.execute(
      { action: 'update', rootId: 'project-dsh', name: 'tool-skill', content: SKILL.replaceAll('demo-skill', 'tool-skill').replace('Body.', 'By tool.') },
      { agent: { id: 'session-1' } },
    )
    assert.equal(updated.created, false)
    assert.match(await readFile(join(projectDir, '.dsh', 'skills', 'tool-skill', 'SKILL.md'), 'utf8'), /By tool\./)

    const listed = await tool.execute({ action: 'list' }, { agent: { id: 'session-1' } })
    assert.ok(listed.counts.total >= 1)
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

/** Directory link, or false when the OS/user cannot create one. */
async function makeDirLink(target, linkPath) {
  try {
    await symlink(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
    return true
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'ENOTSUP') return false
    throw error
  }
}

test('a package linked into another skill root stays readable and editable', async (t) => {
  await withSandbox(async ({ call, projectDir, agentsHome }) => {
    const realDirectory = join(agentsHome, 'skills', 'mirrored-skill')
    await mkdir(realDirectory, { recursive: true })
    await writeFile(join(realDirectory, 'SKILL.md'), SKILL.replaceAll('demo-skill', 'mirrored-skill'))

    const linkPath = join(projectDir, '.dsh', 'skills', 'mirrored-skill')
    await mkdir(join(projectDir, '.dsh', 'skills'), { recursive: true })
    if (!(await makeDirLink(realDirectory, linkPath))) {
      t.skip('this OS/user cannot create directory links')
      return
    }

    const list = await call('list', {})
    const row = list.body.groups[0].skills.find((skill) => skill.name === 'mirrored-skill')
    assert.equal(row.linked, true)
    assert.equal(row.realPath.toLowerCase(), join(realDirectory, 'SKILL.md').toLowerCase())

    const read = await call('read', { name: 'mirrored-skill', rootId: 'project-dsh' })
    assert.equal(read.body.ok, true, JSON.stringify(read.body))
    assert.equal(read.body.linked, true)
    assert.match(read.body.content, /mirrored-skill/)

    // Writes go to the real package, so the link keeps working.
    const toggled = await call('toggle', { rootId: 'project-dsh', name: 'mirrored-skill', field: 'model', value: false })
    assert.equal(toggled.body.ok, true, JSON.stringify(toggled.body))
    assert.match(await readFile(join(realDirectory, 'SKILL.md'), 'utf8'), /disable-model-invocation: true/)

    // Deleting removes the link, never the package it points at.
    const deleted = await call('delete', { rootId: 'project-dsh', name: 'mirrored-skill' })
    assert.equal(deleted.body.ok, true, JSON.stringify(deleted.body))
    assert.equal(deleted.body.unlinked, true)
    await assert.rejects(stat(linkPath))
    assert.match(await readFile(join(realDirectory, 'SKILL.md'), 'utf8'), /name: mirrored-skill/)
  })
})

test('a link pointing outside every skill root is still refused', async (t) => {
  await withSandbox(async ({ call, projectDir }) => {
    const outside = join(projectDir, 'outside', 'secret-skill')
    await mkdir(outside, { recursive: true })
    await writeFile(join(outside, 'SKILL.md'), SKILL.replaceAll('demo-skill', 'secret-skill'))
    await mkdir(join(projectDir, '.dsh', 'skills'), { recursive: true })
    const linkPath = join(projectDir, '.dsh', 'skills', 'secret-skill')
    if (!(await makeDirLink(outside, linkPath))) {
      t.skip('this OS/user cannot create directory links')
      return
    }

    const read = await call('read', { name: 'secret-skill', rootId: 'project-dsh' })
    assert.equal(read.body.ok, false)
    assert.equal(read.body.error.code, 'PATH_ESCAPE')

    const toggled = await call('toggle', { rootId: 'project-dsh', name: 'secret-skill', field: 'model', value: false })
    assert.equal(toggled.body.ok, false)
    assert.equal(toggled.body.error.code, 'PATH_ESCAPE')
    assert.match(await readFile(join(outside, 'SKILL.md'), 'utf8'), /name: secret-skill/)
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
