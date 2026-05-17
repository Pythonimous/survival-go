"""In-memory game orchestration for API endpoints."""

from __future__ import annotations

import copy
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol
from uuid import uuid4

from sgfmill import boards

from backend.app.engine.board import (
    StoneColor,
    from_sgfmill_color,
    format_gtp_coordinate,
    parse_gtp_coordinate,
    to_sgfmill_color,
)
from backend.app.engine.evaluator import SurvivalEvaluation, evaluate_survival_position
from backend.app.engine.move_selector import CandidateMove, choose_engine_move
from backend.app.presets.loader import (
    PresetLoadError,
    get_preset_by_id,
    list_preset_metadata,
)


class GameServiceError(ValueError):
    """Base validation error for game operations."""


class GameNotFoundError(GameServiceError):
    """Raised when a game id is unknown."""


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


@dataclass(slots=True)
class GameState:
    """One in-memory game session."""

    game_id: str
    preset_id: str
    human_side: StoneColor
    engine_side: StoneColor
    next_to_move: StoneColor
    board: boards.Board

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
        katago_client: KataGoAnalyzer | None = None,
        katago_max_visits: int = 20,
        katago_top_n: int = 8,
    ) -> None:
        if katago_top_n < 1:
            raise ValueError("katago_top_n must be at least 1")
        self._games: dict[str, GameState] = {}
        self._survival_threshold = survival_threshold
        self._katago_client = katago_client
        self._katago_max_visits = katago_max_visits
        self._katago_top_n = katago_top_n

    def list_presets(self) -> list[dict[str, object]]:
        return [preset.model_dump() for preset in list_preset_metadata()]

    def create_game(self, *, preset_id: str, human_side: StoneColor) -> GameState:
        try:
            preset = get_preset_by_id(preset_id)
        except PresetLoadError as exc:
            raise GameServiceError(str(exc)) from exc

        if human_side not in ("B", "W"):
            raise GameServiceError("human_side must be 'B' or 'W'")
        if human_side != preset.initial_player_to_move:
            raise GameServiceError("human_side must match preset PL")

        game_id = uuid4().hex
        engine_side: StoneColor = "W" if human_side == "B" else "B"
        game = GameState(
            game_id=game_id,
            preset_id=preset.id,
            human_side=human_side,
            engine_side=engine_side,
            next_to_move=preset.initial_player_to_move,
            board=copy.deepcopy(preset.board),
        )
        self._games[game_id] = game
        return game

    def get_game(self, game_id: str) -> GameState:
        game = self._games.get(game_id)
        if game is None:
            raise GameNotFoundError(f"game not found: {game_id}")
        return game

    def apply_human_move(self, *, game_id: str, move: str) -> GameState:
        game = self.get_game(game_id)
        if game.next_to_move != game.human_side:
            raise GameServiceError("it is not the human side turn")
        self._play_move(game, move=move, side=game.human_side)
        game.next_to_move = game.engine_side
        return game

    def apply_engine_move(self, *, game_id: str) -> tuple[GameState, str]:
        game = self.get_game(game_id)
        if game.next_to_move != game.engine_side:
            raise GameServiceError("it is not the engine side turn")

        candidates = self._ranked_candidates(game)
        selected = choose_engine_move(candidates, engine_side=game.engine_side)
        self._play_move(game, move=selected.move, side=game.engine_side)
        game.next_to_move = game.human_side
        return game, selected.move

    def analyze_game(self, *, game_id: str) -> SurvivalEvaluation:
        game = self.get_game(game_id)
        if self._katago_client is None:
            raise GameServiceError("KataGo client is not configured for analysis")
        try:
            p_black = self._katago_client.analyze_position(
                query_id=f"analyze-{game.game_id}",
                initial_stones=self._board_as_initial_stones(game.board),
                moves=[],
                initial_player=game.next_to_move,
                board_size=game.board.side,
                max_visits=self._katago_max_visits,
            )
        except Exception as exc:
            raise GameServiceError("failed to analyze game with KataGo") from exc
        return evaluate_survival_position(p_black, threshold=self._survival_threshold)

    def _ranked_candidates(self, game: GameState) -> list[CandidateMove]:
        if self._katago_client is None:
            raise GameServiceError("KataGo client is not configured for engine move")
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
                )
            )

        if not candidates:
            raise GameServiceError("no legal engine moves available")
        return candidates

    def _fetch_engine_candidate_moves(
        self, game: GameState, *, initial_stones: Sequence[tuple[StoneColor, str]]
    ) -> list[str]:
        assert self._katago_client is not None
        try:
            moves = self._katago_client.get_candidate_moves(
                query_id=f"engine-candidates-{game.game_id}",
                initial_stones=initial_stones,
                moves=[],
                initial_player=game.engine_side,
                board_size=game.board.side,
                max_visits=self._katago_max_visits,
            )
            return moves[: self._katago_top_n]
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
        assert self._katago_client is not None
        try:
            p_black = self._katago_client.analyze_position(
                query_id=f"engine-eval-{game.game_id}-{move}",
                initial_stones=initial_stones,
                moves=[(side, move)],
                initial_player=side,
                board_size=game.board.side,
                max_visits=self._katago_max_visits,
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
