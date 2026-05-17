type GameOverDialogProps = {
  onTryAgain: () => void;
};

export default function GameOverDialog({ onTryAgain }: GameOverDialogProps) {
  return (
    <div className="game-over-overlay" role="presentation">
      <div
        className="game-over-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-over-title"
      >
        <h2 id="game-over-title">You win!</h2>
        <p>The engine resigned.</p>
        <button type="button" onClick={onTryAgain}>
          Try again
        </button>
      </div>
    </div>
  );
}
