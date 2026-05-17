import type { CandidateSummary, SurvivalMetrics } from "../types/api";

type EngineReasoningProps = {
  survivalScore: number;
  metrics: SurvivalMetrics;
  candidates?: readonly CandidateSummary[];
  selectedMove?: string;
};

function formatProbability(value: number): string {
  return value.toFixed(3);
}

export default function EngineReasoning({
  survivalScore,
  metrics,
  candidates,
  selectedMove,
}: EngineReasoningProps) {
  return (
    <section aria-label="Engine reasoning" className="engine-reasoning">
      <h2>Position analysis</h2>
      <dl className="engine-metrics">
        <MetricPair label="Survival score" value={String(survivalScore)} />
        <MetricPair label="Unresolved points" value={String(metrics.unresolved_count)} />
        <MetricPair
          label="Min black probability"
          value={formatProbability(metrics.min_black_probability)}
        />
      </dl>
      {candidates && candidates.length > 0 && (
        <table aria-label="Candidate comparison" className="candidate-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Move</th>
              <th scope="col">Survival score</th>
              <th scope="col">Min p(black)</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate, index) => (
              <tr
                key={candidate.move}
                aria-label={candidate.move}
                data-selected={candidate.move === selectedMove ? "true" : "false"}
              >
                <td>{index + 1}</td>
                <td>{candidate.move}</td>
                <td>{candidate.survival_score}</td>
                <td>{formatProbability(candidate.min_black_probability)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function MetricPair({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
