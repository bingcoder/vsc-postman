import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vscode from 'vscode'

/** 改写资源路径为 webview URI 并注入 CSP。 */
export function buildWebviewHtml(
  webview: vscode.Webview,
  distRoot: string,
  htmlFile: string
): string {
  const raw = fs.readFileSync(path.join(distRoot, htmlFile), 'utf8')
  const toUri = (file: string) =>
    webview.asWebviewUri(vscode.Uri.file(path.join(distRoot, file))).toString()

  return raw
    .replace(
      /(src|href)="\.\/(assets\/[^"]+|favicon\.svg|icon\.png)"/g,
      (_match, attr: string, file: string) => `${attr}="${toUri(file)}"`
    )
    .replace(
      '<head>',
      [
        '<head>',
        `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; connect-src 'none';">`
      ].join('')
    )
}
