import {
  emptyMarkerMap,
  emptySignMap,
  formatGtpCoordinate,
  formatToPlayLabel,
  formatTurnStatusLabel,
  gtpToVertex,
  markerMapFromLastMove,
  parseGtpCoordinate,
  sgfmillToVertex,
  signMapFromStones,
  vertexToGtp,
  vertexToSgfmill,
} from "../src/lib/coordinates.ts";
import type { ApiStone, Vertex } from "../src/lib/coordinates.ts";

const handlers: Record<string, (...args: never[]) => unknown> = {
  parseGtpCoordinate: (coordinate: string, size = 19) => parseGtpCoordinate(coordinate, size),
  formatGtpCoordinate: (row: number, col: number, size = 19) =>
    formatGtpCoordinate(row, col, size),
  gtpToVertex: (coordinate: string, size = 19) => gtpToVertex(coordinate, size),
  vertexToGtp: (vertex: Vertex, size = 19) => vertexToGtp(vertex, size),
  sgfmillToVertex: (row: number, col: number, size = 19) => sgfmillToVertex(row, col, size),
  vertexToSgfmill: (vertex: Vertex, size = 19) => vertexToSgfmill(vertex, size),
  emptySignMap: (size: number) => emptySignMap(size),
  signMapFromStones: (stones: ApiStone[], size = 19) => signMapFromStones(stones, size),
  emptyMarkerMap: (size: number) => emptyMarkerMap(size),
  markerMapFromLastMove: (lastMove: string | null, size = 19) =>
    markerMapFromLastMove(lastMove, size),
  formatToPlayLabel: (nextToMove: "B" | "W", status: "active" | "finished") =>
    formatToPlayLabel(nextToMove, status),
  formatTurnStatusLabel: (
    nextToMove: "B" | "W",
    humanSide: "B" | "W",
    status: "active" | "finished",
    isTurnInProgress: boolean,
  ) => formatTurnStatusLabel(nextToMove, humanSide, status, isTurnInProgress),
};

function decodeArg(raw: string): unknown {
  return JSON.parse(raw) as unknown;
}

function main(): void {
  const [functionName, ...rawArgs] = process.argv.slice(2);
  const handler = handlers[functionName];
  if (!handler) {
    throw new Error(`Unknown coordinate function: ${functionName}`);
  }
  const args = rawArgs.map(decodeArg);
  const result = handler(...(args as never[]));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main();
