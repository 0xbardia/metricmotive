import type { ComponentProps, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "mm-button group inline-flex items-center justify-center gap-2 font-medium transition-[transform,background-color,color,box-shadow,opacity] duration-[var(--motion-quick)] ease-[var(--ease-out-soft)] hover:not-disabled:-translate-y-px active:not-disabled:translate-y-px active:not-disabled:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ochre min-h-11",
  {
    variants: {
      variant: {
        primary: "bg-carbon text-bone hover:bg-carbon/90 shadow-[var(--shadow-border)]",
        ochre: "bg-ochre text-carbon hover:bg-ochre/90 shadow-[var(--shadow-border)]",
        ghost: "bg-transparent text-carbon hover:bg-cream",
        outline:
          "bg-transparent text-carbon shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
        inverse: "bg-bone text-carbon hover:bg-cream",
      },
      size: {
        sm: "h-10 px-3.5 text-sm rounded-sm",
        md: "h-11 px-4 text-sm rounded-md",
        lg: "h-12 px-5 text-base rounded-md",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = Omit<ComponentProps<"button">, "disabled"> &
  VariantProps<typeof buttonVariants> & {
    /** Async in-flight state: disables the control and blocks double-submit. */
    loading?: boolean;
    /** Copy shown while loading. Falls back to children. */
    loadingLabel?: ReactNode;
    /** Kept for explicit disabling; `loading` implies disabled as well. */
    disabled?: boolean;
  };

/**
 * Shared button. `loading` is the single standard for async actions: it sets
 * `disabled`, `aria-busy`, a visible spinner and a non-interactive appearance,
 * so no caller has to remember the four separately (H0).
 */
export function Button({
  className,
  variant,
  size,
  type = "button",
  loading = false,
  loadingLabel,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), loading && "cursor-progress", className)}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <span>{loadingLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
