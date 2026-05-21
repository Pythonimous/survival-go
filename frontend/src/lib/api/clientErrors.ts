export type ApiClientErrorCode =
  | "http_error"
  | "network_error"
  | "request_timeout";

export class ApiClientError extends Error {
  readonly code: ApiClientErrorCode;

  constructor(code: ApiClientErrorCode, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
  }
}

export class ApiTimeoutError extends ApiClientError {
  readonly timeoutSeconds: number;

  constructor(message: string, timeoutSeconds: number) {
    super("request_timeout", message);
    this.name = "ApiTimeoutError";
    this.timeoutSeconds = timeoutSeconds;
  }
}

export class ApiNetworkError extends ApiClientError {
  constructor(message: string) {
    super("network_error", message);
    this.name = "ApiNetworkError";
  }
}

export class ApiHttpError extends ApiClientError {
  readonly status: number;
  readonly apiCode: string | null;

  constructor(
    message: string,
    options: {
      status: number;
      apiCode?: string | null;
    },
  ) {
    super("http_error", message);
    this.name = "ApiHttpError";
    this.status = options.status;
    this.apiCode = options.apiCode ?? null;
  }
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

export function formatApiOperationFailure(
  operation: string,
  reason: string,
): string {
  return `Could not ${operation}: ${reason}`;
}
