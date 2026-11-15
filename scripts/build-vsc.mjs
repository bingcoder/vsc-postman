import { execFileSync } from 'node:child_process'
import { access, cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcVsc = path.join(root, 'src-vsc')
const distVsc = path.join(root, 'dist-vsc')

/** 统一走 npm，避免依赖全局 pnpm。 */
const run = (script, args = []) =>
  execFileSync('npm', ['run', script, ...args], { cwd: root, stdio: 'inherit' })

// 版本号单一来源：根 package.json 与扩展清单必须一致。
run('version:check')

// 全量构建，避免旧产物残留。
await rm(distVsc, { recursive: true, force: true })

console.log('==> 构建共享 Web UI')
run('build')

console.log('==> 编译 VS Code 扩展')
run('compile:vsc')

// 这个资源曾被 .gitignore 的 media 规则漏掉，导致干净克隆构建才失败；这里提前拦截。
const activityIcon = path.join(srcVsc, 'media', 'activity.svg')
try {
  await access(activityIcon)
} catch {
  throw new Error(
    '缺少 src-vsc/media/activity.svg：请确认扩展图标已纳入版本库（被 .gitignore 忽略时干净克隆会构建失败）'
  )
}

console.log('==> 组装 dist-vsc 扩展根目录')
await mkdir(distVsc, { recursive: true })
await cp(path.join(srcVsc, 'package.json'), path.join(distVsc, 'package.json'))
await cp(path.join(srcVsc, 'package.nls.json'), path.join(distVsc, 'package.nls.json'))
await cp(path.join(srcVsc, 'package.nls.zh-cn.json'), path.join(distVsc, 'package.nls.zh-cn.json'))
await cp(path.join(srcVsc, '.vscodeignore'), path.join(distVsc, '.vscodeignore'))
await cp(path.join(srcVsc, 'l10n'), path.join(distVsc, 'l10n'), { recursive: true })
await cp(path.join(srcVsc, 'media'), path.join(distVsc, 'media'), { recursive: true })
await cp(path.join(root, 'dist'), path.join(distVsc, 'media'), { recursive: true })

// vsce 要求扩展根目录有 README / LICENSE / CHANGELOG：README 用扩展专版，而不是根目录那份。
await cp(path.join(srcVsc, 'README.md'), path.join(distVsc, 'README.md'))
await cp(path.join(root, 'LICENSE'), path.join(distVsc, 'LICENSE'))
await cp(path.join(root, 'CHANGELOG.md'), path.join(distVsc, 'CHANGELOG.md'))

console.log(`完成：${path.relative(root, distVsc)}/`)
console.log('F5 调试路径：dist-vsc/')
