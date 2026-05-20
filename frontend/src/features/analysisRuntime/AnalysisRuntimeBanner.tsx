import type { AnalysisRuntimeStatus } from "@/features/analysisRuntime/useAnalysisRuntimeStatus";

type AnalysisRuntimeBannerProps = {
  status: AnalysisRuntimeStatus;
};

export default function AnalysisRuntimeBanner({ status }: AnalysisRuntimeBannerProps) {
  const { capability, fallback, load, loadSnapshot, inferenceBlocked } = status;

  return (
    <section className="analysis-runtime" aria-label="Analysis runtime status">
      {inferenceBlocked ? (
        <p className="analysis-runtime__alert" role="alert">
          <strong>{capability.title}.</strong> {capability.message}
        </p>
      ) : (
        capability.severity === "warning" &&
        !fallback.showFallbackNotice && (
          <p className="analysis-runtime__warning" role="note">
            <strong>{capability.title}.</strong> {capability.message}
          </p>
        )
      )}

      {fallback.showFallbackNotice && !inferenceBlocked && (
        <p className="analysis-runtime__fallback" role="note">
          <strong>{fallback.title}.</strong> {fallback.message}
        </p>
      )}

      {load.showProgress && (
        <p
          className={`analysis-runtime__progress analysis-runtime__progress--${load.severity}`}
          role="status"
        >
          {load.message}
        </p>
      )}

      {loadSnapshot.phase === "ready" && !inferenceBlocked && (
        <p className="analysis-runtime__ready" role="status">
          {load.message}
        </p>
      )}
    </section>
  );
}
