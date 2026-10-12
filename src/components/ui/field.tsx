import type { ComponentProps, ReactNode } from "react";
import { fieldDescribedBy, fieldIds } from "@/lib/a11y";
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

export function FieldError({ children, id }: { children?: string | null; id?: string }) {
  return (
    <div aria-live="polite">
      {children ? (
        <p id={id ? fieldIds(id).error : undefined} className="mt-1.5 text-sm text-brick">
          {children}
        </p>
      ) : null}
    </div>
  );
}

export function FieldHint({ children, id }: { children?: ReactNode; id?: string }) {
  if (!children) return null;
  return (
    <p id={id ? fieldIds(id).hint : undefined} className="mt-1.5 text-sm text-graphite">
      {children}
    </p>
  );
}

export { fieldDescribedBy };
