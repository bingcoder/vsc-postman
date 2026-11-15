import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { Button as BaseButton } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  // 图标统一 16px：CSS 覆盖 lucide 的 size 属性，需要更小时用尺寸类覆盖。
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-40 data-disabled:pointer-events-none data-disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/85',
        soft: 'bg-primary/10 text-primary hover:bg-primary/15',
        destructive: 'bg-destructive/10 text-destructive hover:bg-destructive/15',
        outline: 'border border-border bg-background text-foreground hover:bg-muted',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
        ghost: 'text-foreground hover:bg-muted',
        link: 'text-foreground underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-8 px-3.5 py-2',
        sm: 'h-7 gap-1.5 px-3 text-xs',
        lg: 'h-9 px-5',
        icon: 'size-8',
        xs: 'size-6 rounded-sm p-1 [&_svg]:size-3.5'
      }
    },
    defaultVariants: { variant: 'default', size: 'default' }
  }
)

export interface ButtonProps
  extends
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size }), className)

    // asChild 走 Slot 合并到子元素（如 NavLink）。
    if (asChild) {
      return <Slot className={classes} {...props} ref={ref} />
    }

    // 显式回退为 button，避免在 form 内意外提交。
    return <BaseButton className={classes} type={type ?? 'button'} ref={ref} {...props} />
  }
)
Button.displayName = 'Button'

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants }
