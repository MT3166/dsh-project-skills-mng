/**
 * dsh-project-skills-mng — host half.
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

import { readdir, readFile, lstat, mkdir, mkdtemp, realpath, rename, rm, stat, unlink, writeFile, access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { gunzipSync } from 'node:zlib'

export const inject = ['webServer', 'connection']

const API_PREFIX = '/dsh-project-skills-mng/api'
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_BODY_BYTES = 1024 * 1024
const MAX_SKILL_BYTES = 512 * 1024
const MAX_CONTENT_BYTES = 256 * 1024
/** Copying a skill moves the whole package, so give it more room than one document. */
const MAX_PACKAGE_BYTES = 32 * 1024 * 1024
/** Directories that are never part of a skill package's content. */
const SKIP_PACKAGE_NAMES = new Set(['.git', 'node_modules'])

const ROOT_SPECS = Object.freeze([
  { id: 'project-dsh', scope: 'project', source: 'project-dsh', rank: 100, label: 'project · .dsh/skills' },
  { id: 'project-agents', scope: 'project', source: 'project-agents', rank: 200, label: 'project · .agents/skills' },
  { id: 'global-dsh', scope: 'global', source: 'user-dsh', rank: 400, label: 'global · .dsh/skills' },
  { id: 'global-agents', scope: 'global', source: 'user-agents', rank: 500, label: 'global · .agents/skills' },
])

const ROOT_IDS = ROOT_SPECS.map((spec) => spec.id)

class ApiError extends Error {
  constructor(code, message, details) {
    super(message)
    this.code = code
    this.details = details
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
  // Keep every body byte: the server only rewrites the frontmatter block. The
  // newline that terminated the closing `---` is re-emitted here.
  return `---\n${head}---\n${body}`
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

/** Flag skills whose package/file resolves somewhere else than its lexical path
 *  (an installed link), so the panel can say where the bytes really live. */
async function annotateLinks(skills, roots) {
  const byId = new Map(roots.map((root) => [root.id, root]))
  for (const skill of skills) {
    const root = byId.get(skill.rootId)
    if (root === undefined) continue
    const rootReal = await realpath(root.path).catch(() => undefined)
    const real = await realpath(skill.path).catch(() => undefined)
    if (rootReal === undefined || real === undefined) continue
    const lexical = join(rootReal, relative(root.path, skill.path))
    if (normalizeForCompare(lexical) === normalizeForCompare(real)) continue
    skill.linked = true
    skill.realPath = real
  }
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

/** Real paths of the declared roots that exist. A skill package may legitimately
 *  be a link into a sibling root (e.g. `~/.dsh/skills/x -> ~/.agents/skills/x`,
 *  which is how mirrored global skill sets are installed). */
async function knownRootReals(roots) {
  const out = []
  for (const root of roots) {
    if (!root.exists) continue
    const real = await realpath(root.path).catch(() => undefined)
    if (real !== undefined) out.push(real)
  }
  return out
}

function isInside(parent, child) {
  const outer = normalizeForCompare(parent)
  const inner = normalizeForCompare(child)
  return inner === outer || inner.startsWith(outer + sep)
}

/**
 * Resolve a target and keep it inside its own root — or inside one of the other
 * skill roots, so linked packages stay browsable/editable. Anything else is a
 * path escape and is refused.
 */
async function resolveContained(rootPath, targetPath, allowedReals = []) {
  const rootReal = await realpath(rootPath)
  const targetReal = await realpath(targetPath)
  if (isInside(rootReal, targetReal)) return { realPath: targetReal, linked: false }
  if (allowedReals.some((candidate) => isInside(candidate, targetReal))) {
    return { realPath: targetReal, linked: true }
  }
  throw new ApiError('PATH_ESCAPE', 'refusing to touch a path outside the skill roots')
}

function normalizeForCompare(path) {
  return process.platform === 'win32' ? path.toLowerCase() : path
}

/** The declared root that physically owns a real path, if any. */
async function rootOwningPath(roots, targetPath) {
  for (const root of roots) {
    if (!root.exists) continue
    const real = await realpath(root.path).catch(() => undefined)
    if (real !== undefined && isInside(real, targetPath)) return root
  }
  return undefined
}

async function ensureRootDirectory(root, allowedReals = []) {
  if (!root.writable) throw new ApiError('ROOT_READ_ONLY', `skill root ${root.path} is not writable`)
  await mkdir(root.path, { recursive: true })
  return (await resolveContained(root.path, root.path, allowedReals)).realPath
}

async function writeSkillFile(root, name, content, allowedReals = []) {
  const rootReal = await ensureRootDirectory(root, allowedReals)
  const existing = await locateSkillFile(rootReal, name)
  // A flat `<name>.md` skill keeps its file in the root itself; only a missing
  // skill gets a fresh `<name>/` package directory.
  const directory = existing === undefined ? join(rootReal, name) : existing.directory ?? rootReal
  const filePath = existing?.filePath ?? join(directory, 'SKILL.md')
  if (existing === undefined) await mkdir(directory, { recursive: true })
  // A linked package keeps its files in the linked-to root; write there so the
  // link is preserved instead of being replaced by a directory.
  const safeDirectory = (await resolveContained(rootReal, directory, allowedReals)).realPath
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

/** Validate a document copied between tiers: same rules, no client size limit. */
function validateTransferredDocument(text, name) {
  const parsed = parseSkillDocument(text)
  if (parsed.problem !== undefined) throw new ApiError('INVALID_CONTENT', parsed.problem)
  if (parsed.name !== name) {
    throw new ApiError('NAME_MISMATCH', `frontmatter name "${parsed.name}" does not match the target "${name}"`)
  }
}

/**
 * Copy a skill package directory tree.
 *
 * A skill is more than its SKILL.md — scripts/, references/ and assets/ are part
 * of it — so a transfer reproduces the whole directory. Links inside the package
 * are flattened to the bytes they resolve to (a copy must not depend on the
 * source layout), and `.git` / `node_modules` never travel with it.
 */
async function copySkillPackage(sourceDir, destinationDir, budget) {
  await mkdir(destinationDir, { recursive: true })
  const entries = await readdir(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    if (SKIP_PACKAGE_NAMES.has(entry.name)) continue
    const from = join(sourceDir, entry.name)
    const to = join(destinationDir, entry.name)
    const info = await lstat(from)
    let isLink = info.isSymbolicLink()
    const real = isLink || info.isDirectory() ? await realpath(from).catch(() => undefined) : undefined
    if (isLink && real === undefined) continue
    const resolvedInfo = isLink ? await lstat(real).catch(() => undefined) : info
    if (resolvedInfo === undefined) continue
    if (resolvedInfo.isDirectory()) {
      await copySkillPackage(real ?? from, to, budget)
      continue
    }
    budget.used += resolvedInfo.size
    if (budget.used > budget.limit) {
      throw new ApiError('PACKAGE_TOO_LARGE', `package exceeds ${Math.round(budget.limit / 1024 / 1024)} MiB`)
    }
    await writeFile(to, await readFile(real ?? from))
  }
}

/** Remove whatever occupies a skill name in one root (package, flat file, or link). */
async function removeSkillEntry(rootReal, name, allowedReals) {
  const located = await locateSkillFile(rootReal, name)
  if (located === undefined) return
  if (located.directory !== undefined) {
    const info = await lstat(located.directory)
    if (info.isSymbolicLink()) {
      await unlink(located.directory)
      return
    }
    const real = (await resolveContained(rootReal, located.directory, allowedReals)).realPath
    await rm(real, { recursive: true, force: true })
    return
  }
  await unlink(located.filePath)
}

/* ------------------------------------------------------------------ *
 * Upstream sources (skills CLI lock file, GitHub, snapshot updates)
 * ------------------------------------------------------------------ */

const LOCK_FILE = '.skill-lock.json'
const PROJECT_LOCK_FILE = 'skills-lock.json'
const STATE_FILE = '.skill-update-state.json'
const GITHUB_API = 'https://api.github.com'
const GITHUB_CODELOAD = 'https://codeload.github.com'
/** Nested files that never count as an upstream change (they are generated). */
const DRIFT_IGNORE_DIRS = new Set(['__pycache__'])
const DRIFT_IGNORE_FILES = new Set(['.DS_Store', 'Thumbs.db'])
const DRIFT_IGNORE_SUFFIXES = ['.pyc', '.log']
const HASHED_SKILL_LIMIT = 40 * 1024 * 1024
const ROOT_SKILL_LIMIT = 128 * 1024 * 1024
const DOWNLOAD_LIMIT = 64 * 1024 * 1024
const UPDATE_CACHE_TTL = 5 * 60 * 1000
const BACKUP_KEEP = 2

function globalLockPath() {
  const stateHome = typeof process.env.XDG_STATE_HOME === 'string' ? process.env.XDG_STATE_HOME.trim() : ''
  if (stateHome !== '') return join(stateHome, 'skills', LOCK_FILE)
  return join(agentsHome(), LOCK_FILE)
}

function projectLockPath(projectRoot) {
  return join(projectRoot, PROJECT_LOCK_FILE)
}

function ignoredDriftPath(segments, name) {
  if (segments.some((segment) => DRIFT_IGNORE_DIRS.has(segment))) return true
  if (DRIFT_IGNORE_FILES.has(name)) return true
  const lower = name.toLowerCase()
  return DRIFT_IGNORE_SUFFIXES.some((suffix) => lower.endsWith(suffix))
}

/** Parse one lock file without ever throwing: a broken lock is a warning, not a crash. */
async function readJsonDocument(filePath) {
  let raw
  try {
    raw = await readFile(filePath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return { missing: true }
    return { problem: `cannot read ${filePath}: ${errorMessage(error)}` }
  }
  try {
    const value = JSON.parse(raw)
    if (value === null || typeof value !== 'object') return { problem: `${filePath} is not a JSON object` }
    return { value }
  } catch (error) {
    return { problem: `${filePath} is not valid JSON: ${errorMessage(error)}` }
  }
}

/** `owner/repo`, `https://github.com/owner/repo(.git)`, `git@github.com:owner/repo.git`. */
function parseRepo(entry) {
  const sourceUrl = typeof entry.sourceUrl === 'string' ? entry.sourceUrl : ''
  const source = typeof entry.source === 'string' ? entry.source : ''
  const candidates = [sourceUrl, source].filter((value) => value !== '')
  for (const candidate of candidates) {
    const ssh = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/.exec(candidate)
    if (ssh !== null) return { repo: `${ssh[1]}/${ssh[2]}`, type: 'git' }
    const https = /^https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(candidate)
    if (https !== null) return { repo: `${https[1]}/${https[2]}`, type: 'github' }
    const bare = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(candidate)
    if (bare !== null) return { repo: `${bare[1]}/${bare[2]}`, type: 'github' }
  }
  return undefined
}

function normalizeLockEntries(raw, scope) {
  const entries = new Map()
  const skills = raw?.skills
  if (skills === null || typeof skills !== 'object') return entries
  for (const [name, value] of Object.entries(skills)) {
    if (value === null || typeof value !== 'object') continue
    const hash = typeof value.skillFolderHash === 'string' ? value.skillFolderHash : typeof value.computedHash === 'string' ? value.computedHash : ''
    entries.set(name, {
      name,
      scope,
      source: typeof value.source === 'string' ? value.source : '',
      sourceType: typeof value.sourceType === 'string' ? value.sourceType : '',
      sourceUrl: typeof value.sourceUrl === 'string' ? value.sourceUrl : '',
      skillPath: typeof value.skillPath === 'string' ? value.skillPath : '',
      hash,
      installedAt: typeof value.installedAt === 'string' ? value.installedAt : undefined,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
      ref: typeof value.ref === 'string' ? value.ref : undefined,
    })
  }
  return entries
}

/** Read both lock files. Global v3 is authoritative for updates; project v1 is read-only. */
async function readLocks(projectRoot) {
  const warnings = []
  const globalPath = globalLockPath()
  const globalRaw = await readJsonDocument(globalPath)
  let global = null
  if (globalRaw.value !== undefined) {
    const version = globalRaw.value.version
    if (version === 3) {
      global = { path: globalPath, exists: true, version, entries: normalizeLockEntries(globalRaw.value, 'global') }
    } else {
      warnings.push({ code: 'LOCK_VERSION_UNSUPPORTED', message: `${globalPath} has version ${String(version)}; expected 3` })
    }
  } else if (globalRaw.missing !== true) {
    warnings.push({ code: 'LOCK_INVALID', message: globalRaw.problem })
  }

  const projectPath = projectLockPath(projectRoot)
  const projectRaw = await readJsonDocument(projectPath)
  let project = null
  if (projectRaw.value !== undefined) {
    const version = projectRaw.value.version
    if (version === 1) {
      project = { path: projectPath, exists: true, version, entries: normalizeLockEntries(projectRaw.value, 'project') }
    } else {
      warnings.push({ code: 'LOCK_VERSION_UNSUPPORTED', message: `${projectPath} has version ${String(version)}; expected 1` })
    }
  } else if (projectRaw.missing !== true) {
    warnings.push({ code: 'LOCK_INVALID', message: projectRaw.problem })
  }
  return { global, project, warnings }
}

/** The global lock is mandatory for updates; keep its distinct failure codes. */
function requireGlobalLock(locks) {
  if (locks.global !== null) return locks.global
  const unsupported = locks.warnings.find((warning) => warning.code === 'LOCK_VERSION_UNSUPPORTED')
  if (unsupported !== undefined) throw new ApiError('LOCK_VERSION_UNSUPPORTED', unsupported.message)
  throw new ApiError('LOCK_INVALID', 'the global skills lock is missing or unsupported')
}

function upstreamOf(entry) {
  const parsed = parseRepo(entry)
  if (parsed === undefined) return null
  return {
    repo: parsed.repo,
    type: parsed.type,
    url: entry.sourceUrl !== '' ? entry.sourceUrl : `https://github.com/${parsed.repo}`,
    skillPath: entry.skillPath,
    installedAt: entry.installedAt,
    updatedAt: entry.updatedAt,
    hash: entry.hash,
    ...(entry.ref === undefined ? {} : { ref: entry.ref }),
    scope: entry.scope,
  }
}

/** Collapse the 400 link row and its 500 twin: one physical package, one row. */
async function mergeMirroredSkills(skills) {
  const ordered = [...skills].sort((left, right) => left.rank - right.rank || left.path.localeCompare(right.path))
  const seen = new Set()
  const kept = []
  for (const skill of ordered) {
    const real = skill.realPath ?? (await realpath(skill.path).catch(() => undefined))
    const key = real === undefined ? `path:${normalizeForCompare(skill.path)}` : `real:${normalizeForCompare(real)}`
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(skill)
  }
  return kept
}

/** Hash a skill folder the way the skills CLI does (sorted relative paths + bytes). */
async function computeFolderHash(directory) {
  const files = []

  async function walk(base, current, segments) {
    let dirents
    try {
      dirents = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const dirent of dirents) {
      if (dirent.name === '.git' || dirent.name === 'node_modules') continue
      if (ignoredDriftPath(segments, dirent.name)) continue
      const full = join(current, dirent.name)
      const nextSegments = [...segments, dirent.name]
      if (dirent.isDirectory()) {
        await walk(base, full, nextSegments)
        continue
      }
      if (!dirent.isFile()) continue
      files.push({ key: nextSegments.join('/'), full })
    }
  }

  await walk(directory, directory, [])
  files.sort((left, right) => left.key.localeCompare(right.key))
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(file.key)
    hash.update(await readFile(file.full))
  }
  return hash.digest('hex')
}

/** Minimal tar reader: ustar + pax `path` overrides; every other member type is skipped. */
function parseTar(buffer) {
  const entries = []
  let offset = 0
  let pendingPath
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512)
    let empty = true
    for (const byte of header) {
      if (byte !== 0) {
        empty = false
        break
      }
    }
    if (empty) break
    const readString = (start, length) => {
      const slice = header.subarray(start, start + length)
      const end = slice.indexOf(0)
      return slice.subarray(0, end === -1 ? slice.length : end).toString('utf8')
    }
    const name = readString(0, 100)
    const prefix = readString(345, 155)
    const sizeText = readString(124, 12).trim()
    const flag = String.fromCharCode(header[156] || 48)
    let size = 0
    if (sizeText !== '') {
      size = parseInt(sizeText, 8)
      if (Number.isNaN(size)) size = 0
    }
    const bodyStart = offset + 512
    const bodyEnd = Math.min(bodyStart + size, buffer.length)
    const body = buffer.subarray(bodyStart, bodyEnd)
    const full = prefix === '' ? name : `${prefix}/${name}`
    offset = bodyStart + Math.ceil(size / 512) * 512

    if (flag === 'x' || flag === 'X') {
      const overrides = parsePax(body)
      if (typeof overrides.path === 'string') pendingPath = overrides.path
      continue
    }
    if (flag === 'g' || flag === 'L' || flag === 'K') continue
    const finalName = pendingPath ?? full
    pendingPath = undefined
    if (flag === '0' || flag === '\u0000' || flag === '') {
      entries.push({ type: 'file', name: finalName, data: body })
    }
  }
  return entries
}

function parsePax(body) {
  const result = {}
  const text = body.toString('utf8')
  let offset = 0
  while (offset < text.length) {
    const space = text.indexOf(' ', offset)
    if (space === -1) break
    const length = parseInt(text.slice(offset, space), 10)
    if (!Number.isFinite(length) || length <= 0) break
    const record = text.slice(space + 1, offset + length - 1)
    const equals = record.indexOf('=')
    if (equals > 0) result[record.slice(0, equals)] = record.slice(equals + 1)
    offset += length
  }
  return result
}

async function fetchBuffer(fetchImpl, url, headers) {
  const response = await fetchImpl(url, { headers, redirect: 'follow' })
  if (response === undefined || response === null) throw new ApiError('UPSTREAM_ERROR', `no response for ${url}`)
  if (response.status === 403 || response.status === 429) {
    throw new ApiError('RATE_LIMITED', 'GitHub rate limit reached; set GITHUB_TOKEN to raise it')
  }
  if (response.ok !== true) throw new ApiError('UPSTREAM_ERROR', `${url} answered ${String(response.status)}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > DOWNLOAD_LIMIT) {
    throw new ApiError('PACKAGE_TOO_LARGE', `download exceeds ${Math.round(DOWNLOAD_LIMIT / 1024 / 1024)} MiB`)
  }
  return buffer
}

function githubHeaders() {
  const token = (process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '').trim()
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'dsh-project-skills-mng' }
  if (token !== '') headers.authorization = `Bearer ${token}`
  return headers
}

async function githubJson(fetchImpl, pathname) {
  const response = await fetchImpl(`${GITHUB_API}${pathname}`, { headers: githubHeaders(), redirect: 'follow' })
  if (response === undefined || response === null) throw new ApiError('UPSTREAM_ERROR', `no response for ${pathname}`)
  if (response.status === 403 || response.status === 429) {
    throw new ApiError('RATE_LIMITED', 'GitHub rate limit reached; set GITHUB_TOKEN to raise it')
  }
  if (response.ok !== true) throw new ApiError('UPSTREAM_ERROR', `${pathname} answered ${String(response.status)}`)
  return response.json()
}

/** Directory inside the repo that holds the skill ('' for a repository-root skill). */
function skillFolderOf(entry) {
  const skillPath = typeof entry.skillPath === 'string' ? entry.skillPath.replace(/\\/g, '/') : ''
  if (skillPath === '') return ''
  if (skillPath === 'SKILL.md') return ''
  return skillPath.endsWith('/SKILL.md') ? skillPath.slice(0, -'/SKILL.md'.length) : skillPath
}

async function defaultBranchOf(fetchImpl, repo) {
  const info = await githubJson(fetchImpl, `/repos/${repo}`)
  return typeof info.default_branch === 'string' && info.default_branch !== '' ? info.default_branch : 'main'
}

async function downloadRepoArchive(fetchImpl, entry) {
  const parsed = parseRepo(entry)
  if (parsed === undefined) throw new ApiError('UNSUPPORTED_SOURCE', `cannot resolve a repository for "${entry.name}"`)
  const ref = typeof entry.ref === 'string' && entry.ref !== '' ? entry.ref : await defaultBranchOf(fetchImpl, parsed.repo)
  // A bare ref lets codeload resolve branches, tags and commit shas alike; the
  // branch-qualified form stays as a fallback for refs that only exist as heads.
  const attempts = [
    `${GITHUB_CODELOAD}/${parsed.repo}/tar.gz/${encodeURIComponent(ref)}`,
    `${GITHUB_CODELOAD}/${parsed.repo}/tar.gz/refs/heads/${encodeURIComponent(ref)}`,
  ]
  let lastError
  for (const url of attempts) {
    try {
      const buffer = await fetchBuffer(fetchImpl, url, githubHeaders())
      return parseTar(gunzipSync(buffer))
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

function cloneRepo(gitImpl, entry, destination) {
  const parsed = parseRepo(entry)
  if (parsed === undefined) throw new ApiError('UNSUPPORTED_SOURCE', `cannot resolve a repository for "${entry.name}"`)
  const args = ['clone', '--depth', '1']
  if (entry.ref !== undefined) args.push('--branch', entry.ref)
  args.push(parsed.type === 'git' ? entry.sourceUrl || `git@github.com:${parsed.repo}.git` : `https://github.com/${parsed.repo}.git`, destination)
  return gitImpl(args, destination)
}

async function writeExtractedFiles(entries, skillFolder, destination, limit) {
  let written = 0
  for (const entry of entries) {
    const parts = entry.name.split('/')
    // The tar root is "<repo>-<ref>/"; drop it before matching the skill folder.
    const relativeParts = parts.slice(1)
    if (relativeParts.length === 0) continue
    if (skillFolder !== '') {
      const folderParts = skillFolder.split('/')
      if (relativeParts.length <= folderParts.length) continue
      if (folderParts.some((part, index) => relativeParts[index] !== part)) continue
      relativeParts.splice(0, folderParts.length)
    }
    if (relativeParts.includes('..')) throw new ApiError('PATH_ESCAPE', `refusing tar entry "${entry.name}"`)
    const target = join(destination, ...relativeParts)
    const comparison = normalizeForCompare(target)
    const base = normalizeForCompare(destination)
    if (comparison !== base && !comparison.startsWith(base + sep)) {
      throw new ApiError('PATH_ESCAPE', `refusing tar entry "${entry.name}"`)
    }
    written += entry.data.length
    if (written > limit) throw new ApiError('PACKAGE_TOO_LARGE', `extracted skill exceeds ${Math.round(limit / 1024 / 1024)} MiB`)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, entry.data)
  }
}

async function readUpdateState() {
  const document = await readJsonDocument(join(agentsHome(), STATE_FILE))
  if (document.value === undefined) return { version: 1, skills: {} }
  const skills = document.value.skills !== null && typeof document.value.skills === 'object' ? document.value.skills : {}
  return { ...document.value, version: 1, skills }
}

async function writeUpdateState(state) {
  const path = join(agentsHome(), STATE_FILE)
  await mkdir(dirname(path), { recursive: true })
  // Same tmp+rename dance as the lock: a crash mid-write must not wipe every
  // LOCAL_CHANGES baseline (an unreadable state file is treated as empty).
  const tmp = `${path}.tmp`
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(tmp, path)
}

async function writeLockDocument(lockPath, document) {
  await writeFile(`${lockPath}.bak`, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  const tmp = `${lockPath}.tmp`
  await writeFile(tmp, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  await rename(tmp, lockPath)
}

async function pruneBackups(rootDirectory, name) {
  let dirents
  try {
    dirents = await readdir(rootDirectory, { withFileTypes: true })
  } catch {
    return
  }
  const backups = dirents
    .map((dirent) => /^\.dsh-bak-(\d{14})-(.+)$/.exec(dirent.name))
    .filter((match) => match !== null && match[2] === name)
    .map((match) => match[0])
    .sort()
  while (backups.length > BACKUP_KEEP) {
    const oldest = backups.shift()
    if (oldest === undefined) break
    await rm(join(rootDirectory, oldest), { recursive: true, force: true }).catch(() => {})
  }
}

function createApi(ctx, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? ((url, init) => fetch(url, init))
  const gitImpl = deps.gitImpl ?? ((args) => new Promise((resolvePromise, rejectPromise) => {
    execFile('git', args, { timeout: 60_000 }, (error, stdout) => {
      if (error !== null && error !== undefined) rejectPromise(new ApiError('UPSTREAM_ERROR', `git ${args[0]} failed: ${errorMessage(error)}`))
      else resolvePromise(stdout)
    })
  }))
  const session = (payload) => resolveSession(ctx, payload?.sessionId)

  const api = {
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
      await annotateLinks(skills, roots)
      const merged = await mergeMirroredSkills(skills)
      markShadowing(merged)

      const locks = await readLocks(resolved.projectRoot)
      const entries = new Map()
      if (locks.project !== null) for (const [name, entry] of locks.project.entries) entries.set(name, entry)
      if (locks.global !== null) for (const [name, entry] of locks.global.entries) if (!entries.has(name)) entries.set(name, entry)

      const describeUpstream = (name) => {
        const entry = entries.get(name)
        if (entry === undefined) return null
        return upstreamOf(entry)
      }
      // The panel mirrors the harness' discovery order instead of collapsing the
      // four roots into "project" and "global": a skill in a lower-ranked root is
      // shadowed by the same name in any higher-ranked root, project or global.
      const tiers = roots.map((root) => ({
        rank: root.rank,
        scope: root.scope,
        id: root.id,
        rootId: root.id,
        source: root.source,
        label: root.label,
        path: root.path,
        exists: root.exists,
        writable: root.writable,
        skills: merged
          .filter((skill) => skill.rootId === root.id)
          .map((skill) => {
            const upstream = describeUpstream(skill.name)
            const entry = entries.get(skill.name)
            return {
              name: skill.name,
              description: skill.description,
              ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
              path: skill.path,
              rootId: skill.rootId,
              source: skill.source,
              rank: skill.rank,
              modelInvocable: skill.modelInvocable,
              userInvocable: skill.userInvocable,
              linked: skill.linked === true,
              ...(skill.realPath === undefined ? {} : { realPath: skill.realPath }),
              ...(upstream === null ? { origin: 'local', updatable: false, upstream: null } : {
                origin: 'managed',
                updatable: entry.scope === 'global',
                upstream,
              }),
              shadowed: skill.shadowed,
              ...(skill.shadowedBy === undefined ? {} : { shadowedBy: skill.shadowedBy }),
              ...(skill.shadows.length === 0 ? {} : { shadows: skill.shadows }),
            }
          }),
      }))
      const counts = {
        project: tiers
          .filter((tier) => tier.scope === 'project')
          .reduce((sum, tier) => sum + tier.skills.length, 0),
        global: tiers
          .filter((tier) => tier.scope === 'global')
          .reduce((sum, tier) => sum + tier.skills.length, 0),
        total: merged.length,
        shadowed: merged.filter((skill) => skill.shadowed).length,
        broken: errors.length,
      }
      const present = new Set(merged.map((skill) => skill.name))
      const missing = []
      if (locks.global !== null) {
        for (const [name, entry] of locks.global.entries) {
          if (present.has(name)) continue
          const upstream = upstreamOf(entry)
          if (upstream === null) continue
          missing.push({ name, upstream })
        }
      }
      missing.sort((left, right) => left.name.localeCompare(right.name))
      const repoCounts = new Map()
      for (const tier of tiers) {
        for (const skill of tier.skills) {
          if (skill.upstream === null) continue
          repoCounts.set(skill.upstream.repo, (repoCounts.get(skill.upstream.repo) ?? 0) + 1)
        }
      }
      const upstreams = [...repoCounts.entries()]
        .map(([repo, count]) => ({ repo, count }))
        .sort((left, right) => right.count - left.count || left.repo.localeCompare(right.repo))
      return {
        cwd: resolved.cwd,
        projectRoot: resolved.projectRoot,
        counts,
        tiers,
        missing,
        upstreams,
        locks: {
          global: locks.global === null ? null : { path: locks.global.path, exists: locks.global.exists, version: locks.global.version, count: locks.global.entries.size },
          project: locks.project === null ? null : { path: locks.project.path, exists: locks.project.exists, version: locks.project.version, count: locks.project.entries.size },
          warnings: locks.warnings,
        },
        errors,
      }
    },

    async read(payload) {
      const resolved = await session(payload)
      const roots = await describeRoots(resolved.projectRoot)
      const allowed = await knownRootReals(roots)
      const name = validateSkillName(payload?.name)
      // A shadowed skill shares its name with a higher-ranked one. Callers that
      // already know the row they clicked pass `rootId` so the shadowed file
      // itself is read instead of the winner.
      const scope = payload?.rootId === undefined || payload?.rootId === null ? roots : [findRoot(roots, payload.rootId)]
      for (const root of scope) {
        if (!root.exists) continue
        const rootReal = await realpath(root.path).catch(() => undefined)
        if (rootReal === undefined) continue
        const located = await locateSkillFile(rootReal, name)
        if (located === undefined) continue
        const contained = await resolveContained(rootReal, located.filePath, allowed)
        const content = await readFile(located.filePath, 'utf8')
        const parsed = parseSkillDocument(content)
        if (parsed.problem !== undefined) throw new ApiError('INVALID_CONTENT', `${located.filePath}: ${parsed.problem}`)
        const locks = await readLocks(resolved.projectRoot)
        const lockEntry = locks.global === null ? undefined : locks.global.entries.get(name)
        return {
          name,
          path: located.filePath,
          rootId: root.id,
          scope: root.scope,
          writable: root.writable,
          linked: contained.linked,
          ...(contained.linked ? { realPath: contained.realPath } : {}),
          updatable: root.scope === 'global' && lockEntry !== undefined,
          upstream: lockEntry === undefined ? null : upstreamOf(lockEntry),
          content,
        }
      }
      throw new ApiError('SKILL_NOT_FOUND', `no skill named "${name}" in this session's roots`)
    },

    async write(payload) {
      const resolved = await session(payload)
      const roots = await describeRoots(resolved.projectRoot)
      const allowed = await knownRootReals(roots)
      const root = findRoot(roots, payload?.rootId)
      const name = validateSkillName(payload?.name)
      const content = validateSkillContent(payload?.content, name)
      const written = await writeSkillFile(root, name, content, allowed)
      return { name, rootId: root.id, path: written.filePath, created: written.created }
    },

    async delete(payload) {
      const resolved = await session(payload)
      const roots = await describeRoots(resolved.projectRoot)
      const allowed = await knownRootReals(roots)
      const root = findRoot(roots, payload?.rootId)
      const name = validateSkillName(payload?.name)
      if (!root.writable) throw new ApiError('ROOT_READ_ONLY', `skill root ${root.path} is not writable`)
      const rootReal = await realpath(root.path).catch(() => undefined)
      if (rootReal === undefined) throw new ApiError('SKILL_NOT_FOUND', `skill root ${root.path} does not exist`)
      const located = await locateSkillFile(rootReal, name)
      if (located === undefined) throw new ApiError('SKILL_NOT_FOUND', `no skill named "${name}" in ${root.path}`)
      const contained = await resolveContained(rootReal, located.filePath, allowed)
      if (located.directory === undefined) {
        // A flat skill can itself be a link. Remove the link, never the file it
        // points at, so a mirrored skill set is not silently destroyed.
        const target = contained.linked ? located.filePath : contained.realPath
        await unlink(target)
        return {
          name,
          rootId: root.id,
          path: target,
          deleted: true,
          ...(contained.linked ? { unlinked: true, realPath: contained.realPath } : {}),
        }
      }
      const directoryInfo = await lstat(located.directory)
      if (directoryInfo.isSymbolicLink()) {
        // A linked package: remove the link only, the real package stays put.
        await unlink(located.directory)
        return {
          name,
          rootId: root.id,
          path: located.directory,
          deleted: true,
          unlinked: true,
          realPath: contained.realPath,
        }
      }
      const directoryReal = (await resolveContained(rootReal, located.directory, allowed)).realPath
      await rm(directoryReal, { recursive: true, force: true })
      return { name, rootId: root.id, path: directoryReal, deleted: true }
    },

    async toggle(payload) {
      const resolved = await session(payload)
      const roots = await describeRoots(resolved.projectRoot)
      const allowed = await knownRootReals(roots)
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
      const contained = await resolveContained(rootReal, located.filePath, allowed)
      const filePath = contained.linked ? contained.realPath : located.filePath

      const source = await readFile(filePath, 'utf8')
      const parsed = parseSkillDocument(source)
      if (parsed.problem !== undefined) throw new ApiError('INVALID_CONTENT', `${filePath}: ${parsed.problem}`)

      const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source)
      const lines = match[1].split(/\r?\n/)
      const key = field === 'model' ? 'disable-model-invocation' : 'user-invocable'
      const rawValue = field === 'model'
        ? (payload.value ? null : 'true')
        : (payload.value ? null : 'false')
      const nextLines = setFrontmatterField(lines, key, rawValue)
      const nextContent = renderSkillDocument(nextLines, source.slice(match[0].length))
      const temporary = join(dirname(filePath), `.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`)
      await writeFile(temporary, nextContent, 'utf8')
      await rename(temporary, filePath)

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

    /**
     * Copy or move one skill into another declared tier.
     *
     * A mirrored package (`~/.dsh/skills/x -> ~/.agents/skills/x`) is a link to
     * bytes that already live in another tier. Copying it writes a real copy;
     * moving it onto the tier that owns those bytes only removes the link, so
     * the real package is never duplicated or destroyed by accident.
     */
    async transfer(payload) {
      const resolved = await session(payload)
      const roots = await describeRoots(resolved.projectRoot)
      const allowed = await knownRootReals(roots)
      const source = findRoot(roots, payload?.rootId)
      const target = findRoot(roots, payload?.targetRootId)
      const mode = payload?.mode === 'copy' || payload?.mode === 'move' ? payload.mode : undefined
      if (mode === undefined) throw new ApiError('INVALID_PAYLOAD', 'mode must be "copy" or "move"')
      const conflict = payload?.conflict === 'overwrite' ? 'overwrite' : 'skip'
      const name = validateSkillName(payload?.name)
      if (!target.writable) throw new ApiError('ROOT_READ_ONLY', `skill root ${target.path} is not writable`)

      const sourceReal = await realpath(source.path).catch(() => undefined)
      if (sourceReal === undefined) throw new ApiError('SKILL_NOT_FOUND', `skill root ${source.path} does not exist`)
      const located = await locateSkillFile(sourceReal, name)
      if (located === undefined) throw new ApiError('SKILL_NOT_FOUND', `no skill named "${name}" in ${source.path}`)
      const contained = await resolveContained(sourceReal, located.filePath, allowed)
      const linked = located.directory === undefined
        ? contained.linked
        : (await lstat(located.directory)).isSymbolicLink()
      const owner = linked ? await rootOwningPath(roots, contained.realPath) : undefined

      // Moving a mirror onto its own bytes is an unlink, not a copy.
      if (mode === 'move' && linked && owner !== undefined && owner.id === target.id) {
        await unlink(located.directory ?? located.filePath)
        return {
          name,
          rootId: source.id,
          targetRootId: target.id,
          mode,
          unlinked: true,
          targetPath: contained.realPath,
        }
      }
      if (source.id === target.id) {
        throw new ApiError('INVALID_TARGET', 'source and target tiers are the same')
      }

      const kind = located.directory === undefined ? 'file' : 'package'
      const sourceDirectory = kind === 'package' ? dirname(contained.realPath) : undefined

      const targetReal = await ensureRootDirectory(target, allowed)
      const conflictWith = await locateSkillFile(targetReal, name)
      let replaced = false
      if (conflictWith !== undefined) {
        const existing = await resolveContained(targetReal, conflictWith.filePath, allowed)
        if (existing.realPath === contained.realPath) {
          throw new ApiError('INVALID_TARGET', 'source and target are the same skill package')
        }
        if (conflict !== 'overwrite') throw new ApiError('TARGET_EXISTS', `"${name}" already exists in ${target.path}`)
        replaced = true
      }

      // Build the whole entry next to its destination inside the target root, validate
      // it there, and only then swap it in. An overwrite must never destroy the
      // previous entry before the replacement is known to be complete.
      const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
      let stage
      let destination
      let targetPath
      try {
        if (kind === 'file') {
          const text = await readFile(contained.realPath, 'utf8')
          validateTransferredDocument(text, name)
          destination = join(targetReal, `${name}.md`)
          stage = join(targetReal, `.dsh-stage-${stamp}-${name}.md`)
          await writeFile(stage, text, 'utf8')
        } else {
          destination = join(targetReal, name)
          stage = join(targetReal, `.dsh-stage-${stamp}-${name}`)
          await copySkillPackage(sourceDirectory ?? dirname(contained.realPath), stage, {
            used: 0,
            limit: MAX_PACKAGE_BYTES,
          })
          validateTransferredDocument(await readFile(join(stage, 'SKILL.md'), 'utf8'), name)
        }
        if (replaced) await removeSkillEntry(targetReal, name, allowed)
        await rename(stage, destination)
        stage = undefined
      } catch (error) {
        if (stage !== undefined) await rm(stage, { recursive: true, force: true }).catch(() => {})
        throw error
      }
      targetPath = kind === 'file' ? destination : join(destination, 'SKILL.md')

      let unlinked = false
      if (mode === 'move') {
        try {
          if (linked) {
            await unlink(located.directory ?? located.filePath)
            unlinked = true
          } else if (kind === 'package' && sourceDirectory !== undefined) {
            await rm(sourceDirectory, { recursive: true, force: true })
          } else {
            await unlink(located.filePath)
          }
        } catch (error) {
          throw new ApiError(
            'SOURCE_REMOVE_FAILED',
            `copied to ${target.path} but the source could not be removed: ${errorMessage(error)}`,
            { targetPath },
          )
        }
      }
      return {
        name,
        rootId: source.id,
        targetRootId: target.id,
        mode,
        kind,
        targetPath,
        ...(unlinked ? { unlinked } : {}),
      }
    },
  }

  const BATCH_LIMIT = 100

  /** Run one batch item through the single-item handler it belongs to. */
  async function runBatchItem(operation, item, payload) {
    try {
      const value = await operation(item, payload)
      return { name: item.name, rootId: item.rootId, ok: true, ...value }
    } catch (error) {
      if (error instanceof ApiError) {
        return {
          name: item.name,
          rootId: item.rootId,
          ok: false,
          code: error.code,
          message: error.message,
          ...(error.details ?? {}),
        }
      }
      // A filesystem hiccup (EPERM/EBUSY/ENOSPC) must not discard the results of
      // the items that were already applied: report it as a failed item.
      return {
        name: item.name,
        rootId: item.rootId,
        ok: false,
        code: 'ITEM_FAILED',
        message: errorMessage(error),
      }
    }
  }

  api.batch = async (payload) => {
    const items = Array.isArray(payload.items) ? payload.items : undefined
    if (items === undefined || items.length === 0) {
      throw new ApiError('INVALID_PAYLOAD', 'items must be a non-empty array')
    }
    if (items.length > BATCH_LIMIT) {
      throw new ApiError('TOO_MANY_ITEMS', `at most ${BATCH_LIMIT} items can be changed at once`)
    }
    const action = payload.action
    const context = { sessionId: payload.sessionId }
    let operation
    if (action === 'delete') {
      operation = (item) => api.delete({ ...context, ...item })
    } else if (action === 'invocation') {
      const invocation = payload.invocation ?? {}
      if (invocation.field !== 'model' && invocation.field !== 'user') {
        throw new ApiError('INVALID_PAYLOAD', 'invocation.field must be "model" or "user"')
      }
      if (typeof invocation.value !== 'boolean') {
        throw new ApiError('INVALID_PAYLOAD', 'invocation.value must be a boolean')
      }
      operation = (item) => api.toggle({ ...context, ...item, field: invocation.field, value: invocation.value })
    } else if (action === 'transfer') {
      if (typeof payload.target?.rootId !== 'string') {
        throw new ApiError('INVALID_PAYLOAD', 'target.rootId is required for transfer')
      }
      operation = (item) =>
        api.transfer({
          ...context,
          ...item,
          targetRootId: payload.target.rootId,
          mode: payload.transferMode,
          conflict: payload.conflict,
        })
    } else {
      throw new ApiError('INVALID_ACTION', `unknown batch action: ${String(action)}`)
    }

    const results = []
    for (const item of items) {
      const entry = item ?? {}
      results.push(await runBatchItem(operation, { name: String(entry.name ?? ''), rootId: entry.rootId }, payload))
    }
    const succeeded = results.filter((result) => result.ok).length
    return {
      summary: { total: results.length, succeeded, failed: results.length - succeeded },
      results,
    }
  }

  const updateCache = new Map()

  /** One GitHub round trip per repo per 5 minutes: default branch + recursive tree. */
  async function repoSnapshot(repo, ref) {
    const key = `${repo}@${ref ?? ''}`
    const cached = updateCache.get(key)
    const now = Date.now()
    if (cached !== undefined && now - cached.at < UPDATE_CACHE_TTL) return cached.value
    let branch = ref
    if (branch === undefined) {
      const info = await githubJson(fetchImpl, `/repos/${repo}`)
      branch = typeof info.default_branch === 'string' ? info.default_branch : 'main'
    }
    const tree = await githubJson(fetchImpl, `/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`)
    const value = { branch, tree }
    updateCache.set(key, { at: now, value })
    return value
  }

  function treeShaFor(tree, folder) {
    if (folder === '') return tree.sha
    const nodes = Array.isArray(tree.tree) ? tree.tree : []
    const node = nodes.find((candidate) => candidate.path === folder && candidate.type === 'tree')
    return node?.sha
  }

  async function upstreamHashFor(entry, folder) {
    const parsed = parseRepo(entry)
    if (parsed === undefined) throw new ApiError('UNSUPPORTED_SOURCE', `cannot resolve a repository for "${entry.name}"`)
    const isTreeHash = /^[0-9a-f]{40}$/i.test(entry.hash)
    if (isTreeHash) {
      const snapshot = await repoSnapshot(parsed.repo, entry.ref)
      const sha = treeShaFor(snapshot.tree, folder)
      if (sha === undefined) throw new ApiError('UPSTREAM_PATH_MISSING', `"${folder}" is not a tree in ${parsed.repo}`)
      return { hash: sha, folder, parsed }
    }
    const entries = await downloadRepoArchive(fetchImpl, entry)
    const temp = await mkdtemp(join(tmpdir(), 'dsh-skills-hash-'))
    try {
      await writeExtractedFiles(entries, folder, temp, HASHED_SKILL_LIMIT)
      return { hash: await computeFolderHash(temp), folder, parsed }
    } finally {
      await rm(temp, { recursive: true, force: true }).catch(() => {})
    }
  }

  api.checkUpdates = async (payload) => {
    const resolved = await session(payload)
    const locks = await readLocks(resolved.projectRoot)
    requireGlobalLock(locks)
    const wanted = Array.isArray(payload?.names) ? new Set(payload.names.filter((name) => typeof name === 'string')) : null
    const targets = [...locks.global.entries.values()].filter((entry) => wanted === null || wanted.has(entry.name))
    const results = []
    const byRepo = new Map()
    for (const entry of targets) {
      const parsed = parseRepo(entry)
      if (parsed === undefined) {
        results.push({ name: entry.name, status: 'unknown', error: { code: 'UNSUPPORTED_SOURCE', message: `cannot resolve a repository for "${entry.name}"` } })
        continue
      }
      const key = `${parsed.repo}@${entry.ref ?? ''}`
      const bucket = byRepo.get(key)
      if (bucket === undefined) byRepo.set(key, { repo: parsed.repo, entries: [entry] })
      else bucket.entries.push(entry)
    }
    for (const bucket of byRepo.values()) {
      let failure
      try {
        const hashes = new Map()
        for (const entry of bucket.entries) {
          const folder = skillFolderOf(entry)
          let value = hashes.get(folder)
          if (value === undefined) {
            value = await upstreamHashFor(entry, folder)
            hashes.set(folder, value)
          }
          const same = String(value.hash).toLowerCase() === String(entry.hash).toLowerCase()
          results.push({ name: entry.name, status: same ? 'up-to-date' : 'update-available', upstreamHash: value.hash })
        }
      } catch (error) {
        failure = error instanceof ApiError
          ? { code: error.code, message: error.message }
          : { code: 'UPSTREAM_ERROR', message: errorMessage(error) }
        for (const entry of bucket.entries) results.push({ name: entry.name, status: 'unknown', error: failure })
      }
    }
    const counts = {
      available: results.filter((result) => result.status === 'update-available').length,
      uptodate: results.filter((result) => result.status === 'up-to-date').length,
      unknown: results.filter((result) => result.status === 'unknown').length,
    }
    return { checkedAt: new Date().toISOString(), results, counts }
  }

  let updating = false

  api.updateSkills = async (payload) => {
    const items = Array.isArray(payload?.items) ? payload.items : []
    if (items.length === 0) throw new ApiError('INVALID_PAYLOAD', 'items must be a non-empty array')
    if (items.length > BATCH_LIMIT) throw new ApiError('TOO_MANY_ITEMS', `at most ${BATCH_LIMIT} items can be updated at once`)
    if (updating) throw new ApiError('BUSY', 'another update is already running')
    updating = true
    try {
      const resolved = await session(payload)
      const locks = await readLocks(resolved.projectRoot)
      requireGlobalLock(locks)
      const lockDocument = (await readJsonDocument(globalLockPath())).value
      const agentsRoot = await ensureAgentsRoot()
      const state = await readUpdateState()
      const force = payload?.force === true
      const handled = new Set()
      const results = []
      for (const raw of items) {
        const item = raw ?? {}
        const name = typeof item.name === 'string' ? item.name : ''
        try {
          validateSkillName(name)
          const entry = locks.global.entries.get(name)
          if (entry === undefined) throw new ApiError('NOT_MANAGED', `"${name}" is not installed by the skills CLI`)
          const physical = join(agentsRoot, name)
          const real = normalizeForCompare(physical)
          if (handled.has(real)) {
            results.push({ name, rootId: item.rootId, ok: true, status: 'skipped', message: 'already handled in this batch' })
            continue
          }
          handled.add(real)
          const outcome = await runUpdate({ entry, name, agentsRoot, physical, state, force })
          if (outcome.lockHash !== undefined) {
            const target = lockDocument?.skills?.[name]
            if (target !== null && typeof target === 'object') {
              // Keep the entry's hash format: a 40-hex entry stays a tree sha,
              // everything else stays a sha256 of the folder contents.
              target.skillFolderHash = outcome.lockHash
              if (typeof target.computedHash === 'string') delete target.computedHash
              target.updatedAt = new Date().toISOString()
            }
          }
          results.push({ name, rootId: item.rootId, ok: true, ...outcome.result })
        } catch (error) {
          if (error instanceof ApiError) {
            results.push({ name, rootId: item.rootId, ok: false, code: error.code, message: error.message, ...(error.details ?? {}) })
          } else {
            // Never abandon the loop: earlier items already replaced files on disk
            // and still need their lock hash and snapshot written.
            results.push({ name, rootId: item.rootId, ok: false, code: 'ITEM_FAILED', message: errorMessage(error) })
          }
        }
      }
      const ok = results.filter((result) => result.ok).length
      if (ok > 0) {
        if (lockDocument !== undefined && lockDocument !== null) await writeLockDocument(globalLockPath(), lockDocument)
        await writeUpdateState(state)
      }
      return { results, counts: { ok, failed: results.length - ok } }
    } finally {
      updating = false
    }
  }

  async function ensureAgentsRoot() {
    const path = join(agentsHome(), 'skills')
    await mkdir(path, { recursive: true })
    return realpath(path)
  }

  async function runUpdate({ entry, name, agentsRoot, physical, state, force }) {
    const folder = skillFolderOf(entry)
    const exists = await stat(physical).then((info) => info.isDirectory()).catch(() => false)
    let localHash
    if (exists) {
      localHash = await computeFolderHash(physical)
      const baseline = state.skills[name]?.localHash
      // The CLI can rewrite a package outside the panel; when the folder still
      // matches the hash recorded in the lock it is unmodified regardless of our
      // older snapshot, so do not refuse a legitimate upstream update.
      const matchesLock = String(localHash).toLowerCase() === String(entry.hash).toLowerCase()
      const modified = typeof baseline === 'string' ? baseline !== localHash && !matchesLock : false
      if (modified && !force) {
        throw new ApiError('LOCAL_CHANGES', `"${name}" has local changes; pass force to overwrite them`)
      }
    }

    const parsed = parseRepo(entry)
    if (parsed === undefined) throw new ApiError('UNSUPPORTED_SOURCE', `cannot resolve a repository for "${name}"`)
    const isTreeHash = /^[0-9a-f]{40}$/i.test(entry.hash)
    let upstreamHash = entry.hash
    let staged
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)

    if (isTreeHash) {
      const snapshot = await repoSnapshot(parsed.repo, entry.ref)
      const sha = treeShaFor(snapshot.tree, folder)
      if (sha === undefined) throw new ApiError('UPSTREAM_PATH_MISSING', `"${folder}" is not a tree in ${parsed.repo}`)
      upstreamHash = sha
      const unchanged = exists && String(sha).toLowerCase() === String(entry.hash).toLowerCase() && localHash === state.skills[name]?.localHash
      if (unchanged) {
        state.skills[name] = { localHash, syncedAt: new Date().toISOString() }
        return { result: { status: 'up-to-date' } }
      }
    }

    const stage = join(agentsRoot, `.dsh-stage-${timestamp}-${name}`)
    await rm(stage, { recursive: true, force: true }).catch(() => {})
    try {
      let entries
      if (parsed.type === 'git') {
        const clone = join(agentsRoot, `.dsh-clone-${timestamp}-${name}`)
        await rm(clone, { recursive: true, force: true }).catch(() => {})
        await mkdir(clone, { recursive: true })
        await cloneRepo(gitImpl, entry, clone)
        try {
          const prefix = folder === '' ? clone : join(clone, ...folder.split('/'))
          await copySkillPackage(prefix, stage, { used: 0, limit: folder === '' ? ROOT_SKILL_LIMIT : MAX_PACKAGE_BYTES })
        } finally {
          await rm(clone, { recursive: true, force: true }).catch(() => {})
        }
      } else {
        entries = await downloadRepoArchive(fetchImpl, entry)
        await mkdir(stage, { recursive: true })
        await writeExtractedFiles(entries, folder, stage, folder === '' ? ROOT_SKILL_LIMIT : MAX_PACKAGE_BYTES)
      }
      const skillFile = join(stage, 'SKILL.md')
      const text = await readFile(skillFile, 'utf8').catch(() => undefined)
      if (text === undefined) throw new ApiError('UPSTREAM_PATH_MISSING', 'the upstream skill has no SKILL.md')
      validateTransferredDocument(text, name)
      if (!isTreeHash) {
        upstreamHash = await computeFolderHash(stage)
        // Content-hash sources have no tree sha to compare against, so the only
        // honest "nothing to do" answer comes from hashing what we just staged.
        if (exists && upstreamHash === localHash) {
          state.skills[name] = { localHash, syncedAt: new Date().toISOString() }
          return { result: { status: 'up-to-date', upstreamHash } }
        }
      }

      let backupPath
      if (exists) {
        backupPath = join(agentsRoot, `.dsh-bak-${timestamp}-${name}`)
        await rm(backupPath, { recursive: true, force: true }).catch(() => {})
        await rename(physical, backupPath)
      }
      try {
        await rename(stage, physical)
      } catch (error) {
        if (backupPath !== undefined) await rename(backupPath, physical).catch(() => {})
        throw new ApiError('UPDATE_FAILED', `could not move the new package into place: ${errorMessage(error)}`)
      }
      if (backupPath !== undefined) await pruneBackups(agentsRoot, name)
      const newLocal = await computeFolderHash(physical)
      state.skills[name] = { localHash: newLocal, syncedAt: new Date().toISOString() }
      return {
        lockHash: upstreamHash,
        result: {
          status: exists ? 'updated' : 'installed',
          ...(backupPath === undefined ? {} : { backupPath }),
          upstreamHash,
        },
      }
    } finally {
      await rm(stage, { recursive: true, force: true }).catch(() => {})
    }
  }

  return api
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
      ctx.logger?.warn?.(`dsh-project-skills-mng: ${method} failed: ${errorMessage(error)}`)
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
    ctx.logger?.info?.('dsh-project-skills-mng: tools service is unavailable; skipping the model-facing tool')
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
      // The tool advertises create/update; both write one SKILL.md.
      const method = action === 'create' || action === 'update' ? 'write' : action
      if (!Object.hasOwn(api, method)) throw new Error(`unknown action "${String(action)}"`)
      if (method === 'roots') throw new Error('roots is not a tool action')
      return await api[method](payload)
    },
  }), 'dsh-project-skills-mng: model-facing tool')
}

/* ------------------------------------------------------------------ *
 * Plugin entry
 * ------------------------------------------------------------------ */

export function apply(ctx) {
  // Tests inject a fake network/git boundary through this global; production
  // always uses the real fetch and the real `git` binary.
  const deps = globalThis.__dshProjectSkillsTest?.deps ?? {}
  const api = createApi(ctx, deps)
  const handler = createHandler(ctx, api)
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler,
  }), 'dsh-project-skills-mng: host API')
  registerTool(ctx, api)
}
