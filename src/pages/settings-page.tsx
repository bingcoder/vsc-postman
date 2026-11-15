import { useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { ArrowLeft, Database, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useT } from '@/hooks/use-i18n'
import type { Language } from '@/lib/i18n'
import { useTheme } from '@/hooks/use-theme'
import { useIsVscode } from '@/hooks/use-runtime'
import { focusPanel } from '@/services/bridge/vscode'
import { useAppStore } from '@/stores/app-store'
import { useVscPostmanStore } from '@/stores/http-store'
import { openStorageInVsCode } from '@/services/storage'
import { HISTORY_LIMIT_OPTIONS } from '@/services/vsc-postman/constants'

const APPEARANCE_OPTIONS = ['light', 'dark', 'system'] as const
const LANGUAGE_OPTIONS: Language[] = ['zh', 'en']

export function SettingsPage() {
  const { t, language } = useT()
  const { mode, setMode } = useTheme()
  const setLanguage = useAppStore((state) => state.setLanguage)
  const historyLimit = useVscPostmanStore((state) => state.historyLimit)
  const historyCount = useVscPostmanStore((state) => state.history.length)
  const setHistoryLimit = useVscPostmanStore((state) => state.setHistoryLimit)
  const navigate = useNavigate()
  const [openingStorage, setOpeningStorage] = useState(false)

  const isVscode = useIsVscode()
  // VS Code 下主题由工作台决定，外观切换降级为只读提示。
  const themeLocked = isVscode

  // 兼容旧版本持久化的自定义值。
  const limitOptions = useMemo(
    () => [...new Set<number>([...HISTORY_LIMIT_OPTIONS, historyLimit])].sort((a, b) => a - b),
    [historyLimit]
  )

  const handleOpenStorage = async () => {
    if (isVscode) {
      setOpeningStorage(true)
      try {
        await openStorageInVsCode()
      } catch {
        navigate('/storage')
      } finally {
        setOpeningStorage(false)
      }
      return
    }
    navigate('/storage')
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 md:py-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{t('settings.eyebrow')}</p>
          <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-tight">
            {t('settings.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t('settings.intro')}
          </p>
        </div>
        {isVscode ? (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => void focusPanel().catch(() => undefined)}
          >
            <ArrowLeft />
            {t('settings.back')}
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <NavLink to="/vsc-postman">
              <ArrowLeft />
              {t('settings.back')}
            </NavLink>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.appearance.title')}</CardTitle>
          <CardDescription>{t('settings.appearance.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleGroup
            value={[mode]}
            disabled={themeLocked}
            onValueChange={(value) => {
              // ToggleGroup 是多选语义，取与当前值不同的项。
              const next = value.find((v) => v !== mode)
              if (next === 'light' || next === 'dark' || next === 'system') setMode(next)
            }}
            aria-label={t('settings.appearance.title')}
          >
            {APPEARANCE_OPTIONS.map((option) => (
              <ToggleGroupItem key={option} value={option}>
                {t(`sidebar.appearance.${option}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {themeLocked && (
            <p className="mt-3 text-xs leading-5 text-subtle-foreground">
              {t('settings.appearance.locked')}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.language.title')}</CardTitle>
          <CardDescription>{t('settings.language.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleGroup
            value={[language]}
            onValueChange={(value) => {
              const next = value.find((v) => v !== language)
              if (next === 'zh' || next === 'en') setLanguage(next)
            }}
            aria-label={t('settings.language.title')}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <ToggleGroupItem key={option} value={option}>
                {t(`settings.language.${option}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.history.title')}</CardTitle>
          <CardDescription>{t('settings.history.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleGroup
            value={[String(historyLimit)]}
            onValueChange={(value) => {
              // 同上：取与当前值不同的项。
              const next = value.find((v) => v !== String(historyLimit))
              if (next) setHistoryLimit(Number(next))
            }}
            aria-label={t('settings.history.title')}
          >
            {limitOptions.map((count) => (
              <ToggleGroupItem key={count} value={String(count)}>
                {t('settings.history.option', { count })}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="mt-3 text-sm text-muted-foreground">
            {t('settings.history.current', { count: historyCount })}
          </p>
          <p className="mt-1 text-xs leading-5 text-subtle-foreground">
            {t('settings.history.hint')}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.storage.title')}</CardTitle>
          <CardDescription>{t('settings.storage.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleOpenStorage} disabled={openingStorage}>
            {isVscode ? (
              <>
                <ExternalLink />
                {t('settings.storage.openVscode')}
              </>
            ) : (
              <>
                <Database />
                {t('settings.storage.openWeb')}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
