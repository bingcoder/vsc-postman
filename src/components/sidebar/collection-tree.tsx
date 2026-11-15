import { useState } from 'react'
import { useT } from '@/hooks/use-i18n'
import {
  Check,
  ChevronRight,
  Copy,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip } from '@/components/ui/tooltip'
import { RequestTooltip } from '@/components/sidebar/request-tooltip'
import { methodAbbr, methodTextTone } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Collection } from '@/types/http'

type CollectionTreeProps = {
  collections: Collection[]
  activeRequestId: string | null
  searchQuery: string
  /** 窄容器用覆盖式行尾操作，避免挤占标题。 */
  overlayActions: boolean
  onLoadRequest: (collectionId: string, requestId: string) => void
  onRemoveRequest: (collectionId: string, requestId: string) => void
  onDuplicateRequest: (collectionId: string, requestId: string) => void
  onCreateCollection: (name: string) => void
  onRenameCollection: (id: string, name: string) => void
  onDeleteCollection: (id: string) => void
}

export function CollectionTree({
  collections,
  activeRequestId,
  searchQuery,
  overlayActions,
  onLoadRequest,
  onRemoveRequest,
  onDuplicateRequest,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection
}: CollectionTreeProps) {
  const { t } = useT()
  const [collapsedIds, setCollapsedIds] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const isSearching = searchQuery.trim().length > 0

  const isExpanded = (id: string) => isSearching || !collapsedIds.includes(id)

  const toggleCollection = (id: string) => {
    if (isSearching) return
    setCollapsedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    )
  }

  const submitNewCollection = () => {
    const trimmed = newName.trim()
    if (trimmed) onCreateCollection(trimmed)
    setCreating(false)
    setNewName('')
  }

  const cancelNewCollection = () => {
    setCreating(false)
    setNewName('')
  }

  const startRename = (collection: Collection) => {
    setEditingId(collection.id)
    setEditingName(collection.name)
  }

  const submitRename = () => {
    if (editingId) onRenameCollection(editingId, editingName)
    setEditingId(null)
    setEditingName('')
  }

  const cancelRename = () => {
    setEditingId(null)
    setEditingName('')
  }

  return (
    <section aria-label={t('collection.title')} className="flex h-full min-h-0 flex-col px-2">
      <div className="flex shrink-0 items-center justify-between px-1.5 pb-1 pt-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t('collection.title')}</span>
        <Tooltip content={t('collection.new')}>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-label={t('collection.new')}
            onClick={() => {
              setCreating(true)
              setNewName('')
            }}
            className="text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <Plus size={14} />
          </Button>
        </Tooltip>
      </div>

      {creating && (
        <form
          className="flex shrink-0 items-center gap-1 px-1 py-1"
          onSubmit={(event) => {
            event.preventDefault()
            submitNewCollection()
          }}
        >
          <FolderPlus size={14} className="shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') cancelNewCollection()
            }}
            placeholder={t('collection.namePlaceholder')}
            aria-label={t('collection.newName')}
            className="h-7 min-w-0 flex-1 rounded-md border border-transparent bg-background px-1.5 text-sm shadow-none placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-focus/20"
          />
          <Button
            type="submit"
            variant="ghost"
            size="xs"
            aria-label={t('collection.create')}
            className="text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <Check size={14} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-label={t('collection.cancelCreate')}
            onClick={cancelNewCollection}
            className="text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <X size={14} />
          </Button>
        </form>
      )}

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-2">
        {collections.length === 0 && (
          <p className="px-1.5 py-1.5 text-xs text-muted-foreground">
            {isSearching ? t('collection.noMatch') : t('collection.empty')}
          </p>
        )}

        {collections.map((collection) => {
          const expanded = isExpanded(collection.id)

          return (
            <div key={collection.id}>
              <div className="group/collection relative flex items-center gap-0.5 rounded-sm px-1 hover:bg-sidebar-accent">
                <Tooltip
                  content={
                    expanded
                      ? t('collection.collapse', { name: collection.name })
                      : t('collection.expand', { name: collection.name })
                  }
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => toggleCollection(collection.id)}
                    aria-label={
                      expanded
                        ? t('collection.collapseAria', { name: collection.name })
                        : t('collection.expandAria', { name: collection.name })
                    }
                    aria-expanded={expanded}
                    className="size-6 text-muted-foreground hover:bg-transparent hover:text-foreground"
                  >
                    <ChevronRight
                      size={13}
                      className={cn('transition-transform', expanded && 'rotate-90')}
                    />
                  </Button>
                </Tooltip>

                {editingId === collection.id ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-0.5 py-1"
                    onSubmit={(event) => {
                      event.preventDefault()
                      submitRename()
                    }}
                  >
                    <Input
                      autoFocus
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') cancelRename()
                      }}
                      aria-label={t('collection.nameAria')}
                      className="h-7 min-w-0 flex-1 rounded-md border border-transparent bg-background px-1.5 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-focus/20"
                    />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="xs"
                      aria-label={t('collection.confirmRename')}
                      className="text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <Check size={13} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      aria-label={t('collection.cancelRename')}
                      onClick={cancelRename}
                      className="text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <X size={13} />
                    </Button>
                  </form>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => toggleCollection(collection.id)}
                      className="h-auto min-w-0 flex-1 justify-start gap-1.5 rounded-md py-1 text-left text-sm hover:bg-transparent px-0"
                    >
                      {expanded ? (
                        <FolderOpen size={14} className="shrink-0 text-muted-foreground" />
                      ) : (
                        <Folder size={14} className="shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{collection.name}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {collection.requests.length}
                      </span>
                    </Button>
                    <div
                      className={cn(
                        'flex items-center gap-0.5 transition-opacity',
                        overlayActions &&
                          'absolute inset-y-0 right-0 bg-linear-to-l from-sidebar-accent via-sidebar-accent to-transparent pl-7 pr-1 pointer-events-none opacity-0 group-hover/collection:pointer-events-auto group-hover/collection:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100'
                      )}
                    >
                      <Tooltip content={t('collection.rename', { name: collection.name })}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          aria-label={t('collection.renameAria', { name: collection.name })}
                          onClick={() => startRename(collection)}
                          className="text-muted-foreground hover:bg-background hover:text-foreground"
                        >
                          <Pencil size={12} />
                        </Button>
                      </Tooltip>
                      <Tooltip content={t('collection.delete', { name: collection.name })}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          aria-label={t('collection.deleteAria', { name: collection.name })}
                          onClick={() =>
                            setPendingDeleteId((current) =>
                              current === collection.id ? null : collection.id
                            )
                          }
                          className="text-muted-foreground hover:bg-background hover:text-destructive"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </Tooltip>
                    </div>
                  </>
                )}
              </div>

              {expanded && (
                <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-1.5">
                  {collection.requests.length === 0 && (
                    <li className="px-1.5 py-1 text-xs text-muted-foreground">
                      {t('collection.emptyCollection')}
                    </li>
                  )}
                  {collection.requests.map((request) => {
                    const active = request.id === activeRequestId

                    return (
                      <li key={request.id}>
                        <div
                          className={cn(
                            'group/request relative flex items-center gap-1 rounded-sm hover:bg-sidebar-accent',
                            active && 'bg-sidebar-accent'
                          )}
                        >
                          <RequestTooltip method={request.method} url={request.url}>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => onLoadRequest(collection.id, request.id)}
                              aria-label={t('collection.openRequest', { name: request.name })}
                              className={cn(
                                'h-auto min-w-0 flex-1 justify-start gap-1.5 rounded-sm px-1.5 py-1 text-left text-sm hover:bg-transparent',
                                active && 'font-medium'
                              )}
                            >
                              <span
                                className={cn(
                                  'shrink-0 font-mono text-[10px] font-bold tabular-nums',
                                  methodTextTone(request.method)
                                )}
                              >
                                {methodAbbr(request.method)}
                              </span>
                              <span className="truncate">{request.name}</span>
                            </Button>
                          </RequestTooltip>
                          <div
                            className={cn(
                              'flex items-center gap-0.5 transition-opacity',
                              overlayActions &&
                                'absolute inset-y-0 right-0 bg-linear-to-l from-sidebar-accent via-sidebar-accent to-transparent pl-7 pr-1 pointer-events-none opacity-0 group-hover/request:pointer-events-auto group-hover/request:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100'
                            )}
                          >
                            <Tooltip content={t('collection.copyRequest', { name: request.name })}>
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                onClick={() => onDuplicateRequest(collection.id, request.id)}
                                aria-label={t('collection.copyRequestAria', { name: request.name })}
                                className="text-muted-foreground hover:bg-background hover:text-foreground"
                              >
                                <Copy size={12} />
                              </Button>
                            </Tooltip>
                            <Tooltip
                              content={t('collection.deleteRequest', { name: request.name })}
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                onClick={() => onRemoveRequest(collection.id, request.id)}
                                aria-label={t('collection.deleteRequestAria', {
                                  name: request.name
                                })}
                                className="text-muted-foreground hover:bg-background hover:text-destructive"
                              >
                                <Trash2 size={12} />
                              </Button>
                            </Tooltip>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}

              {pendingDeleteId === collection.id && (
                <div className="ml-4 mt-1 rounded-md border border-sidebar-border bg-background p-1.5">
                  <p className="text-xs text-muted-foreground">
                    {t('collection.confirmDelete', {
                      name: collection.name,
                      count: collection.requests.length
                    })}
                  </p>
                  <div className="mt-2 flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingDeleteId(null)}
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        onDeleteCollection(collection.id)
                        setPendingDeleteId(null)
                      }}
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
