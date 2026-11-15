#!/usr/bin/env node
/**
 * 1.x → 2.0 历史迁移冒烟测试。
 *
 * 直接加载 `dist-vsc/` 的编译产物（与扩展真实运行的是同一份代码），
 * 用 `vscode-shim.cjs` 顶替 `vscode` 模块。
 *
 * 用法：
 *   npm run build:vsc        # 先生成 dist-vsc/
 *   npm run smoke:migrate
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import Module from 'node:module'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const shimPath = path.join(root, 'scripts', 'migrate-smoke', 'vscode-shim.cjs')

const require = createRequire(import.meta.url)

// 把 `require('vscode')` 重定向到本地 shim（扩展宿主外没有这个模块）。
const originalLoad = Module._load
Module._load = function load(request, parent, isMain) {
  if (request === 'vscode') return originalLoad.call(this, shimPath, parent, isMain)
  return originalLoad.call(this, request, parent, isMain)
}

const vscode = require(shimPath)
const distVsc = path.join(root, 'dist-vsc')
const { convertLegacyHistory, migrateLegacyHistory } = require(path.join(distVsc, 'migrate.js'))
const { WorkspaceModel } = require(path.join(distVsc, 'workspace.js'))

const stateKey = 'vsc-postman:state'
const markerKey = 'vsc-postman:migrated-legacy-history'

function createContext(initial = {}) {
  const store = new Map(Object.entries(initial))
  return {
    store,
    context: {
      globalState: {
        get: (key) => store.get(key),
        update: async (key, value) => {
          store.set(key, value)
        }
      }
    }
  }
}

const legacyCases = [
  { raw: JSON.stringify({ name: '查用户', url: 'https://api.example.com/users', method: 'get', headers: '{"Authorization":"Bearer x"}', createTime: 1700000000000 }) },
  { raw: JSON.stringify({ name: 'bad', url: 'https://api.example.com/bad', method: 'POST', headers: '{not json', createTime: 1700000001000 }) },
  { raw: JSON.stringify({ url: 'https://api.example.com/orders?p=1', method: 'PUT', createTime: 1700000002000 }) },
  { raw: JSON.stringify({ name: 'obj', url: 'https://e.com/o', method: 'DELETE', headers: { 'X-A': '1' }, createTime: 1700000003000 }) },
  { raw: JSON.stringify({ name: 'nourl', method: 'GET', createTime: 1700000004000 }) },
  { raw: 'not-json' },
  { raw: JSON.stringify({ name: 'unknown', url: 'https://e.com/u', method: 'TRACE', createTime: 1700000005000 }) }
]

const { entries, skipped } = convertLegacyHistory(legacyCases.map((item) => item.raw))
assert.equal(entries.length, 5, '应转换出 5 条')
assert.equal(skipped, 2, '应跳过 2 条')

const userEntry = entries.find((entry) => entry.url.endsWith('/users'))
assert.equal(userEntry.method, 'GET')
assert.equal(userEntry.request.name, '查用户')
assert.equal(userEntry.request.headers[0].key, 'Authorization')
assert.equal(userEntry.status, null)
const draftFields = ['id', 'name', 'method', 'url', 'params', 'headers', 'bodyMode', 'bodyText', 'formFields', 'formData']
for (const field of draftFields) assert.ok(field in userEntry.request, `draft 缺字段 ${field}`)

const badEntry = entries.find((entry) => entry.url.endsWith('/bad'))
assert.equal(badEntry.request.headers[0].key, 'X-Legacy-Headers')
assert.equal(badEntry.request.headers[0].enabled, false)

// 端到端：一次迁移 + 幂等
{
  vscode.__reset()
  vscode.__setLegacyHistory(legacyCases.map((item) => item.raw))
  const { context, store } = createContext()
  const model = new WorkspaceModel(context)

  const first = migrateLegacyHistory(context, model)
  assert.deepEqual(
    { found: first.found, imported: first.imported, skipped: first.skipped },
    { found: 5, imported: 5, skipped: 2 }
  )
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(JSON.parse(store.get(stateKey)).state.history.length, 5)
  assert.equal(store.get(markerKey), true)

  const second = migrateLegacyHistory(context, model)
  assert.equal(second.imported, 0, '第二次迁移应无新增')
  assert.equal(model.getHistory().length, 5, '历史不应重复')
}

// 无旧数据：不写业务数据，但要落标记
{
  vscode.__reset()
  vscode.__setLegacyHistory([])
  const { context, store } = createContext()
  const model = new WorkspaceModel(context)
  const result = migrateLegacyHistory(context, model)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(result.imported, 0)
  assert.equal(store.get(markerKey), true)
  assert.equal(store.get(stateKey), undefined, '没有旧数据时不应写 state')
}

// 与已有新数据合并：按时间倒序
{
  vscode.__reset()
  vscode.__setLegacyHistory([legacyCases[0].raw])
  const existing = JSON.stringify({
    state: {
      collections: [],
      history: [{ id: 'h1', method: 'GET', url: 'https://e.com/new', status: 200, durationMs: 5, at: 1800000000000, request: { id: 'h1' } }],
      historyLimit: 50
    }
  })
  const { context, store } = createContext({ [stateKey]: existing })
  const model = new WorkspaceModel(context)
  migrateLegacyHistory(context, model)
  await new Promise((resolve) => setTimeout(resolve, 0))
  const history = JSON.parse(store.get(stateKey)).state.history
  assert.deepEqual(history.map((item) => item.at), [1800000000000, 1700000000000])
}

// 历史上限裁剪：上限 10 时只保留最近 10 条
{
  vscode.__reset()
  const many = Array.from({ length: 30 }, (_, index) =>
    JSON.stringify({ name: `r${index}`, url: `https://e.com/r${index}`, method: 'GET', createTime: 1700000000000 + index })
  )
  vscode.__setLegacyHistory(many)
  const existing = JSON.stringify({ state: { collections: [], history: [], historyLimit: 10 } })
  const { context, store } = createContext({ [stateKey]: existing })
  const model = new WorkspaceModel(context)
  migrateLegacyHistory(context, model)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(JSON.parse(store.get(stateKey)).state.history.length, 10)
}

// 请求体映射：1.x 的 body 字符串 → 2.0 的 bodyMode/bodyText/params
{
  const bodyCases = [
    { raw: JSON.stringify({ name: 'get-query', url: 'https://e.com/q', method: 'GET', body: '{"page":"1","size":20}', createTime: 1700000010000 }) },
    { raw: JSON.stringify({ name: 'get-nested', url: 'https://e.com/n', method: 'GET', body: '{"filter":{"a":1}}', createTime: 1700000011000 }) },
    { raw: JSON.stringify({ name: 'post-json', url: 'https://e.com/j', method: 'POST', body: '{"name":"Ada"}', createTime: 1700000012000 }) },
    { raw: JSON.stringify({ name: 'post-text', url: 'https://e.com/t', method: 'POST', body: 'hello', createTime: 1700000013000 }) },
    { raw: JSON.stringify({ name: 'no-body', url: 'https://e.com/x', method: 'DELETE', createTime: 1700000014000 }) }
  ]
  const bodyEntries = convertLegacyHistory(bodyCases.map((item) => item.raw)).entries
  const byName = (name) => bodyEntries.find((entry) => entry.request.name === name)

  const getQuery = byName('get-query')
  assert.equal(getQuery.request.bodyMode, 'none', 'GET 的 body 应还原成 params')
  assert.deepEqual(
    getQuery.request.params.map((row) => [row.key, row.value]),
    [['page', '1'], ['size', '20']]
  )
  assert.equal(getQuery.request.bodyText, '')

  const getNested = byName('get-nested')
  assert.equal(getNested.request.params.length, 0, '嵌套值不展开成 params')
  assert.equal(getNested.request.bodyMode, 'json', '嵌套值回退为 JSON body')

  const postJson = byName('post-json')
  assert.equal(postJson.request.bodyMode, 'json')
  assert.equal(postJson.request.bodyText, '{"name":"Ada"}')

  const postText = byName('post-text')
  assert.equal(postText.request.bodyMode, 'text')
  assert.equal(postText.request.bodyText, 'hello')

  const noBody = byName('no-body')
  assert.equal(noBody.request.bodyMode, 'none')
  assert.equal(noBody.request.bodyText, '')
}

console.log('✅ 迁移冒烟测试通过')
