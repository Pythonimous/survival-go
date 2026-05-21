import { ApiHttpError } from "@/lib/api/clientErrors";

type ApiErrorDetail = {
  code?: string;
  message?: string;
};

type ApiErrorBody = {
  detail?: string | ApiErrorDetail;
};

function readApiError(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const maybeError = body as ApiErrorBody;
  const { detail } = maybeError;
  if (typeof detail === "string") {
    return detail;
  }
  if (typeof detail === "object" && detail !== null && typeof detail.message === "string") {
    return detail.message;
  }
  return null;
}

export function readApiErrorCode(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const maybeError = body as ApiErrorBody;
  const { detail } = maybeError;
  if (typeof detail === "object" && detail !== null && typeof detail.code === "string") {
    return detail.code;
  }
  return null;
}

export async function readApiFailure(response: Response, fallback: string): Promise<never> {
  const errorBody = (await response.json().catch(() => null)) as unknown;
  const apiMessage = readApiError(errorBody);
  throw new ApiHttpError(apiMessage ?? fallback, {
    status: response.status,
    apiCode: readApiErrorCode(errorBody),
  });
}
