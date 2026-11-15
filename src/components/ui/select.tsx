import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { Select as BaseSelect } from '@base-ui/react/select'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const triggerVariants = cva(
  'flex w-full items-center justify-between gap-2 rounded-md border border-transparent bg-background text-sm transition-colors focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/25 disabled:cursor-not-allowed disabled:opacity-50 data-disabled:cursor-not-allowed data-disabled:opacity-50',
  {
    variants: {
      size: {
        default: 'h-10 px-3 py-2',
        sm: 'h-8 px-3 text-xs font-semibold'
      }
    },
    defaultVariants: { size: 'default' }
  }
)

export type SelectOption = { value: string; label: string }

export interface SelectProps
  extends
    Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'>,
    VariantProps<typeof triggerVariants> {
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (value: string | null) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  name?: string
  id?: string
  triggerClassName?: string
}

export function Select({
  value,
  defaultValue,
  onValueChange,
  options,
  placeholder,
  disabled,
  name,
  id,
  size,
  className,
  triggerClassName,
  ...props
}: SelectProps) {
  const items = React.useMemo(() => {
    const list = placeholder ? [{ value: null, label: placeholder }, ...options] : options
    return list.map((o) => ({ value: o.value, label: o.label }))
  }, [options, placeholder])

  return (
    <BaseSelect.Root
      id={id}
      name={name}
      value={value ?? undefined}
      defaultValue={defaultValue ?? undefined}
      onValueChange={(v) => onValueChange?.(v)}
      items={items}
      disabled={disabled}
    >
      <BaseSelect.Trigger
        className={cn(triggerVariants({ size }), triggerClassName, className)}
        aria-label={props['aria-label']}
      >
        <BaseSelect.Value
          className="data-placeholder:text-muted-foreground"
          placeholder={placeholder}
        >
          {(val: string | null) => {
            const matched = options.find((o) => o.value === val)
            return matched ? matched.label : (val ?? '')
          }}
        </BaseSelect.Value>
        <BaseSelect.Icon className="shrink-0 text-muted-foreground">
          <ChevronDown size={size === 'sm' ? 12 : 16} />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          className="z-50 outline-none"
          sideOffset={4}
          alignItemWithTrigger={false}
        >
          <BaseSelect.Popup className="max-h-[var(--available-height)] min-w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-popover outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            <BaseSelect.List className="relative">
              {placeholder && (
                <BaseSelect.Item
                  value={null}
                  className="grid cursor-pointer grid-cols-[1rem_1fr] items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <BaseSelect.ItemIndicator className="col-start-1 text-foreground">
                    <Check />
                  </BaseSelect.ItemIndicator>
                  <BaseSelect.ItemText className="col-start-2 text-muted-foreground">
                    {placeholder}
                  </BaseSelect.ItemText>
                </BaseSelect.Item>
              )}
              {options.map((option) => (
                <BaseSelect.Item
                  key={option.value}
                  value={option.value}
                  className="grid cursor-pointer grid-cols-[1rem_1fr] items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <BaseSelect.ItemIndicator className="col-start-1 text-foreground">
                    <Check />
                  </BaseSelect.ItemIndicator>
                  <BaseSelect.ItemText className="col-start-2">{option.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}

function Check() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block' }}
    >
      <path d="m2.5 8.5 4 4 7-9" />
    </svg>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export { triggerVariants as selectTriggerVariants }
