"""In-memory game orchestration for API endpoints."""

from __future__ import annotations

import copy
import random
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol
from uuid import uuid4

from sgfmill import boards

from backend.app.engine.board import (
    StoneColor,
    from_sgfmill_color,
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
    rank_candidates_for_side,
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


class KataGoAnalyzer(Protocol):
    """Protocol for KataGo analysis used by game orchestration."""

    def get_candidate_moves(
        self,
        *,
        query_id: str,
        initial_stones: Sequence[tuple[StoneColor, str]],
        moves: Sequence[tuple[StoneColor, str]],
        initial_player: StoneColor,
        board_size: int,
        max_visits: int,
        komi: float = 7.5,
    ) -> list[str]: ...

    def analyze_position(
        self,
        *,
        query_id: str,
        initial_stones: Sequence[tuple[StoneColor, str]],
        moves: Sequence[tuple[StoneColor, str]],
        initial_player: StoneColor,
        board_size: int,
        max_visits: int,
        komi: float = 7.5,
    ) -> list[float]: ...


class RandomSource(Protocol):
    def random(self) -> float: ...

    def choice(self, values: Sequence[CandidateMove]) -> CandidateMove: ...


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


def _stop_katago_client(client: KataGoAnalyzer) -> None:
    stop = getattr(client, "stop", None)
    if callable(stop):
        stop()


class InMemoryGameService:
    """Game lifecycle orchestration backed by process memory."""

    def __init__(
        self,
        *,
        survival_threshold: float,
        katago_client_factory: Callable[[], KataGoAnalyzer] | None = None,
        katago_max_visits: int = 20,
        katago_top_n: int = 8,
        random_source: RandomSource | None = None,
    ) -> None:
        if katago_top_n < 1:
            raise ValueError("katago_top_n must be at least 1")
        self._games: dict[str, GameState] = {}
        self._katago_client: KataGoAnalyzer | None = None
        self._survival_threshold = survival_threshold
        self._katago_client_factory = katago_client_factory
        self._katago_max_visits = katago_max_visits
        self._katago_top_n = katago_top_n
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
        self._ensure_katago_client()
        return game

    def delete_game(self, game_id: str) -> None:
        game = self._games.pop(game_id, None)
        if game is None:
            raise GameNotFoundError(f"game not found: {game_id}")

    def shutdown(self) -> None:
        if self._katago_client is not None:
            _stop_katago_client(self._katago_client)
            self._katago_client = None
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

    def apply_engine_move(self, *, game_id: str) -> EngineMoveResult:
        game = self.get_game(game_id)
        if game.status == "finished":
            raise GameServiceError("game is already finished")
        if game.next_to_move != game.engine_side:
            raise GameServiceError("it is not the engine side turn")

        position = self._analyze_current_position(game)
        if should_engine_resign(
            engine_side=game.engine_side,
            min_black_probability=position.metrics.min_black_probability,
        ):
            return self._engine_resign(game, evaluation=position)

        candidates = self._ranked_candidates(game)
        ranked = rank_candidates_for_side(candidates, engine_side=game.engine_side)
        ranked_shortlist = ranked[: min(self._game_top_n(game), len(ranked))]
        selected = self._select_engine_move(ranked_shortlist, game=game)
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
            candidates=ranked_shortlist,
        )

    def analyze_game(self, *, game_id: str) -> SurvivalEvaluation:
        game = self.get_game(game_id)
        return self._analyze_current_position(game)

    def _ensure_katago_client(self) -> None:
        if self._katago_client_factory is None:
            return
        if self._katago_client is None:
            self._katago_client = self._katago_client_factory()

    def _katago_for_game(self) -> KataGoAnalyzer:
        client = self._katago_client
        if client is None:
            raise GameServiceError("KataGo client is not configured for this game")
        return client

    def _analyze_current_position(self, game: GameState) -> SurvivalEvaluation:
        try:
            p_black = self._katago_for_game().analyze_position(
                query_id=f"analyze-{game.game_id}",
                initial_stones=self._board_as_initial_stones(game.board),
                moves=[],
                initial_player=game.next_to_move,
                board_size=game.board.side,
                max_visits=self._game_max_visits(game),
            )
        except Exception as exc:
            raise GameServiceError("failed to analyze game with KataGo") from exc
        return evaluate_survival_position(p_black, threshold=self._survival_threshold)

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

    def _ranked_candidates(self, game: GameState) -> list[CandidateMove]:
        side = game.engine_side
        initial_stones = self._board_as_initial_stones(game.board)
        candidate_moves = self._fetch_engine_candidate_moves(game, initial_stones=initial_stones)

        candidates: list[CandidateMove] = []
        for move in candidate_moves:
            if not self._is_legal_candidate_move(game, move=move, side=side):
                continue
            evaluation = self._evaluate_engine_candidate(
                game,
                move=move,
                side=side,
                initial_stones=initial_stones,
            )
            candidates.append(
                CandidateMove(
                    move=move,
                    survival_score=evaluation.survival_score,
                    min_black_probability=evaluation.metrics.min_black_probability,
                )
            )

        if not candidates:
            raise GameServiceError("no legal engine moves available")
        return candidates

    def _fetch_engine_candidate_moves(
        self, game: GameState, *, initial_stones: Sequence[tuple[StoneColor, str]]
    ) -> list[str]:
        try:
            moves = self._katago_for_game().get_candidate_moves(
                query_id=f"engine-candidates-{game.game_id}",
                initial_stones=initial_stones,
                moves=[],
                initial_player=game.engine_side,
                board_size=game.board.side,
                max_visits=self._game_max_visits(game),
            )
            return moves
        except Exception as exc:
            raise GameServiceError("failed to fetch engine move candidates from KataGo") from exc

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

    def _evaluate_engine_candidate(
        self,
        game: GameState,
        *,
        move: str,
        side: StoneColor,
        initial_stones: Sequence[tuple[StoneColor, str]],
    ) -> SurvivalEvaluation:
        try:
            p_black = self._katago_for_game().analyze_position(
                query_id=f"engine-eval-{game.game_id}-{move}",
                initial_stones=initial_stones,
                moves=[(side, move)],
                initial_player=side,
                board_size=game.board.side,
                max_visits=self._game_max_visits(game),
            )
        except Exception as exc:
            raise GameServiceError("failed to evaluate engine candidates with KataGo") from exc
        return evaluate_survival_position(p_black, threshold=self._survival_threshold)

    def _play_move(self, game: GameState, *, move: str, side: StoneColor) -> None:
        row, col = parse_gtp_coordinate(move, size=game.board.side)
        try:
            game.board.play(row, col, to_sgfmill_color(side))
        except ValueError as exc:
            raise GameServiceError(f"illegal move: {move}") from exc
        game.moves_played += 1
        game.last_move = move

    def _game_max_visits(self, game: GameState) -> int:
        return game.difficulty.max_visits

    def _game_top_n(self, game: GameState) -> int:
        return game.difficulty.top_n

    def _select_engine_move(
        self, ranked: list[CandidateMove], *, game: GameState
    ) -> CandidateMove:
        if not ranked:
            raise GameServiceError("no legal engine moves available")
        if len(ranked) == 1:
            return ranked[0]
        randomness = game.difficulty.randomness
        if randomness <= 0.0:
            return ranked[0]
        if self._random_source.random() >= randomness:
            return ranked[0]
        return self._random_source.choice(ranked[1:])

    def _default_difficulty(self) -> DifficultyConfig:
        return DifficultyConfig(
            max_visits=self._katago_max_visits,
            top_n=self._katago_top_n,
            randomness=0.0,
        )

    def _board_as_initial_stones(self, board: boards.Board) -> list[tuple[StoneColor, str]]:
        initial_stones: list[tuple[StoneColor, str]] = []
        for row in range(board.side):
            for col in range(board.side):
                color = board.get(row, col)
                if color is None:
                    continue
                initial_stones.append(
                    (
                        from_sgfmill_color(color),
                        format_gtp_coordinate(row, col, size=board.side),
                    )
                )
        return initial_stones
