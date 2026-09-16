export class MetricMotiveError extends Error {
  readonly code: string;
  readonly authority: "chain" | "api" | "local";
  readonly txHash?: `0x${string}`;

  constructor(
    code: string,
    message: string,
    authority: "chain" | "api" | "local" = "local",
    txHash?: `0x${string}`,
  ) {
    super(message);
    this.name = "MetricMotiveError";
    this.code = code;
    this.authority = authority;
    this.txHash = txHash;
  }
}

export function asError(err: unknown, fallback: string): MetricMotiveError {
  if (err instanceof MetricMotiveError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new MetricMotiveError("UNEXPECTED", message || fallback);
}
