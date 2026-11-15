import * as React from 'react'
import { X } from 'lucide-react'
import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useT } from '@/hooks/use-i18n'

export interface DialogProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

/** 受控弹窗外壳：Root + Portal + Backdrop。 */
export function Dialog({ open, defaultOpen, onOpenChange, children }: DialogProps) {
  return (
    <BaseDialog.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-black/25 backdrop-blur-[1px] transition-opacity duration-150 data-starting-style:opacity-0 data-ending-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute" />
        {children}
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}

export type DialogContentProps = React.HTMLAttributes<HTMLDivElement>

export function DialogContent({ className, children, ...props }: DialogContentProps) {
  return (
    <BaseDialog.Popup
      className={cn(
        'fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border border-border bg-background p-5 text-foreground shadow-popover transition-[scale,opacity] duration-150 ease-out data-starting-style:scale-[0.98] data-starting-style:opacity-0 data-ending-style:scale-[0.98] data-ending-style:opacity-0',
        className
      )}
      {...(props as React.HTMLAttributes<HTMLDivElement>)}
    >
      {children}
    </BaseDialog.Popup>
  )
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-3', className)} {...props} />
}

export function DialogTitle({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <BaseDialog.Title className={cn('text-base font-semibold', className)}>
        {children}
      </BaseDialog.Title>
    </div>
  )
}

export function DialogDescription({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <BaseDialog.Description className={cn('text-sm text-muted-foreground', className)}>
      {children}
    </BaseDialog.Description>
  )
}

export function DialogClose({ className }: { className?: string }) {
  const { t } = useT()
  return (
    <BaseDialog.Close
      render={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn('size-8 shrink-0', className)}
          aria-label={t('common.close')}
        />
      }
    >
      <X />
    </BaseDialog.Close>
  )
}
