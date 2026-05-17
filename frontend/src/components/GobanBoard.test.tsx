import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import GobanBoard from "./GobanBoard";

const captured = vi.hoisted(() => ({
  onVertexClick: undefined as
    | ((event: Event, vertex: [number, number]) => void)
    | undefined,
  vertexSize: undefined as number | undefined,
}));

vi.mock("../lib/shudan", () => ({
  Goban: ({
    onVertexClick,
    vertexSize,
  }: {
    onVertexClick?: (event: Event, vertex: [number, number]) => void;
    vertexSize?: number;
  }) => {
    captured.onVertexClick = onVertexClick;
    captured.vertexSize = vertexSize;
    return (
      <button
        type="button"
        data-testid="mock-goban-vertex"
        onClick={() => onVertexClick?.(new Event("click"), [3, 15])}
      >
        Play D4
      </button>
    );
  },
}));

describe("GobanBoard", () => {
  it("uses a larger default vertex size for board-forward layout", () => {
    render(<GobanBoard />);

    expect(captured.vertexSize).toBe(30);
  });

  it("forwards Shudan vertex clicks as GTP coordinates via onGtpClick", async () => {
    const user = userEvent.setup();
    const onGtpClick = vi.fn();
    render(<GobanBoard onGtpClick={onGtpClick} />);

    await user.click(screen.getByTestId("mock-goban-vertex"));

    expect(onGtpClick).toHaveBeenCalledWith("D4");
  });

  it("does not pass onVertexClick to Shudan when callbacks are omitted", () => {
    render(<GobanBoard />);

    expect(captured.onVertexClick).toBeUndefined();
  });
});
