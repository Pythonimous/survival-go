import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import EngineReasoning from "./EngineReasoning";

describe("EngineReasoning", () => {
  it("renders human-centric metrics when playing Black", () => {
    render(
      <EngineReasoning
        humanSide="B"
        boardSize={19}
        metrics={{ unresolved_count: 12, min_black_probability: 0.41 }}
      />,
    );

    const region = screen.getByRole("region", { name: /engine reasoning/i });
    expect(region).toHaveTextContent("Points still disputed");
    expect(region).toHaveTextContent("12 / 361");
    expect(region).toHaveTextContent("Most vulnerable point");
    expect(region).toHaveTextContent("41% Black control (target: 95%+)");
    expect(screen.queryByText("Survival score")).not.toBeInTheDocument();
  });

  it("renders human-centric metrics when playing White", () => {
    render(
      <EngineReasoning
        humanSide="W"
        boardSize={19}
        metrics={{ unresolved_count: 3, min_black_probability: 0.41 }}
      />,
    );

    const region = screen.getByRole("region", { name: /engine reasoning/i });
    expect(region).toHaveTextContent("Points still in play");
    expect(region).toHaveTextContent("3 / 361");
    expect(region).toHaveTextContent("Strongest foothold");
    expect(region).toHaveTextContent(
      "59% non-Black control (keep any point in play)",
    );
  });

  it("renders ranked candidate comparison rows and highlights the selected move", () => {
    render(
      <EngineReasoning
        humanSide="W"
        boardSize={19}
        metrics={{ unresolved_count: 1, min_black_probability: 0.4 }}
        candidates={[
          { move: "Q16", survival_score: 1, min_black_probability: 0.4 },
          { move: "D4", survival_score: 2, min_black_probability: 0.35 },
        ]}
        selectedMove="Q16"
      />,
    );

    const table = screen.getByRole("table", { name: /candidate comparison/i });
    expect(table).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /points in play/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /best foothold/i })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /q16/i })).toHaveAttribute("data-selected", "true");
    expect(screen.getByRole("row", { name: /d4/i })).toHaveAttribute("data-selected", "false");
    expect(screen.getByRole("row", { name: /q16/i })).toHaveTextContent("60%");
    expect(screen.getByRole("row", { name: /d4/i })).toHaveTextContent("65%");
  });
});
