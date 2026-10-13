export type ApiErrorBody = {
  error: { code: string; message: string };
  requestId: string;
};

export class AppError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function errorBody(
  err: unknown,
  requestId: string,
  log: (...args: unknown[]) => void = console.error,
): ApiErrorBody {
  if (err instanceof AppError) {
    return { error: { code: err.code, message: err.message }, requestId };
  }
  // Anything else (driver, runtime, library) may carry internals: log it here, never return its text.
  log(`[api-error] ${requestId}:`, err);
  if (err instanceof Error && /relation .* does not exist|column .* does not exist/i.test(err.message)) {
    return {
      error: { code: "SCHEMA_NOT_READY", message: "MetricMotive couldn’t save this draft. Please retry." },
      requestId,
    };
  }
  return {
    error: { code: "INTERNAL", message: "Something went wrong. Try again." },
    requestId,
  };
}

export function requestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
