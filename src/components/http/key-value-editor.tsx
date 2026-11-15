import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { KvRow } from '@/types/http'
import { useT } from '@/hooks/use-i18n'

type KeyValueEditorProps = {
  rows: KvRow[]
  labels?: [string, string]
  keyPlaceholder?: string
  valuePlaceholder?: string
  emptyText?: string
  onAdd: () => void
  onChange: (id: string, patch: Partial<Pick<KvRow, 'key' | 'value'>>) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
}

export function KeyValueEditor({
  rows,
  labels,
  keyPlaceholder = 'key',
  valuePlaceholder = 'value',
  emptyText,
  onAdd,
  onChange,
  onToggle,
  onRemove
}: KeyValueEditorProps) {
  const { t } = useT()
  const resolvedLabels = labels ?? [t('kv.key'), t('kv.value')]
  const resolvedEmpty = emptyText ?? t('kv.empty')
  return (
    <div className="space-y-1">
      {rows.length > 0 ? (
        <>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-2 px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span className="w-3.5" aria-hidden="true" />
            <span>{resolvedLabels[0]}</span>
            <span>{resolvedLabels[1]}</span>
            <span className="w-7" aria-hidden="true" />
          </div>

          <div className="space-y-0.5">
            {rows.map((row) => (
              <div
                key={row.id}
                className="group grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-2 rounded-sm px-2 py-0.5 transition-colors hover:bg-muted/60"
              >
                <Checkbox
                  checked={row.enabled}
                  onCheckedChange={() => onToggle(row.id)}
                  aria-label={t('kv.enable', { name: row.key || t('kv.thisRow') })}
                />
                <Input
                  value={row.key}
                  onChange={(event) => onChange(row.id, { key: event.target.value })}
                  placeholder={keyPlaceholder}
                  aria-label={`${resolvedLabels[0]} ${row.key || ''}`}
                  className="h-8 border-transparent bg-transparent px-1.5 font-mono text-xs shadow-none focus-visible:border-transparent focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-focus/20"
                />
                <Input
                  value={row.value}
                  onChange={(event) => onChange(row.id, { value: event.target.value })}
                  placeholder={valuePlaceholder}
                  aria-label={`${resolvedLabels[1]} ${row.key || ''}`}
                  className="h-8 border-transparent bg-transparent px-1.5 font-mono text-xs shadow-none focus-visible:border-transparent focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-focus/20"
                />
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
            ))}
          </div>
        </>
      ) : (
        <p className="rounded-md bg-muted/50 px-3 py-3 text-center text-xs text-muted-foreground">
          {resolvedEmpty}
        </p>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onAdd}
        className="mt-1 text-muted-foreground"
      >
        <Plus /> {t('common.add')}
      </Button>
    </div>
  )
}
