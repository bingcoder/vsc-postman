import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const projectRoot = path.resolve(__dirname, '..')

/** 复制 manifest、图标与扩展说明；放在 closeBundle 以支持 --watch。 */
function copyChromeAssets(): Plugin {
  return {
    name: 'copy-chrome-assets',
    async closeBundle() {
      const outDir = path.resolve(projectRoot, 'dist-chrome')
      await mkdir(outDir, { recursive: true })
      await copyFile(path.resolve(__dirname, 'manifest.json'), path.join(outDir, 'manifest.json'))
      await copyFile(path.resolve(projectRoot, 'public/icon.png'), path.join(outDir, 'icon.png'))
      // 随 zip 一起提交商店，供审核方与解压使用者阅读。
      await copyFile(path.resolve(__dirname, 'README.md'), path.join(outDir, 'README.md'))
    }
  }
}

/** 把 HTML 产物扁平化为 app.html 并修正资源相对路径。 */
function flattenAppHtml(): Plugin {
  return {
    name: 'flatten-app-html',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const key = Object.keys(bundle).find((name) => name.endsWith('src-chrome/app.html'))
      if (!key) return

      const asset = bundle[key]
      if (asset.type !== 'asset') return

      delete bundle[key]
      asset.fileName = 'app.html'
      asset.source = String(asset.source)
        .replaceAll('../assets/', './assets/')
        .replaceAll('../icon.png', './icon.png')
      bundle['app.html'] = asset
    }
  }
}

/** Chrome MV3 构建：app.html 为页面入口，background 固定命名，产物用相对路径。 */
export default defineConfig({
  root: projectRoot,
  base: './',
  publicDir: path.resolve(projectRoot, 'public'),
  plugins: [react(), tailwindcss(), flattenAppHtml(), copyChromeAssets()],
  build: {
    outDir: path.resolve(projectRoot, 'dist-chrome'),
    emptyOutDir: true,
    target: 'chrome116',
    rollupOptions: {
      input: {
        app: path.resolve(__dirname, 'app.html'),
        background: path.resolve(__dirname, 'background.ts')
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, 'src'),
      '@chrome': __dirname
    }
  }
})
