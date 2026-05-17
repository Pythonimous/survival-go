import { useEffect, useState } from "react";

import type {
  CreateGamePayload,
  DifficultyConfig,
  DifficultyPreset,
  PresetMetadata,
  StoneColor,
} from "../types/api";
import FieldHelp from "./FieldHelp";

const ADVANCED_FIELD_HELP = {
  maxVisits: {
    hint: "How many simulations KataGo runs per decision. More visits usually means stronger play but slower responses.",
    detail:
      "Each visit is one search step. The engine stops after this budget and chooses from what it learned. Presets set a baseline; raise this for tougher opponents at the cost of longer waits.",
  },
  topN: {
    hint: "How many best moves the engine keeps in its shortlist before picking one.",
    detail:
      "KataGo ranks moves by survival score. Only the top N candidates stay in the shortlist used for selection. Lower values make play more focused; higher values allow more variety before randomness is applied.",
  },
  randomness: {
    hint: "Chance to skip the top-ranked move and sample another move from the top candidates (0–1).",
    detail:
      "On each engine turn, with probability equal to this value, the engine skips the #1 ranked move and uniformly chooses among ranks 2 through N. At 0 it always plays the top move; at 1 it never picks #1 when N is at least 2.",
  },
} as const;

type GameSetupProps = {
  presets: readonly PresetMetadata[];
  difficultyPresets: readonly DifficultyPreset[];
  onStart: (payload: CreateGamePayload) => void;
};

export default function GameSetup({ presets, difficultyPresets, onStart }: GameSetupProps) {
  const [presetId, setPresetId] = useState(presets[0]?.id ?? "");
  const [humanSide, setHumanSide] = useState<StoneColor>("W");
  const [difficultyPresetId, setDifficultyPresetId] = useState(difficultyPresets[0]?.id ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [maxVisits, setMaxVisits] = useState(difficultyPresets[0]?.config.max_visits ?? 20);
  const [topN, setTopN] = useState(difficultyPresets[0]?.config.top_n ?? 4);
  const [randomness, setRandomness] = useState(difficultyPresets[0]?.config.randomness ?? 0.35);

  const selectedPreset = presets.find((preset) => preset.id === presetId);
  const selectedDifficultyPreset = difficultyPresets.find(
    (preset) => preset.id === difficultyPresetId,
  );

  useEffect(() => {
    if (selectedPreset) {
      setHumanSide(selectedPreset.initial_player_to_move);
    }
  }, [selectedPreset?.id, selectedPreset?.initial_player_to_move]);

  useEffect(() => {
    if (!selectedDifficultyPreset) {
      return;
    }
    setMaxVisits(selectedDifficultyPreset.config.max_visits);
    setTopN(selectedDifficultyPreset.config.top_n);
    setRandomness(selectedDifficultyPreset.config.randomness);
  }, [selectedDifficultyPreset?.id]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPreset || !selectedDifficultyPreset) {
      return;
    }
    const difficulty: DifficultyConfig = {
      max_visits: Math.max(1, Math.floor(maxVisits)),
      top_n: Math.max(1, Math.floor(topN)),
      randomness: Math.min(1, Math.max(0, randomness)),
    };
    onStart({
      preset_id: selectedPreset.id,
      human_side: humanSide,
      difficulty,
    });
  };

  if (presets.length === 0 || difficultyPresets.length === 0) {
    return <p>No presets available.</p>;
  }

  return (
    <form className="game-setup" onSubmit={handleSubmit}>
      <fieldset>
        <legend>Preset</legend>
        <div role="radiogroup" aria-label="Preset" className="game-setup__presets">
          {presets.map((preset) => (
            <label key={preset.id}>
              <input
                type="radio"
                name="preset"
                value={preset.id}
                checked={presetId === preset.id}
                onChange={() => setPresetId(preset.id)}
              />
              {preset.name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Your color</legend>
        <div role="radiogroup" aria-label="Your color" className="game-setup__sides">
          {(["B", "W"] as const).map((side) => (
            <label key={side}>
              <input
                type="radio"
                name="human-side"
                value={side}
                checked={humanSide === side}
                onChange={() => setHumanSide(side)}
              />
              {side === "B" ? "Black" : "White"}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Difficulty</legend>
        <div role="radiogroup" aria-label="Difficulty" className="game-setup__difficulty">
          {difficultyPresets.map((preset) => (
            <label key={preset.id}>
              <input
                type="radio"
                name="difficulty"
                value={preset.id}
                checked={difficultyPresetId === preset.id}
                onChange={() => setDifficultyPresetId(preset.id)}
              />
              {preset.name}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="game-setup__disclaimer">
        Stronger settings may increase AI response time.
      </p>
      <button
        type="button"
        aria-expanded={advancedOpen}
        onClick={() => setAdvancedOpen((open) => !open)}
      >
        Advanced
      </button>
      {advancedOpen && (
        <fieldset className="game-setup__advanced">
          <legend>Advanced difficulty tuning</legend>
          <div className="game-setup__field">
            <label htmlFor="game-setup-max-visits">Max visits</label>
            <FieldHelp
              fieldName="Max visits"
              hint={ADVANCED_FIELD_HELP.maxVisits.hint}
              detail={ADVANCED_FIELD_HELP.maxVisits.detail}
            />
            <input
              id="game-setup-max-visits"
              className="game-setup__field-input"
              type="number"
              min={1}
              value={maxVisits}
              onChange={(event) => setMaxVisits(Number(event.target.value))}
            />
          </div>
          <div className="game-setup__field">
            <label htmlFor="game-setup-top-n">Top candidates</label>
            <FieldHelp
              fieldName="Top candidates"
              hint={ADVANCED_FIELD_HELP.topN.hint}
              detail={ADVANCED_FIELD_HELP.topN.detail}
            />
            <input
              id="game-setup-top-n"
              className="game-setup__field-input"
              type="number"
              min={1}
              value={topN}
              onChange={(event) => setTopN(Number(event.target.value))}
            />
          </div>
          <div className="game-setup__field">
            <label htmlFor="game-setup-randomness">Randomness</label>
            <FieldHelp
              fieldName="Randomness"
              hint={ADVANCED_FIELD_HELP.randomness.hint}
              detail={ADVANCED_FIELD_HELP.randomness.detail}
            />
            <input
              id="game-setup-randomness"
              className="game-setup__field-input"
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={randomness}
              onChange={(event) => setRandomness(Number(event.target.value))}
            />
          </div>
        </fieldset>
      )}
      <button type="submit">Start game</button>
    </form>
  );
}
