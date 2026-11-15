#!/usr/bin/env node
/**
 * 把 dist-extension/ 打成可上传到任意 Chromium 扩展商店（Edge Add-ons / Chrome Web Store /
 * Opera 等）的 zip；产物不绑定某一个商店。
 *
 * 用法：
 *   node scripts/package-extension.mjs               # → out/vsc-postman-browser-extension-<version>.zip
 *   node scripts/package-extension.mjs --out dist    # 自定义输出目录
 *
 * 商店的硬性要求，脚本会在打包后校验，不满足直接失败：
 *   1. manifest.json 必须在 zip **根目录**（不能有外层文件夹）；
 *   2. 入口文件齐全（manifest.json / background.js / app.html / icon.png）；
 *   3. description 不能提到其他浏览器（商店包校验会告警「避免在扩展描述中引用其他浏览器」），
 *      且不超过商店 132 字符上限。
 *
 * 体积会打印出来，与 README 的「体积」章节对照，避免文案漂移。
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distExtension = path.join(root, 'dist-extension')

const args = process.argv.slice(2)
const outIndex = args.indexOf('--out')
const outDir = path.resolve(root, outIndex === -1 ? 'out' : (args[outIndex + 1] ?? 'out'))

if (!statSync(distExtension, { throwIfNoEntry: false })) {
  console.error('❌ 缺少 dist-extension/，先跑 npm run build:extension')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(path.join(distExtension, 'manifest.json'), 'utf8'))
const version = manifest.version
if (!/^\d+(\.\d+){1,3}$/.test(version)) {
  console.error(`❌ manifest.json 的 version "${version}" 不是 1~4 段点分整数，商店会拒收`)
  process.exit(1)
}

// 扩展商店的包校验都会扫 description：提到 Chrome、Firefox 等浏览器名会直接告警。
// 文案以 docs/store-listing-edge.md §1 为准，这里只做机械校验。
const description = typeof manifest.description === 'string' ? manifest.description.trim() : ''
if (!description) {
  console.error('❌ manifest.json 缺少 description，商店会拒收')
  process.exit(1)
}
if (description.length > 132) {
  console.error(`❌ description 为 ${description.length} 字符，超过商店 132 字符上限`)
  process.exit(1)
}
const otherBrowsers = [
  ...new Set(
    description.match(/\b(chrome|chromium|edge|firefox|safari|opera|brave|vivaldi)\b/gi) ?? []
  )
]
if (otherBrowsers.length > 0) {
  console.error(`❌ description 引用了其他浏览器：${otherBrowsers.join(', ')}`)
  console.error('   扩展商店包校验会告警「避免在扩展描述中引用其他浏览器」，请改成中性表述')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
const zipPath = path.join(outDir, `vsc-postman-browser-extension-${version}.zip`)

// zip -r 对已存在的包只更新不删除：先清掉同名包，否则重建后的旧哈希资源会残留、包越打越大。
rmSync(zipPath, { force: true })

// -X 去掉多余的 extra field，同样的输入产出同样的字节，便于比对。
execFileSync('zip', ['-r', '-X', '-q', zipPath, '.'], { cwd: distExtension, stdio: 'inherit' })

const listing = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
const entries = listing.split('\n').map((line) => line.trim()).filter(Boolean)

const required = ['manifest.json', 'background.js', 'app.html', 'icon.png']
const missing = required.filter((name) => !entries.includes(name))
if (missing.length > 0) {
  console.error(`❌ zip 根目录缺少：${missing.join(', ')}`)
  console.error(`   实际内容：${entries.join(', ')}`)
  process.exit(1)
}

// 有外层文件夹时，第一个条目会形如 `dist-extension/manifest.json`。
const nested = entries.find((name) => name.startsWith('dist-extension/'))
if (nested) {
  console.error(`❌ zip 里出现了外层文件夹（${nested}），商店要求 manifest.json 在根目录`)
  process.exit(1)
}

const size = statSync(zipPath).size
const sizeKb = (size / 1024).toFixed(1)
console.log(`✅ ${path.relative(root, zipPath)}`)
console.log(`   版本 ${version} · ${entries.length} 个条目 · ${sizeKb} KB`)
console.log('   下一步：在目标扩展商店后台（如 Edge Partner Center）上传该 zip（商店不支持自动提交）')
