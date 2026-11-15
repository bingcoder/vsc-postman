import { useMemo, useRef, useState } from 'react'
import { Paperclip, Plus, Trash2, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useT } from '@/hooks/use-i18n'
import { formatBytes } from '@/lib/format'
import { guessMimeType } from '@/lib/mime'
import { detectRuntime } from '@/lib/runtime'
import { pickFilesViaHost } from '@/services/bridge/vscode'
import { getFileSource } from '@/services/vsc-postman/file-registry'
import type { FormFieldKind, FormFieldRow, PickedFile } from '@/types/http'

type FormDataEditorProps = {
  rows: FormFieldRow[]
  onAdd: () => void
  onChange: (id: string, patch: Partial<Pick<FormFieldRow, 'key' | 'value'>>) => void
  onChangeKind: (id: string, kind: FormFieldKind) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onAssignFiles: (id: string, files: PickedFile[]) => void
  onClearFile: (id: string) => void
}

/** form-data 字段编辑器：文件行只挂一个文件，多文件用多行同 key 表示。 */
export function FormDataEditor({
  rows,
  onAdd,
  onChange,
  onChangeKind,
  onToggle,
  onRemove,
  onAssignFiles,
  onClearFile
}: FormDataEditorProps) {
  const { t } = useT()
  const isVscode = useMemo(() => detectRuntime() === 'vscode-webview', [])
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingRowRef = useRef<string | null>(null)
  const [pickError, setPickError] = useState<string | null>(null)

  const fileCount = rows.filter(
    (row) => row.enabled && row.kind === 'file' && row.file
  ).length
  const totalSize = rows.reduce(
    (sum, row) =>
      sum +
      (row.enabled && row.kind === 'file' && row.file ? row.file.size : 0),
    0
  )

  const assign = (rowId: string, picked: PickedFile[]) => {
    if (picked.length === 0) return
    onAssignFiles(rowId, picked)
  }

  const pickForRow = async (rowId: string) => {
    setPickError(null)

    if (isVscode) {
      try {
        const files = await pickFilesViaHost()
        assign(
          rowId,
          files.map((file) => ({
            name: file.name,
            size: file.size,
            mimeType: guessMimeType(file.name),
            path: file.path
          }))
        )
      } catch {
        setPickError(t('composer.selectFilesFailed'))
      }
      return
    }

    pendingRowRef.current = rowId
    inputRef.current?.click()
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    const rowId = pendingRowRef.current
    pendingRowRef.current = null
    if (!rowId) return

    assign(
      rowId,
      files.map((file) => ({
        name: file.name,
        size: file.size,
        mimeType: file.type || guessMimeType(file.name),
        file
      }))
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleInputChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {rows.length > 0 ? (
          <div className="space-y-1">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1.4fr)_auto] items-center gap-2 px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span className="w-3.5" aria-hidden="true" />
              <span>{t('composer.formKey')}</span>
              <span>{t('composer.formDataType')}</span>
              <span>{t('composer.formValue')}</span>
              <span className="w-7" aria-hidden="true" />
            </div>

            <div className="space-y-0.5">
              {rows.map((row) => {
                const missing = row.kind === 'file' && Boolean(row.file) && !getFileSource(row.id)

                return (
                  <div
                    key={row.id}
                    className="group grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1.4fr)_auto] items-center gap-2 rounded-sm px-2 py-0.5 transition-colors hover:bg-muted/60"
                  >
                    <Checkbox
                      checked={row.enabled}
                      onCheckedChange={() => onToggle(row.id)}
                      aria-label={t('kv.enable', { name: row.key || t('kv.thisRow') })}
                    />

                    <Input
                      value={row.key}
                      onChange={(event) => onChange(row.id, { key: event.target.value })}
                      placeholder="name"
                      aria-label={`${t('composer.formKey')} ${row.key || ''}`}
                      className="h-8 border-transparent bg-transparent px-1.5 font-mono text-xs shadow-none focus-visible:border-transparent focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-focus/20"
                    />

                    <label className="sr-only" htmlFor={`form-kind-${row.id}`}>
                      {t('composer.formDataType')}
                    </label>
                    <select
                      id={`form-kind-${row.id}`}
                      value={row.kind}
                      onChange={(event) =>
                        onChangeKind(row.id, event.target.value as FormFieldKind)
                      }
                      className="h-7 cursor-pointer rounded-sm border border-transparent bg-transparent px-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/70 focus-visible:border-focus/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/15"
                    >
                      <option value="text">{t('composer.formDataTypeText')}</option>
                      <option value="file">
                        {t('composer.formDataTypeFile')}
                      </option>
                    </select>

                    {row.kind === 'text' ? (
                      <Input
                        value={row.value}
                        onChange={(event) => onChange(row.id, { value: event.target.value })}
                        placeholder={t('composer.formValue')}
                        aria-label={`${t('composer.formValue')} ${row.key || ''}`}
                        className="h-8 border-transparent bg-transparent px-1.5 font-mono text-xs shadow-none focus-visible:border-transparent focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-focus/20"
                      />
                    ) : row.file ? (
                      <div className="flex min-w-0 items-center gap-1.5 rounded-sm px-1.5">
                        {missing ? (
                          <TriangleAlert
                            size={12}
                            className="shrink-0 text-amber-600 dark:text-amber-400"
                          />
                        ) : (
                          <Paperclip size={12} className="shrink-0 text-muted-foreground" />
                        )}
                        <button
                          type="button"
                          onClick={() => void pickForRow(row.id)}
                          title={t('composer.formDataReplaceFile')}
                          className="min-w-0 truncate text-left font-mono text-xs hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/25"
                        >
                          {row.file.name}
                        </button>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {missing ? t('composer.formDataMissing') : formatBytes(row.file.size)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={t('composer.formDataClearFile')}
                          title={t('composer.formDataClearFile')}
                          onClick={() => onClearFile(row.id)}
                        >
                          <X size={12} />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 justify-start gap-1.5 px-1.5 text-xs font-normal text-muted-foreground"
                        onClick={() => void pickForRow(row.id)}
                      >
                        <Paperclip size={12} />
                        {t('composer.formDataPickFile')}
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground opacity-100 hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                      aria-label={t('kv.delete', { name: row.key || t('kv.thisRow') })}
                      onClick={() => onRemove(row.id)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <p className="rounded-md bg-muted/50 px-3 py-3 text-center text-xs text-muted-foreground">
            {t('composer.noFormFields')}
          </p>
        )}
      </div>

      <div className="shrink-0 space-y-1 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onAdd}
          className="text-muted-foreground"
        >
          <Plus /> {t('common.add')}
        </Button>

        {pickError && (
          <p className="text-xs text-destructive" role="alert">
            {pickError}
          </p>
        )}

        {fileCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-muted-foreground">
            <span>
              {t('composer.formDataTotal', {
                count: fileCount,
                size: formatBytes(totalSize)
              })}
            </span>
            <span className="text-subtle-foreground">{t('composer.formDataHint')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
