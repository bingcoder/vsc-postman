import { type MouseEventHandler, type ReactNode } from 'react'
import { Separator } from 'react-resizable-panels'
import { cn } from '@/lib/utils'

type ResizeHandleProps = {
  /** 与 Group 的 orientation 一致：horizontal 为竖条。 */
  direction: 'horizontal' | 'vertical'
  label?: string
  /** 禁用库内置双击复位。 */
  disableReset?: boolean
  /** 自定义双击行为（配合 disableReset）。 */
  onDoubleClick?: MouseEventHandler<HTMLDivElement>
  className?: string
  /** 自定义内部视觉。 */
  children?: ReactNode
  /** 极简形态：仅一条 1px 细线，命中区由库虚拟扩展。 */
  thin?: boolean
}

/** 分栏手柄：交互语义由库提供，这里只管外观。 */
export function ResizeHandle({
  direction,
  label,
  disableReset,
  onDoubleClick,
  className,
  children,
  thin
}: ResizeHandleProps) {
  const isVertical = direction === 'vertical'

  return (
    <Separator
      aria-label={label}
      disableDoubleClick={disableReset}
      onDoubleClick={onDoubleClick}
      className={cn(
        'group relative z-10 flex items-center justify-center select-none focus-visible:outline-none',
        // 命中区尺寸；flex-grow/shrink 由库接管。
        isVertical
          ? 'h-4 cursor-row-resize'
          : thin
            ? 'w-px cursor-col-resize'
            : 'w-4 cursor-col-resize',
        className
      )}
    >
      {children ??
        (thin ? (
          <span
            aria-hidden="true"
            className={cn(
              'transition-colors duration-150',
              isVertical ? 'h-px w-full' : 'h-full w-px',
              'bg-border group-hover:bg-subtle-foreground/35 group-focus-visible:bg-focus/60 group-focus-visible:ring-1 group-focus-visible:ring-focus/20 group-active:bg-focus/60 group-active:ring-1 group-active:ring-focus/20'
            )}
          />
        ) : (
          <>
            <span
              aria-hidden="true"
              className={cn(
                'transition-colors duration-150',
                isVertical ? 'h-px w-full' : 'h-full w-px',
                'bg-border group-hover:bg-subtle-foreground/35 group-focus-visible:bg-focus/60 group-focus-visible:ring-1 group-focus-visible:ring-focus/20 group-active:bg-focus/60 group-active:ring-1 group-active:ring-focus/20'
              )}
            />
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute rounded-sm transition-colors duration-150',
                isVertical
                  ? 'top-1/2 left-1/2 h-[3px] w-9 -translate-x-1/2 -translate-y-1/2'
                  : 'top-1/2 left-1/2 h-9 w-[3px] -translate-x-1/2 -translate-y-1/2',
                'bg-subtle-foreground/35 group-hover:bg-subtle-foreground/55 group-focus-visible:bg-focus/70 group-active:bg-focus/70'
              )}
            />
          </>
        ))}
    </Separator>
  )
}
