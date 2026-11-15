#!/usr/bin/env node
/**
 * 根据上一次发布（v* tag）以来的提交，算出下一个版本号。
 *
 * 用法：
 *   node scripts/release-bump.mjs                  # auto：按提交类型决定
 *   node scripts/release-bump.mjs --bump minor     # 强制 minor
 *   node scripts/release-bump.mjs --bump none      # 明确不发版（用于 dry-run 调试）
 *
 * 输出（同时写入 $GITHUB_OUTPUT，供 workflow 消费）：
 *   should_release=true|false
 *   version=2.1.0
 *   previous_version=2.0.0
 *   bump=minor
 *   reason=...                 # 人类可读的判定理由，写进 job summary
 *
 * 版本号仍以根 package.json 为唯一来源，本脚本只负责**算**，写文件交给 version.mjs。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)

function argValue(name, fallback) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : (args[index + 1] ?? fallback)
}

const requestedBump = argValue('--bump', 'auto')
/** tag job 用：版本已经定了，只要按它渲染变更摘要，避免两次计算结果打架。 */
const forcedVersion = argValue('--version', '')
const validBumps = ['auto', 'patch', 'minor', 'major', 'none']
if (!validBumps.includes(requestedBump)) {
  console.error(`❌ --bump 只能是 ${validBumps.join(' | ')}，收到 "${requestedBump}"`)
  process.exit(1)
}

/** git 失败（比如没有 tag）时返回 null，而不是抛错。 */
function git(...gitArgs) {
  try {
    return execFileSync('git', gitArgs, { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

const currentVersion = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version

/**
 * 只认严格的三段式 tag（v2.0.0）。仓库里还有 `v1.0.0-legacy` 这类历史 tag，
 * 用 `git describe` 会把它们当成基线，导致从错误的起点算提交范围。
 */
const SEMVER_TAG_RE = /^v\d+\.\d+\.\d+$/
const lastTag =
  (git('tag', '--merged', 'HEAD', '--list', 'v*', '--sort=-version:refname') ?? '')
    .split('\n')
    .map((line) => line.trim())
    .find((tag) => SEMVER_TAG_RE.test(tag)) ?? null
const range = lastTag ? `${lastTag}..HEAD` : 'HEAD'

// %x00 分隔“标题”和“正文”，%x1e 分隔提交，避免提交正文里的换行干扰解析。
const raw = git('log', range, '--pretty=format:%s%x00%b%x1e') ?? ''
const commits = raw
  .split('\x1e')
  .map((chunk) => chunk.trim())
  .filter(Boolean)
  .map((chunk) => {
    const [subject, ...body] = chunk.split('\x00')
    return { subject: subject.trim(), body: body.join('\x00').trim() }
  })

const TYPE_RE = /^([a-zA-Z]+)(\([^)]*\))?(!)?:\s*(.+)$/

/** 每个提交归到一个类别；决定 bump 级别的只看 type 与 breaking。 */
function classify(commit) {
  const match = TYPE_RE.exec(commit.subject)
  if (!match) return { type: null, breaking: false, ...commit }
  const [, type, , bang, rest] = match
  const breaking = Boolean(bang) || /BREAKING[ -]CHANGE/.test(commit.body)
  return { type: type.toLowerCase(), breaking, summary: rest, ...commit }
}

const classified = commits.map(classify)

// 机器人自己写的发布提交不应再触发下一轮发布。
const IGNORED = new Set(['docs', 'chore', 'style', 'test', 'ci', 'refactor', 'build', 'release'])
const meaningful = classified.filter((item) => item.type && !IGNORED.has(item.type))

const hasBreaking = meaningful.some((item) => item.breaking)
const hasFeat = meaningful.some((item) => item.type === 'feat')
const hasFix = meaningful.some((item) => item.type === 'fix' || item.type === 'perf')

let bump = 'none'
let reason = ''
if (requestedBump !== 'auto') {
  bump = requestedBump
  reason = `手动指定 --bump ${requestedBump}`
} else if (commits.length === 0) {
  reason = lastTag ? `${lastTag} 之后没有新提交` : '仓库里没有提交'
} else if (hasBreaking) {
  bump = 'major'
  reason = '存在破坏性变更（! 或 BREAKING CHANGE）'
} else if (hasFeat) {
  bump = 'minor'
  reason = '存在 feat: 提交'
} else if (hasFix) {
  bump = 'patch'
  reason = '存在 fix:/perf: 提交'
} else {
  reason = `没有可发布的功能性提交（${commits.length} 个提交属于 docs/chore/ci 等）`
}

function nextVersion(from, level) {
  const [major, minor, patch] = from.split('.').map(Number)
  if (level === 'major') return `${major + 1}.0.0`
  if (level === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

const shouldRelease = bump !== 'none' || Boolean(forcedVersion)
const version = forcedVersion || (shouldRelease ? nextVersion(currentVersion, bump) : currentVersion)

/** 给 GitHub Release 用的变更摘要：按类别分组，忽略不发布的提交。 */
function releaseNotes() {
  const groups = [
    ['feat', '新功能'],
    ['fix', '修复'],
    ['perf', '性能'],
    ['refactor', '重构'],
    ['docs', '文档'],
    ['chore', '杂项'],
    ['ci', 'CI']
  ]
  const lines = [`# v${version}`, '']
  if (classified.length === 0) {
    lines.push('本次没有需要发布的变更。', '')
  }
  for (const [type, title] of groups) {
    const items = classified.filter((item) => item.type === type)
    if (items.length === 0) continue
    lines.push(`## ${title}`)
    for (const item of items) {
      const scope = TYPE_RE.exec(item.subject)?.[2] ?? ''
      lines.push(`- ${scope ? `\`${scope.slice(1, -1)}\` ` : ''}${item.summary ?? item.subject}`)
    }
    lines.push('')
  }
  const others = classified.filter((item) => !item.type)
  if (others.length > 0) {
    lines.push('## 其他')
    for (const item of others) lines.push(`- ${item.subject}`)
    lines.push('')
  }
  lines.push(`完整对比：${lastTag ? `\`${lastTag}...v${version}\`` : '首次发布'}`)
  return lines.join('\n')
}

const notes = releaseNotes()
const notesPath = path.join(root, 'release-notes.md')
writeFileSync(notesPath, notes + '\n')

const outputs = {
  should_release: String(shouldRelease),
  version,
  previous_version: currentVersion,
  bump,
  reason,
  last_tag: lastTag ?? ''
}

console.log(JSON.stringify({ ...outputs, commits: commits.length }, null, 2))
console.log(`\n判定：${reason}`)
console.log(shouldRelease ? `→ 发布 v${version}（${currentVersion} → ${version}）` : '→ 跳过发布')
console.log(`变更摘要已写入 ${path.relative(root, notesPath)}`)

if (process.env.GITHUB_OUTPUT) {
  const body = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  writeFileSync(process.env.GITHUB_OUTPUT, body + '\n', { flag: 'a' })
}
