import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DifficultyPreset, PresetMetadata } from "../types/api";
import GameSetup from "./GameSetup";

const SAMPLE_PRESETS: PresetMetadata[] = [
  {
    id: "balanced",
    name: "Balanced",
    board_size: 19,
    initial_player_to_move: "W",
  },
  {
    id: "black-flavoured",
    name: "Black Flavoured",
    board_size: 19,
    initial_player_to_move: "W",
  },
];

const DIFFICULTY_PRESETS: DifficultyPreset[] = [
  {
    id: "easy",
    name: "Easy",
    description: "Fast and forgiving",
    config: {
      max_visits: 12,
      top_n: 6,
      randomness: 0.7,
      variant_awareness: 0.35,
      policy_anchor: 0.6,
      score_anchor: 0.1,
      temperature: 0.7,
      blunder_margin: 0.08,
      global_weight: 1.0,
      local_weight: 0.0,
    },
  },
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
];

function presetGroup() {
  return within(screen.getByRole("radiogroup", { name: /^preset$/i }));
}

function sideGroup() {
  return within(screen.getByRole("radiogroup", { name: /^your color$/i }));
}

describe("GameSetup", () => {
  it("renders preset options from props", () => {
    render(
      <GameSetup presets={SAMPLE_PRESETS} difficultyPresets={DIFFICULTY_PRESETS} onStart={vi.fn()} />,
    );

    expect(screen.getByRole("radiogroup", { name: /^preset$/i })).toBeInTheDocument();
    expect(presetGroup().getByRole("radio", { name: /^balanced$/i })).toBeInTheDocument();
    expect(presetGroup().getByRole("radio", { name: /^black flavoured$/i })).toBeInTheDocument();
  });

  it("selects a preset when the user picks a radio option", async () => {
    const user = userEvent.setup();
    render(
      <GameSetup presets={SAMPLE_PRESETS} difficultyPresets={DIFFICULTY_PRESETS} onStart={vi.fn()} />,
    );

    const blackFlavoured = presetGroup().getByRole("radio", { name: /^black flavoured$/i });
    await user.click(blackFlavoured);

    expect(blackFlavoured).toBeChecked();
  });

  it("renders human side selection with role descriptions", () => {
    render(
      <GameSetup presets={SAMPLE_PRESETS} difficultyPresets={DIFFICULTY_PRESETS} onStart={vi.fn()} />,
    );

    expect(screen.getByRole("radiogroup", { name: /^your color$/i })).toBeInTheDocument();
    expect(
      screen.getByText(/black tries to secure the whole board\. white tries to survive at any cost/i),
    ).toBeInTheDocument();
    expect(
      sideGroup().getByRole("radio", { name: /black: take the whole board/i }),
    ).toBeInTheDocument();
    expect(
      sideGroup().getByRole("radio", { name: /white: make a single living group/i }),
    ).toBeInTheDocument();
  });

  it("defaults human side to the selected preset initial player", async () => {
    const user = userEvent.setup();
    render(
      <GameSetup presets={SAMPLE_PRESETS} difficultyPresets={DIFFICULTY_PRESETS} onStart={vi.fn()} />,
    );

    await user.click(presetGroup().getByRole("radio", { name: /^black flavoured$/i }));

    expect(
      sideGroup().getByRole("radio", { name: /white: make a single living group/i }),
    ).toBeChecked();
  });

  it("allows start when human picks Black on a White-to-move preset", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      <GameSetup
        presets={SAMPLE_PRESETS}
        difficultyPresets={DIFFICULTY_PRESETS}
        onStart={onStart}
      />,
    );

    await user.click(
      sideGroup().getByRole("radio", { name: /black: take the whole board/i }),
    );
    await user.click(screen.getByRole("button", { name: /start game/i }));

    expect(onStart).toHaveBeenCalledWith({
      preset_id: "balanced",
      human_side: "B",
      difficulty: expect.objectContaining({
        max_visits: 12,
        top_n: 6,
        randomness: 0.7,
        variant_awareness: 0.35,
        temperature: 0.7,
      }),
    });
  });

  it("calls onStart with preset_id and human_side when configuration is valid", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      <GameSetup
        presets={SAMPLE_PRESETS}
        difficultyPresets={DIFFICULTY_PRESETS}
        onStart={onStart}
      />,
    );

    await user.click(presetGroup().getByRole("radio", { name: /^black flavoured$/i }));
    await user.click(screen.getByRole("button", { name: /start game/i }));

    expect(onStart).toHaveBeenCalledWith({
      preset_id: "black-flavoured",
      human_side: "W",
      difficulty: expect.objectContaining({
        max_visits: 12,
        top_n: 6,
        randomness: 0.7,
        variant_awareness: 0.35,
        temperature: 0.7,
      }),
    });
  });

  it("supports advanced difficulty overrides", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      <GameSetup
        presets={SAMPLE_PRESETS}
        difficultyPresets={DIFFICULTY_PRESETS}
        onStart={onStart}
      />,
    );

    await user.click(screen.getByRole("button", { name: /advanced/i }));
    await user.clear(screen.getByRole("spinbutton", { name: /^max visits$/i }));
    await user.type(screen.getByRole("spinbutton", { name: /^max visits$/i }), "42");
    await user.clear(screen.getByRole("spinbutton", { name: /^top candidates$/i }));
    await user.type(screen.getByRole("spinbutton", { name: /^top candidates$/i }), "3");
    await user.clear(screen.getByRole("spinbutton", { name: /^variant awareness$/i }));
    await user.type(screen.getByRole("spinbutton", { name: /^variant awareness$/i }), "0.7");
    await user.clear(screen.getByRole("spinbutton", { name: /^variety temperature$/i }));
    await user.type(screen.getByRole("spinbutton", { name: /^variety temperature$/i }), "0.15");
    await user.click(screen.getByRole("button", { name: /start game/i }));

    expect(onStart).toHaveBeenCalledWith({
      preset_id: "balanced",
      human_side: "W",
      difficulty: expect.objectContaining({
        max_visits: 42,
        top_n: 3,
        variant_awareness: 0.7,
        temperature: 0.15,
      }),
    });
  });

  it("shows think-time disclaimer", () => {
    render(
      <GameSetup presets={SAMPLE_PRESETS} difficultyPresets={DIFFICULTY_PRESETS} onStart={vi.fn()} />,
    );

    expect(screen.getByText(/stronger settings may increase ai response time/i)).toBeInTheDocument();
  });

  it("shows stacked advanced fields with hints when advanced is open", async () => {
    const user = userEvent.setup();
    render(
      <GameSetup presets={SAMPLE_PRESETS} difficultyPresets={DIFFICULTY_PRESETS} onStart={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: /advanced/i }));

    expect(screen.getByText(/simulations kataGo runs per decision/i)).toBeInTheDocument();
    expect(screen.getByText(/best moves the engine keeps in its shortlist/i)).toBeInTheDocument();
    expect(screen.getByText(/plausible kataGo ideas/i)).toBeInTheDocument();
    expect(screen.getByText(/how much variety the engine keeps/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /more information about max visits/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /more information about top candidates/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /more information about variant awareness/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /more information about variety temperature/i }),
    ).toBeInTheDocument();
  });
});
