import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ArrowLeft, Check, Copy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip } from '@/components/ui/tooltip'
import { useT } from '@/hooks/use-i18n'
import { copyText } from '@/lib/clipboard'
import { detectRuntime } from '@/lib/runtime'
import { getStorageAdapter, STORAGE_KEYS } from '@/services/storage'

type Entry =
  { key: string; parsed: unknown; raw: string; error: false } | { key: string; error: true }

function tryParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export function StoragePage() {
  const { t } = useT()
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<Entry[]>([])
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const isVscode = detectRuntime() === 'vscode-webview'

  useEffect(() => {
    let cancelled = false
    const adapter = getStorageAdapter()

    void (async () => {
      const results: Entry[] = []
      for (const key of STORAGE_KEYS) {
        const raw = await adapter.getItem(key)
        if (raw === null || raw === undefined) continue
        results.push({ key, raw, parsed: tryParse(raw), error: false })
      }
      if (cancelled) return
      setEntries(results)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const handleCopy = async (entry: Extract<Entry, { error: false }>) => {
    const ok = await copyText(JSON.stringify(entry.parsed, null, 2))
    if (!ok) return
    setCopiedKey(entry.key)
    setTimeout(() => setCopiedKey((current) => (current === entry.key ? null : current)), 1500)
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 md:py-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{t('storage.eyebrow')}</p>
          <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-tight">
            {t('storage.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t('storage.intro')}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <NavLink to="/settings">
            <ArrowLeft />
            {t('storage.back')}
          </NavLink>
        </Button>
      </div>

      {isVscode && (
        <Card>
          <CardHeader>
            <CardTitle>{t('storage.vscodeTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t('storage.vscodeNote')}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          {t('storage.loading')}
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t('storage.empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) =>
            entry.error ? null : (
              <Card key={entry.key}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div className="min-w-0">
                    <CardTitle className="truncate font-mono text-sm">{entry.key}</CardTitle>
                    <CardDescription>{entry.raw.length.toLocaleString()} bytes</CardDescription>
                  </div>
                  <Tooltip
                    content={copiedKey === entry.key ? t('storage.copied') : t('storage.copy')}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('storage.copy')}
                      onClick={() => handleCopy(entry)}
                    >
                      {copiedKey === entry.key ? <Check /> : <Copy />}
                    </Button>
                  </Tooltip>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-5 text-foreground">
                    {JSON.stringify(entry.parsed, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}
    </div>
  )
}
