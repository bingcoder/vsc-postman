import { useMemo, useState } from 'react'
import { Save } from 'lucide-react'
import { Group, Panel, type Layout } from 'react-resizable-panels'
import { Button } from '@/components/ui/button'
import { ResizeHandle } from '@/components/common/resize-handle'
import { RequestComposer } from '@/components/http/request-composer'
import { ResponseViewer } from '@/components/http/response-viewer'
import { SaveRequestDialog, type SaveRequestInput } from '@/components/http/save-request-dialog'
import { useT } from '@/hooks/use-i18n'
import { useIsVscode } from '@/hooks/use-runtime'
import { createPanelLayoutStore } from '@/lib/panel-layout-store'
import { useVscPostmanStore } from '@/stores/http-store'
import { cn } from '@/lib/utils'
import { isResponseActive } from '@/types/http'

export function VscPostmanPage() {
  const draft = useVscPostmanStore((state) => state.draft)
  const response = useVscPostmanStore((state) => state.response)
  const uploadProgress = useVscPostmanStore((state) => state.uploadProgress)
  const collections = useVscPostmanStore((state) => state.collections)
  const setDraftField = useVscPostmanStore((state) => state.setDraftField)
  const addRow = useVscPostmanStore((state) => state.addRow)
  const updateRow = useVscPostmanStore((state) => state.updateRow)
  const removeRow = useVscPostmanStore((state) => state.removeRow)
  const toggleRow = useVscPostmanStore((state) => state.toggleRow)
  const addFormRow = useVscPostmanStore((state) => state.addFormRow)
  const updateFormRow = useVscPostmanStore((state) => state.updateFormRow)
  const toggleFormRow = useVscPostmanStore((state) => state.toggleFormRow)
  const removeFormRow = useVscPostmanStore((state) => state.removeFormRow)
  const assignFormFiles = useVscPostmanStore((state) => state.assignFormFiles)
  const clearFormFile = useVscPostmanStore((state) => state.clearFormFile)
  const send = useVscPostmanStore((state) => state.send)
  const cancel = useVscPostmanStore((state) => state.cancel)
  const createCollection = useVscPostmanStore((state) => state.createCollection)
  const saveCurrent = useVscPostmanStore((state) => state.saveCurrent)

  const [saveOpen, setSaveOpen] = useState(false)
  const { t } = useT()
  const isVscode = useIsVscode()

  const active = isResponseActive(response)
  const permissionDenied =
    response.status === 'error' && response.error.code === 'permission-denied'

  const permissionHost = useMemo(() => {
    const raw = draft.url.trim()
    if (!raw) return ''
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `http://${raw}`
    try {
      return new URL(withScheme).host
    } catch {
      return raw
    }
  }, [draft.url])

  // 上下分栏布局持久化。
  const RESPONSE_LAYOUT_KEY = 'vsc-postman:response-pane-layout'
  const responseLayoutStore = useMemo(() => createPanelLayoutStore(RESPONSE_LAYOUT_KEY), [])
  const defaultResponseLayout = useMemo<Layout | undefined>(
    () => responseLayoutStore.read() ?? undefined,
    [responseLayoutStore]
  )

  const currentCollectionId = useMemo(() => {
    const found = collections.find((collection) =>
      collection.requests.some((request) => request.id === draft.id)
    )
    return found?.id ?? collections[0]?.id ?? ''
  }, [collections, draft.id])

  const handleSave = (input: SaveRequestInput) => {
    const targetId = input.newCollectionName
      ? createCollection(input.newCollectionName)
      : input.collectionId
    if (!targetId) return

    saveCurrent(input.name, targetId)
    setSaveOpen(false)
  }

  return (
    <div className={cn('flex flex-col', isVscode ? 'h-dvh' : 'h-[calc(100dvh-3rem)] md:h-dvh')}>
      <header className="z-20 flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background p-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="shrink-0 text-muted-foreground">{t('page.eyebrow')}</span>
          <span className="text-subtle-foreground" aria-hidden="true">
            /
          </span>
          <span className="truncate font-medium">{draft.name || t('page.unnamedRequest')}</span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSaveOpen(true)}
            disabled={!draft.url.trim()}
            aria-label={t('page.saveRequest')}
          >
            <Save /> {t('common.save')}
          </Button>
        </div>
      </header>

      <Group
        orientation="vertical"
        className="min-h-0 flex-1"
        defaultLayout={defaultResponseLayout}
        onLayoutChanged={(layout, meta) => {
          // 仅持久化用户操作。
          if (meta.isUserInteraction) responseLayoutStore.write(layout)
        }}
      >
        <Panel id="request" minSize={200} className="overflow-hidden">
          <RequestComposer
            key={draft.id}
            draft={draft}
            loading={active}
            uploadProgress={uploadProgress}
            permissionDenied={permissionDenied}
            permissionHost={permissionHost}
            onFieldChange={setDraftField}
            onAddRow={addRow}
            onUpdateRow={updateRow}
            onToggleRow={toggleRow}
            onRemoveRow={removeRow}
            onAddFormRow={addFormRow}
            onUpdateFormRow={updateFormRow}
            onToggleFormRow={toggleFormRow}
            onRemoveFormRow={removeFormRow}
            onAssignFormFiles={assignFormFiles}
            onClearFormFile={clearFormFile}
            onSend={send}
            onCancel={cancel}
          />
        </Panel>

        <ResizeHandle direction="vertical" label={t('resizer.label')} />

        <Panel id="response" minSize={180} defaultSize="45" className="overflow-hidden">
          <div
            id="response-pane"
            role="region"
            aria-label={t('page.responseRegion')}
            className="h-full overflow-hidden"
          >
            <ResponseViewer response={response} />
          </div>
        </Panel>
      </Group>

      {saveOpen && (
        <SaveRequestDialog
          collections={collections}
          defaultName={draft.name.trim() || draft.url.trim()}
          defaultCollectionId={currentCollectionId}
          onClose={() => setSaveOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
