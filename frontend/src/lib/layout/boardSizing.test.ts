import { describe, expect, it } from "vitest";

import {
  computeBoardBounds,
  computeMaxVertexSize,
  DEFAULT_MAX_VERTEX_SIZE,
  MIN_VERTEX_SIZE,
} from "./boardSizing";

describe("computeMaxVertexSize", () => {
  it("caps vertex size at the desktop default on wide containers", () => {
    expect(computeMaxVertexSize(1200)).toBe(DEFAULT_MAX_VERTEX_SIZE);
    expect(computeMaxVertexSize(768)).toBe(DEFAULT_MAX_VERTEX_SIZE);
  });

  it("shrinks vertex size on typical phone widths", () => {
    expect(computeMaxVertexSize(375)).toBe(17);
    expect(computeMaxVertexSize(390)).toBe(18);
  });

  it("never goes below the minimum tap-friendly vertex size", () => {
    expect(computeMaxVertexSize(200)).toBe(MIN_VERTEX_SIZE);
  });

  it("returns the desktop default when container width is unknown", () => {
    expect(computeMaxVertexSize(0)).toBe(DEFAULT_MAX_VERTEX_SIZE);
  });

  it("uses a smaller layout unit count when coordinates are hidden", () => {
    expect(
      computeMaxVertexSize(380, { showCoordinates: false }),
    ).toBeGreaterThan(computeMaxVertexSize(380, { showCoordinates: true }));
  });
});

describe("computeBoardBounds", () => {
  it("uses square width-based bounds by default", () => {
    expect(computeBoardBounds(400)).toEqual({ maxWidth: 400, maxHeight: 400 });
  });

  it("limits height on short viewports while keeping a minimum board size", () => {
    const bounds = computeBoardBounds(400, 600);
    expect(bounds.maxWidth).toBe(400);
    expect(bounds.maxHeight).toBe(330);
    expect(bounds.maxHeight).toBeGreaterThanOrEqual(MIN_VERTEX_SIZE * 21);
  });
});
