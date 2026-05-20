import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import GameOverDialog from "./GameOverDialog";

describe("GameOverDialog", () => {
  it("shows you win and calls onTryAgain when Try again is clicked", async () => {
    const user = userEvent.setup();
    const onTryAgain = vi.fn();

    render(<GameOverDialog outcome="human_win" onTryAgain={onTryAgain} />);

    expect(screen.getByRole("dialog", { name: /you win/i })).toBeInTheDocument();
    expect(screen.getByText(/engine resigned/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });

  it("shows resignation loss copy when the human resigned", () => {
    render(<GameOverDialog outcome="human_loss" onTryAgain={() => undefined} />);

    expect(screen.getByRole("dialog", { name: /you resigned/i })).toBeInTheDocument();
    expect(screen.getByText(/engine wins/i)).toBeInTheDocument();
  });
});
