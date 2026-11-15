#!/usr/bin/env node
/**
 * 把 dist-chrome/ 打成可上传到 Edge Add-ons / Chrome Web Store 的 zip。
 *
 * 用法：
 *   node scripts/package-chrome.mjs               # → out/vsc-postman-edge-<version>.zip
 *   node scripts/package-chrome.mjs --out dist    # 自定义输出目录
 *
 * 商店的两条硬性要求，脚本会在打包后校验，不满足直接失败：
 *   1. manifest.json 必须在 zip **根目录**（不能有外层文件夹）；
 *   2. 入口文件齐全（manifest.json / background.js / app.html / icon.png）。
 *
 * 体积会打印出来，与 README 的「体积」章节对照，避免文案漂移。
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distChrome = path.join(root, 'dist-chrome')

const args = process.argv.slice(2)
const outIndex = args.indexOf('--out')
const outDir = path.resolve(root, outIndex === -1 ? 'out' : (args[outIndex + 1] ?? 'out'))

if (!statSync(distChrome, { throwIfNoEntry: false })) {
  console.error('❌ 缺少 dist-chrome/，先跑 npm run build:chrome')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(path.join(distChrome, 'manifest.json'), 'utf8'))
const version = manifest.version
if (!/^\d+(\.\d+){1,3}$/.test(version)) {
  console.error(`❌ manifest.json 的 version "${version}" 不是 1~4 段点分整数，商店会拒收`)
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
const zipPath = path.join(outDir, `vsc-postman-edge-${version}.zip`)

// -X 去掉多余的 extra field，同样的输入产出同样的字节，便于比对。
execFileSync('zip', ['-r', '-X', '-q', zipPath, '.'], { cwd: distChrome, stdio: 'inherit' })

const listing = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
const entries = listing.split('\n').map((line) => line.trim()).filter(Boolean)

const required = ['manifest.json', 'background.js', 'app.html', 'icon.png']
const missing = required.filter((name) => !entries.includes(name))
if (missing.length > 0) {
  console.error(`❌ zip 根目录缺少：${missing.join(', ')}`)
  console.error(`   实际内容：${entries.join(', ')}`)
  process.exit(1)
}

// 有外层文件夹时，第一个条目会形如 `dist-chrome/manifest.json`。
const nested = entries.find((name) => name.startsWith('dist-chrome/'))
if (nested) {
  console.error(`❌ zip 里出现了外层文件夹（${nested}），商店要求 manifest.json 在根目录`)
  process.exit(1)
}

const size = statSync(zipPath).size
const sizeKb = (size / 1024).toFixed(1)
console.log(`✅ ${path.relative(root, zipPath)}`)
console.log(`   版本 ${version} · ${entries.length} 个条目 · ${sizeKb} KB`)
console.log('   下一步：在 Edge Partner Center 的 Packages 页手动上传该 zip（商店不支持自动提交）')
