import { EditorView } from '@codemirror/view'
import { syntaxHighlighting, HighlightStyle, defaultHighlightStyle } from '@codemirror/language'

/** 编辑器主题：颜色引用 globals.css 语义 token，切换主题无需重建实例。 */
export const codemirrorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
    // 与 text-xs / leading-6 对齐
    fontSize: '12px',
    height: '100%'
  },
  '.cm-scroller': {
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    lineHeight: '1.5rem'
  },
  '.cm-content': {
    caretColor: 'var(--focus)',
    padding: '0.5rem 0.75rem'
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--subtle-foreground)',
    border: 'none'
  },
  '.cm-gutter': {
    backgroundColor: 'transparent'
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--foreground) 4%, transparent)'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)'
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--foreground) 14%, transparent) !important'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--focus)'
  },
  '&.cm-focused': {
    outline: 'none'
  },
  '.cm-placeholder': {
    color: 'var(--subtle-foreground)'
  },
  '.cm-foldgutter': {
    width: '0.9rem',
    padding: '0 0.1rem'
  },
  '.cm-foldgutter .cm-gutterElement': {
    cursor: 'pointer',
    color: 'var(--subtle-foreground)',
    textAlign: 'center'
  },
  '.cm-foldgutter .cm-gutterElement:hover': {
    color: 'var(--muted-foreground)'
  }
})

/** 高亮：复用 defaultHighlightStyle 的 tag，只把 JSON 颜色换成 --cm-* 变量。 */
const COLOR_TO_VAR: Record<string, string> = {
  '#00c': 'var(--cm-key)',
  '#a11': 'var(--cm-string)',
  '#164': 'var(--cm-number)',
  '#219': 'var(--cm-bool)',
  '#708': 'var(--cm-null)',
  '#f00': 'var(--cm-invalid)'
}

export const codemirrorHighlightStyle = HighlightStyle.define(
  defaultHighlightStyle.specs.map((spec) => {
    const mapped = spec.color ? COLOR_TO_VAR[spec.color] : undefined
    return mapped ? { ...spec, color: mapped } : spec
  })
)

export const codemirrorHighlight = syntaxHighlighting(codemirrorHighlightStyle)

export const codemirrorBaseExtensions = [codemirrorTheme, codemirrorHighlight]
