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
import { gzipSync } from 'node:zlib'
import { dirname, join, normalize } from 'node:path'

const API = '/dsh-project-skills-mng/api/'

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

async function withSandbox(run, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-project-skills-mng-'))
  const projectDir = join(root, 'project')
  const dshHome = join(root, 'dsh-home')
  const agentsHome = join(root, 'agents-home')
  await mkdir(join(projectDir, '.git'), { recursive: true })
  await mkdir(dshHome, { recursive: true })
  await mkdir(agentsHome, { recursive: true })
  const previous = { DSH_HOME: process.env.DSH_HOME, DSH_AGENTS_HOME: process.env.DSH_AGENTS_HOME, XDG_STATE_HOME: process.env.XDG_STATE_HOME }
  process.env.DSH_HOME = dshHome
  process.env.DSH_AGENTS_HOME = agentsHome
  delete process.env.XDG_STATE_HOME
  const previousHandler = globalThis.__dshProjectSkillsTest
  globalThis.__dshProjectSkillsTest = options.deps === undefined ? undefined : { deps: options.deps }
  try {
    const { apply } = await import('../index.js')
    const { ctx, call, tools } = createHost({ projectDir })
    apply(ctx)
    await run({ call, projectDir, dshHome, agentsHome, tools, root })
  } finally {
    process.env.DSH_HOME = previous.DSH_HOME
    process.env.DSH_AGENTS_HOME = previous.DSH_AGENTS_HOME
    if (previous.XDG_STATE_HOME === undefined) delete process.env.XDG_STATE_HOME
    else process.env.XDG_STATE_HOME = previous.XDG_STATE_HOME
    globalThis.__dshProjectSkillsTest = previousHandler
    await rm(root, { recursive: true, force: true })
  }
}

test('list returns one tier per DSH root and marks shadowing', async () => {
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

    // Four tiers in DSH's discovery order, each carrying its own root metadata.
    assert.deepEqual(
      body.tiers.map((tier) => [tier.rootId, tier.rank, tier.scope]),
      [
        ['project-dsh', 100, 'project'],
        ['project-agents', 200, 'project'],
        ['global-dsh', 400, 'global'],
        ['global-agents', 500, 'global'],
      ],
    )
    for (const tier of body.tiers) {
      assert.equal(typeof tier.path, 'string')
      assert.equal(typeof tier.exists, 'boolean')
      assert.equal(typeof tier.writable, 'boolean')
    }

    const project = body.tiers[0]
    const global = body.tiers[2]
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
    assert.ok(list.body.tiers[0].skills.some((skill) => skill.name === 'fresh-skill'))
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
    const row = list.body.tiers[0].skills.find((skill) => skill.name === 'mirrored-skill')
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

test('batch delete reports per-item success and failure', async () => {
  await withSandbox(async ({ call, projectDir }) => {
    const skills = join(projectDir, '.dsh', 'skills')
    for (const name of ['one-skill', 'two-skill']) {
      await mkdir(join(skills, name), { recursive: true })
      await writeFile(join(skills, name, 'SKILL.md'), SKILL.replaceAll('demo-skill', name))
    }

    const response = await call('batch', {
      action: 'delete',
      items: [
        { name: 'one-skill', rootId: 'project-dsh' },
        { name: 'missing-skill', rootId: 'project-dsh' },
        { name: 'two-skill', rootId: 'project-dsh' },
      ],
    })
    assert.equal(response.body.ok, true, JSON.stringify(response.body))
    assert.deepEqual(response.body.summary, { total: 3, succeeded: 2, failed: 1 })
    assert.equal(response.body.results[0].ok, true)
    assert.equal(response.body.results[1].ok, false)
    assert.equal(response.body.results[1].code, 'SKILL_NOT_FOUND')
    assert.equal(response.body.results[2].ok, true)
    await assert.rejects(stat(join(skills, 'one-skill')))
    await assert.rejects(stat(join(skills, 'two-skill')))
  })
})

test('batch invocation flips the model flag on every item', async () => {
  await withSandbox(async ({ call, projectDir }) => {
    const skills = join(projectDir, '.dsh', 'skills')
    for (const name of ['alpha-skill', 'beta-skill']) {
      await mkdir(join(skills, name), { recursive: true })
      await writeFile(join(skills, name, 'SKILL.md'), SKILL.replaceAll('demo-skill', name))
    }

    const response = await call('batch', {
      action: 'invocation',
      invocation: { field: 'model', value: false },
      items: [
        { name: 'alpha-skill', rootId: 'project-dsh' },
        { name: 'beta-skill', rootId: 'project-dsh' },
      ],
    })
    assert.equal(response.body.ok, true, JSON.stringify(response.body))
    assert.deepEqual(response.body.summary, { total: 2, succeeded: 2, failed: 0 })
    for (const name of ['alpha-skill', 'beta-skill']) {
      assert.match(await readFile(join(skills, name, 'SKILL.md'), 'utf8'), /disable-model-invocation: true/)
    }
  })
})

test('batch rejects more than one hundred items', async () => {
  await withSandbox(async ({ call }) => {
    const items = Array.from({ length: 101 }, (_, index) => ({ name: `skill-${index}`, rootId: 'project-dsh' }))
    const response = await call('batch', { action: 'delete', items })
    assert.equal(response.body.ok, false)
    assert.equal(response.body.error.code, 'TOO_MANY_ITEMS')
  })
})

test('transfer copies the whole package, not just SKILL.md', async () => {
  await withSandbox(async ({ call, projectDir, agentsHome }) => {
    const source = join(projectDir, '.dsh', 'skills', 'rich-skill')
    await mkdir(join(source, 'scripts'), { recursive: true })
    await mkdir(join(source, 'node_modules'), { recursive: true })
    await writeFile(join(source, 'SKILL.md'), SKILL.replaceAll('demo-skill', 'rich-skill'))
    await writeFile(join(source, 'scripts', 'run.sh'), '#!/bin/sh\necho hi\n')
    await writeFile(join(source, 'reference.md'), '# Reference\n')
    await writeFile(join(source, 'node_modules', 'ignored.js'), 'nope')

    const response = await call('transfer', {
      name: 'rich-skill',
      rootId: 'project-dsh',
      targetRootId: 'global-agents',
      mode: 'copy',
    })
    assert.equal(response.body.ok, true, JSON.stringify(response.body))
    assert.equal(response.body.kind, 'package')
    const copied = join(agentsHome, 'skills', 'rich-skill')
    assert.match(await readFile(join(copied, 'scripts', 'run.sh'), 'utf8'), /echo hi/)
    assert.match(await readFile(join(copied, 'reference.md'), 'utf8'), /Reference/)
    await assert.rejects(stat(join(copied, 'node_modules')))
  })
})

test('transfer keeps a flat skill flat when it moves tiers', async () => {
  await withSandbox(async ({ call, projectDir, agentsHome }) => {
    await mkdir(join(projectDir, '.dsh', 'skills'), { recursive: true })
    await writeFile(join(projectDir, '.dsh', 'skills', 'flat-skill.md'), SKILL.replaceAll('demo-skill', 'flat-skill'))

    const response = await call('transfer', {
      name: 'flat-skill',
      rootId: 'project-dsh',
      targetRootId: 'global-agents',
      mode: 'move',
    })
    assert.equal(response.body.ok, true, JSON.stringify(response.body))
    assert.equal(response.body.kind, 'file')
    assert.match(await readFile(join(agentsHome, 'skills', 'flat-skill.md'), 'utf8'), /name: flat-skill/)
    await assert.rejects(stat(join(agentsHome, 'skills', 'flat-skill')))
    await assert.rejects(stat(join(projectDir, '.dsh', 'skills', 'flat-skill.md')))
  })
})

test('deleting a linked flat skill keeps the file behind the link', async (t) => {
  await withSandbox(async ({ call, projectDir, agentsHome }) => {
    const real = join(agentsHome, 'skills', 'flat-linked.md')
    await mkdir(join(agentsHome, 'skills'), { recursive: true })
    await writeFile(real, SKILL.replaceAll('demo-skill', 'flat-linked'))
    await mkdir(join(projectDir, '.dsh', 'skills'), { recursive: true })
    const linkPath = join(projectDir, '.dsh', 'skills', 'flat-linked.md')
    try {
      await symlink(real, linkPath, 'file')
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'ENOTSUP') {
        t.skip('this OS/user cannot create file links')
        return
      }
      throw error
    }

    const deleted = await call('delete', { rootId: 'project-dsh', name: 'flat-linked' })
    assert.equal(deleted.body.ok, true, JSON.stringify(deleted.body))
    assert.equal(deleted.body.unlinked, true)
    await assert.rejects(stat(linkPath))
    assert.match(await readFile(real, 'utf8'), /name: flat-linked/)
  })
})

test('transfer copies a skill into another tier and leaves the source alone', async () => {
  await withSandbox(async ({ call, projectDir, agentsHome }) => {
    const source = join(projectDir, '.dsh', 'skills', 'demo-skill', 'SKILL.md')
    await mkdir(dirname(source), { recursive: true })
    await writeFile(source, SKILL)

    const response = await call('transfer', {
      name: 'demo-skill',
      rootId: 'project-dsh',
      targetRootId: 'global-agents',
      mode: 'copy',
      conflict: 'skip',
    })
    assert.equal(response.body.ok, true, JSON.stringify(response.body))
    const copied = join(agentsHome, 'skills', 'demo-skill', 'SKILL.md')
    assert.equal(normalize(response.body.targetPath), normalize(copied))
    assert.match(await readFile(copied, 'utf8'), /name: demo-skill/)
    assert.match(await readFile(source, 'utf8'), /name: demo-skill/)
  })
})

test('transfer reports a conflict instead of overwriting by default', async () => {
  await withSandbox(async ({ call, projectDir, agentsHome }) => {
    await mkdir(join(projectDir, '.dsh', 'skills', 'demo-skill'), { recursive: true })
    await writeFile(join(projectDir, '.dsh', 'skills', 'demo-skill', 'SKILL.md'), SKILL)
    const target = join(agentsHome, 'skills', 'demo-skill', 'SKILL.md')
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, SKILL.replace('Body.', 'Existing body.'))

    const response = await call('transfer', {
      name: 'demo-skill',
      rootId: 'project-dsh',
      targetRootId: 'global-agents',
      mode: 'copy',
    })
    assert.equal(response.body.ok, false)
    assert.equal(response.body.error.code, 'TARGET_EXISTS')
    assert.match(await readFile(target, 'utf8'), /Existing body\./)

    // Everything after a failing request is untouched; the batch path reports it per item.
    const batch = await call('batch', {
      action: 'transfer',
      transferMode: 'copy',
      conflict: 'skip',
      target: { rootId: 'global-agents' },
      items: [{ name: 'demo-skill', rootId: 'project-dsh' }],
    })
    assert.equal(batch.body.summary.failed, 1)
    assert.equal(batch.body.results[0].code, 'TARGET_EXISTS')
  })
})

test('transfer overwrites the target when asked to', async () => {
  await withSandbox(async ({ call, projectDir, agentsHome }) => {
    await mkdir(join(projectDir, '.dsh', 'skills', 'demo-skill'), { recursive: true })
    await writeFile(join(projectDir, '.dsh', 'skills', 'demo-skill', 'SKILL.md'), SKILL)
    const target = join(agentsHome, 'skills', 'demo-skill', 'SKILL.md')
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, SKILL.replace('Body.', 'Existing body.'))

    const response = await call('transfer', {
      name: 'demo-skill',
      rootId: 'project-dsh',
      targetRootId: 'global-agents',
      mode: 'copy',
      conflict: 'overwrite',
    })
    assert.equal(response.body.ok, true, JSON.stringify(response.body))
    assert.match(await readFile(target, 'utf8'), /Body\./)
    assert.doesNotMatch(await readFile(target, 'utf8'), /Existing body\./)
  })
})

test('transfer moves a skill and removes the source', async () => {
  await withSandbox(async ({ call, projectDir, agentsHome }) => {
    const source = join(projectDir, '.dsh', 'skills', 'demo-skill')
    await mkdir(source, { recursive: true })
    await writeFile(join(source, 'SKILL.md'), SKILL)

    const response = await call('transfer', {
      name: 'demo-skill',
      rootId: 'project-dsh',
      targetRootId: 'global-agents',
      mode: 'move',
    })
    assert.equal(response.body.ok, true, JSON.stringify(response.body))
    assert.match(await readFile(join(agentsHome, 'skills', 'demo-skill', 'SKILL.md'), 'utf8'), /name: demo-skill/)
    await assert.rejects(stat(source))
  })
})

test('transfer refuses to move a skill onto its own tier', async () => {
  await withSandbox(async ({ call, projectDir }) => {
    await mkdir(join(projectDir, '.dsh', 'skills', 'demo-skill'), { recursive: true })
    await writeFile(join(projectDir, '.dsh', 'skills', 'demo-skill', 'SKILL.md'), SKILL)

    const response = await call('transfer', {
      name: 'demo-skill',
      rootId: 'project-dsh',
      targetRootId: 'project-dsh',
      mode: 'move',
    })
    assert.equal(response.body.ok, false)
    assert.equal(response.body.error.code, 'INVALID_TARGET')
  })
})

test('moving a linked skill to its real tier only removes the link', async (t) => {
  await withSandbox(async ({ call, projectDir, agentsHome }) => {
    const real = join(agentsHome, 'skills', 'mirrored-skill')
    await mkdir(real, { recursive: true })
    await writeFile(join(real, 'SKILL.md'), SKILL.replaceAll('demo-skill', 'mirrored-skill'))
    const linkPath = join(projectDir, '.dsh', 'skills', 'mirrored-skill')
    await mkdir(join(projectDir, '.dsh', 'skills'), { recursive: true })
    if (!(await makeDirLink(real, linkPath))) {
      t.skip('this OS/user cannot create directory links')
      return
    }

    const batch = await call('batch', {
      action: 'transfer',
      transferMode: 'move',
      target: { rootId: 'global-agents' },
      items: [{ name: 'mirrored-skill', rootId: 'project-dsh' }],
    })
    assert.equal(batch.body.summary.succeeded, 1, JSON.stringify(batch.body))
    assert.equal(batch.body.results[0].unlinked, true)
    await assert.rejects(stat(linkPath))
    assert.match(await readFile(join(real, 'SKILL.md'), 'utf8'), /name: mirrored-skill/)
  })
})



/* ------------------------------------------------------------------ *
 * Upstream sources: lock reading, update checks, updates
 * ------------------------------------------------------------------ */

function tarHeader(name, size) {
  const header = Buffer.alloc(512)
  header.write(name, 0, 100, 'utf8')
  header.write('0000644\0', 100, 8, 'ascii')
  header.write('0000000\0', 108, 8, 'ascii')
  header.write('0000000\0', 116, 8, 'ascii')
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii')
  header.write('00000000000\0', 136, 12, 'ascii')
  header.write('        ', 148, 8, 'ascii')
  header.write('0', 156, 1, 'ascii')
  let sum = 0
  for (const byte of header) sum += byte
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
  return header
}

function makeTarGz(files) {
  const parts = []
  for (const file of files) {
    const data = Buffer.from(file.content, 'utf8')
    parts.push(tarHeader(file.path, data.length))
    parts.push(data)
    const padding = (512 - (data.length % 512)) % 512
    if (padding > 0) parts.push(Buffer.alloc(padding))
  }
  parts.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(parts))
}

function jsonResponse(value) {
  return {
    ok: true,
    status: 200,
    async json() {
      return value
    },
    async arrayBuffer() {
      return Buffer.from(JSON.stringify(value))
    },
  }
}

function bufferResponse(buffer) {
  return {
    ok: true,
    status: 200,
    async json() {
      return JSON.parse(buffer.toString('utf8'))
    },
    async arrayBuffer() {
      return buffer
    },
  }
}

function fakeUpstream({ repo = 'acme/tools', branch = 'main', tree = { sha: 'roots'.padEnd(40, '0'), tree: [] }, files = [] } = {}) {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    if (url.startsWith('https://api.github.com/repos/') && !url.includes('/git/trees/')) return jsonResponse({ default_branch: branch })
    if (url.includes('/git/trees/')) return jsonResponse(tree)
    if (url.startsWith('https://codeload.github.com/')) return bufferResponse(makeTarGz(files))
    return { ok: false, status: 404, async json() { return {} }, async arrayBuffer() { return Buffer.alloc(0) } }
  }
  return { fetchImpl, calls }
}

async function writeGlobalLock(agentsHome, skills) {
  await writeFile(join(agentsHome, '.skill-lock.json'), JSON.stringify({ version: 3, skills, dismissed: { ignored: true }, lastSelectedAgents: ['dsh'] }, null, 2))
}

test('list reads the CLI lock, merges the mirrored row and lists missing skills', async (t) => {
  await withSandbox(async ({ call, dshHome, agentsHome }) => {
    const real = join(agentsHome, 'skills', 'brainstorming')
    await mkdir(real, { recursive: true })
    await writeFile(join(real, 'SKILL.md'), SKILL.replaceAll('demo-skill', 'brainstorming'))
    await mkdir(join(dshHome, 'skills'), { recursive: true })
    if (!(await makeDirLink(real, join(dshHome, 'skills', 'brainstorming')))) {
      t.skip('this OS/user cannot create directory links')
      return
    }
    await writeGlobalLock(agentsHome, {
      brainstorming: {
        source: 'obra/superpowers',
        sourceType: 'github',
        sourceUrl: 'https://github.com/obra/superpowers',
        skillPath: 'skills/brainstorming',
        skillFolderHash: 'a'.repeat(40),
        installedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
      'ghost-skill': {
        source: 'acme/tools',
        sourceType: 'github',
        skillPath: 'skills/ghost-skill',
        skillFolderHash: 'b'.repeat(40),
      },
    })

    const response = await call('list', {})
    assert.equal(response.body.ok, true, JSON.stringify(response.body))
    const rows = response.body.tiers.flatMap((tier) => tier.skills)
    assert.equal(rows.filter((row) => row.name === 'brainstorming').length, 1)
    const row = rows.find((candidate) => candidate.name === 'brainstorming')
    assert.equal(row.linked, true)
    assert.equal(row.origin, 'managed')
    assert.equal(row.updatable, true)
    assert.equal(row.upstream.repo, 'obra/superpowers')
    assert.equal(row.upstream.skillPath, 'skills/brainstorming')
    assert.equal(response.body.counts.total, 1)
    assert.deepEqual(response.body.missing.map((entry) => entry.name), ['ghost-skill'])
    assert.equal(response.body.locks.global.count, 2)
    assert.deepEqual(response.body.upstreams, [{ repo: 'obra/superpowers', count: 1 }])
  })
})

test('a project lock is shown but never updatable', async () => {
  await withSandbox(async ({ call, projectDir }) => {
    await mkdir(join(projectDir, '.agents', 'skills', 'proj-skill'), { recursive: true })
    await writeFile(join(projectDir, '.agents', 'skills', 'proj-skill', 'SKILL.md'), SKILL.replaceAll('demo-skill', 'proj-skill'))
    await writeFile(join(projectDir, 'skills-lock.json'), JSON.stringify({
      version: 1,
      skills: { 'proj-skill': { source: 'acme/tools', sourceType: 'github', skillPath: 'skills/proj-skill', computedHash: 'c'.repeat(64) } },
    }))

    const response = await call('list', {})
    const row = response.body.tiers.flatMap((tier) => tier.skills).find((candidate) => candidate.name === 'proj-skill')
    assert.equal(row.origin, 'managed')
    assert.equal(row.updatable, false)
    assert.equal(row.upstream.repo, 'acme/tools')
    assert.equal(response.body.locks.project.version, 1)
    assert.equal(response.body.locks.project.count, 1)
  })
})

test('checkUpdates compares a 40-hex entry against the git tree sha', async () => {
  const tree = {
    sha: 'r'.repeat(40),
    tree: [
      { path: 'skills/fresh', type: 'tree', sha: 'f'.repeat(40) },
      { path: 'skills/stale', type: 'tree', sha: 'e'.repeat(40) },
    ],
  }
  const { fetchImpl } = fakeUpstream({ tree })
  await withSandbox(async ({ call, agentsHome }) => {
    await writeGlobalLock(agentsHome, {
      fresh: { source: 'acme/tools', sourceType: 'github', skillPath: 'skills/fresh', skillFolderHash: 'f'.repeat(40) },
      stale: { source: 'acme/tools', sourceType: 'github', skillPath: 'skills/stale', skillFolderHash: 'd'.repeat(40) },
    })
    const response = await call('checkUpdates', {})
    assert.equal(response.body.ok, true, JSON.stringify(response.body))
    const byName = new Map(response.body.results.map((result) => [result.name, result]))
    assert.equal(byName.get('fresh').status, 'up-to-date')
    assert.equal(byName.get('stale').status, 'update-available')
    assert.equal(byName.get('stale').upstreamHash, 'e'.repeat(40))
    assert.deepEqual(response.body.counts, { available: 1, uptodate: 1, unknown: 0 })
  }, { deps: { fetchImpl } })
})

test('checkUpdates hashes the upstream folder for a non tree-shaped entry', async () => {
  const files = [
    { path: 'repo-main/skills/hashed/SKILL.md', content: SKILL.replaceAll('demo-skill', 'hashed') },
  ]
  const { fetchImpl } = fakeUpstream({ files })
  await withSandbox(async ({ call, agentsHome }) => {
    await writeGlobalLock(agentsHome, {
      hashed: { source: 'acme/tools', sourceType: 'git', sourceUrl: 'https://github.com/acme/tools.git', skillPath: 'skills/hashed', skillFolderHash: '1'.repeat(64) },
    })
    const response = await call('checkUpdates', {})
    assert.equal(response.body.ok, true, JSON.stringify(response.body))
    const result = response.body.results[0]
    assert.equal(result.status, 'update-available')
    assert.equal(result.upstreamHash.length, 64)
  }, { deps: { fetchImpl } })
})

test('updateSkills installs a missing skill and keeps the lock hash format', async () => {
  const tar = makeTarGz([{ path: 'repo-main/skills/ghost-skill/SKILL.md', content: SKILL.replaceAll('demo-skill', 'ghost-skill') }])
  const tree = { sha: 'r'.repeat(40), tree: [{ path: 'skills/ghost-skill', type: 'tree', sha: 'b'.repeat(40) }] }
  const fetchImpl = async (url) => {
    if (url.includes('/git/trees/')) return jsonResponse(tree)
    if (url.startsWith('https://api.github.com/repos/')) return jsonResponse({ default_branch: 'main' })
    if (url.startsWith('https://codeload.github.com/')) return bufferResponse(tar)
    return { ok: false, status: 404, async json() { return {} }, async arrayBuffer() { return Buffer.alloc(0) } }
  }
  await withSandbox(async ({ call, agentsHome }) => {
    await writeGlobalLock(agentsHome, {
      'ghost-skill': { source: 'acme/tools', sourceType: 'github', skillPath: 'skills/ghost-skill', skillFolderHash: 'a'.repeat(40) },
    })
    const response = await call('updateSkills', { items: [{ name: 'ghost-skill', rootId: 'global-agents' }] })
    assert.equal(response.body.ok, true, JSON.stringify(response.body))
    assert.equal(response.body.results[0].status, 'installed')
    const installed = await readFile(join(agentsHome, 'skills', 'ghost-skill', 'SKILL.md'), 'utf8')
    assert.match(installed, /name: ghost-skill/)
    const lock = JSON.parse(await readFile(join(agentsHome, '.skill-lock.json'), 'utf8'))
    assert.equal(lock.skills['ghost-skill'].skillFolderHash, 'b'.repeat(40))
    assert.equal(typeof lock.skills['ghost-skill'].updatedAt, 'string')
    assert.deepEqual(lock.dismissed, { ignored: true })
    assert.deepEqual(lock.lastSelectedAgents, ['dsh'])
  }, { deps: { fetchImpl } })
})

test('updateSkills refuses local changes unless forced and keeps a backup', async () => {
  const tar = makeTarGz([{ path: 'repo-main/skills/edited/SKILL.md', content: SKILL.replaceAll('demo-skill', 'edited') }])
  const tree = { sha: 'r'.repeat(40), tree: [{ path: 'skills/edited', type: 'tree', sha: '2'.repeat(40) }] }
  const fetchImpl = async (url) => {
    if (url.includes('/git/trees/')) return jsonResponse(tree)
    if (url.startsWith('https://api.github.com/repos/')) return jsonResponse({ default_branch: 'main' })
    if (url.startsWith('https://codeload.github.com/')) return bufferResponse(tar)
    return { ok: false, status: 404, async json() { return {} }, async arrayBuffer() { return Buffer.alloc(0) } }
  }
  await withSandbox(async ({ call, agentsHome }) => {
    const dir = join(agentsHome, 'skills', 'edited')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), SKILL.replaceAll('demo-skill', 'edited').replace('Body.', 'Locally edited body.'))
    await writeFile(join(agentsHome, '.skill-update-state.json'), JSON.stringify({ version: 1, skills: { edited: { localHash: 'deadbeef', syncedAt: '2026-01-01T00:00:00.000Z' } } }))
    await writeGlobalLock(agentsHome, {
      edited: { source: 'acme/tools', sourceType: 'github', skillPath: 'skills/edited', skillFolderHash: '1'.repeat(40) },
    })

    const refused = await call('updateSkills', { items: [{ name: 'edited', rootId: 'global-agents' }] })
    assert.equal(refused.body.results[0].code, 'LOCAL_CHANGES')
    assert.match(await readFile(join(dir, 'SKILL.md'), 'utf8'), /Locally edited body/)

    const forced = await call('updateSkills', { items: [{ name: 'edited', rootId: 'global-agents' }], force: true })
    assert.equal(forced.body.results[0].ok, true, JSON.stringify(forced.body))
    assert.equal(forced.body.results[0].status, 'updated')
    const backupPath = forced.body.results[0].backupPath
    assert.match(backupPath, /[\\/]\.dsh-bak-/)
    assert.match(await readFile(join(backupPath, 'SKILL.md'), 'utf8'), /Locally edited body/)
    assert.match(await readFile(join(dir, 'SKILL.md'), 'utf8'), /^---/m)
  }, { deps: { fetchImpl } })
})

test('updateSkills rejects tar entries that escape the skill folder', async () => {
  const tar = makeTarGz([{ path: 'repo-main/skills/evil/../../evil.md', content: 'boom' }])
  const fetchImpl = async (url) => {
    if (url.startsWith('https://codeload.github.com/')) return bufferResponse(tar)
    if (url.startsWith('https://api.github.com/repos/')) return jsonResponse({ default_branch: 'main' })
    return { ok: false, status: 404, async json() { return {} }, async arrayBuffer() { return Buffer.alloc(0) } }
  }
  await withSandbox(async ({ call, agentsHome }) => {
    await writeGlobalLock(agentsHome, {
      evil: { source: 'acme/tools', sourceType: 'github', skillPath: 'skills/evil', skillFolderHash: '1'.repeat(64) },
    })
    const response = await call('updateSkills', { items: [{ name: 'evil', rootId: 'global-agents' }] })
    assert.equal(response.body.results[0].ok, false)
    assert.equal(response.body.results[0].code, 'PATH_ESCAPE')
    await assert.rejects(stat(join(agentsHome, 'evil.md')))
  }, { deps: { fetchImpl } })
})

test('updateSkills handles one physical package once per batch', async () => {
  const tar = makeTarGz([{ path: 'repo-main/skills/dup/SKILL.md', content: SKILL.replaceAll('demo-skill', 'dup') }])
  const tree = { sha: 'r'.repeat(40), tree: [{ path: 'skills/dup', type: 'tree', sha: '3'.repeat(40) }] }
  const fetchImpl = async (url) => {
    if (url.includes('/git/trees/')) return jsonResponse(tree)
    if (url.startsWith('https://api.github.com/repos/')) return jsonResponse({ default_branch: 'main' })
    if (url.startsWith('https://codeload.github.com/')) return bufferResponse(tar)
    return { ok: false, status: 404, async json() { return {} }, async arrayBuffer() { return Buffer.alloc(0) } }
  }
  await withSandbox(async ({ call, agentsHome }) => {
    await writeGlobalLock(agentsHome, {
      dup: { source: 'acme/tools', sourceType: 'github', skillPath: 'skills/dup', skillFolderHash: '4'.repeat(40) },
    })
    const response = await call('updateSkills', {
      items: [
        { name: 'dup', rootId: 'global-dsh' },
        { name: 'dup', rootId: 'global-agents' },
      ],
    })
    assert.equal(response.body.counts.ok, 2)
    assert.equal(response.body.results[1].status, 'skipped')
  }, { deps: { fetchImpl } })
})