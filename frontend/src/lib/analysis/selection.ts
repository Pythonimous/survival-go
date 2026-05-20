import { BrowserOnnxProvider } from "@/lib/analysis/providers/BrowserOnnxProvider";
import type { AnalysisProvider } from "@/lib/analysis/types";

const browserOnnxProvider = new BrowserOnnxProvider();

let overrideProvider: AnalysisProvider | null = null;

export function getAnalysisProvider(): AnalysisProvider {
  return overrideProvider ?? browserOnnxProvider;
}

export function setAnalysisProviderForTests(provider: AnalysisProvider | null): void {
  overrideProvider = provider;
}

export function getDefaultAnalysisProviderId(): string {
  return browserOnnxProvider.id;
}
