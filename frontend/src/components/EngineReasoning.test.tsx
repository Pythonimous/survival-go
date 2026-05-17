import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import EngineReasoning from "./EngineReasoning";

describe("EngineReasoning", () => {
  it("renders survival metrics from analysis", () => {
    render(
      <EngineReasoning
        survivalScore={3}
        metrics={{ unresolved_count: 3, min_black_probability: 0.41 }}
      />,
    );

    const region = screen.getByRole("region", { name: /engine reasoning/i });
    expect(region).toBeInTheDocument();
    expect(region).toHaveTextContent("Survival score");
    expect(region).toHaveTextContent("0.410");
    expect(screen.getAllByText("3")).toHaveLength(2);
  });

  it("renders ranked candidate comparison rows and highlights the selected move", () => {
    render(
      <EngineReasoning
        survivalScore={1}
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
    expect(screen.getByRole("row", { name: /q16/i })).toHaveAttribute("data-selected", "true");
    expect(screen.getByRole("row", { name: /d4/i })).toHaveAttribute("data-selected", "false");
  });
});
