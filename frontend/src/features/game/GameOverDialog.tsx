export type GameOverOutcome = "human_win" | "human_loss";

type GameOverDialogProps = {
  outcome: GameOverOutcome;
  onTryAgain: () => void;
};

const OUTCOME_COPY: Record<GameOverOutcome, { title: string; body: string }> = {
  human_win: { title: "You win!", body: "The engine resigned." },
  human_loss: { title: "You resigned", body: "The engine wins." },
};

export default function GameOverDialog({ outcome, onTryAgain }: GameOverDialogProps) {
  const copy = OUTCOME_COPY[outcome];
  return (
    <div className="game-over-overlay" role="presentation">
      <div
        className="game-over-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-over-title"
      >
        <h2 id="game-over-title">{copy.title}</h2>
        <p>{copy.body}</p>
        <button type="button" onClick={onTryAgain}>
          Try again
        </button>
      </div>
    </div>
  );
}
