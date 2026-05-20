import {
  candidateColumnLabels,
  formatCandidateBottleneck,
  formatPositionMetrics,
} from "@/lib/go/survivalDisplay";
import type { CandidateSummary, StoneColor, SurvivalMetrics } from "@/types/api";

type EngineReasoningProps = {
  humanSide: StoneColor;
  boardSize: number;
  metrics: SurvivalMetrics;
  candidates?: readonly CandidateSummary[];
  selectedMove?: string;
};

export default function EngineReasoning({
  humanSide,
  boardSize,
  metrics,
  candidates,
  selectedMove,
}: EngineReasoningProps) {
  const positionLabels = formatPositionMetrics(metrics, humanSide, boardSize);
  const columns = candidateColumnLabels(humanSide);

  return (
    <section aria-label="Engine reasoning" className="engine-reasoning">
      <h2>Position analysis</h2>
      <dl className="engine-metrics">
        <MetricPair label={positionLabels.disputedLabel} value={positionLabels.disputedValue} />
        <MetricPair
          label={positionLabels.bottleneckLabel}
          value={positionLabels.bottleneckValue}
        />
      </dl>
      {candidates && candidates.length > 0 && (
        <table aria-label="Candidate comparison" className="candidate-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Move</th>
              <th scope="col">{columns.disputedHeader}</th>
              <th scope="col">{columns.bottleneckHeader}</th>
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
                <td>{formatCandidateBottleneck(candidate.min_black_probability, humanSide)}</td>
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
