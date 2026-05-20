// SPDX-License-Identifier: AGPL-3.0-or-later
// Ported from kaya-go/kaya (AGPL-3.0), packages/goboard/src/types.ts
// Upstream commit: 8fafeac0fedde020c447d931c0b1afdf283edf2a

// Basic types
// 1 = Black, -1 = White, 0 = Empty
export type Sign = -1 | 0 | 1;
export type Vertex = [number, number];
export type SignMap = Sign[][];

export interface MakeMoveOptions {
  preventSuicide?: boolean;
  preventOverwrite?: boolean;
  preventKo?: boolean;
  disableKoCheck?: boolean;
  mutate?: boolean;
}

export interface MoveAnalysis {
  pass: boolean;
  overwrite: boolean;
  capturing: boolean;
  suicide: boolean;
  ko: boolean;
  valid: boolean;
}
