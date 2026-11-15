import type * as React from 'react'
import { Tooltip } from '@/components/ui/tooltip'
import { methodTextTone, statusTextTone } from '@/lib/format'
import { useT } from '@/hooks/use-i18n'
import { cn } from '@/lib/utils'
import type { HttpMethod } from '@/types/http'

type RequestTooltipProps = {
  method: HttpMethod
  url: string
  /** 状态码，null 表示失败。 */
  status?: number | null
  /** 请求时间。 */
  time?: string
  /** 失败原因。 */
  error?: string
  children: React.ReactElement
}

/** 请求行悬浮提示；触发元素仍需 aria-label。 */
export function RequestTooltip({
  method,
  url,
  status,
  time,
  error,
  children
}: RequestTooltipProps) {
  const { t } = useT()
  return (
    <Tooltip
      side="right"
      sideOffset={8}
      className="max-w-80 px-2 py-1.5"
      content={
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className={cn('text-[11px] font-semibold tracking-wide', methodTextTone(method))}>
              {method}
            </span>
            {status !== undefined && (
              <span
                className={cn(
                  'text-[11px] font-medium tabular-nums',
                  status === null ? 'text-destructive' : statusTextTone(status)
                )}
              >
                {status ?? t('common.failed')}
              </span>
            )}
            {time && (
              <span className="ml-auto shrink-0 pl-2 text-[11px] tabular-nums text-subtle-foreground">
                {time}
              </span>
            )}
          </div>

          <span
            className={cn(
              'font-mono text-[11px] leading-4 break-all',
              url ? 'text-muted-foreground' : 'text-subtle-foreground'
            )}
          >
            {url || t('tooltip.noUrl')}
          </span>

          {error && (
            <span className="text-[11px] leading-4 break-words text-destructive">{error}</span>
          )}
        </div>
      }
    >
      {children}
    </Tooltip>
  )
}
