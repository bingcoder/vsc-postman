import { useEffect, useRef, useState } from 'react'
import { useT } from '@/hooks/use-i18n'
import { Braces, Check, ChevronDown, CircleAlert, ShieldAlert, X } from 'lucide-react'
import { Select as BaseSelect } from '@base-ui/react/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CodeEditor, type CodeEditorHandle } from '@/components/ui/code-editor'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsIndicator } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { FormDataEditor } from '@/components/http/form-data-editor'
import { KeyValueEditor } from '@/components/http/key-value-editor'
import { formatBytes } from '@/lib/format'
import { methodSupportsBody } from '@/services/vsc-postman/prepare-request'
import type { UploadProgress } from '@/services/vsc-postman/transport'
import {
  BODY_MODES,
  HTTP_METHODS,
  type BodyMode,
  type FormFieldKind,
  type FormFieldRow,
  type HttpMethod,
  type KvRow,
  type KvSection,
  type PickedFile,
  type RequestDraft
} from '@/types/http'

type DraftFieldPatch = Partial<
  Pick<RequestDraft, 'name' | 'method' | 'url' | 'bodyMode' | 'bodyText'>
>

type RowPatch = Partial<Pick<KvRow, 'key' | 'value' | 'enabled'>>

type FormFieldPatch = Partial<Pick<FormFieldRow, 'key' | 'value' | 'kind'>>

type RequestComposerProps = {
  draft: RequestDraft
  loading: boolean
  uploadProgress: UploadProgress | null
  permissionDenied?: boolean
  permissionHost?: string
  onFieldChange: (patch: DraftFieldPatch) => void
  onAddRow: (section: KvSection) => void
  onUpdateRow: (section: KvSection, id: string, patch: RowPatch) => void
  onToggleRow: (section: KvSection, id: string) => void
  onRemoveRow: (section: KvSection, id: string) => void
  onAddFormRow: () => void
  onUpdateFormRow: (id: string, patch: FormFieldPatch) => void
  onToggleFormRow: (id: string) => void
  onRemoveFormRow: (id: string) => void
  onAssignFormFiles: (id: string, files: PickedFile[]) => void
  onClearFormFile: (id: string) => void
  onSend: () => void
  onCancel: () => void
}

type ComposerTab = 'params' | 'headers' | 'body'

function countActiveRows(rows: KvRow[]): number {
  return rows.filter((row) => row.enabled && row.key.trim().length > 0).length
}

export function RequestComposer({
  draft,
  loading,
  uploadProgress,
  permissionDenied = false,
  permissionHost = '',
  onFieldChange,
  onAddRow,
  onUpdateRow,
  onToggleRow,
  onRemoveRow,
  onAddFormRow,
  onUpdateFormRow,
  onToggleFormRow,
  onRemoveFormRow,
  onAssignFormFiles,
  onClearFormFile,
  onSend,
  onCancel
}: RequestComposerProps) {
  const { t } = useT()
  const [tab, setTab] = useState<ComposerTab>('params')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const editorRef = useRef<CodeEditorHandle>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return
      event.preventDefault()
      if (loading) {
        onCancel()
      } else {
        onSend()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [loading, onCancel, onSend])

  const tabs: { value: ComposerTab; label: string; count?: number }[] = [
    { value: 'params', label: 'Params', count: countActiveRows(draft.params) },
    { value: 'headers', label: 'Headers', count: countActiveRows(draft.headers) },
    { value: 'body', label: 'Body', count: draft.bodyMode === 'none' ? undefined : 1 }
  ]

  const handleFormatJson = () => {
    const result = editorRef.current?.formatJson()
    setJsonError(result?.ok ? null : t('composer.jsonError'))
  }

  const bodyDisabled = !methodSupportsBody(draft.method)

  return (
    <section className="flex h-full flex-col">
      <div className="flex h-full min-h-0 flex-col p-2 pt-3">
        <form
          className="shrink-0"
          onSubmit={(event) => {
            event.preventDefault()
            if (loading) onCancel()
            else if (draft.url.trim()) onSend()
          }}
        >
          <div className="flex items-stretch gap-2">
            <div className="flex h-9 min-w-0 flex-1 items-center rounded-md border border-border bg-muted/45 pl-1 pr-1 transition-[background-color,border-color,box-shadow] duration-150 focus-within:border-focus/40 focus-within:bg-muted/70 focus-within:ring-2 focus-within:ring-focus/15">
              <BaseSelect.Root
                value={draft.method}
                onValueChange={(value) => onFieldChange({ method: (value ?? 'GET') as HttpMethod })}
              >
                <BaseSelect.Trigger
                  aria-label={t('composer.method')}
                  className="flex h-6 shrink-0 items-center gap-1.5 rounded-sm px-2 text-xs font-semibold transition-colors hover:bg-muted/80 focus-visible:bg-muted/80 focus-visible:outline-none data-pressed:bg-muted/80"
                >
                  <BaseSelect.Value />
                  <BaseSelect.Icon className="text-subtle-foreground">
                    <ChevronDown size={12} />
                  </BaseSelect.Icon>
                </BaseSelect.Trigger>
                <BaseSelect.Portal>
                  <BaseSelect.Positioner
                    className="z-50 outline-none"
                    sideOffset={4}
                    alignItemWithTrigger={false}
                  >
                    <BaseSelect.Popup className="min-w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-popover outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
                      <BaseSelect.List className="relative">
                        {HTTP_METHODS.map((method) => (
                          <BaseSelect.Item
                            key={method}
                            value={method}
                            className="grid cursor-pointer grid-cols-[1rem_1fr] items-center gap-2 rounded-sm px-2 py-1.5 text-xs font-semibold outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                          >
                            <BaseSelect.ItemIndicator className="col-start-1 text-foreground">
                              <Check size={12} />
                            </BaseSelect.ItemIndicator>
                            <BaseSelect.ItemText className="col-start-2">
                              {method}
                            </BaseSelect.ItemText>
                          </BaseSelect.Item>
                        ))}
                      </BaseSelect.List>
                    </BaseSelect.Popup>
                  </BaseSelect.Positioner>
                </BaseSelect.Portal>
              </BaseSelect.Root>

              <span aria-hidden="true" className="mx-1 h-3.5 w-px shrink-0 bg-border" />

              <Input
                value={draft.url}
                onChange={(event) => onFieldChange({ url: event.target.value })}
                placeholder="https://api.example.com/users"
                aria-label={t('composer.url')}
                autoComplete="off"
                spellCheck={false}
                className="h-6 min-w-0 flex-1 border-0 bg-transparent px-1.5 py-0 font-mono text-[13px] shadow-none focus-visible:border-transparent focus-visible:ring-0"
              />

              <div className="flex shrink-0 items-center pr-0.5">
                {draft.url ? (
                  <button
                    type="button"
                    onClick={() => onFieldChange({ url: '' })}
                    aria-label={t('composer.clearUrl')}
                    title={t('composer.clearUrl')}
                    className="flex size-5 cursor-pointer items-center justify-center rounded-sm text-subtle-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/25"
                  >
                    <X size={13} />
                  </button>
                ) : (
                  <kbd className="hidden h-5 items-center rounded-sm border border-border/80 bg-background/60 px-1.5 text-[10px] font-medium text-subtle-foreground lg:inline-flex">
                    ⌘↵
                  </kbd>
                )}
              </div>
            </div>

            <Button
              type="submit"
              variant={loading ? 'secondary' : 'default'}
              disabled={!loading && !draft.url.trim()}
              aria-label={loading ? t('composer.cancelRequest') : t('composer.send')}
              title={loading ? t('composer.cancelRequest') : t('composer.send')}
              className="h-9 shrink-0 px-3.5 text-sm"
            >
              {loading ? t('common.cancel') : t('common.send')}
            </Button>
          </div>
        </form>

        {permissionDenied && (
          <div
            className="mt-2 flex shrink-0 flex-col gap-2 rounded-md border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <div className="flex min-w-0 items-start gap-2">
              <ShieldAlert size={14} className="mt-0.5 shrink-0" />
              <p className="min-w-0 leading-5">
                {t('permission.deniedHint', { host: permissionHost || '…' })}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSend}
              className="shrink-0 border-amber-400/60 bg-background/70 text-amber-950 hover:bg-background dark:border-amber-500/30 dark:text-amber-100"
            >
              {t('permission.allowAndRetry')}
            </Button>
          </div>
        )}

        {loading && uploadProgress && (
          <div className="mt-2 shrink-0 space-y-1" role="status" aria-live="polite">
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              {uploadProgress.total > 0 ? (
                <div
                  className="h-full rounded-full bg-foreground/50 transition-[width] duration-150"
                  style={{
                    width: `${Math.min(100, Math.round((uploadProgress.loaded / uploadProgress.total) * 100))}%`
                  }}
                />
              ) : (
                <div className="h-full w-1/3 animate-pulse rounded-full bg-foreground/30" />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {uploadProgress.total > 0
                ? t('composer.uploading', {
                    loaded: formatBytes(uploadProgress.loaded),
                    total: formatBytes(uploadProgress.total)
                  })
                : t('composer.uploadingIndeterminate', {
                    loaded: formatBytes(uploadProgress.loaded)
                  })}
            </p>
          </div>
        )}

        <div className="mt-2 shrink-0 border-b border-border">
          <Tabs value={tab} onValueChange={(value) => setTab(value as ComposerTab)}>
            <TabsList aria-label={t('composer.config')}>
              {tabs.map((item) => (
                <TabsTrigger key={item.value} value={item.value}>
                  {item.label}
                  {typeof item.count === 'number' && item.count > 0 && (
                    <span className="text-[10px] font-normal tabular-nums text-muted-foreground">
                      {item.count}
                    </span>
                  )}
                </TabsTrigger>
              ))}
              <TabsIndicator />
            </TabsList>
          </Tabs>
        </div>

        <div className="min-h-0 flex-1 pt-3">
          {tab === 'params' && (
            <ScrollArea className="h-full">
              <KeyValueEditor
                rows={draft.params}
                labels={[t('composer.paramsKey'), t('composer.paramsValue')]}
                keyPlaceholder="page"
                valuePlaceholder="1"
                emptyText={t('composer.noParams')}
                onAdd={() => onAddRow('params')}
                onChange={(id, patch) => onUpdateRow('params', id, patch)}
                onToggle={(id) => onToggleRow('params', id)}
                onRemove={(id) => onRemoveRow('params', id)}
              />
            </ScrollArea>
          )}

          {tab === 'headers' && (
            <ScrollArea className="h-full">
              <KeyValueEditor
                rows={draft.headers}
                labels={[t('composer.headerKey'), t('composer.headerValue')]}
                keyPlaceholder="Authorization"
                valuePlaceholder="Bearer ..."
                emptyText={t('composer.noHeaders')}
                onAdd={() => onAddRow('headers')}
                onChange={(id, patch) => onUpdateRow('headers', id, patch)}
                onToggle={(id) => onToggleRow('headers', id)}
                onRemove={(id) => onRemoveRow('headers', id)}
              />
            </ScrollArea>
          )}

          {tab === 'body' && (
            <div className="flex h-full flex-col gap-3">
              {bodyDisabled ? (
                <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-3 text-xs text-muted-foreground">
                  <CircleAlert size={14} />
                  {t('composer.bodyDisabled', { method: draft.method })}
                </div>
              ) : (
                <>
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                    <ToggleGroup
                      aria-label={t('composer.bodyType')}
                      className="flex-wrap"
                      value={[draft.bodyMode]}
                      onValueChange={(value) => {
                        const next = value[0]
                        if (next) onFieldChange({ bodyMode: next as BodyMode })
                      }}
                    >
                      {BODY_MODES.map((mode) => (
                        <ToggleGroupItem key={mode.value} value={mode.value}>
                          {mode.label}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>

                    {draft.bodyMode === 'json' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!draft.bodyText.trim()}
                        onClick={handleFormatJson}
                      >
                        <Braces /> {t('composer.format')}
                      </Button>
                    )}
                  </div>

                  <div className="min-h-0 flex-1">
                    {draft.bodyMode === 'none' && (
                      <p className="rounded-md bg-muted/50 px-3 py-3 text-xs text-muted-foreground">
                        {t('composer.noBody')}
                      </p>
                    )}

                    {(draft.bodyMode === 'json' || draft.bodyMode === 'text') && (
                      <div className="flex h-full flex-col gap-2">
                        <CodeEditor
                          ref={editorRef}
                          value={draft.bodyText}
                          onChange={(text) => {
                            onFieldChange({ bodyText: text })
                            setJsonError(null)
                          }}
                          language={draft.bodyMode === 'json' ? 'json' : 'text'}
                          placeholder={
                            draft.bodyMode === 'json'
                              ? '{ "name": "Ada" }'
                              : t('composer.bodyPlaceholder')
                          }
                          ariaLabel={t('composer.body')}
                          minHeight={0}
                          className="min-h-0 flex-1"
                        />
                        {jsonError && (
                          <p className="shrink-0 text-xs text-destructive" role="alert">
                            {jsonError}
                          </p>
                        )}
                      </div>
                    )}

                    {draft.bodyMode === 'x-www-form-urlencoded' && (
                      <ScrollArea className="h-full">
                        <KeyValueEditor
                          rows={draft.formFields}
                          labels={[t('composer.formKey'), t('composer.formValue')]}
                          keyPlaceholder="name"
                          valuePlaceholder="Ada"
                          emptyText={t('composer.noFormFields')}
                          onAdd={() => onAddRow('formFields')}
                          onChange={(id, patch) => onUpdateRow('formFields', id, patch)}
                          onToggle={(id) => onToggleRow('formFields', id)}
                          onRemove={(id) => onRemoveRow('formFields', id)}
                        />
                      </ScrollArea>
                    )}

                    {draft.bodyMode === 'form-data' && (
                      <FormDataEditor
                        rows={draft.formData}
                        onAdd={onAddFormRow}
                        onChange={(id, patch) => onUpdateFormRow(id, patch)}
                        onChangeKind={(id, kind: FormFieldKind) => onUpdateFormRow(id, { kind })}
                        onToggle={onToggleFormRow}
                        onRemove={onRemoveFormRow}
                        onAssignFiles={onAssignFormFiles}
                        onClearFile={onClearFormFile}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
