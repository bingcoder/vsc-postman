import { useState } from 'react'
import { useT } from '@/hooks/use-i18n'
import { CircleAlert, List, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose
} from '@/components/ui/dialog'
import type { Collection } from '@/types/http'

export type SaveRequestInput = {
  name: string
  collectionId: string
  newCollectionName: string | null
}

type SaveRequestDialogProps = {
  collections: Collection[]
  defaultName: string
  defaultCollectionId: string
  onClose: () => void
  onSave: (input: SaveRequestInput) => void
}

export function SaveRequestDialog({
  collections,
  defaultName,
  defaultCollectionId,
  onClose,
  onSave
}: SaveRequestDialogProps) {
  const [name, setName] = useState(defaultName)
  const [collectionId, setCollectionId] = useState(defaultCollectionId || collections[0]?.id || '')
  const [creatingCollection, setCreatingCollection] = useState(collections.length === 0)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { t } = useT()

  const handleSubmit = () => {
    if (creatingCollection) {
      const trimmedCollection = newCollectionName.trim()
      if (!trimmedCollection) {
        setError(t('saveDialog.error.noCollectionName'))
        return
      }
      onSave({
        name: name.trim() || defaultName,
        collectionId: '',
        newCollectionName: trimmedCollection
      })
      return
    }

    if (!collectionId) {
      setError(t('saveDialog.error.noCollection'))
      return
    }

    onSave({
      name: name.trim() || defaultName,
      collectionId,
      newCollectionName: null
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div>
            <DialogTitle>{t('saveDialog.title')}</DialogTitle>
            <DialogDescription>{t('saveDialog.desc')}</DialogDescription>
          </div>
          <DialogClose />
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            handleSubmit()
          }}
        >
          <div className="space-y-1.5">
            <label
              htmlFor="save-request-name"
              className="text-xs font-medium text-muted-foreground"
            >
              {t('saveDialog.name')}
            </label>
            <Input
              id="save-request-name"
              autoFocus
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setError(null)
              }}
              aria-label={t('saveDialog.requestName')}
              placeholder={t('saveDialog.requestName')}
              className="border-border bg-background focus-visible:border-focus/40"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor={
                  creatingCollection ? 'save-request-new-collection' : 'save-request-collection'
                }
                className="text-xs font-medium text-muted-foreground"
              >
                {t('saveDialog.collection')}
              </label>
              {collections.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={
                    creatingCollection
                      ? t('saveDialog.switchToSelect')
                      : t('saveDialog.switchToNew')
                  }
                  className="-mr-1.5 h-6 shrink-0 gap-1 rounded-sm px-1.5 py-0 text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-3"
                  onClick={() => {
                    setCreatingCollection((value) => !value)
                    setError(null)
                  }}
                >
                  {creatingCollection ? <List size={12} /> : <Plus size={12} />}
                  {creatingCollection
                    ? t('saveDialog.selectCollection')
                    : t('saveDialog.newCollection')}
                </Button>
              )}
            </div>

            {creatingCollection ? (
              <Input
                id="save-request-new-collection"
                value={newCollectionName}
                onChange={(event) => {
                  setNewCollectionName(event.target.value)
                  setError(null)
                }}
                aria-label={t('saveDialog.newName')}
                aria-invalid={Boolean(error)}
                placeholder={t('saveDialog.collectionPlaceholder')}
                className="border-border bg-background focus-visible:border-focus/40"
              />
            ) : (
              <Select
                id="save-request-collection"
                value={collectionId}
                onValueChange={(value) => {
                  setCollectionId(value ?? '')
                  setError(null)
                }}
                options={collections.map((collection) => ({
                  value: collection.id,
                  label: collection.name
                }))}
                aria-label={t('saveDialog.saveToCollection')}
                triggerClassName="border-border focus-visible:border-focus/40"
              />
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md bg-destructive/8 px-2.5 py-2 text-xs text-destructive"
            >
              <CircleAlert size={14} className="mt-px shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="min-w-20">
              {t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
