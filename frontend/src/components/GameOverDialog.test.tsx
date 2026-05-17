import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import GameOverDialog from "./GameOverDialog";

describe("GameOverDialog", () => {
  it("shows you win and calls onTryAgain when Try again is clicked", async () => {
    const user = userEvent.setup();
    const onTryAgain = vi.fn();

    render(<GameOverDialog onTryAgain={onTryAgain} />);

    expect(screen.getByRole("dialog", { name: /you win/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });
});
