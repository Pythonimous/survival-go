const DEFAULT_GITHUB_REPO = "https://github.com/Pythonimous/survival-go";

export const GITHUB_REPO_URL = DEFAULT_GITHUB_REPO;

/** Where users report bugs / site issues (not slow local inference). */
export function resolveFeedbackUrl(): string {
  const configured = import.meta.env.VITE_FEEDBACK_URL?.trim();
  if (configured) {
    return configured;
  }
  return `${DEFAULT_GITHUB_REPO}/issues/new`;
}

export const FEEDBACK_URL = resolveFeedbackUrl();
