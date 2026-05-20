/** Session-scoped agent debug logging (NDJSON ingest). Remove after debug session. */
export function agentDebugLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>,
  runId = "pre-fix",
): void {
  // #region agent log
  fetch("http://127.0.0.1:7362/ingest/7690f648-0300-4758-a29e-c30f0ffe579b", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "d1a301",
    },
    body: JSON.stringify({
      sessionId: "d1a301",
      runId,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => undefined);
  // #endregion
}
