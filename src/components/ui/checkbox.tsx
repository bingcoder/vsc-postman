import * as React from 'react'
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox'
import { cn } from '@/lib/utils'

export interface CheckboxProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'onChange'> {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  name?: string
  value?: string
  id?: string
  className?: string
  'aria-label'?: string
}

const Checkbox = React.forwardRef<HTMLSpanElement, CheckboxProps>(
  (
    {
      checked,
      defaultChecked,
      onCheckedChange,
      disabled,
      readOnly,
      required,
      name,
      value,
      id,
      className,
      ...props
    },
    ref
  ) => (
    <BaseCheckbox.Root
      ref={ref}
      id={id}
      name={name}
      value={value}
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      className={cn(
        'flex size-3.5 shrink-0 items-center justify-center rounded-sm border border-input bg-background text-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 data-checked:border-foreground data-checked:bg-foreground data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className
      )}
      aria-label={props['aria-label']}
    >
      <BaseCheckbox.Indicator className="flex data-unchecked:hidden">
        <svg
          width="9"
          height="9"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ display: 'block' }}
        >
          <path d="m2.5 8.5 4 4 7-9" />
        </svg>
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  )
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
