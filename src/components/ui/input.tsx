import * as React from 'react'
import { Input as BaseInput } from '@base-ui/react/input'
import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <BaseInput
      ref={ref}
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-transparent bg-background px-3 py-2 text-sm transition-colors placeholder:text-subtle-foreground focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/25 disabled:cursor-not-allowed disabled:opacity-50 data-disabled:cursor-not-allowed data-disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export { Input }
