import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cn("mb-1.5 block text-sm font-medium text-carbon", className)}
      {...props}
    />
  );
}

const fieldClass =
  "w-full min-h-11 rounded-md bg-card px-3 py-2 text-base text-carbon shadow-[var(--shadow-border)] placeholder:text-graphite transition-[box-shadow] duration-[var(--motion-quick)] ease-[var(--ease-out-soft)] focus-visible:outline-2 focus-visible:outline-ochre disabled:opacity-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(fieldClass, "min-h-32 resize-y leading-relaxed", className)}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldClass, "appearance-auto", className)} {...props} />;
}

export function FieldError({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <p className="mt-1.5 text-sm text-brick" role="alert">
      {children}
    </p>
  );
}
