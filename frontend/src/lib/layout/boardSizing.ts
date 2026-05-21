/** Default desktop cap — matches prior fixed `vertexSize` in GobanBoard. */
export const DEFAULT_MAX_VERTEX_SIZE = 30;

/** Minimum vertex size so intersections stay tappable on narrow phones. */
export const MIN_VERTEX_SIZE = 14;

/** Coordinate gutters add ~2 em beyond the N×N grid when coords are shown. */
export const COORDINATE_GUTTER_UNITS = 2;

export type BoardSizingOptions = {
  boardSize?: number;
  showCoordinates?: boolean;
};

export function layoutUnits(
  boardSize: number,
  showCoordinates: boolean,
): number {
  return showCoordinates ? boardSize + COORDINATE_GUTTER_UNITS : boardSize;
}

/**
 * Fit vertex size to container width for a square 19×19 goban with optional coords.
 */
export function computeMaxVertexSize(
  containerWidth: number,
  options: BoardSizingOptions = {},
): number {
  const boardSize = options.boardSize ?? 19;
  const showCoordinates = options.showCoordinates ?? true;
  if (containerWidth <= 0) {
    return DEFAULT_MAX_VERTEX_SIZE;
  }
  const units = layoutUnits(boardSize, showCoordinates);
  const fitted = Math.floor(containerWidth / units);
  return Math.min(
    DEFAULT_MAX_VERTEX_SIZE,
    Math.max(MIN_VERTEX_SIZE, fitted),
  );
}

/**
 * Pixel bounds passed to Shudan `BoundedGoban` (square board, height capped on short viewports).
 */
export function computeBoardBounds(
  containerWidth: number,
  viewportHeight?: number,
  options: BoardSizingOptions = {},
): { maxWidth: number; maxHeight: number } {
  const boardSize = options.boardSize ?? 19;
  const showCoordinates = options.showCoordinates ?? true;
  const maxWidth = Math.max(0, Math.floor(containerWidth));
  let maxHeight = maxWidth;
  if (viewportHeight !== undefined && viewportHeight > 0) {
    const viewportCap = Math.floor(viewportHeight * 0.55);
    maxHeight = Math.min(maxWidth, viewportCap);
  }
  const minPixels = MIN_VERTEX_SIZE * layoutUnits(boardSize, showCoordinates);
  return {
    maxWidth,
    maxHeight: Math.max(maxHeight, minPixels),
  };
}
