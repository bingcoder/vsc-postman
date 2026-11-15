import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area'
import { cn } from '@/lib/utils'

/** base-ui ScrollArea 是 headless 的，这里补齐 Notion 风格的竖向滚动条样式。 */
function ScrollArea({
  className,
  children,
  viewportRef,
  ...props
}: React.ComponentProps<typeof BaseScrollArea.Root> & {
  viewportRef?: React.Ref<HTMLDivElement>
}) {
  return (
    <BaseScrollArea.Root className={cn('relative overflow-hidden', className)} {...props}>
      <BaseScrollArea.Viewport ref={viewportRef} className="h-full w-full">
        {children}
      </BaseScrollArea.Viewport>
      <BaseScrollArea.Scrollbar
        orientation="vertical"
        className="absolute top-0 right-0 bottom-0 flex w-2 touch-none select-none flex-col p-0.5"
      >
        <BaseScrollArea.Thumb className="rounded-full bg-border transition-colors duration-150 hover:bg-subtle-foreground/45" />
      </BaseScrollArea.Scrollbar>
    </BaseScrollArea.Root>
  )
}

export { ScrollArea }
