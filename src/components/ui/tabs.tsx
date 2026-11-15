import * as React from 'react'
import { Tabs as BaseTabs } from '@base-ui/react/tabs'
import { cn } from '@/lib/utils'

export interface TabsProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  className?: string
  children: React.ReactNode
}

export function Tabs({ value, defaultValue, onValueChange, className, children }: TabsProps) {
  return (
    <BaseTabs.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={(v) => onValueChange?.(v)}
      className={className}
    >
      {children}
    </BaseTabs.Root>
  )
}

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <BaseTabs.List
      className={cn('relative flex items-center gap-1', className)}
      {...(props as React.HTMLAttributes<HTMLDivElement>)}
    />
  )
}

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

export function TabsTrigger({ value, className, children, ...props }: TabsTriggerProps) {
  return (
    <BaseTabs.Tab
      value={value}
      className={cn(
        '-mb-px inline-flex items-center gap-1 border-b-2 border-transparent px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none data-active:border-foreground data-active:font-medium data-active:text-foreground',
        className
      )}
      {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </BaseTabs.Tab>
  )
}

export function TabsIndicator({ className }: { className?: string }) {
  return (
    <BaseTabs.Indicator
      className={cn(
        'pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-foreground transition-all duration-200 ease-out',
        className
      )}
    />
  )
}

export function TabsPanel({
  value,
  className,
  children,
  keepMounted
}: {
  value: string
  className?: string
  children: React.ReactNode
  keepMounted?: boolean
}) {
  return (
    <BaseTabs.Panel value={value} keepMounted={keepMounted} className={className}>
      {children}
    </BaseTabs.Panel>
  )
}
