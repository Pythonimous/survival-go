import { useEffect, useState } from "react";

import type {
  CreateGamePayload,
  DifficultyConfig,
  DifficultyPreset,
  PresetMetadata,
  StoneColor,
} from "@/types/api";
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
      "KataGo ranks moves by composite Survival difficulty score. Only the top N candidates stay in the shortlist used for blunder filtering and final selection.",
  },
  variantAwareness: {
    hint: "How strongly to prioritize the Survival objective over plausible KataGo ideas (0-1).",
    detail:
      "Higher values make the engine focus on the side-aware bottleneck objective. Lower values keep more policy-guided variation, which feels more human-like on easier settings.",
  },
  temperature: {
    hint: "How much variety the engine keeps when sampling among safe candidates.",
    detail:
      "After filtering blunders, the engine softmax-samples by score. Lower temperature is more deterministic; higher temperature explores alternatives while still respecting the margin.",
  },
} as const;

const HUMAN_SIDE_ROLE_HINT =
  "Black tries to secure the whole board. White tries to survive at any cost.";

const HUMAN_SIDE_LABELS: Record<StoneColor, string> = {
  B: "Black: take the whole board",
  W: "White: make a single living group.",
};

type GameSetupProps = {
  presets: readonly PresetMetadata[];
  difficultyPresets: readonly DifficultyPreset[];
  onStart: (payload: CreateGamePayload) => void;
  startDisabled?: boolean;
};

export default function GameSetup({
  presets,
  difficultyPresets,
  onStart,
  startDisabled = false,
}: GameSetupProps) {
  const [presetId, setPresetId] = useState(presets[0]?.id ?? "");
  const [humanSide, setHumanSide] = useState<StoneColor>("W");
  const [difficultyPresetId, setDifficultyPresetId] = useState(difficultyPresets[0]?.id ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [maxVisits, setMaxVisits] = useState(difficultyPresets[0]?.config.max_visits ?? 20);
  const [topN, setTopN] = useState(difficultyPresets[0]?.config.top_n ?? 4);
  const [variantAwareness, setVariantAwareness] = useState(
    difficultyPresets[0]?.config.variant_awareness ?? 0.6,
  );
  const [temperature, setTemperature] = useState(difficultyPresets[0]?.config.temperature ?? 0.35);

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
    setVariantAwareness(selectedDifficultyPreset.config.variant_awareness);
    setTemperature(selectedDifficultyPreset.config.temperature);
  }, [selectedDifficultyPreset?.id]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPreset || !selectedDifficultyPreset) {
      return;
    }
    const difficulty: DifficultyConfig = {
      max_visits: Math.max(1, Math.floor(maxVisits)),
      top_n: Math.max(1, Math.floor(topN)),
      randomness: Math.min(1, Math.max(0, temperature)),
      variant_awareness: Math.min(1, Math.max(0, variantAwareness)),
      policy_anchor: selectedDifficultyPreset.config.policy_anchor,
      score_anchor: selectedDifficultyPreset.config.score_anchor,
      temperature: Math.max(0, temperature),
      blunder_margin: selectedDifficultyPreset.config.blunder_margin,
      global_weight: selectedDifficultyPreset.config.global_weight,
      local_weight: selectedDifficultyPreset.config.local_weight,
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
        <p className="game-setup__hint">{HUMAN_SIDE_ROLE_HINT}</p>
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
              {HUMAN_SIDE_LABELS[side]}
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
            <label htmlFor="game-setup-variant-awareness">Variant awareness</label>
            <FieldHelp
              fieldName="Variant awareness"
              hint={ADVANCED_FIELD_HELP.variantAwareness.hint}
              detail={ADVANCED_FIELD_HELP.variantAwareness.detail}
            />
            <input
              id="game-setup-variant-awareness"
              className="game-setup__field-input"
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={variantAwareness}
              onChange={(event) => setVariantAwareness(Number(event.target.value))}
            />
          </div>
          <div className="game-setup__field">
            <label htmlFor="game-setup-temperature">Variety temperature</label>
            <FieldHelp
              fieldName="Variety temperature"
              hint={ADVANCED_FIELD_HELP.temperature.hint}
              detail={ADVANCED_FIELD_HELP.temperature.detail}
            />
            <input
              id="game-setup-temperature"
              className="game-setup__field-input"
              type="number"
              min={0}
              step={0.01}
              value={temperature}
              onChange={(event) => setTemperature(Number(event.target.value))}
            />
          </div>
        </fieldset>
      )}
      <button type="submit" disabled={startDisabled}>
        Start game
      </button>
    </form>
  );
}
