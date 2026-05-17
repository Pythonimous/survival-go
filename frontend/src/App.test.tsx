import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("App", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads presets from GET /api/presets on startup", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          id: "balanced",
          name: "Balanced",
          board_size: 19,
          initial_player_to_move: "W",
        },
      ]),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          id: "normal",
          name: "Normal",
          description: "Balanced baseline",
          config: { max_visits: 20, top_n: 4, randomness: 0.35 },
        },
      ]),
    );

    render(<App />);

    expect(fetchMock).toHaveBeenCalledWith("/api/presets");
    expect(fetchMock).toHaveBeenCalledWith("/api/difficulty-presets");
    expect(await screen.findByRole("radio", { name: /^balanced$/i })).toBeInTheDocument();
  });

  it("posts game setup to /api/games when start is clicked", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: "balanced",
            name: "Balanced",
            board_size: 19,
            initial_player_to_move: "W",
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: "normal",
            name: "Normal",
            description: "Balanced baseline",
            config: { max_visits: 20, top_n: 4, randomness: 0.35 },
          },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse({ game_id: "game-1" }, 201))
      .mockResolvedValueOnce(
        jsonResponse({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "W",
          engine_side: "B",
          next_to_move: "W",
          moves_played: 0,
          last_move: null,
          status: "active",
          winner: null,
          stones: [],
        }),
      );

    render(<App />);

    await screen.findByRole("radio", { name: /^balanced$/i });
    await user.click(screen.getByRole("button", { name: /start game/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/games",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preset_id: "balanced",
          human_side: "W",
          difficulty: { max_visits: 20, top_n: 4, randomness: 0.35 },
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/games/game-1");
    expect(screen.getByRole("button", { name: /new game/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start game/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: /difficulty/i })).not.toBeInTheDocument();
  });

  it("shows a footer link to the GitHub repository", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          id: "balanced",
          name: "Balanced",
          board_size: 19,
          initial_player_to_move: "W",
        },
      ]),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          id: "normal",
          name: "Normal",
          description: "Balanced baseline",
          config: { max_visits: 20, top_n: 4, randomness: 0.35 },
        },
      ]),
    );

    render(<App />);

    const link = await screen.findByRole("link", { name: /source on github/i });
    expect(link).toHaveAttribute("href", "https://github.com/Pythonimous/survival-go");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("returns to setup when New game is clicked", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: "balanced",
            name: "Balanced",
            board_size: 19,
            initial_player_to_move: "W",
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: "normal",
            name: "Normal",
            description: "Balanced baseline",
            config: { max_visits: 20, top_n: 4, randomness: 0.35 },
          },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse({ game_id: "game-1" }, 201))
      .mockResolvedValueOnce(
        jsonResponse({
          game_id: "game-1",
          preset_id: "balanced",
          board_size: 19,
          human_side: "W",
          engine_side: "B",
          next_to_move: "W",
          moves_played: 0,
          last_move: null,
          status: "active",
          winner: null,
          stones: [],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    render(<App />);
    await screen.findByRole("radio", { name: /^balanced$/i });
    await user.click(screen.getByRole("button", { name: /start game/i }));
    await screen.findByRole("button", { name: /new game/i });

    await user.click(screen.getByRole("button", { name: /new game/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/games/game-1", { method: "DELETE" }),
    );
    expect(screen.getByRole("button", { name: /start game/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new game/i })).not.toBeInTheDocument();
  });
});
