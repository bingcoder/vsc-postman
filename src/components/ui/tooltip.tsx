import * as React from 'react'
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import { cn } from '@/lib/utils'

export function TooltipProvider({
  children,
  delay = 300,
  closeDelay = 0
}: {
  children: React.ReactNode
  delay?: number
  closeDelay?: number
}) {
  return (
    <BaseTooltip.Provider delay={delay} closeDelay={closeDelay}>
      {children}
    </BaseTooltip.Provider>
  )
}

export interface TooltipProps {
  content: React.ReactNode
  children: React.ReactElement
  side?: 'top' | 'bottom' | 'left' | 'right'
  sideOffset?: number
  disabled?: boolean
  className?: string
}

/** 提示挂在唯一子元素上；触发元素需自带 aria-label。 */
export function Tooltip({
  content,
  children,
  side = 'top',
  sideOffset = 6,
  disabled,
  className
}: TooltipProps) {
  return (
    <BaseTooltip.Root disabled={disabled}>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={sideOffset} className={cn('z-50')}>
          <BaseTooltip.Popup
            className={cn(
              'z-50 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-popover outline-none transition-[transform,opacity] duration-100 ease-out data-starting-style:opacity-0 data-starting-style:scale-[0.98] data-ending-style:opacity-0 data-ending-style:scale-[0.98]',
              className
            )}
          >
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  )
}
