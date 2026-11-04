/**
 * Live-data probe: run the plugin's Host handlers in-process against the real
 * skill roots on this machine (with a throwaway project root), so the catalog
 * parsing can be checked without the DSH runtime.
 *
 * Usage: node test/probe.mjs <projectDir>
 */
import { EventEmitter } from 'node:events'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../index.js'

const projectDir = mkdtempSync(join(tmpdir(), 'dsh-ps-probe-'))
mkdirSync(join(projectDir, '.dsh', 'skills', 'demo-skill'), { recursive: true })
writeFileSync(
  join(projectDir, '.dsh', 'skills', 'demo-skill', 'SKILL.md'),
  `---\nname: demo-skill\ndescription: Demo project skill for the live probe.\n---\n\n# Demo\n`,
)

let handler
const ctx = {
  logger: { warn: () => {}, info: () => {}, error: () => {} },
  get(name) {
    if (name === 'sessionQuery') {
      return {
        async observeSession(id) {
          if (id !== 'probe') throw new Error('not found')
          return { projections: { values: { workingDirectory: projectDir } }, header: { cwd: projectDir } }
        },
      }
    }
    if (name === 'tools') return undefined
    return undefined
  },
  effect(fn) {
    fn()
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

apply(ctx)

function request(method, payload) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter()
    req.method = 'POST'
    req.url = '/dsh-project-skills-mng/api/' + method
    req.destroy = () => {}
    const res = {
      statusCode: 0,
      setHeader() {},
      end(body) {
        resolve({ status: this.statusCode, body: JSON.parse(body) })
      },
    }
    handler(req, res).catch(reject)
    req.emit('data', Buffer.from(JSON.stringify(payload), 'utf8'))
    req.emit('end')
  })
}

const list = await request('list', { sessionId: 'probe' })
const groups = list.body.groups ?? []
console.log(JSON.stringify({
  projectDir,
  ok: list.body.ok,
  cwd: list.body.cwd,
  projectRoot: list.body.projectRoot,
  counts: list.body.counts,
  errors: list.body.errors?.length ?? 0,
  groups: groups.map((g) => ({
    scope: g.scope,
    roots: g.roots?.map?.((r) => ({ id: r.id, exists: r.exists, writable: r.writable, count: r.skills?.length })),
    skills: g.skills?.length,
    shadowed: g.skills?.filter?.((s) => s.shadowedBy).length,
    sample: g.skills?.slice?.(0, 6).map((s) => `${s.name}${s.shadowedBy ? '*' : ''}${s.modelInvocable ? '' : ' [no-model]'}${s.userInvocable ? '' : ' [no-user]'}`),
  })),
  firstErrors: (list.body.errors ?? []).slice(0, 5),
}, null, 2))
