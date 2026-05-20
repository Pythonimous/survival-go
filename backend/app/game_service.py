"""In-memory game orchestration for API endpoints."""

from __future__ import annotations

import copy
import random
from collections.abc import Sequence
from dataclasses import dataclass
from math import exp
from typing import Literal, Protocol
from uuid import uuid4

from sgfmill import boards

from backend.app.engine.board import (
    StoneColor,
    format_gtp_coordinate,
    parse_gtp_coordinate,
    to_sgfmill_color,
)
from backend.app.engine.evaluator import (
    SurvivalEvaluation,
    SurvivalMetrics,
    evaluate_survival_position,
)
from backend.app.engine.resignation import should_engine_resign
from backend.app.engine.move_selector import (
    CandidateMove,
    filter_blunders,
    rank_candidates_for_side,
    select_candidate_for_side,
)
from backend.app.difficulty import DifficultyConfig
from backend.app.presets.loader import (
    PresetLoadError,
    get_preset_by_id,
    list_preset_metadata,
)


class GameServiceError(ValueError):
    """Base validation error for game operations."""


class GameNotFoundError(GameServiceError):
    """Raised when a game id is unknown."""


GameStatus = Literal["active", "finished"]


@dataclass(frozen=True, slots=True)
class EngineMoveResult:
    """Outcome of an engine move including reasoning for the UI."""

    game: GameState
    move: str
    survival_score: int
    metrics: SurvivalMetrics
    candidates: list[CandidateMove]
    resigned: bool = False


@dataclass(frozen=True, slots=True)
class AnalysisResult:
    """Canonical analysis contract returned to API handlers."""

    survival_score: int
    metrics: SurvivalMetrics
    policy: list[float] | None = None
    p_black: list[float] | None = None
    score_lead: float | None = None
    winrate: float | None = None


@dataclass(frozen=True, slots=True)
class BrowserEngineMoveCandidate:
    """Browser-provided candidate move plus raw model outputs."""

    move: str
    policy_prob: float
    policy: Sequence[float]
    ownership: Sequence[float]
    value: Sequence[float] | None = None
    miscvalue: Sequence[float] | None = None


class RandomSource(Protocol):
    def random(self) -> float: ...


@dataclass(slots=True)
class GameState:
    """One in-memory game session."""

    game_id: str
    preset_id: str
    human_side: StoneColor
    engine_side: StoneColor
    next_to_move: StoneColor
    board: boards.Board
    difficulty: DifficultyConfig
    moves_played: int = 0
    last_move: str | None = None
    status: GameStatus = "active"
    winner: StoneColor | None = None

    @property
    def board_size(self) -> int:
        return self.board.side

    def stones(self) -> list[dict[str, str]]:
        points: list[dict[str, str]] = []
        for row in range(self.board.side):
            for col in range(self.board.side):
                colour = self.board.get(row, col)
                if colour is None:
                    continue
                points.append(
                    {
                        "move": format_gtp_coordinate(row, col, size=self.board.side),
                        "color": "B" if colour == "b" else "W",
                    }
                )
        return points


class InMemoryGameService:
    """Game lifecycle orchestration backed by process memory."""

    def __init__(
        self,
        *,
        survival_threshold: float,
        default_max_visits: int = 20,
        default_top_n: int = 8,
        random_source: RandomSource | None = None,
    ) -> None:
        if default_top_n < 1:
            raise ValueError("default_top_n must be at least 1")
        self._games: dict[str, GameState] = {}
        self._survival_threshold = survival_threshold
        self._default_max_visits = default_max_visits
        self._default_top_n = default_top_n
        self._random_source = random_source or random.Random()

    def list_presets(self) -> list[dict[str, object]]:
        return [preset.model_dump() for preset in list_preset_metadata()]

    def create_game(
        self,
        *,
        preset_id: str,
        human_side: StoneColor,
        difficulty: DifficultyConfig | None = None,
    ) -> GameState:
        try:
            preset = get_preset_by_id(preset_id)
        except PresetLoadError as exc:
            raise GameServiceError(str(exc)) from exc

        if human_side not in ("B", "W"):
            raise GameServiceError("human_side must be 'B' or 'W'")

        game_id = uuid4().hex
        engine_side: StoneColor = "W" if human_side == "B" else "B"
        game = GameState(
            game_id=game_id,
            preset_id=preset.id,
            human_side=human_side,
            engine_side=engine_side,
            next_to_move=preset.initial_player_to_move,
            board=copy.deepcopy(preset.board),
            difficulty=(difficulty or self._default_difficulty()).model_copy(deep=True),
        )
        self._games[game_id] = game
        return game

    def delete_game(self, game_id: str) -> None:
        game = self._games.pop(game_id, None)
        if game is None:
            raise GameNotFoundError(f"game not found: {game_id}")

    def shutdown(self) -> None:
        self._games.clear()

    def get_game(self, game_id: str) -> GameState:
        game = self._games.get(game_id)
        if game is None:
            raise GameNotFoundError(f"game not found: {game_id}")
        return game

    def apply_human_move(self, *, game_id: str, move: str) -> GameState:
        game = self.get_game(game_id)
        if game.status == "finished":
            raise GameServiceError("game is already finished")
        if game.next_to_move != game.human_side:
            raise GameServiceError("it is not the human side turn")
        self._play_move(game, move=move, side=game.human_side)
        game.next_to_move = game.engine_side
        return game

    def apply_human_resign(self, *, game_id: str) -> GameState:
        game = self.get_game(game_id)
        if game.status == "finished":
            raise GameServiceError("game is already finished")
        game.status = "finished"
        game.winner = game.engine_side
        game.next_to_move = game.engine_side
        return game

    def apply_engine_move_from_browser_payload(
        self,
        *,
        game_id: str,
        position_policy: Sequence[float],
        position_ownership: Sequence[float],
        position_value: Sequence[float] | None,
        position_miscvalue: Sequence[float] | None,
        candidates: Sequence[BrowserEngineMoveCandidate],
    ) -> EngineMoveResult:
        game = self.get_game(game_id)
        if game.status == "finished":
            raise GameServiceError("game is already finished")
        if game.next_to_move != game.engine_side:
            raise GameServiceError("it is not the engine side turn")

        root = self.analyze_raw_model_outputs(
            game_id=game_id,
            policy=position_policy,
            ownership=position_ownership,
            value=position_value,
            miscvalue=position_miscvalue,
        )
        root_evaluation = SurvivalEvaluation(
            survival_score=root.survival_score,
            metrics=root.metrics,
        )
        if should_engine_resign(
            engine_side=game.engine_side,
            min_black_probability=root.metrics.min_black_probability,
        ):
            return self._engine_resign(game, evaluation=root_evaluation)

        browser_candidates = self._ranked_candidates_from_browser_payload(
            game=game,
            candidates=candidates,
        )
        return self._finalize_engine_move_from_candidates(
            game=game,
            candidates=browser_candidates,
        )

    def _finalize_engine_move_from_candidates(
        self,
        *,
        game: GameState,
        candidates: list[CandidateMove],
    ) -> EngineMoveResult:
        # Survival rerank runs on the full browser payload; top_n truncates only
        # after ranking (selection + display shortlist).
        ranked = rank_candidates_for_side(
            candidates,
            engine_side=game.engine_side,
            difficulty=game.difficulty,
        )
        ranked_shortlist = ranked[: min(self._game_top_n(game), len(ranked))]
        selected = self._select_engine_move(ranked_shortlist, game=game)
        filtered_shortlist = filter_blunders(
            ranked_shortlist,
            engine_side=game.engine_side,
            difficulty=game.difficulty,
        )
        self._play_move(game, move=selected.move, side=game.engine_side)
        game.next_to_move = game.human_side
        return EngineMoveResult(
            game=game,
            move=selected.move,
            survival_score=selected.survival_score,
            metrics=SurvivalMetrics(
                unresolved_count=selected.survival_score,
                min_black_probability=selected.min_black_probability,
            ),
            candidates=filtered_shortlist,
        )

    def _ranked_candidates_from_browser_payload(
        self,
        *,
        game: GameState,
        candidates: Sequence[BrowserEngineMoveCandidate],
    ) -> list[CandidateMove]:
        resolved: list[CandidateMove] = []
        for candidate in candidates:
            if not self._is_legal_candidate_move(
                game,
                move=candidate.move,
                side=game.engine_side,
            ):
                continue
            evaluation = self.analyze_raw_model_outputs(
                game_id=game.game_id,
                policy=candidate.policy,
                ownership=candidate.ownership,
                value=candidate.value,
                miscvalue=candidate.miscvalue,
            )
            resolved.append(
                CandidateMove(
                    move=candidate.move,
                    survival_score=evaluation.survival_score,
                    min_black_probability=evaluation.metrics.min_black_probability,
                    policy=candidate.policy_prob,
                    score_lead=evaluation.score_lead,
                )
            )
        if not resolved:
            raise GameServiceError("no legal engine moves available")
        return resolved

    def analyze_raw_model_outputs(
        self,
        *,
        game_id: str,
        policy: Sequence[float],
        ownership: Sequence[float],
        value: Sequence[float] | None = None,
        miscvalue: Sequence[float] | None = None,
    ) -> AnalysisResult:
        game = self.get_game(game_id)
        expected_points = game.board.side * game.board.side
        expected_policy_points = expected_points + 1
        if len(policy) < expected_policy_points:
            raise GameServiceError(
                "raw policy length "
                f"{len(policy)} is below required points {expected_policy_points}"
            )
        if len(ownership) != expected_points:
            raise GameServiceError(
                "raw ownership length "
                f"{len(ownership)} does not match board points {expected_points}"
            )
        if miscvalue is not None and len(miscvalue) != 10:
            raise GameServiceError(
                "raw miscvalue length "
                f"{len(miscvalue)} does not match required length 10"
            )
        policy_probs = _softmax([float(item) for item in policy[:expected_policy_points]])
        p_black = _ownership_to_p_black(ownership)
        evaluation = evaluate_survival_position(p_black, threshold=self._survival_threshold)
        return AnalysisResult(
            survival_score=evaluation.survival_score,
            metrics=evaluation.metrics,
            policy=policy_probs,
            p_black=p_black,
            score_lead=_extract_score_lead(miscvalue),
            winrate=_extract_winrate(value),
        )

    def _engine_resign(
        self, game: GameState, *, evaluation: SurvivalEvaluation
    ) -> EngineMoveResult:
        game.status = "finished"
        game.winner = game.human_side
        game.next_to_move = game.human_side
        return EngineMoveResult(
            game=game,
            move="",
            survival_score=evaluation.survival_score,
            metrics=evaluation.metrics,
            candidates=[],
            resigned=True,
        )

    def legal_moves_for_side(self, game: GameState, *, side: StoneColor) -> list[str]:
        """Return every legal GTP move for ``side`` on the current board."""
        legal: list[str] = []
        for row in range(game.board.side):
            for col in range(game.board.side):
                if game.board.get(row, col) is not None:
                    continue
                move = format_gtp_coordinate(row, col, size=game.board.side)
                if self._is_legal_candidate_move(game, move=move, side=side):
                    legal.append(move)
        return legal

    def _is_legal_candidate_move(self, game: GameState, *, move: str, side: StoneColor) -> bool:
        try:
            row, col = parse_gtp_coordinate(move, size=game.board.side)
        except ValueError:
            return False
        if game.board.get(row, col) is not None:
            return False
        trial = copy.deepcopy(game.board)
        try:
            trial.play(row, col, to_sgfmill_color(side))
        except ValueError:
            return False
        return True

    def _play_move(self, game: GameState, *, move: str, side: StoneColor) -> None:
        row, col = parse_gtp_coordinate(move, size=game.board.side)
        try:
            game.board.play(row, col, to_sgfmill_color(side))
        except ValueError as exc:
            raise GameServiceError(f"illegal move: {move}") from exc
        game.moves_played += 1
        game.last_move = move

    def _game_top_n(self, game: GameState) -> int:
        return game.difficulty.top_n

    def _select_engine_move(
        self, ranked: list[CandidateMove], *, game: GameState
    ) -> CandidateMove:
        try:
            return select_candidate_for_side(
                ranked,
                engine_side=game.engine_side,
                difficulty=game.difficulty,
                random_source=self._random_source,
            )
        except ValueError as exc:
            raise GameServiceError("no legal engine moves available") from exc

    def _default_difficulty(self) -> DifficultyConfig:
        return DifficultyConfig(
            max_visits=self._default_max_visits,
            top_n=self._default_top_n,
            randomness=0.0,
            temperature=0.0,
        )


def _raw_ownership_to_p_black(value: float) -> float:
    return max(0.0, min(1.0, (value + 1.0) / 2.0))


def _ownership_to_p_black(ownership: Sequence[float]) -> list[float]:
    """Convert Kaya/model raw ownership in [-1, 1] into Black probabilities."""
    return [_raw_ownership_to_p_black(float(item)) for item in ownership]


def _softmax(values: Sequence[float]) -> list[float]:
    max_value = max(values)
    exps = [exp(item - max_value) for item in values]
    total = sum(exps)
    return [item / total for item in exps]


def _extract_winrate(value: Sequence[float] | None) -> float | None:
    if value is None or len(value) < 3:
        return None
    probs = _softmax([float(value[0]), float(value[1]), float(value[2])])
    return probs[0]


def _extract_score_lead(miscvalue: Sequence[float] | None) -> float | None:
    if miscvalue is None or len(miscvalue) < 3:
        return None
    return float(miscvalue[2]) * 20.0
