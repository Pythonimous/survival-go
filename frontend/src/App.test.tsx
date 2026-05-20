import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import {
  reportOnnxModelDownloadStarted,
  reportOnnxModelReady,
  resetOnnxModelLoadSnapshotForTests,
} from "@/lib/analysis/runtime/loadProgress";
import { clearUserSelectedOnnxModelVariant } from "@/lib/analysis/runtime/modelVariant";

const { loadOnnxModelVariantMock } = vi.hoisted(() => ({
  loadOnnxModelVariantMock: vi.fn(),
}));

vi.mock("@/lib/analysis/runtime/modelLoader", () => ({
  warmupOnnxModelSession: vi.fn(async () => undefined),
  resetOnnxWarmupForTests: vi.fn(),
  loadOnnxModelVariant: loadOnnxModelVariantMock,
}));

loadOnnxModelVariantMock.mockImplementation(async (variant: "fp32" | "fp16" | "uint8") => {
  reportOnnxModelDownloadStarted(`/models/kaya.${variant}.onnx`, variant);
  reportOnnxModelReady(`/models/kaya.${variant}.onnx`, variant);
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockPresetsResponses(): void {
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
        config: {
          max_visits: 20,
          top_n: 4,
          randomness: 0.35,
          variant_awareness: 0.6,
          policy_anchor: 0.45,
          score_anchor: 0.1,
          temperature: 0.35,
          blunder_margin: 0.04,
          global_weight: 1.0,
          local_weight: 0.0,
        },
      },
    ]),
  );
}

async function pickFp16Model(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole("button", { name: /half precision \(fp16/i }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /start game/i })).not.toBeDisabled(),
  );
}

const fetchMock = vi.fn<typeof fetch>();

describe("App", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    loadOnnxModelVariantMock.mockClear();
    loadOnnxModelVariantMock.mockImplementation(async (variant: "fp32" | "fp16" | "uint8") => {
      reportOnnxModelDownloadStarted(`/models/kaya.${variant}.onnx`, variant);
      reportOnnxModelReady(`/models/kaya.${variant}.onnx`, variant);
    });
    resetOnnxModelLoadSnapshotForTests();
    clearUserSelectedOnnxModelVariant();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetOnnxModelLoadSnapshotForTests();
    clearUserSelectedOnnxModelVariant();
  });

  it("loads presets from GET /api/presets on startup", async () => {
    mockPresetsResponses();

    render(<App />);

    expect(fetchMock).toHaveBeenCalledWith("/api/presets");
    expect(fetchMock).toHaveBeenCalledWith("/api/difficulty-presets");
    expect(await screen.findByRole("radio", { name: /^balanced$/i })).toBeInTheDocument();
  });

  it("disables Start game until the user picks and loads a model", async () => {
    const user = userEvent.setup();
    mockPresetsResponses();

    render(<App />);
    await screen.findByRole("radio", { name: /^balanced$/i });

    const startButton = screen.getByRole("button", { name: /start game/i });
    expect(startButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /half precision \(fp16/i }));

    await waitFor(() => expect(loadOnnxModelVariantMock).toHaveBeenCalledWith("fp16"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /start game/i })).not.toBeDisabled(),
    );
    const picker = screen.getByRole("region", { name: /model picker/i });
    expect(picker).toHaveTextContent(/fp16 model ready/i);
  });

  it("posts game setup to /api/games when start is clicked after picking a model", async () => {
    const user = userEvent.setup();
    mockPresetsResponses();
    fetchMock
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
    await pickFp16Model(user);
    await user.click(screen.getByRole("button", { name: /start game/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/games",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const createCall = fetchMock.mock.calls[2];
    const createPayload = JSON.parse(String((createCall[1] as RequestInit).body));
    expect(createPayload).toEqual(
      expect.objectContaining({
        preset_id: "balanced",
        human_side: "W",
        difficulty: expect.objectContaining({
          max_visits: 20,
          top_n: 4,
          randomness: 0.35,
          variant_awareness: 0.6,
          temperature: 0.35,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/games/game-1");
    expect(screen.getByRole("button", { name: /new game/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start game/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: /difficulty/i })).not.toBeInTheDocument();
  });

  it("shows footer inference note and links to GitHub and feedback", async () => {
    mockPresetsResponses();

    render(<App />);

    expect(
      await screen.findByText(/inference runs in your browser on your device/i),
    ).toBeInTheDocument();

    const sourceLink = await screen.findByRole("link", { name: /source on github/i });
    expect(sourceLink).toHaveAttribute("href", "https://github.com/Pythonimous/survival-go");
    expect(sourceLink).toHaveAttribute("target", "_blank");
    expect(sourceLink).toHaveAttribute("rel", "noopener noreferrer");

    const feedbackLink = screen.getByRole("link", { name: /send feedback/i });
    expect(feedbackLink).toHaveAttribute(
      "href",
      "https://github.com/Pythonimous/survival-go/issues/new",
    );
  });

  it("returns to setup when New game is clicked", async () => {
    const user = userEvent.setup();
    mockPresetsResponses();
    fetchMock
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
    await pickFp16Model(user);
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
