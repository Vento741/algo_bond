import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors',
  {
    variants: {
      variant: {
        default:
          'bg-white/5 text-gray-300 ring-white/10',
        profit:
          'bg-brand-profit/10 text-brand-profit ring-brand-profit/20',
        loss:
          'bg-brand-loss/10 text-brand-loss ring-brand-loss/20',
        premium:
          'bg-brand-premium/10 text-brand-premium ring-brand-premium/20',
        accent:
          'bg-brand-accent/10 text-brand-accent ring-brand-accent/20',
        outline:
          'bg-transparent text-gray-400 ring-white/10',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  ),
);
Badge.displayName = 'Badge';

export { Badge, badgeVariants };
