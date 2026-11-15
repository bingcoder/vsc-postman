import * as React from 'react'
import { ToggleGroup as BaseToggleGroup } from '@base-ui/react/toggle-group'
import { Toggle } from '@base-ui/react/toggle'
import { cn } from '@/lib/utils'

export interface ToggleGroupProps {
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (value: string[]) => void
  disabled?: boolean
  className?: string
  'aria-label'?: string
  children: React.ReactNode
}

export function ToggleGroup({
  value,
  defaultValue,
  onValueChange,
  disabled,
  className,
  children,
  ...props
}: ToggleGroupProps) {
  return (
    <BaseToggleGroup
      value={value}
      defaultValue={defaultValue}
      onValueChange={(v) => onValueChange?.(v)}
      disabled={disabled}
      className={cn('inline-flex rounded-md bg-muted p-0.5', className)}
      aria-label={props['aria-label']}
    >
      {children}
    </BaseToggleGroup>
  )
}

export interface ToggleGroupItemProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'value'
> {
  value: string
}

export function ToggleGroupItem({ value, className, children, ...props }: ToggleGroupItemProps) {
  return (
    <Toggle
      value={value}
      className={cn(
        'rounded-sm px-2.5 py-1 text-xs transition-colors hover:text-foreground focus-visible:outline-none data-pressed:bg-background data-pressed:font-medium data-pressed:text-foreground',
        className
      )}
      {...props}
    >
      {children}
    </Toggle>
  )
}
