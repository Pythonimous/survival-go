import type { Sign, SignMap, Vertex } from "@/lib/go/shudan";

export type { Sign, SignMap, Vertex };

export const GTP_COLUMNS = "ABCDEFGHJKLMNOPQRST";

export class InvalidCoordinateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCoordinateError";
  }
}

export function parseGtpCoordinate(coordinate: string, size = 19): [number, number] {
  const trimmed = coordinate.trim().toUpperCase();
  if (!trimmed || trimmed.length < 2) {
    throw new InvalidCoordinateError("Coordinate must include a column and row.");
  }

  const columnChar = trimmed[0];
  if (columnChar === "I") {
    throw new InvalidCoordinateError("Column I is not used in GTP coordinates.");
  }

  const col = GTP_COLUMNS.indexOf(columnChar);
  if (col < 0 || col >= size) {
    throw new InvalidCoordinateError("Column is out of range.");
  }

  const rowNumber = Number.parseInt(trimmed.slice(1), 10);
  if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > size) {
    throw new InvalidCoordinateError("Row is out of range.");
  }

  return [rowNumber - 1, col];
}

export function formatGtpCoordinate(row: number, col: number, size = 19): string {
  if (row < 0 || row >= size || col < 0 || col >= size) {
    throw new InvalidCoordinateError("Coordinate is out of range.");
  }
  return `${GTP_COLUMNS[col]}${row + 1}`;
}

/** Map sgfmill (row, col) with row 0 at the bottom to Shudan [x, y] (y 0 at top). */
export function sgfmillToVertex(row: number, col: number, size = 19): Vertex {
  return [col, size - 1 - row];
}

/** Map Shudan [x, y] to sgfmill (row, col) with row 0 at the bottom. */
export function vertexToSgfmill(vertex: Vertex, size = 19): [number, number] {
  const [x, y] = vertex;
  return [size - 1 - y, x];
}

export function gtpToVertex(coordinate: string, size = 19): Vertex {
  const [row, col] = parseGtpCoordinate(coordinate, size);
  return sgfmillToVertex(row, col, size);
}

export function vertexToGtp(vertex: Vertex, size = 19): string {
  const [row, col] = vertexToSgfmill(vertex, size);
  return formatGtpCoordinate(row, col, size);
}

export function emptySignMap(size: number): SignMap {
  return Array.from({ length: size }, () => Array<Sign>(size).fill(0));
}

export type ApiStone = {
  move: string;
  color: "B" | "W";
};

export function signMapFromStones(stones: readonly ApiStone[], size = 19): SignMap {
  const signMap = emptySignMap(size);
  for (const { move, color } of stones) {
    const vertex = gtpToVertex(move, size);
    const [x, y] = vertex;
    signMap[y][x] = color === "B" ? 1 : -1;
  }
  return signMap;
}

export type BoardMarker = {
  type: "point";
};

export type MarkerMap = (BoardMarker | null)[][];

export function emptyMarkerMap(size: number): MarkerMap {
  return Array.from({ length: size }, () => Array<BoardMarker | null>(size).fill(null));
}

export function markerMapFromLastMove(
  lastMove: string | null | undefined,
  size = 19,
): MarkerMap {
  const markerMap = emptyMarkerMap(size);
  if (!lastMove) {
    return markerMap;
  }
  const [x, y] = gtpToVertex(lastMove, size);
  markerMap[y][x] = { type: "point" };
  return markerMap;
}

export function formatToPlayLabel(
  nextToMove: ApiStone["color"],
  status: "active" | "finished",
): string {
  if (status === "finished") {
    return "Game over";
  }
  return nextToMove === "B" ? "Black to play" : "White to play";
}

export function formatTurnStatusLabel(
  nextToMove: ApiStone["color"],
  humanSide: ApiStone["color"],
  status: "active" | "finished",
  isTurnInProgress: boolean,
): string {
  if (status === "finished") {
    return "Game over";
  }
  const engineSide: ApiStone["color"] = humanSide === "B" ? "W" : "B";
  const engineIsActing = isTurnInProgress || nextToMove !== humanSide;
  if (engineIsActing) {
    return engineSide === "B" ? "Black is thinking..." : "White is thinking...";
  }
  return nextToMove === "B" ? "Black to play" : "White to play";
}
