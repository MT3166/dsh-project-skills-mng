/**
 * dsh-project-skills — host half.
 *
 * Serves the right-sidebar Skills panel over one fenced HTTP prefix route and
 * registers a model-facing tool that reuses the exact same operations. Skills
 * are the plain `SKILL.md` packages/`<name>.md` files that DSH's own
 * skill-filesystem provider discovers, so this plugin never invents a second
 * registry: it edits the files the registry already watches.
 *
 * Roots, highest priority first (same ranks as @deepseek-ai/dsh-skill-filesystem):
 *   project-dsh     100  <projectRoot>/.dsh/skills
 *   project-agents  200  <projectRoot>/.agents/skills
 *   global-dsh      400  <DSH_HOME>/skills
 *   global-agents   500  <AGENTS_HOME>/skills
 */

import { readdir, readFile, mkdir, realpath, rename, rm, stat, unlink, writeFile, access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'

export const inject = ['webServer', 'connection']

const API_PREFIX = '/dsh-project-skills/api'
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_BODY_BYTES = 1024 * 1024
const MAX_SKILL_BYTES = 512 * 1024
const MAX_CONTENT_BYTES = 256 * 1024

const ROOT_SPECS = Object.freeze([
  { id: 'project-dsh', scope: 'project', source: 'project-dsh', rank: 100, label: 'project · .dsh/skills' },
  { id: 'project-agents', scope: 'project', source: 'project-agents', rank: 200, label: 'project · .agents/skills' },
  { id: 'global-dsh', scope: 'global', source: 'user-dsh', rank: 400, label: 'global · .dsh/skills' },
  { id: 'global-agents', scope: 'global', source: 'user-agents', rank: 500, label: 'global · .agents/skills' },
])

const ROOT_IDS = ROOT_SPECS.map((spec) => spec.id)

class ApiError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

/** Environment-backed skill homes. Read per call so a changed environment is honoured. */
function dshHome() {
  const configured = process.env.DSH_HOME
  return typeof configured === 'string' && configured.trim() !== '' ? configured : join(homedir(), '.dsh')
}

function agentsHome() {
  const configured = process.env.DSH_AGENTS_HOME
  return typeof configured === 'string' && configured.trim() !== '' ? configured : join(homedir(), '.agents')
}

function rootPathOf(spec, projectRoot) {
  switch (spec.id) {
    case 'project-dsh': return join(projectRoot, '.dsh', 'skills')
    case 'project-agents': return join(projectRoot, '.agents', 'skills')
    case 'global-dsh': return join(dshHome(), 'skills')
    case 'global-agents': return join(agentsHome(), 'skills')
    default: throw new ApiError('ROOT_UNKNOWN', `unknown skill root "${spec.id}"`)
  }
}

/* ------------------------------------------------------------------ *
 * Session resolution
 * ------------------------------------------------------------------ */

/**
 * Resolve the cwd and project root a session's skills are discovered from.
 * Mirrors @deepseek-ai/dsh-api-session-controller's own skill catalog lookup.
 */
async function resolveSession(ctx, sessionId) {
  const id = typeof sessionId === 'string' ? sessionId.trim() : ''
  if (id === '') throw new ApiError('SESSION_REQUIRED', 'sessionId is required')

  let observation
  const sessionQuery = ctx.get('sessionQuery')
  if (sessionQuery !== undefined && typeof sessionQuery.observeSession === 'function') {
    try {
      observation = await sessionQuery.observeSession(id)
    } catch (error) {
      throw new ApiError('SESSION_NOT_FOUND', `session ${id} is unavailable: ${errorMessage(error)}`)
    }
  }

  const agents = ctx.get('agents')
  const live = agents !== undefined && typeof agents.get === 'function' ? agents.get(id) : undefined

  const workingDirectory = ctx.get('workingDirectory')
  let cwd = observation?.projections?.values?.workingDirectory ?? observation?.header?.cwd
  if (live !== undefined && workingDirectory !== undefined && typeof workingDirectory.ensure === 'function') {
    try {
      const ensured = await workingDirectory.ensure(live, undefined)
      if (typeof ensured === 'string' && ensured !== '') cwd = ensured
    } catch {
      // The projected cwd above stays authoritative when ensure() cannot answer.
    }
  }
  if (typeof cwd !== 'string' || cwd === '') {
    const fallback = workingDirectory?.defaultDirectory
    if (typeof fallback === 'string' && fallback !== '') cwd = fallback
  }
  if (typeof cwd !== 'string' || cwd === '') {
    throw new ApiError('SESSION_NOT_FOUND', `session ${id} has no working directory`)
  }

  const projectRoot = await findProjectRoot(resolve(cwd))
  return { sessionId: id, cwd: resolve(cwd), projectRoot }
}

/** Nearest ancestor holding a `.git` entry, exactly like the filesystem skill provider. */
async function findProjectRoot(start) {
  let current = start
  for (;;) {
    try {
      await stat(join(current, '.git'))
      return current
    } catch {
      const parent = dirname(current)
      if (parent === current) return start
      current = parent
    }
  }
}

/* ------------------------------------------------------------------ *
 * Roots
 * ------------------------------------------------------------------ */

async function describeRoots(projectRoot) {
  const roots = []
  for (const spec of ROOT_SPECS) {
    const path = rootPathOf(spec, projectRoot)
    const exists = await pathExists(path)
    roots.push({
      id: spec.id,
      scope: spec.scope,
      source: spec.source,
      rank: spec.rank,
      label: spec.label,
      path,
      exists,
      writable: await isWritable(path, exists),
    })
  }
  return roots
}

function findRoot(roots, rootId) {
  const root = roots.find((candidate) => candidate.id === rootId)
  if (root === undefined) throw new ApiError('ROOT_UNKNOWN', `unknown skill root "${String(rootId)}"`)
  return root
}

async function pathExists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function isWritable(path, exists) {
  let target = path
  if (!exists) {
    // A missing root is writable when its nearest existing ancestor is.
    for (;;) {
      const parent = dirname(target)
      if (parent === target) return false
      target = parent
      if (await pathExists(target)) break
    }
  }
  try {
    await access(target, fsConstants.W_OK)
    return true
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ *
 * SKILL.md documents
 * ------------------------------------------------------------------ */

/**
 * Split a SKILL.md into frontmatter lines and body. Returns `problem` instead of
 * a document when the frontmatter cannot describe a skill.
 */
function parseSkillDocument(source) {
  const text = source.replace(/^\uFEFF/, '')
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  if (match === null) return { problem: 'missing YAML frontmatter' }

  const lines = match[1].split(/\r?\n/)
  const fields = collectFrontmatterFields(lines)

  const name = fields.get('name')
  if (name === undefined || name.value === '') return { problem: 'frontmatter requires a name' }
  if (!SKILL_NAME.test(name.value)) return { problem: `invalid skill name "${name.value}"` }

  const description = fields.get('description')
  if (description === undefined || description.value.trim() === '') {
    return { problem: 'frontmatter requires a non-empty description' }
  }

  const whenToUse = fields.get('whenToUse')
  const modelInvocable = booleanish(fields.get('disable-model-invocation')?.value) !== true
  const userInvocable = booleanish(fields.get('user-invocable')?.value) !== false

  return {
    name: name.value,
    description: description.value,
    whenToUse: whenToUse !== undefined && whenToUse.value !== '' ? whenToUse.value : undefined,
    modelInvocable,
    userInvocable,
    body: text.slice(match[0].length).trim(),
  }
}

function booleanish(value) {
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value
  const normalized = String(value).trim().toLowerCase()
  if (normalized === 'true' || normalized === 'yes' || normalized === 'on' || normalized === '1') return true
  if (normalized === 'false' || normalized === 'no' || normalized === 'off' || normalized === '0') return false
  return undefined
}

/**
 * Collect top-level `key: value` frontmatter pairs, including block scalars.
 * Unknown nested structures are skipped rather than guessed at.
 */
function collectFrontmatterFields(lines) {
  const fields = new Map()
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const match = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(line)
    if (match === null) continue
    const key = match[1]
    const raw = match[2].trim()
    if (raw.startsWith('|') || raw.startsWith('>')) {
      const block = []
      let cursor = index + 1
      while (cursor < lines.length && (lines[cursor].startsWith(' ') || lines[cursor].startsWith('\t') || lines[cursor].trim() === '')) {
        block.push(lines[cursor].replace(/^[ \t]/, ''))
        cursor += 1
      }
      index = cursor - 1
      const joined = raw.startsWith('>') ? block.join(' ').replace(/\s+/g, ' ').trim() : dedent(block).trim()
      fields.set(key, { value: joined, start: indexOfKey(lines, key), end: index })
      continue
    }
    fields.set(key, { value: unquote(raw), start: index, end: index })
  }
  return fields
}

function indexOfKey(lines, key) {
  const prefix = `${key}:`
  for (let index = 0; index < lines.length; index += 1) if (lines[index].startsWith(prefix)) return index
  return -1
}

function dedent(lines) {
  const indents = lines.filter((line) => line.trim() !== '').map((line) => /^[ \t]+/.exec(line)?.[0].length ?? 0)
  const width = indents.length === 0 ? 0 : Math.min(...indents)
  return lines.map((line) => line.slice(width)).join('\n')
}

function unquote(raw) {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return JSON.parse(raw)
    } catch {
      return raw.slice(1, -1)
    }
  }
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replaceAll("''", "'")
  }
  return raw
}

/** Rewrite (or drop) one top-level scalar field while keeping every other byte intact. */
function setFrontmatterField(lines, key, rawValue) {
  const next = [...lines]
  const prefix = `${key}:`
  const existing = next.findIndex((line) => line.startsWith(prefix))
  if (rawValue === null) {
    if (existing !== -1) next.splice(existing, 1)
    return next
  }
  const replacement = `${key}: ${rawValue}`
  if (existing !== -1) next[existing] = replacement
  else next.push(replacement)
  return next
}

function renderSkillDocument(lines, body) {
  const head = lines.length === 0 ? '' : `${lines.join('\n')}\n`
  return `---\n${head}---\n\n${body.replace(/^\n+/, '')}`
}

/* ------------------------------------------------------------------ *
 * Discovery
 * ------------------------------------------------------------------ */

async function readSkillFile(root, filePath) {
  let info
  try {
    info = await stat(filePath)
  } catch {
    return { kind: 'skip' }
  }
  if (!info.isFile()) return { kind: 'skip' }
  if (info.size > MAX_SKILL_BYTES) {
    return { kind: 'error', path: filePath, message: `SKILL.md is larger than ${Math.round(MAX_SKILL_BYTES / 1024)} KiB` }
  }
  let source
  try {
    source = await readFile(filePath, 'utf8')
  } catch (error) {
    return { kind: 'error', path: filePath, message: errorMessage(error) }
  }
  const parsed = parseSkillDocument(source)
  if (parsed.problem !== undefined) return { kind: 'error', path: filePath, message: parsed.problem }
  return {
    kind: 'skill',
    skill: {
      name: parsed.name,
      description: parsed.description,
      ...(parsed.whenToUse === undefined ? {} : { whenToUse: parsed.whenToUse }),
      path: filePath,
      rootId: root.id,
      scope: root.scope,
      source: root.source,
      rank: root.rank,
      modelInvocable: parsed.modelInvocable,
      userInvocable: parsed.userInvocable,
      shadowed: false,
      shadowedBy: undefined,
      shadows: [],
    },
  }
}

async function scanRoot(root) {
  const skills = []
  const errors = []
  if (!root.exists) return { skills, errors }
  let dirents
  try {
    dirents = await readdir(root.path, { withFileTypes: true })
  } catch (error) {
    errors.push({ rootId: root.id, path: root.path, message: errorMessage(error) })
    return { skills, errors }
  }
  for (const dirent of dirents) {
    if (dirent.name.startsWith('.')) continue
    const entryPath = join(root.path, dirent.name)
    let filePath
    let info
    try {
      info = await stat(entryPath)
    } catch {
      continue
    }
    if (info.isDirectory()) filePath = join(entryPath, 'SKILL.md')
    else if (info.isFile() && dirent.name.endsWith('.md')) filePath = entryPath
    else continue
    const record = await readSkillFile(root, filePath)
    if (record.kind === 'skill') skills.push(record.skill)
    else if (record.kind === 'error') errors.push({ rootId: root.id, path: record.path, message: record.message })
  }
  skills.sort((left, right) => left.name.localeCompare(right.name))
  return { skills, errors }
}

/** Mark the candidate that loses a name collision so the panel can explain shadowing. */
function markShadowing(skills) {
  const byName = new Map()
  for (const skill of skills) {
    const group = byName.get(skill.name)
    if (group === undefined) byName.set(skill.name, [skill])
    else group.push(skill)
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue
    group.sort((left, right) => left.rank - right.rank || left.path.localeCompare(right.path))
    const [winner, ...losers] = group
    winner.shadows = losers.map((loser) => ({ rootId: loser.rootId, path: loser.path }))
    for (const loser of losers) {
      loser.shadowed = true
      loser.shadowedBy = { rootId: winner.rootId, path: winner.path, name: winner.name }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Mutations
 * ------------------------------------------------------------------ */

function validateSkillName(name) {
  const value = typeof name === 'string' ? name.trim() : ''
  if (!SKILL_NAME.test(value)) {
    throw new ApiError('INVALID_NAME', 'skill name must be kebab-case, e.g. "my-skill"')
  }
  return value
}

async function locateSkillFile(rootPath, name) {
  const packageDir = join(rootPath, name)
  const packageFile = join(packageDir, 'SKILL.md')
  if (await pathExists(packageFile)) return { filePath: packageFile, directory: packageDir }
  const flatFile = join(rootPath, `${name}.md`)
  if (await pathExists(flatFile)) return { filePath: flatFile, directory: undefined }
  return undefined
}

async function assertContained(rootPath, targetPath) {
  const rootReal = await realpath(rootPath)
  const targetReal = await realpath(targetPath)
  const parent = normalizeForCompare(rootReal)
  const child = normalizeForCompare(targetReal)
  if (child !== parent && !child.startsWith(parent + sep)) {
    throw new ApiError('PATH_ESCAPE', 'refusing to touch a path outside the skill root')
  }
  return targetReal
}

function normalizeForCompare(path) {
  return process.platform === 'win32' ? path.toLowerCase() : path
}

async function ensureRootDirectory(root) {
  if (!root.writable) throw new ApiError('ROOT_READ_ONLY', `skill root ${root.path} is not writable`)
  await mkdir(root.path, { recursive: true })
  return assertContained(root.path, root.path)
}

async function writeSkillFile(root, name, content) {
  const rootReal = await ensureRootDirectory(root)
  const existing = await locateSkillFile(rootReal, name)
  const directory = existing?.directory ?? join(rootReal, name)
  const filePath = existing?.filePath ?? join(directory, 'SKILL.md')
  if (existing === undefined) await mkdir(directory, { recursive: true })
  const safeDirectory = await assertContained(rootReal, directory)
  const target = join(safeDirectory, basename(filePath))
  const temporary = join(safeDirectory, `.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`)
  await writeFile(temporary, content, 'utf8')
  await rename(temporary, target)
  return { filePath: target, created: existing === undefined }
}

/** Validate a document a client wants to store; the name must match its frontmatter. */
function validateSkillContent(content, name) {
  const text = typeof content === 'string' ? content : ''
  if (text.trim() === '') throw new ApiError('INVALID_CONTENT', 'content is required')
  if (Buffer.byteLength(text, 'utf8') > MAX_CONTENT_BYTES) {
    throw new ApiError('INVALID_CONTENT', `content exceeds ${Math.round(MAX_CONTENT_BYTES / 1024)} KiB`)
  }
  const parsed = parseSkillDocument(text)
  if (parsed.problem !== undefined) throw new ApiError('INVALID_CONTENT', parsed.problem)
  if (parsed.name !== name) {
    throw new ApiError('NAME_MISMATCH', `frontmatter name "${parsed.name}" does not match the target "${name}"`)
  }
  return text
}

/* ------------------------------------------------------------------ *
 * API operations
 * ------------------------------------------------------------------ */

function createApi(ctx) {
  const session = (payload) => resolveSession(ctx, payload?.sessionId)

  return {
    async roots(payload) {
      const resolved = await session(payload)
      return { cwd: resolved.cwd, projectRoot: resolved.projectRoot, roots: await describeRoots(resolved.projectRoot) }
    },

    async list(payload) {
      const resolved = await session(payload)
      const roots = await describeRoots(resolved.projectRoot)
      const skills = []
      const errors = []
      for (const root of roots) {
        const scanned = await scanRoot(root)
        skills.push(...scanned.skills)
        errors.push(...scanned.errors)
      }
      markShadowing(skills)
      const groups = ['project', 'global'].map((scope) => ({
        scope,
        roots: roots
          .filter((root) => root.scope === scope)
          .map((root) => ({ id: root.id, source: root.source, path: root.path, exists: root.exists, writable: root.writable })),
        skills: skills
          .filter((skill) => skill.scope === scope)
          .map((skill) => ({
            name: skill.name,
            description: skill.description,
            ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
            path: skill.path,
            rootId: skill.rootId,
            source: skill.source,
            rank: skill.rank,
            modelInvocable: skill.modelInvocable,
            userInvocable: skill.userInvocable,
            shadowed: skill.shadowed,
            ...(skill.shadowedBy === undefined ? {} : { shadowedBy: skill.shadowedBy }),
            ...(skill.shadows.length === 0 ? {} : { shadows: skill.shadows }),
          })),
      }))
      const counts = {
        project: groups[0].skills.length,
        global: groups[1].skills.length,
        total: skills.length,
        shadowed: skills.filter((skill) => skill.shadowed).length,
        broken: errors.length,
      }
      return { cwd: resolved.cwd, projectRoot: resolved.projectRoot, counts, groups, errors }
    },

    async read(payload) {
      const resolved = await session(payload)
      const roots = await describeRoots(resolved.projectRoot)
      const name = validateSkillName(payload?.name)
      for (const root of roots) {
        if (!root.exists) continue
        const rootReal = await realpath(root.path).catch(() => undefined)
        if (rootReal === undefined) continue
        const located = await locateSkillFile(rootReal, name)
        if (located === undefined) continue
        const content = await readFile(located.filePath, 'utf8')
        const parsed = parseSkillDocument(content)
        if (parsed.problem !== undefined) throw new ApiError('INVALID_CONTENT', `${located.filePath}: ${parsed.problem}`)
        return {
          name,
          path: located.filePath,
          rootId: root.id,
          scope: root.scope,
          writable: root.writable,
          content,
        }
      }
      throw new ApiError('SKILL_NOT_FOUND', `no skill named "${name}" in this session's roots`)
    },

    async write(payload) {
      const resolved = await session(payload)
      const roots = await describeRoots(resolved.projectRoot)
      const root = findRoot(roots, payload?.rootId)
      const name = validateSkillName(payload?.name)
      const content = validateSkillContent(payload?.content, name)
      const written = await writeSkillFile(root, name, content)
      return { name, rootId: root.id, path: written.filePath, created: written.created }
    },

    async delete(payload) {
      const resolved = await session(payload)
      const roots = await describeRoots(resolved.projectRoot)
      const root = findRoot(roots, payload?.rootId)
      const name = validateSkillName(payload?.name)
      if (!root.writable) throw new ApiError('ROOT_READ_ONLY', `skill root ${root.path} is not writable`)
      const rootReal = await realpath(root.path).catch(() => undefined)
      if (rootReal === undefined) throw new ApiError('SKILL_NOT_FOUND', `skill root ${root.path} does not exist`)
      const located = await locateSkillFile(rootReal, name)
      if (located === undefined) throw new ApiError('SKILL_NOT_FOUND', `no skill named "${name}" in ${root.path}`)
      const safe = await assertContained(rootReal, located.filePath)
      if (located.directory === undefined) await unlink(safe)
      else await rm(await realpath(located.directory), { recursive: true, force: true })
      return { name, rootId: root.id, path: safe, deleted: true }
    },

    async toggle(payload) {
      const resolved = await session(payload)
      const roots = await describeRoots(resolved.projectRoot)
      const root = findRoot(roots, payload?.rootId)
      const name = validateSkillName(payload?.name)
      const field = payload?.field
      if (field !== 'model' && field !== 'user') throw new ApiError('INVALID_FIELD', 'field must be "model" or "user"')
      if (typeof payload?.value !== 'boolean') throw new ApiError('INVALID_FIELD', 'value must be a boolean')
      if (!root.writable) throw new ApiError('ROOT_READ_ONLY', `skill root ${root.path} is not writable`)

      const rootReal = await realpath(root.path).catch(() => undefined)
      if (rootReal === undefined) throw new ApiError('SKILL_NOT_FOUND', `skill root ${root.path} does not exist`)
      const located = await locateSkillFile(rootReal, name)
      if (located === undefined) throw new ApiError('SKILL_NOT_FOUND', `no skill named "${name}" in ${root.path}`)
      await assertContained(rootReal, located.filePath)

      const source = await readFile(located.filePath, 'utf8')
      const parsed = parseSkillDocument(source)
      if (parsed.problem !== undefined) throw new ApiError('INVALID_CONTENT', `${located.filePath}: ${parsed.problem}`)

      const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source)
      const lines = match[1].split(/\r?\n/)
      const key = field === 'model' ? 'disable-model-invocation' : 'user-invocable'
      const rawValue = field === 'model'
        ? (payload.value ? null : 'true')
        : (payload.value ? null : 'false')
      const nextLines = setFrontmatterField(lines, key, rawValue)
      const nextContent = renderSkillDocument(nextLines, source.slice(match[0].length))
      const temporary = join(dirname(located.filePath), `.${basename(located.filePath)}.${process.pid}.${Date.now()}.tmp`)
      await writeFile(temporary, nextContent, 'utf8')
      await rename(temporary, located.filePath)

      const reparsed = parseSkillDocument(nextContent)
      if (reparsed.problem !== undefined) throw new ApiError('INVALID_CONTENT', reparsed.problem)
      return {
        name,
        path: located.filePath,
        rootId: root.id,
        modelInvocable: reparsed.modelInvocable,
        userInvocable: reparsed.userInvocable,
        content: nextContent,
      }
    },
  }
}

/* ------------------------------------------------------------------ *
 * HTTP surface
 * ------------------------------------------------------------------ */

function writeJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function readJsonBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        rejectPromise(new ApiError('BODY_TOO_LARGE', `request body exceeds ${Math.round(MAX_BODY_BYTES / 1024)} KiB`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (raw === '') {
        resolvePromise({})
        return
      }
      try {
        const parsed = JSON.parse(raw)
        resolvePromise(parsed !== null && typeof parsed === 'object' ? parsed : {})
      } catch {
        rejectPromise(new ApiError('BAD_JSON', 'request body is not valid JSON'))
      }
    })
    req.on('error', (error) => rejectPromise(error))
  })
}

function createHandler(ctx, api) {
  return async function handler(req, res) {
    let rejection
    try {
      rejection = ctx.connection.requestRejection(req)
    } catch (error) {
      rejection = error
    }
    if (rejection !== undefined) {
      writeJson(res, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'request rejected by the deployment fence' } })
      return
    }
    if (req.method !== 'POST') {
      writeJson(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'POST is required' } })
      return
    }
    const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
    if (!pathname.startsWith(`${API_PREFIX}/`)) {
      writeJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'unknown endpoint' } })
      return
    }
    const method = pathname.slice(API_PREFIX.length + 1)
    if (!Object.hasOwn(api, method)) {
      writeJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: `unknown method "${method}"` } })
      return
    }
    try {
      const payload = await readJsonBody(req)
      const result = await api[method](payload)
      writeJson(res, 200, { ok: true, ...result })
    } catch (error) {
      if (error instanceof ApiError) {
        writeJson(res, 200, { ok: false, error: { code: error.code, message: error.message } })
        return
      }
      ctx.logger?.warn?.(`dsh-project-skills: ${method} failed: ${errorMessage(error)}`)
      writeJson(res, 500, { ok: false, error: { code: 'INTERNAL', message: errorMessage(error) } })
    }
  }
}

/* ------------------------------------------------------------------ *
 * Model-facing tool
 * ------------------------------------------------------------------ */

const TOOL_PARAMETERS = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['list', 'read', 'create', 'update', 'delete', 'toggle'],
      description: 'list: catalog of project and global skills. read: one SKILL.md. create/update: write one SKILL.md. delete: remove one skill. toggle: flip its model/user invocation flags.',
    },
    name: { type: 'string', description: 'kebab-case skill name; required for read/create/update/delete/toggle.' },
    rootId: {
      type: 'string',
      enum: ROOT_IDS,
      description: 'Target root for create/update/delete/toggle. project-dsh = <project>/.dsh/skills, project-agents = <project>/.agents/skills, global-dsh = ~/.dsh/skills, global-agents = ~/.agents/skills.',
    },
    content: { type: 'string', description: 'Full SKILL.md text (YAML frontmatter plus body) for create/update.' },
    field: { type: 'string', enum: ['model', 'user'], description: 'For toggle: which invocation flag to change.' },
    value: { type: 'boolean', description: 'For toggle: the desired value of the chosen flag.' },
  },
  required: ['action'],
  additionalProperties: false,
}

function registerTool(ctx, api) {
  const tools = ctx.get('tools')
  if (tools === undefined || typeof tools.register !== 'function') {
    ctx.logger?.info?.('dsh-project-skills: tools service is unavailable; skipping the model-facing tool')
    return
  }
  ctx.effect(() => tools.register({
    name: 'skills_manage',
    description: 'Browse and manage the project-level and global Agent Skills in effect for this session. Actions: list (catalog with scope/source/shadowing), read (SKILL.md), create/update (write SKILL.md into a root), delete, toggle (model/user invocation flags).',
    parameters: TOOL_PARAMETERS,
    output: {
      schema: { type: 'object' },
      render(_args, value) {
        return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
      },
    },
    async execute(args, exec) {
      const payload = { ...(args !== null && typeof args === 'object' ? args : {}), sessionId: String(exec.agent?.id ?? '') }
      const action = payload.action
      if (!Object.hasOwn(api, action)) throw new Error(`unknown action "${String(action)}"`)
      if (action === 'roots') throw new Error('roots is not a tool action')
      return await api[action](payload)
    },
  }), 'dsh-project-skills: model-facing tool')
}

/* ------------------------------------------------------------------ *
 * Plugin entry
 * ------------------------------------------------------------------ */

export function apply(ctx) {
  const api = createApi(ctx)
  const handler = createHandler(ctx, api)
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler,
  }), 'dsh-project-skills: host API')
  registerTool(ctx, api)
}
