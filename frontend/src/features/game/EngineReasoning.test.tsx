import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import EngineReasoning from "./EngineReasoning";

describe("EngineReasoning", () => {
  it("renders win rate and score for human Black", () => {
    render(
      <EngineReasoning
        humanSide="B"
        winrate={0.73}
        scoreLead={5.2}
      />,
    );

    const region = screen.getByRole("region", { name: /engine reasoning/i });
    expect(region).toHaveTextContent("Your win rate");
    expect(region).toHaveTextContent("73.0%");
    expect(region).toHaveTextContent("Score");
    expect(region).toHaveTextContent("B+5.2");
    expect(screen.queryByText("Points still in play")).not.toBeInTheDocument();
  });

  it("renders win rate and score for human White", () => {
    render(
      <EngineReasoning
        humanSide="W"
        winrate={0.33}
        scoreLead={-5}
      />,
    );

    const region = screen.getByRole("region", { name: /engine reasoning/i });
    expect(region).toHaveTextContent("67.0%");
    expect(region).toHaveTextContent("W+5");
  });

  it("renders candidate stats from the mover perspective when engine is Black", () => {
    render(
      <EngineReasoning
        humanSide="W"
        candidatePerspectiveSide="B"
        winrate={0.02}
        scoreLead={-14}
        candidates={[
          { move: "K10", survival_score: 0, min_black_probability: 0.5, winrate: 0.98, score_lead: 22.5 },
          { move: "D4", survival_score: 0, min_black_probability: 0.5, winrate: 0.35, score_lead: -1 },
        ]}
        selectedMove="K10"
      />,
    );

    expect(screen.getByText("Your win rate")).toBeInTheDocument();
    expect(screen.getByText("2.0%")).toBeInTheDocument();
    expect(screen.getByText("W-22.5")).toBeInTheDocument();
    expect(
      screen.getByText("Each row is the position after Black plays that move."),
    ).toBeInTheDocument();
    const table = screen.getByRole("table", { name: /candidate comparison/i });
    expect(table).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /black win rate/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /score after move/i })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /k10/i })).toHaveAttribute("data-selected", "true");
    expect(screen.getByRole("row", { name: /d4/i })).toHaveAttribute("data-selected", "false");
    expect(screen.getByRole("row", { name: /k10/i })).toHaveTextContent("98.0%");
    expect(screen.getByRole("row", { name: /k10/i })).toHaveTextContent("B+22.5");
    expect(screen.getByRole("row", { name: /d4/i })).toHaveTextContent("35.0%");
    expect(screen.getByRole("row", { name: /d4/i })).toHaveTextContent("B-1");
    expect(screen.getAllByRole("row").map((row) => row.getAttribute("aria-label"))).toEqual([
      null,
      "K10",
      "D4",
    ]);
  });
});
