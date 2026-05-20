import {
  candidateColumnLabels,
  candidateTableCaption,
  formatCandidateScore,
  formatCandidateWinRate,
  formatPositionAnalysis,
  sortCandidatesForDisplay,
} from "@/lib/go/analysisDisplay";
import type { CandidateSummary, StoneColor } from "@/types/api";

type EngineReasoningProps = {
  humanSide: StoneColor;
  /** Side that chose among candidates (engine); stats are shown from this perspective. */
  candidatePerspectiveSide?: StoneColor;
  winrate?: number;
  scoreLead?: number;
  candidates?: readonly CandidateSummary[];
  selectedMove?: string;
};

export default function EngineReasoning({
  humanSide,
  candidatePerspectiveSide,
  winrate,
  scoreLead,
  candidates,
  selectedMove,
}: EngineReasoningProps) {
  const perspectiveSide = candidatePerspectiveSide ?? humanSide;
  const hasCandidateComparison = Boolean(candidates && candidates.length > 0);
  const columns = candidateColumnLabels(perspectiveSide);
  const displayCandidates = hasCandidateComparison
    ? sortCandidatesForDisplay(candidates!, perspectiveSide)
    : candidates;
  const selectedCandidate = selectedMove
    ? displayCandidates?.find((candidate) => candidate.move === selectedMove)
    : undefined;
  const positionLabels = formatPositionAnalysis(
    humanSide,
    selectedCandidate?.winrate ?? winrate,
    selectedCandidate?.score_lead ?? scoreLead,
  );

  return (
    <section aria-label="Engine reasoning" className="engine-reasoning">
      <h2>Position analysis</h2>
      <dl className="engine-metrics">
        <MetricPair label={positionLabels.winRateLabel} value={positionLabels.winRateValue} />
        <MetricPair label={positionLabels.scoreLabel} value={positionLabels.scoreValue} />
      </dl>
      {displayCandidates && displayCandidates.length > 0 && (
        <>
          <p className="candidate-table-caption">{candidateTableCaption(perspectiveSide)}</p>
          <table aria-label="Candidate comparison" className="candidate-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Move</th>
              <th scope="col">{columns.winRateHeader}</th>
              <th scope="col">{columns.scoreHeader}</th>
            </tr>
          </thead>
          <tbody>
            {displayCandidates.map((candidate, index) => (
              <tr
                key={candidate.move}
                aria-label={candidate.move}
                data-selected={candidate.move === selectedMove ? "true" : "false"}
              >
                <td>{index + 1}</td>
                <td>{candidate.move}</td>
                <td>{formatCandidateWinRate(candidate.winrate, perspectiveSide)}</td>
                <td>{formatCandidateScore(candidate.score_lead, perspectiveSide)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </>
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
