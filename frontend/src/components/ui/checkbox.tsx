import * as React from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange"
> {
  checked?: boolean;
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  (
    { className, checked = false, indeterminate = false, onChange, ...props },
    ref,
  ) => {
    const isActive = checked || indeterminate;

    return (
      <button
        ref={ref}
        type="button"
        role="checkbox"
        aria-checked={indeterminate ? "mixed" : checked}
        onClick={() => onChange?.(!checked)}
        className={cn(
          "peer inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg",
          "disabled:cursor-not-allowed disabled:opacity-50",
          isActive
            ? "border-brand-accent bg-brand-accent text-white"
            : "border-white/20 bg-white/5 hover:border-white/30",
          className,
        )}
        {...props}
      >
        {indeterminate ? (
          <Minus className="h-3 w-3" />
        ) : checked ? (
          <Check className="h-3 w-3" />
        ) : null}
      </button>
    );
  },
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
