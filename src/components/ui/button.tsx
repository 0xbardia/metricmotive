import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
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

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
