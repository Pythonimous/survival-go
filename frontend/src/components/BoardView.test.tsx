import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GameState } from "../types/api";
import BoardView from "./BoardView";

function activeGame(
  overrides: Omit<GameState, "status" | "winner" | "last_move"> &
    Partial<Pick<GameState, "status" | "winner" | "last_move">>,
): GameState {
  const { status = "active", winner = null, last_move = null, ...rest } = overrides;
  return { ...rest, status, winner, last_move };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const PRESET_SETUP_STONES: GameState["stones"] = [
  { move: "D4", color: "B" },
  { move: "Q16", color: "B" },
];

const captured = vi.hoisted(() => ({
  signMap: undefined as number[][] | undefined,
  markerMap: undefined as ({ type?: string } | null)[][] | undefined,
  onGtpClick: undefined as ((coordinate: string) => void) | undefined,
}));

vi.mock("./GobanBoard", () => ({
  default: ({
    signMap,
    markerMap,
    onGtpClick,
  }: {
    signMap?: number[][];
    markerMap?: ({ type?: string } | null)[][];
    onGtpClick?: (coordinate: string) => void;
  }) => {
    captured.signMap = signMap;
    captured.markerMap = markerMap;
    captured.onGtpClick = onGtpClick;
    return (
      <button type="button" data-testid="mock-board-click" onClick={() => onGtpClick?.("D4")}>
        Mock board
      </button>
    );
  },
}));

describe("BoardView", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const onTryAgain = vi.fn();
  const onNewGame = vi.fn();

  const renderBoard = (gameId = "game-1") =>
    render(<BoardView gameId={gameId} onTryAgain={onTryAgain} onNewGame={onNewGame} />);

  beforeEach(() => {
    fetchMock.mockReset();
    onTryAgain.mockReset();
    onNewGame.mockReset();
    captured.signMap = undefined;
    captured.markerMap = undefined;
    captured.onGtpClick = undefined;
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads game state and maps API stones to Goban signMap", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        activeGame({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "W",
          engine_side: "B",
          next_to_move: "W",
          moves_played: 0,
          stones: [{ move: "D4", color: "B" }],
        }),
      ),
    );

    renderBoard();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/games/game-1"));

    expect(captured.signMap).toBeDefined();
    expect(captured.signMap?.[15]?.[3]).toBe(1);
  });

  it("renders a large board area with a separate analysis panel", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        activeGame({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "W",
          engine_side: "B",
          next_to_move: "W",
          moves_played: 0,
          stones: [],
        }),
      ),
    );

    renderBoard();

    expect(await screen.findByLabelText(/board area/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/analysis panel/i)).toBeInTheDocument();
  });

  it("shows whose turn it is and marks the last move on the board", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        activeGame({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "W",
          engine_side: "B",
          next_to_move: "W",
          moves_played: 2,
          last_move: "Q16",
          stones: [
            { move: "D4", color: "W" },
            { move: "Q16", color: "B" },
          ],
        }),
      ),
    );

    renderBoard();

    expect(await screen.findByText("White to play")).toBeInTheDocument();
    expect(captured.markerMap?.[3]?.[15]).toEqual({ type: "point" });
  });

  it("shows game over instead of a turn label when the game is finished", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        game_id: "game-1",
        preset_id: "balanced",
        board_size: 19,
        human_side: "W",
        engine_side: "B",
        next_to_move: "W",
        moves_played: 3,
        status: "finished",
        winner: "W",
        last_move: "K10",
        stones: [
          { move: "D4", color: "W" },
          { move: "Q16", color: "B" },
          { move: "K10", color: "W" },
        ],
      }),
    );

    renderBoard();

    expect(await screen.findByText("Game over")).toBeInTheDocument();
    expect(screen.queryByText(/to play/i)).not.toBeInTheDocument();
  });

  it("submits human move and requests engine move automatically on board click", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "W",
          engine_side: "B",
          next_to_move: "W",
          moves_played: 0,
          stones: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "W",
          engine_side: "B",
          next_to_move: "B",
          move: "D4",
          moves_played: 1,
          stones: [{ move: "D4", color: "W" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "W",
          engine_side: "B",
          next_to_move: "B",
          moves_played: 1,
          stones: [{ move: "D4", color: "W" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "W",
          engine_side: "B",
          next_to_move: "W",
          move: "Q16",
          moves_played: 2,
          survival_score: 1,
          metrics: { unresolved_count: 1, min_black_probability: 0.4 },
          candidates: [{ move: "Q16", survival_score: 1, min_black_probability: 0.4 }],
          stones: [
            { move: "D4", color: "W" },
            { move: "Q16", color: "B" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "W",
          engine_side: "B",
          next_to_move: "W",
          moves_played: 2,
          stones: [
            { move: "D4", color: "W" },
            { move: "Q16", color: "B" },
          ],
        }),
      );

    renderBoard();
    await screen.findByTestId("mock-board-click");

    await user.click(screen.getByTestId("mock-board-click"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "/api/games/game-1/move",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ move: "D4" }),
        }),
      ),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        "/api/games/game-1/engine-move",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenNthCalledWith(5, "/api/games/game-1"));
  });

  it("requests engine move automatically when human plays Black on load", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "B",
          engine_side: "W",
          next_to_move: "W",
          moves_played: 0,
          stones: PRESET_SETUP_STONES,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "B",
          engine_side: "W",
          next_to_move: "B",
          move: "D4",
          moves_played: 1,
          survival_score: 1,
          metrics: { unresolved_count: 1, min_black_probability: 0.4 },
          candidates: [{ move: "D4", survival_score: 1, min_black_probability: 0.4 }],
          stones: [...PRESET_SETUP_STONES, { move: "D4", color: "W" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "B",
          engine_side: "W",
          next_to_move: "B",
          moves_played: 1,
          stones: [...PRESET_SETUP_STONES, { move: "D4", color: "W" }],
        }),
      );

    renderBoard();
    await screen.findByTestId("mock-board-click");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "/api/games/game-1/engine-move",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/games/game-1"));
    expect(captured.onGtpClick).toBeDefined();
  });

  it("does not submit a move when it is the engine turn", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        game_id: "game-1",
        preset_id: "balanced",
        board_size: 19,
        human_side: "W",
        engine_side: "B",
        next_to_move: "B",
        moves_played: 1,
        stones: [{ move: "D4", color: "W" }],
      }),
    );

    renderBoard();
    await screen.findByTestId("mock-board-click");
    expect(captured.onGtpClick).toBeUndefined();
    expect(screen.getByText("Black is thinking...")).toBeInTheDocument();

    await user.click(screen.getByTestId("mock-board-click"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("shows human to-play label when playing as Black", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        activeGame({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "B",
          engine_side: "W",
          next_to_move: "B",
          moves_played: 1,
          stones: PRESET_SETUP_STONES,
        }),
      ),
    );

    renderBoard();

    expect(await screen.findByText("Black to play")).toBeInTheDocument();
  });

  it("shows engine thinking label after the human submits a move", async () => {
    const user = userEvent.setup();
    let resolveMove: (value: Response) => void = () => undefined;
    const moveDeferred = new Promise<Response>((resolve) => {
      resolveMove = resolve;
    });

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          activeGame({
            game_id: "game-1",
            preset_id: "balanced",
            board_size: 19,
            human_side: "B",
            engine_side: "W",
            next_to_move: "B",
            moves_played: 0,
            stones: PRESET_SETUP_STONES,
          }),
        ),
      )
      .mockImplementationOnce(() => moveDeferred);

    renderBoard();
    await screen.findByTestId("mock-board-click");
    await user.click(screen.getByTestId("mock-board-click"));

    expect(await screen.findByText("White is thinking...")).toBeInTheDocument();

    resolveMove(
      jsonResponse(
        activeGame({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "B",
          engine_side: "W",
          next_to_move: "W",
          moves_played: 1,
          stones: [...PRESET_SETUP_STONES, { move: "D4", color: "B" }],
        }),
      ),
    );
  });

  it("loads analyze metrics when analyze is requested", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "W",
          engine_side: "B",
          next_to_move: "W",
          moves_played: 0,
          stones: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          game_id: "game-1",
          survival_score: 2,
          metrics: { unresolved_count: 2, min_black_probability: 0.55 },
        }),
      );

    renderBoard();
    await screen.findByRole("button", { name: /analyze position/i });

    await user.click(screen.getByRole("button", { name: /analyze position/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "/api/games/game-1/analyze",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(await screen.findByRole("region", { name: /engine reasoning/i })).toBeInTheDocument();
    expect(screen.getByText("0.550")).toBeInTheDocument();
  });

  it("shows engine metrics and candidate table after automatic engine response", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "W",
          engine_side: "B",
          next_to_move: "W",
          moves_played: 0,
          stones: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "W",
          engine_side: "B",
          next_to_move: "B",
          move: "D4",
          moves_played: 1,
          stones: [{ move: "D4", color: "W" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "W",
          engine_side: "B",
          next_to_move: "B",
          moves_played: 1,
          stones: [{ move: "D4", color: "W" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "W",
          engine_side: "B",
          next_to_move: "W",
          move: "Q16",
          moves_played: 2,
          survival_score: 1,
          metrics: { unresolved_count: 1, min_black_probability: 0.4 },
          candidates: [
            { move: "Q16", survival_score: 1, min_black_probability: 0.4 },
            { move: "D4", survival_score: 2, min_black_probability: 0.35 },
          ],
          stones: [
            { move: "D4", color: "W" },
            { move: "Q16", color: "B" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "W",
          engine_side: "B",
          next_to_move: "W",
          moves_played: 2,
          stones: [
            { move: "D4", color: "W" },
            { move: "Q16", color: "B" },
          ],
        }),
      );

    renderBoard();
    await screen.findByTestId("mock-board-click");

    await user.click(screen.getByTestId("mock-board-click"));

    expect(await screen.findByRole("table", { name: /candidate comparison/i })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /q16/i })).toHaveAttribute("data-selected", "true");
  });

  it("shows API error feedback when move submission fails", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "W",
          engine_side: "B",
          next_to_move: "W",
          moves_played: 0,
          stones: [],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ detail: "illegal move: D4" }, 400));

    renderBoard();
    await screen.findByTestId("mock-board-click");

    await user.click(screen.getByTestId("mock-board-click"));

    expect(await screen.findByRole("alert")).toHaveTextContent("illegal move: D4");
  });

  it("shows resignation message when engine resigns on opening", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          activeGame({
            game_id: "game-1",
            preset_id: "balanced",
            board_size: 19,
            human_side: "B",
            engine_side: "W",
            next_to_move: "W",
            moves_played: 0,
            difficulty: { max_visits: 20, top_n: 4, randomness: 0.35 },
            stones: PRESET_SETUP_STONES,
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ...activeGame({
            game_id: "game-1",
            preset_id: "balanced",
            board_size: 19,
            human_side: "B",
            engine_side: "W",
            next_to_move: "B",
            moves_played: 0,
            difficulty: { max_visits: 20, top_n: 4, randomness: 0.35 },
            stones: PRESET_SETUP_STONES,
          }),
          status: "finished",
          winner: "B",
          move: "",
          survival_score: 361,
          metrics: { unresolved_count: 361, min_black_probability: 0.995 },
          candidates: [],
          resigned: true,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          activeGame({
            game_id: "game-1",
            preset_id: "balanced",
            board_size: 19,
            human_side: "B",
            engine_side: "W",
            next_to_move: "B",
            moves_played: 0,
            difficulty: { max_visits: 20, top_n: 4, randomness: 0.35 },
            status: "finished",
            winner: "B",
            stones: PRESET_SETUP_STONES,
          }),
        ),
      );

    renderBoard();

    expect(await screen.findByRole("dialog", { name: /you win/i })).toBeInTheDocument();
    expect(captured.onGtpClick).toBeUndefined();
  });

  it("calls onTryAgain with current setup when Try again is clicked", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          activeGame({
            game_id: "game-1",
            preset_id: "balanced",
            board_size: 19,
            human_side: "B",
            engine_side: "W",
            next_to_move: "W",
            moves_played: 0,
            difficulty: { max_visits: 20, top_n: 4, randomness: 0.35 },
            stones: PRESET_SETUP_STONES,
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ...activeGame({
            game_id: "game-1",
            preset_id: "balanced",
            board_size: 19,
            human_side: "B",
            engine_side: "W",
            next_to_move: "B",
            moves_played: 0,
            difficulty: { max_visits: 20, top_n: 4, randomness: 0.35 },
            stones: PRESET_SETUP_STONES,
          }),
          status: "finished",
          winner: "B",
          move: "",
          survival_score: 361,
          metrics: { unresolved_count: 361, min_black_probability: 0.995 },
          candidates: [],
          resigned: true,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          activeGame({
            game_id: "game-1",
            preset_id: "balanced",
            board_size: 19,
            human_side: "B",
            engine_side: "W",
            next_to_move: "B",
            moves_played: 0,
            status: "finished",
            winner: "B",
            difficulty: { max_visits: 20, top_n: 4, randomness: 0.35 },
            stones: PRESET_SETUP_STONES,
          }),
        ),
      );

    renderBoard();
    await user.click(await screen.findByRole("button", { name: /try again/i }));

    expect(onTryAgain).toHaveBeenCalledWith({
      preset_id: "balanced",
      human_side: "B",
      difficulty: { max_visits: 20, top_n: 4, randomness: 0.35 },
    });
  });

  it("calls onNewGame when New game is clicked", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        activeGame({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "W",
          engine_side: "B",
          next_to_move: "W",
          moves_played: 0,
          stones: [],
        }),
      ),
    );

    renderBoard();
    await screen.findByRole("button", { name: /new game/i });
    await user.click(screen.getByRole("button", { name: /new game/i }));

    expect(onNewGame).toHaveBeenCalledTimes(1);
  });
});
