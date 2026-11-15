import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { EditorState, Compartment, Annotation, type Extension } from '@codemirror/state'
import {
  EditorView,
  placeholder as cmPlaceholder,
  type ViewUpdate,
  lineNumbers,
  highlightActiveLine,
  keymap
} from '@codemirror/view'
import {
  bracketMatching,
  codeFolding,
  foldGutter,
  foldKeymap,
  indentOnInput
} from '@codemirror/language'
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { json } from '@codemirror/lang-json'
import { cn } from '@/lib/utils'
import { codemirrorBaseExtensions } from '@/lib/codemirror-theme'

export type CodeEditorLanguage = 'json' | 'text'

export type CodeEditorHandle = {
  /** 格式化为缩进 JSON；失败返回 ok:false 且不改文档。 */
  formatJson: () => { ok: boolean }
}

type CodeEditorProps = {
  value: string
  onChange?: (value: string) => void
  language?: CodeEditorLanguage
  editable?: boolean
  placeholder?: string
  minHeight?: number
  className?: string
  ariaLabel?: string
}

/** 标记程序化 dispatch，updateListener 据此跳过，避免回调循环。 */
const EXTERNAL_SYNC = Annotation.define<boolean>()

function languageExtension(lang: CodeEditorLanguage): Extension {
  return lang === 'json' ? json() : []
}

/** 受控 CodeMirror 6 编辑器；语言与 editable 用 Compartment 切换。 */
export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(
  {
    value,
    onChange,
    language = 'text',
    editable = true,
    placeholder,
    minHeight = 176,
    className,
    ariaLabel
  },
  ref
) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const langCompartment = useRef(new Compartment())
  const editableCompartment = useRef(new Compartment())
  // ref 持有 onChange，避免重建扩展。
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!hostRef.current) return

    const extensions: Extension[] = [
      ...codemirrorBaseExtensions,
      lineNumbers(),
      foldGutter(),
      codeFolding(),
      bracketMatching(),
      highlightActiveLine(),
      indentOnInput(),
      EditorView.lineWrapping,
      // 只读区同样支持折叠。
      keymap.of([...foldKeymap]),
      langCompartment.current.of(languageExtension(language)),
      editableCompartment.current.of(EditorState.readOnly.of(!editable)),
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (!update.docChanged) return
        // 只回传用户输入，跳过程序化变更。
        const isExternal = update.transactions.some((tr) => tr.annotation(EXTERNAL_SYNC) === true)
        if (isExternal) return
        onChangeRef.current?.(update.state.doc.toString())
      })
    ]

    if (editable) {
      extensions.push(history(), keymap.of([...defaultKeymap, ...historyKeymap]))
    }
    if (placeholder) {
      extensions.push(cmPlaceholder(placeholder))
    }

    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: hostRef.current
    })
    viewRef.current = view

    if (ariaLabel) {
      view.contentDOM.setAttribute('aria-label', ariaLabel)
    }

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // 仅挂载时创建实例。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: langCompartment.current.reconfigure(languageExtension(language))
    })
  }, [language])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: editableCompartment.current.reconfigure(EditorState.readOnly.of(!editable))
    })
  }, [editable])

  // 外部 value 变化时同步到编辑器。
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      annotations: EXTERNAL_SYNC.of(true)
    })
  }, [value])

  // 暴露 formatJson：整体替换为 2 空格缩进。
  useImperativeHandle(
    ref,
    (): CodeEditorHandle => ({
      formatJson() {
        const view = viewRef.current
        if (!view) return { ok: false }
        const text = view.state.doc.toString()
        try {
          const formatted = JSON.stringify(JSON.parse(text) as unknown, null, 2)
          if (!formatted) return { ok: false }
          view.dispatch({
            changes: { from: 0, to: text.length, insert: formatted },
            annotations: EXTERNAL_SYNC.of(true)
          })
          onChangeRef.current?.(formatted)
          return { ok: true }
        } catch {
          return { ok: false }
        }
      }
    }),
    []
  )

  return (
    <div
      className={cn('flex flex-col overflow-hidden rounded-md bg-muted/30', className)}
      style={{ minHeight }}
    >
      <div ref={hostRef} className="min-h-0 flex-1" />
    </div>
  )
})

CodeEditor.displayName = 'CodeEditor'
