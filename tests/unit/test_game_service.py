"""Unit tests for game lifecycle orchestration."""

from __future__ import annotations

from collections.abc import Sequence

import pytest

from backend.app.engine.board import format_gtp_coordinate, to_sgfmill_color
from backend.app.game_service import GameServiceError, InMemoryGameService
from backend.app.presets.loader import get_preset_by_id


def _first_legal_move_for_side(preset_id: str, *, side: str) -> str:
    preset = get_preset_by_id(preset_id)
    board = preset.board
    sgf_color = to_sgfmill_color(side)
    for row in range(board.side):
        for col in range(board.side):
            if board.get(row, col) is not None:
                continue
            trial = board.copy()
            try:
                trial.play(row, col, sgf_color)
            except ValueError:
                continue
            return format_gtp_coordinate(row, col, size=board.side)
    raise AssertionError(f"no legal move available for side {side}")


class _FakeKataGoClient:
    def __init__(self, p_black: Sequence[float]) -> None:
        self._p_black = list(p_black)
        self.calls: list[dict[str, object]] = []

    def analyze_position(
        self,
        *,
        query_id: str,
        initial_stones: Sequence[tuple[str, str]],
        moves: Sequence[tuple[str, str]],
        initial_player: str,
        board_size: int,
        max_visits: int,
        komi: float = 7.5,
    ) -> list[float]:
        self.calls.append(
            {
                "query_id": query_id,
                "initial_stones": list(initial_stones),
                "moves": list(moves),
                "initial_player": initial_player,
                "board_size": board_size,
                "max_visits": max_visits,
                "komi": komi,
            }
        )
        return list(self._p_black)


class _RaisingKataGoClient:
    def analyze_position(self, **_: object) -> list[float]:
        raise TimeoutError("analysis timed out")


class _EngineMoveKataGoClient:
    def __init__(
        self,
        *,
        candidate_moves: Sequence[str],
        ownership_by_move: dict[str, Sequence[float]],
    ) -> None:
        self._candidate_moves = list(candidate_moves)
        self._ownership_by_move = {move: list(values) for move, values in ownership_by_move.items()}
        self.candidate_calls: list[dict[str, object]] = []
        self.analysis_calls: list[dict[str, object]] = []

    def get_candidate_moves(
        self,
        *,
        query_id: str,
        initial_stones: Sequence[tuple[str, str]],
        moves: Sequence[tuple[str, str]],
        initial_player: str,
        board_size: int,
        max_visits: int,
        komi: float = 7.5,
    ) -> list[str]:
        self.candidate_calls.append(
            {
                "query_id": query_id,
                "initial_stones": list(initial_stones),
                "moves": list(moves),
                "initial_player": initial_player,
                "board_size": board_size,
                "max_visits": max_visits,
                "komi": komi,
            }
        )
        return list(self._candidate_moves)

    def analyze_position(
        self,
        *,
        query_id: str,
        initial_stones: Sequence[tuple[str, str]],
        moves: Sequence[tuple[str, str]],
        initial_player: str,
        board_size: int,
        max_visits: int,
        komi: float = 7.5,
    ) -> list[float]:
        self.analysis_calls.append(
            {
                "query_id": query_id,
                "initial_stones": list(initial_stones),
                "moves": list(moves),
                "initial_player": initial_player,
                "board_size": board_size,
                "max_visits": max_visits,
                "komi": komi,
            }
        )
        if not moves:
            raise AssertionError("candidate evaluation call must include one move")
        move = moves[-1][1]
        values = self._ownership_by_move.get(move)
        if values is None:
            raise AssertionError(f"unexpected candidate move {move}")
        return list(values)


def _first_n_legal_moves_for_game(
    game_service: InMemoryGameService, game_id: str, *, side: str, n: int
) -> list[str]:
    game = game_service.get_game(game_id)
    board = game.board
    sgf_color = to_sgfmill_color(side)
    legal: list[str] = []
    for row in range(board.side):
        for col in range(board.side):
            if board.get(row, col) is not None:
                continue
            trial = board.copy()
            try:
                trial.play(row, col, sgf_color)
            except ValueError:
                continue
            legal.append(format_gtp_coordinate(row, col, size=board.side))
            if len(legal) >= n:
                return legal
    raise AssertionError(f"no {n} legal moves available for side {side}")


@pytest.mark.unit
def test_analyze_game_uses_katago_ownership_output() -> None:
    katago_client = _FakeKataGoClient([0.4] + [1.0] * 360)
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client=katago_client,
        katago_max_visits=10,
    )
    human_side = get_preset_by_id("balanced").initial_player_to_move
    game = service.create_game(preset_id="balanced", human_side=human_side)
    move = _first_legal_move_for_side("balanced", side=human_side)
    service.apply_human_move(game_id=game.game_id, move=move)

    evaluation = service.analyze_game(game_id=game.game_id)

    assert evaluation.survival_score == 1
    assert evaluation.metrics.unresolved_count == 1
    assert evaluation.metrics.min_black_probability == pytest.approx(0.4)
    assert len(katago_client.calls) == 1
    call = katago_client.calls[0]
    assert call["query_id"] == f"analyze-{game.game_id}"
    assert call["moves"] == []
    assert call["initial_player"] == game.next_to_move
    assert call["board_size"] == 19
    assert call["max_visits"] == 10
    initial_stones = call["initial_stones"]
    assert isinstance(initial_stones, list)
    assert (human_side, move) in initial_stones


@pytest.mark.unit
def test_analyze_game_surfaces_katago_failures() -> None:
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client=_RaisingKataGoClient(),
    )
    human_side = get_preset_by_id("balanced").initial_player_to_move
    game = service.create_game(preset_id="balanced", human_side=human_side)

    with pytest.raises(GameServiceError, match="failed to analyze game with KataGo"):
        service.analyze_game(game_id=game.game_id)


@pytest.mark.unit
def test_apply_engine_move_uses_katago_candidates_and_survival_rerank() -> None:
    base_p_black = [1.0] * 361
    worse_eval = [0.4] + base_p_black[1:]
    better_eval = list(base_p_black)
    placeholder_client = _EngineMoveKataGoClient(candidate_moves=[], ownership_by_move={})
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client=placeholder_client,
        katago_max_visits=7,
    )
    human_side = get_preset_by_id("balanced").initial_player_to_move
    game = service.create_game(preset_id="balanced", human_side=human_side)
    human_move = _first_legal_move_for_side("balanced", side=human_side)
    service.apply_human_move(game_id=game.game_id, move=human_move)
    candidate_a, candidate_b = _first_n_legal_moves_for_game(
        service,
        game.game_id,
        side=game.engine_side,
        n=2,
    )
    katago_client = _EngineMoveKataGoClient(
        candidate_moves=[candidate_a, candidate_b],
        ownership_by_move={
            candidate_a: worse_eval,
            candidate_b: better_eval,
        },
    )
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client=katago_client,
        katago_max_visits=7,
    )
    game = service.create_game(preset_id="balanced", human_side=human_side)
    service.apply_human_move(game_id=game.game_id, move=human_move)

    _, selected_move = service.apply_engine_move(game_id=game.game_id)

    assert selected_move == candidate_b
    assert len(katago_client.candidate_calls) == 1
    assert len(katago_client.analysis_calls) == 2
    assert katago_client.candidate_calls[0]["query_id"] == f"engine-candidates-{game.game_id}"
    assert all(call["initial_player"] == game.engine_side for call in katago_client.analysis_calls)


@pytest.mark.unit
def test_apply_engine_move_enforces_katago_top_n_candidate_limit() -> None:
    base_p_black = [1.0] * 361
    lower_eval = [0.4] + base_p_black[1:]
    higher_eval = list(base_p_black)
    placeholder_client = _EngineMoveKataGoClient(candidate_moves=[], ownership_by_move={})
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client=placeholder_client,
    )
    human_side = get_preset_by_id("balanced").initial_player_to_move
    game = service.create_game(preset_id="balanced", human_side=human_side)
    human_move = _first_legal_move_for_side("balanced", side=human_side)
    service.apply_human_move(game_id=game.game_id, move=human_move)
    candidate_a, candidate_b = _first_n_legal_moves_for_game(
        service,
        game.game_id,
        side=game.engine_side,
        n=2,
    )
    katago_client = _EngineMoveKataGoClient(
        candidate_moves=[candidate_a, candidate_b],
        ownership_by_move={
            candidate_a: lower_eval,
            candidate_b: higher_eval,
        },
    )
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client=katago_client,
        katago_top_n=1,
    )
    game = service.create_game(preset_id="balanced", human_side=human_side)
    service.apply_human_move(game_id=game.game_id, move=human_move)

    _, selected_move = service.apply_engine_move(game_id=game.game_id)

    assert selected_move == candidate_a
    assert len(katago_client.analysis_calls) == 1
    evaluated_moves = [call["moves"] for call in katago_client.analysis_calls]
    assert evaluated_moves == [[(game.engine_side, candidate_a)]]
