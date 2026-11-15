export type Language = 'zh' | 'en'

type Dictionary = Record<string, [zh: string, en: string]>

const en = 'en'

/** 语言镜像：非组件代码读取，避免依赖 app-store 造成循环引用。 */
let currentLanguage: Language = readInitialLanguage()

function readInitialLanguage(): Language {
  try {
    const raw = globalThis.localStorage?.getItem('vsc-postman:app')
    if (!raw) return 'zh'
    const parsed = JSON.parse(raw) as { state?: { language?: unknown } }
    return parsed.state?.language === 'en' ? 'en' : 'zh'
  } catch {
    return 'zh'
  }
}

export function setCurrentLanguage(language: Language): void {
  currentLanguage = language
}

const dictionary: Dictionary = {
  'sidebar.appearance.light': ['浅色', 'Light'],
  'sidebar.appearance.dark': ['深色', 'Dark'],
  'sidebar.appearance.system': ['跟随系统', 'System'],
  'sidebar.close': ['关闭侧边栏', 'Close sidebar'],
  'sidebar.open': ['打开侧边栏', 'Open sidebar'],
  'sidebar.collapse': ['收起侧边栏', 'Collapse sidebar'],
  'sidebar.expand': ['展开侧边栏', 'Expand sidebar'],
  'sidebar.newRequest': ['新建请求', 'New request'],
  'sidebar.search': ['搜索集合和请求', 'Search collections and requests'],
  'sidebar.clearSearch': ['清空搜索', 'Clear search'],
  'sidebar.settings': ['设置', 'Settings'],
  'sidebar.resize': ['拖动调整侧边栏宽度', 'Drag to resize sidebar'],
  'sidebar.resizeSections': [
    '拖动调整集合与历史记录的高度',
    'Drag to resize collections and history'
  ],

  'common.cancel': ['取消', 'Cancel'],
  'common.save': ['保存', 'Save'],
  'common.delete': ['删除', 'Delete'],
  'common.close': ['关闭', 'Close'],
  'common.failed': ['失败', 'Failed'],
  'common.copy': ['复制', 'Copy'],
  'common.copied': ['已复制', 'Copied'],
  'common.copyFailed': ['复制失败', 'Copy failed'],
  'common.send': ['发送', 'Send'],
  'common.add': ['添加一行', 'Add row'],

  'page.eyebrow': ['接口调试', 'API debugging'],
  'page.unnamedRequest': ['未命名请求', 'Untitled request'],
  'page.saveRequest': ['保存请求', 'Save request'],
  'page.newRequest': ['新建请求', 'New request'],
  'page.responseRegion': ['响应区', 'Response region'],

  'composer.method': ['请求方法', 'Request method'],
  'composer.url': ['请求 URL', 'Request URL'],
  'composer.clearUrl': ['清空 URL', 'Clear URL'],
  'composer.send': ['发送请求', 'Send request'],
  'composer.cancelRequest': ['取消请求', 'Cancel request'],
  'composer.config': ['请求配置', 'Request configuration'],
  'composer.paramsKey': ['参数名', 'Param name'],
  'composer.paramsValue': ['参数值', 'Param value'],
  'composer.headerKey': ['Header', 'Header'],
  'composer.headerValue': ['值', 'Value'],
  'composer.formKey': ['字段', 'Field'],
  'composer.formValue': ['值', 'Value'],
  'composer.formDataType': ['字段类型', 'Field type'],
  'composer.formDataTypeText': ['文本', 'Text'],
  'composer.formDataTypeFile': ['文件', 'File'],
  'composer.formDataPickFile': ['选择文件', 'Choose file'],
  'composer.formDataReplaceFile': ['重新选择文件', 'Replace file'],
  'composer.formDataClearFile': ['移除文件', 'Remove file'],
  'composer.formDataMissing': ['需重新选择', 'Reselect'],
  'composer.formDataHint': [
    '文件只记录名称与大小，不会保存内容；刷新或重开页面后需要重新选择。',
    'Only file names and sizes are stored; reselect the files after a reload.'
  ],
  'composer.formDataTotal': ['{count} 个文件 · 合计 {size}', '{count} files · {size} total'],
  'composer.uploading': ['上传中 {loaded} / {total}', 'Uploading {loaded} / {total}'],
  'composer.uploadingIndeterminate': ['上传中 {loaded}', 'Uploading {loaded}'],
  'composer.noParams': ['暂无 query 参数', 'No query parameters'],
  'composer.noHeaders': ['暂无自定义请求头', 'No custom headers'],
  'composer.noFormFields': ['暂无表单字段', 'No form fields'],
  'composer.selectFilesFailed': ['选择文件失败', 'Failed to select files'],
  'composer.bodyType': ['请求体类型', 'Body type'],
  'composer.body': ['请求体', 'Request body'],
  'composer.bodyPlaceholder': ['请求体内容', 'Request body content'],
  'composer.format': ['格式化', 'Format'],
  'composer.jsonError': [
    'JSON 格式有误，无法格式化（仍可原样发送）',
    'Invalid JSON, could not format (can still send as-is)'
  ],
  'composer.bodyDisabled': [
    '{method} 请求不发送请求体，请继续在 Params / Headers 中配置。',
    '{method} requests do not send a body; configure Params / Headers instead.'
  ],
  'composer.noBody': [
    '当前请求没有请求体，可在上方切换为 JSON、Text、Form 或 Form-Data。',
    'This request has no body. Switch to JSON, Text, Form or Form-Data above.'
  ],

  'response.title': ['响应', 'Response'],
  'response.view': ['响应视图', 'Response view'],
  'response.truncated': ['已截断', 'Truncated'],
  'response.openInVscode': ['在 VS Code 中打开', 'Open in VS Code'],
  'response.open': ['打开', 'Open'],
  'response.raw': ['原始', 'Raw'],
  'response.pretty': ['格式化', 'Pretty'],
  'response.idle': [
    '发送请求后，响应会显示在这里',
    'Send a request and the response will appear here'
  ],
  'response.loading': ['请求发送中…', 'Sending request…'],
  'response.emptyBody': ['（空响应体）', '(empty body)'],
  'response.binary': [
    '二进制响应（{size}），暂不支持预览或下载。',
    'Binary response ({size}), preview or download not supported.'
  ],
  'response.noHeaders': ['无响应头', 'No response headers'],
  'response.tab.request': ['请求', 'Request'],
  'response.request.method': ['请求方式', 'Method'],
  'response.request.url': ['请求 URL', 'Request URL'],
  'response.request.headers': ['请求头', 'Request headers'],
  'response.request.body': ['请求体', 'Request body'],
  'response.request.noHeaders': ['无请求头', 'No request headers'],
  'response.request.noBody': ['无请求体', 'No request body'],
  'response.err.invalidUrl': ['参数错误', 'Invalid request'],
  'response.err.timeout': ['请求超时', 'Request timed out'],
  'response.err.aborted': ['已取消', 'Cancelled'],
  'response.err.network': ['网络错误', 'Network error'],
  'response.err.proxyError': ['代理错误', 'Proxy error'],
  'response.err.unsupported': ['环境不支持', 'Environment not supported'],
  'response.err.fileMissing': ['缺少文件', 'Missing file'],
  'response.err.permissionDenied': ['缺少站点权限', 'Site access required'],
  'response.tip.proxy': [
    '提示：开发环境需要 Vite Dev Server 提供代理；生产 Web 可配置 VITE_HTTP_PROXY_URL，或改用浏览器扩展 / VS Code 插件运行。',
    'Tip: dev needs the Vite Dev Server proxy; production web can set VITE_HTTP_PROXY_URL, or use the browser extension / VS Code plugin.'
  ],
  'response.stream.phase.open': ['接收中', 'Streaming'],
  'response.stream.phase.ended': ['已结束', 'Ended'],
  'response.stream.phase.aborted': ['已取消', 'Cancelled'],
  'response.stream.events': ['{count} 个事件', '{count} events'],
  'response.stream.view': ['事件流视图', 'Event stream view'],
  'response.stream.tab.events': ['事件', 'Events'],
  'response.stream.tab.raw': ['原始', 'Raw'],
  'response.stream.rawItems': ['原始项', 'Raw items'],
  'response.stream.eventsList': ['事件列表', 'Event list'],
  'response.stream.resize': [
    '拖动调整事件列表与解析内容的宽度',
    'Drag to resize the event list and parsed content'
  ],
  'response.stream.parsed': ['解析内容', 'Parsed content'],
  'response.stream.field.event': ['事件', 'Event'],
  'response.stream.field.id': ['ID', 'ID'],
  'response.stream.field.retry': ['重试间隔', 'Retry'],
  'response.stream.field.data': ['数据', 'Data'],
  'response.stream.emptyData': ['（空数据）', '(empty data)'],
  'response.stream.waiting': ['已建立连接，等待事件…', 'Connected, waiting for events…'],
  'response.stream.empty': ['流已结束，没有收到事件', 'Stream ended with no events'],
  'response.stream.emptyAborted': ['已取消，没有收到事件', 'Cancelled before any event arrived'],
  'response.stream.limitReached': [
    '展示已达上限（{size}），已停止接收；已收到的内容仍可查看。',
    'Display limit reached ({size}); the stream was stopped. Received content is still available.'
  ],
  'response.stream.jumpToBottom': ['跳到最新', 'Jump to latest'],
  'response.stream.rawEmpty': ['（尚未收到数据）', '(no data received yet)'],

  'saveDialog.title': ['保存请求', 'Save request'],
  'saveDialog.desc': [
    '保存到集合，之后可从侧边栏快速打开。',
    'Save to a collection and reopen it quickly from the sidebar.'
  ],
  'saveDialog.name': ['名称', 'Name'],
  'saveDialog.requestName': ['请求名称', 'Request name'],
  'saveDialog.collection': ['集合', 'Collection'],
  'saveDialog.newCollection': ['新建集合', 'New collection'],
  'saveDialog.selectCollection': ['选择已有集合', 'Select existing collection'],
  'saveDialog.switchToSelect': ['改为选择已有集合', 'Switch to selecting an existing collection'],
  'saveDialog.switchToNew': ['改为新建集合', 'Switch to creating a new collection'],
  'saveDialog.newName': ['新建集合名称', 'New collection name'],
  'saveDialog.collectionPlaceholder': ['例如：用户服务', 'e.g. User service'],
  'saveDialog.saveToCollection': ['保存到集合', 'Save to collection'],
  'saveDialog.error.noCollectionName': ['请输入集合名称', 'Please enter a collection name'],
  'saveDialog.error.noCollection': ['请选择集合', 'Please select a collection'],

  'kv.key': ['键', 'Key'],
  'kv.value': ['值', 'Value'],
  'kv.empty': ['暂无内容', 'No content'],
  'kv.enable': ['启用 {name}', 'Enable {name}'],
  'kv.delete': ['删除 {name}', 'Delete {name}'],
  'kv.thisRow': ['该行', 'this row'],

  'history.title': ['历史记录', 'History'],
  'history.clear': ['清空', 'Clear'],
  'history.noMatch': ['没有匹配的历史记录', 'No matching history'],
  'history.empty': ['暂无请求记录', 'No request history yet'],
  'history.open': ['打开历史请求 {name}', 'Open history request {name}'],
  'history.delete': ['删除历史记录', 'Delete history entry'],
  'history.group.today': ['今天', 'Today'],
  'history.group.yesterday': ['昨天', 'Yesterday'],
  'history.group.count': ['{count} 条记录', '{count} entries'],
  'history.group.clear': ['清空 {date} 的记录', 'Clear {date} history'],

  'collection.title': ['集合', 'Collections'],
  'collection.new': ['新建集合', 'New collection'],
  'collection.namePlaceholder': ['集合名称', 'Collection name'],
  'collection.newName': ['新建集合名称', 'New collection name'],
  'collection.create': ['创建集合', 'Create collection'],
  'collection.cancelCreate': ['取消创建集合', 'Cancel creating collection'],
  'collection.noMatch': ['没有匹配的集合', 'No matching collections'],
  'collection.empty': ['还没有集合，点击 + 新建', 'No collections yet. Click + to create one'],
  'collection.collapse': ['收起 {name}', 'Collapse {name}'],
  'collection.expand': ['展开 {name}', 'Expand {name}'],
  'collection.collapseAria': ['收起集合 {name}', 'Collapse collection {name}'],
  'collection.expandAria': ['展开集合 {name}', 'Expand collection {name}'],
  'collection.rename': ['重命名 {name}', 'Rename {name}'],
  'collection.renameAria': ['重命名集合 {name}', 'Rename collection {name}'],
  'collection.delete': ['删除 {name}', 'Delete {name}'],
  'collection.deleteAria': ['删除集合 {name}', 'Delete collection {name}'],
  'collection.nameAria': ['集合名称', 'Collection name'],
  'collection.confirmRename': ['确认重命名', 'Confirm rename'],
  'collection.cancelRename': ['取消重命名', 'Cancel rename'],
  'collection.emptyCollection': ['空集合', 'Empty collection'],
  'collection.openRequest': ['打开请求 {name}', 'Open request {name}'],
  'collection.copyRequest': ['复制 {name}', 'Copy {name}'],
  'collection.copyRequestAria': ['复制请求 {name}', 'Copy request {name}'],
  'collection.deleteRequest': ['删除 {name}', 'Delete {name}'],
  'collection.deleteRequestAria': ['删除请求 {name}', 'Delete request {name}'],
  'collection.confirmDelete': [
    '删除「{name}」及其中 {count} 个请求？',
    'Delete "{name}" and its {count} request(s)?'
  ],

  'tooltip.noUrl': ['未填写 URL', 'No URL'],

  'resizer.label': ['调整响应区高度', 'Adjust response pane height'],

  'settings.eyebrow': ['设置', 'Settings'],
  'settings.title': ['工作区偏好', 'Workspace preferences'],
  'settings.intro': [
    '这里汇总当前工作区的外观、语言与数据存储方式。',
    'A summary of appearance, language and storage for this workspace.'
  ],
  'settings.appearance.title': ['外观', 'Appearance'],
  'settings.appearance.desc': [
    '在浅色、深色与跟随系统之间切换。',
    'Switch between light, dark and system.'
  ],
  'settings.language.title': ['语言', 'Language'],
  'settings.language.desc': ['切换界面显示语言。', 'Switch the interface display language.'],
  'settings.language.zh': ['中文', '中文'],
  'settings.language.en': ['English', 'English'],
  'settings.appearance.locked': [
    '主题跟随 VS Code 工作台配色，在 VS Code 内不可单独切换。',
    'The theme follows the VS Code workbench colors and cannot be changed here.'
  ],
  'settings.history.title': ['历史记录', 'History'],
  'settings.history.desc': [
    '设置历史最多保留多少条。历史会保存完整请求快照，上限越大占用本地存储越多。',
    'Choose how many history entries to keep. Each entry stores a full request snapshot, so a larger limit uses more local storage.'
  ],
  'settings.history.option': ['{count} 条', '{count}'],
  'settings.history.current': ['当前已记录 {count} 条', '{count} entries recorded'],
  'settings.history.hint': [
    '超出上限后自动删除最早的记录；调小上限会立即清理多余记录。',
    'Oldest entries are removed once the limit is exceeded. Lowering the limit cleans up extra entries immediately.'
  ],
  'settings.storage.title': ['存储', 'Storage'],
  'settings.storage.desc': [
    '集合、请求与历史都保存在本地，不会上传到服务器。',
    'Collections, requests and history stay on this device and are never uploaded.'
  ],
  'settings.storage.openWeb': ['查看存储数据', 'View stored data'],
  'settings.storage.openVscode': ['在 VS Code 中打开存储文件', 'Open storage file in VS Code'],
  'settings.back': ['返回工作区', 'Back to workspace'],

  'storage.eyebrow': ['存储', 'Storage'],
  'storage.title': ['存储数据', 'Stored data'],
  'storage.intro': [
    '只读展示当前工作区保存的全部 JSON 数据。',
    'Read-only view of all JSON data saved in the current workspace.'
  ],
  'storage.empty': ['当前没有可读取的存储数据。', 'No readable storage data found.'],
  'storage.loading': ['加载中…', 'Loading…'],
  'storage.vscodeNote': [
    'VS Code Webview 下的持久化数据保存在扩展宿主 globalState，只读快照可能与宿主存在短暂差异。',
    'Under VS Code the persisted data lives in the host globalState; this read-only snapshot may briefly differ from the host.'
  ],
  'storage.vscodeTitle': ['VS Code 存储', 'VS Code storage'],
  'storage.copy': ['复制', 'Copy'],
  'storage.copied': ['已复制', 'Copied'],
  'storage.back': ['返回设置', 'Back to settings'],
  'storage.loadError': ['读取存储数据失败', 'Failed to load storage data'],

  'notfound.title': ['找不到这个页面', 'Page not found'],
  'notfound.desc': [
    '当前链接没有对应的路由，可能已被移除或地址有误。返回工作区继续发起请求。',
    'This URL has no matching route — it may have been removed or mistyped. Return to the workspace to keep making requests.'
  ],
  'notfound.back': ['返回工作区', 'Back to workspace'],

  'store.unnamedCollection': ['未命名集合', 'Untitled collection'],
  'store.unnamedRequest': ['未命名请求', 'Untitled request'],
  'store.copySuffix': ['副本', 'copy'],
  'format.requestSummary': ['{method} 请求', '{method} request'],

  'error.invalidUrl.empty': ['请输入请求 URL', 'Please enter a request URL'],
  'error.invalidUrl.format': ['URL 格式不正确', 'Invalid URL format'],
  'error.invalidUrl.scheme': ['仅支持 http/https 协议', 'Only http/https schemes are supported'],
  'error.aborted': ['请求已取消', 'Request cancelled'],
  'error.timeout': ['请求超时（{seconds}s）', 'Request timed out ({seconds}s)'],
  'error.stream.connectTimeout': [
    '等待响应超时（{seconds}s）',
    'Timed out waiting for a response ({seconds}s)'
  ],
  'error.stream.idleTimeout': [
    '流式响应空闲超时（{seconds}s），已停止接收',
    'Stream idle for {seconds}s; stopped receiving'
  ],
  'error.network.fallback': ['请求失败', 'Request failed'],
  'error.network.send': ['网络请求失败', 'Network request failed'],
  'error.unsupported.webview': [
    '当前环境不在 VS Code Webview 中，无法使用扩展宿主能力',
    'Not running inside a VS Code Webview; host capabilities are unavailable'
  ],
  'error.timeout.bridge': ['VS Code 扩展宿主响应超时', 'VS Code extension host timed out'],
  'error.fetch.transport': [
    '{message}。请确认目标可访问。',
    '{message}. Make sure the target is reachable.'
  ],
  'error.proxy.unparseable': [
    '开发代理返回了无法解析的响应（HTTP {status}）',
    'The dev proxy returned an unparseable response (HTTP {status})'
  ],
  'error.proxy.unreachable': [
    '无法连接开发代理（{endpoint}），请确认 Vite Dev Server 正在运行',
    'Could not connect to the dev proxy ({endpoint}); make sure the Vite Dev Server is running'
  ],
  'error.formData.fileMissing': [
    '字段「{name}」还没有选择文件',
    'Field "{name}" has no file selected'
  ],
  'error.upload.pathUnsupported': [
    '浏览器环境无法读取该文件的本地路径，请重新选择文件（{name}）',
    'The browser cannot read a local path for this file; reselect it ({name})'
  ],
  'error.upload.memoryUnsupported': [
    'VS Code 环境只能发送从宿主选择框选取的文件（{name}）',
    'Under VS Code only files picked through the host dialog can be sent ({name})'
  ],
  'error.permission.denied': ['未获得 {host} 的站点权限', 'Site access to {host} was not granted'],
  'error.extension.disconnected': [
    '与扩展后台的连接已断开，请重试',
    'Lost connection to the extension background. Please retry.'
  ],
  'permission.deniedHint': [
    '浏览器当前未允许访问 {host}。请在扩展详情页把「站点访问」设为「在所有网站上」，然后重新发送。',
    'Your browser is not allowing access to {host}. Set Site access to "On all sites" in the extension details, then send again.'
  ],
  'permission.allowAndRetry': ['重新发送', 'Send again']
}

export function translate(
  key: string,
  language: Language,
  vars?: Record<string, string | number>
): string {
  const entry = dictionary[key]
  let text = entry ? (language === en ? entry[1] : entry[0]) : key
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}

export function getCurrentLanguage(): Language {
  return currentLanguage
}
