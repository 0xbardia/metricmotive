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

export function errorBody(err: unknown, requestId: string): ApiErrorBody {
  if (err instanceof AppError) {
    return { error: { code: err.code, message: err.message }, requestId };
  }
  if (err && typeof err === "object" && "code" in err && "message" in err) {
    const rec = err as { code: unknown; message: unknown };
    return {
      error: {
        code: String(rec.code ?? "UNKNOWN"),
        message: String(rec.message ?? "Unexpected error"),
      },
      requestId,
    };
  }
  return {
    error: { code: "INTERNAL", message: "Unexpected error" },
    requestId,
  };
}

export function requestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
