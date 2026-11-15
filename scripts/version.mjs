#!/usr/bin/env node
/**
 * 版本号单一来源：根 package.json 的 version 是唯一权威值，
 * 扩展清单与 Chrome 清单由本脚本同步。
 *
 * 用法：
 *   node scripts/version.mjs check        # 三处不一致则 exit 1
 *   node scripts/version.mjs set 2.0.0    # 一次写三处
 *
 * 也可通过 npm run version:check / npm run version:set 2.0.0 调用。
 * 注意：Chrome 清单版本必须是 1~4 段点分整数（每段 0-65535，无前导零）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 每个目标：文件、读写字段、展示名。 */
const targets = [
  { file: 'package.json', name: '根 package.json' },
  { file: 'src-vsc/package.json', name: 'src-vsc/package.json' },
  { file: 'src-chrome/manifest.json', name: 'src-chrome/manifest.json' }
]

const VERSION_RE = /^(0|[1-9]\d*)(\.(0|[1-9]\d*)){1,3}$/

function readJson(file) {
  return JSON.parse(readFileSync(path.join(root, file), 'utf8'))
}

function writeJson(file, value) {
  writeFileSync(path.join(root, file), JSON.stringify(value, null, 2) + '\n')
}

function readVersions() {
  return targets.map((target) => ({ ...target, version: readJson(target.file).version }))
}

function assertValid(version) {
  if (!VERSION_RE.test(version)) {
    throw new Error(
      `版本号 "${version}" 不合法：需为 2~4 段点分整数（如 2.0.0），每段 0-65535 且无前导零`
    )
  }
  for (const part of version.split('.')) {
    const value = Number(part)
    if (value > 65535) throw new Error(`版本号 "${version}" 的某一段超过 65535`)
  }
}

function check() {
  const versions = readVersions()
  const expected = versions[0].version
  const mismatched = versions.filter((item) => item.version !== expected)

  if (mismatched.length === 0) {
    console.log(`✅ 版本一致：${expected}`)
    return
  }

  console.error('❌ 版本号不一致：')
  for (const item of versions) {
    const mark = item.version === expected ? '  ' : '→ '
    console.error(`${mark}${item.version}\t${item.name}`)
  }
  console.error(`\n以根 package.json 为准执行：node scripts/version.mjs set ${expected}`)
  process.exit(1)
}

function set(version) {
  assertValid(version)
  for (const target of targets) {
    const json = readJson(target.file)
    json.version = version
    writeJson(target.file, json)
  }
  console.log(`✅ 已写入三处版本号：${version}`)
}

const [, , command, value] = process.argv

switch (command) {
  case 'check':
    check()
    break
  case 'set':
    if (!value) {
      console.error('用法：node scripts/version.mjs set <version>')
      process.exit(1)
    }
    set(value)
    break
  default:
    console.error('用法：node scripts/version.mjs <check|set> [version]')
    process.exit(1)
}
