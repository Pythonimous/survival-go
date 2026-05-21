import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_MAX_VERTEX_SIZE } from "@/lib/layout/boardSizing";
import GobanBoard from "./GobanBoard";

const captured = vi.hoisted(() => ({
  onVertexClick: undefined as
    | ((event: Event, vertex: [number, number]) => void)
    | undefined,
  maxWidth: undefined as number | undefined,
  maxHeight: undefined as number | undefined,
  maxVertexSize: undefined as number | undefined,
}));

vi.mock("@/lib/go/shudan", () => ({
  BoundedGoban: ({
    onVertexClick,
    maxWidth,
    maxHeight,
    maxVertexSize,
  }: {
    onVertexClick?: (event: Event, vertex: [number, number]) => void;
    maxWidth?: number;
    maxHeight?: number;
    maxVertexSize?: number;
  }) => {
    captured.onVertexClick = onVertexClick;
    captured.maxWidth = maxWidth;
    captured.maxHeight = maxHeight;
    captured.maxVertexSize = maxVertexSize;
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
  let observeTarget: Element | undefined;

  beforeEach(() => {
    observeTarget = undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserverStub {
        private readonly callback: ResizeObserverCallback;

        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
        }

        observe(target: Element) {
          observeTarget = target;
          Object.defineProperty(target, "clientWidth", {
            configurable: true,
            value: 1200,
          });
          this.callback(
            [{ target } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
        }

        disconnect() {
          observeTarget = undefined;
        }

        unobserve() {
          /* no-op */
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses bounded goban sizing with the desktop vertex cap on wide containers", () => {
    render(<GobanBoard />);

    expect(captured.maxWidth).toBe(1200);
    expect(captured.maxVertexSize).toBe(DEFAULT_MAX_VERTEX_SIZE);
  });

  it("shrinks bounded goban width on narrow containers", async () => {
    render(<GobanBoard />);
    expect(observeTarget).toBeDefined();
    Object.defineProperty(observeTarget!, "clientWidth", {
      configurable: true,
      value: 375,
    });
    window.dispatchEvent(new Event("resize"));

    await waitFor(() => {
      expect(captured.maxWidth).toBe(375);
    });
    expect(captured.maxHeight).toBeLessThanOrEqual(375);
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

  it("renders a responsive root wrapper for layout measurement", () => {
    const { container } = render(<GobanBoard />);

    expect(container.querySelector(".goban-board-root")).toBeInTheDocument();
  });
});
