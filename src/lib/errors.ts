export type ErrorCode =
  | "VALIDATION_ERROR"
  | "ROUTER_UNAVAILABLE"
  | "ROUTER_TIMEOUT"
  | "MODEL_OUTPUT_INVALID"
  | "EXPORT_FAILED"
  | "UNKNOWN_ERROR";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, statusCode = 500, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
