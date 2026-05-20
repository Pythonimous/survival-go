type ApiErrorBody = {
  detail?: string;
};

function readApiError(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const maybeError = body as ApiErrorBody;
  return typeof maybeError.detail === "string" ? maybeError.detail : null;
}

export async function readApiFailure(response: Response, fallback: string): Promise<never> {
  const errorBody = (await response.json().catch(() => null)) as unknown;
  const apiMessage = readApiError(errorBody);
  throw new Error(apiMessage ?? fallback);
}
