import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

const FALLBACK_MESSAGE = "An unexpected error occurred. Try reloading the page.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bone px-6 text-center text-carbon">
      <span className="text-brick" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="font-display text-2xl">Something went wrong</h1>
      <p className="max-w-md text-sm break-words text-graphite">{errorMessage(error)}</p>
    </main>
  );
}
