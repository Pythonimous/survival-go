"""Unit tests for game lifecycle orchestration."""

from __future__ import annotations

from collections.abc import Sequence

import pytest

from backend.app.engine.board import format_gtp_coordinate, to_sgfmill_color
from backend.app.difficulty import DifficultyConfig
from backend.app.game_service import GameServiceError, InMemoryGameService
from backend.app.katago.client import KataGoMoveInfo
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
        position_p_black: Sequence[float] | None = None,
    ) -> None:
        self._candidate_moves = list(candidate_moves)
        self._ownership_by_move = {move: list(values) for move, values in ownership_by_move.items()}
        self._position_p_black = (
            list(position_p_black) if position_p_black is not None else [0.5] * 361
        )
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
    ) -> list[KataGoMoveInfo]:
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
        return [
            KataGoMoveInfo(move=move, policy=0.0, score_lead=None)
            for move in self._candidate_moves
        ]

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
            return list(self._position_p_black)
        move = moves[-1][1]
        values = self._ownership_by_move.get(move)
        if values is None:
            raise AssertionError(f"unexpected candidate move {move}")
        return list(values)


class _DeterministicRandom:
    def __init__(self, *, random_values: Sequence[float], choice_index: int = 0) -> None:
        self._random_values = list(random_values)
        self._choice_index = choice_index
        self.random_calls = 0
        self.choice_calls = 0

    def random(self) -> float:
        self.random_calls += 1
        if self._random_values:
            return self._random_values.pop(0)
        return 0.0

    def choice(self, values: Sequence[object]) -> object:
        self.choice_calls += 1
        if not values:
            raise IndexError("cannot choose from an empty sequence")
        index = min(self._choice_index, len(values) - 1)
        return values[index]


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
def test_create_game_allows_human_black_when_preset_pl_is_white() -> None:
    service = InMemoryGameService(survival_threshold=0.95)
    preset = get_preset_by_id("balanced")
    assert preset.initial_player_to_move == "W"

    game = service.create_game(preset_id="balanced", human_side="B")

    assert game.human_side == "B"
    assert game.engine_side == "W"
    assert game.next_to_move == "W"
    assert game.moves_played == 0
    assert game.last_move is None
    assert game.difficulty.max_visits == 20
    assert game.difficulty.top_n == 8
    assert game.difficulty.randomness == pytest.approx(0.0)
    assert game.difficulty.temperature == pytest.approx(0.0)


@pytest.mark.unit
def test_create_game_accepts_custom_difficulty() -> None:
    service = InMemoryGameService(survival_threshold=0.95)
    custom = DifficultyConfig(
        max_visits=40,
        top_n=3,
        randomness=0.25,
        variant_awareness=0.5,
        temperature=0.25,
        blunder_margin=0.02,
    )

    game = service.create_game(preset_id="balanced", human_side="W", difficulty=custom)

    assert game.difficulty == custom


@pytest.mark.unit
def test_apply_human_move_increments_moves_played() -> None:
    service = InMemoryGameService(survival_threshold=0.95)
    human_side = get_preset_by_id("balanced").initial_player_to_move
    game = service.create_game(preset_id="balanced", human_side=human_side)
    move = _first_legal_move_for_side("balanced", side=human_side)

    service.apply_human_move(game_id=game.game_id, move=move)

    updated = service.get_game(game.game_id)
    assert updated.moves_played == 1
    assert updated.last_move == move


@pytest.mark.unit
def test_apply_engine_move_sets_last_move() -> None:
    placeholder_client = _EngineMoveKataGoClient(candidate_moves=[], ownership_by_move={})
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client_factory=lambda: placeholder_client,
        katago_max_visits=10,
    )
    human_side = get_preset_by_id("balanced").initial_player_to_move
    game = service.create_game(preset_id="balanced", human_side=human_side)
    human_move = _first_legal_move_for_side("balanced", side=human_side)
    service.apply_human_move(game_id=game.game_id, move=human_move)
    engine_move = _first_n_legal_moves_for_game(
        service,
        game.game_id,
        side=game.engine_side,
        n=1,
    )[0]
    katago_client = _EngineMoveKataGoClient(
        candidate_moves=[engine_move],
        ownership_by_move={engine_move: [0.4] + [1.0] * 360},
    )
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client_factory=lambda: katago_client,
        katago_max_visits=10,
    )
    game = service.create_game(preset_id="balanced", human_side=human_side)
    service.apply_human_move(game_id=game.game_id, move=human_move)
    service.apply_engine_move(game_id=game.game_id)

    updated = service.get_game(game.game_id)
    assert updated.last_move == engine_move


@pytest.mark.unit
def test_analyze_game_uses_katago_ownership_output() -> None:
    katago_client = _FakeKataGoClient([0.4] + [1.0] * 360)
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client_factory=lambda: katago_client,
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
        katago_client_factory=lambda: _RaisingKataGoClient(),
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
        katago_client_factory=lambda: placeholder_client,
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
        katago_client_factory=lambda: katago_client,
        katago_max_visits=7,
    )
    game = service.create_game(preset_id="balanced", human_side=human_side)
    service.apply_human_move(game_id=game.game_id, move=human_move)

    outcome = service.apply_engine_move(game_id=game.game_id)

    assert outcome.move == candidate_b
    assert outcome.survival_score == 0
    assert outcome.metrics.min_black_probability == pytest.approx(1.0)
    assert [candidate.move for candidate in outcome.candidates] == [candidate_b]
    assert len(katago_client.candidate_calls) == 1
    assert len(katago_client.analysis_calls) == 3
    assert katago_client.candidate_calls[0]["query_id"] == f"engine-candidates-{game.game_id}"
    assert all(call["initial_player"] == game.engine_side for call in katago_client.analysis_calls)


@pytest.mark.unit
def test_apply_engine_move_black_prefers_higher_min_over_lower_survival_score() -> None:
    """Bottleneck ownership wins even when another move has fewer unresolved points."""
    mostly_resolved = [0.96] * 361
    low_min_few_unresolved = [0.2] + mostly_resolved[1:]
    higher_min_more_unresolved = [0.5] + [0.94] * 200 + mostly_resolved[201:]
    placeholder_client = _EngineMoveKataGoClient(candidate_moves=[], ownership_by_move={})
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client_factory=lambda: placeholder_client,
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
            candidate_a: low_min_few_unresolved,
            candidate_b: higher_min_more_unresolved,
        },
    )
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client_factory=lambda: katago_client,
    )
    game = service.create_game(preset_id="balanced", human_side=human_side)
    service.apply_human_move(game_id=game.game_id, move=human_move)

    outcome = service.apply_engine_move(game_id=game.game_id)

    assert outcome.move == candidate_b
    assert outcome.metrics.min_black_probability == pytest.approx(0.5)
    assert outcome.survival_score > 1


@pytest.mark.unit
def test_apply_engine_move_enforces_katago_top_n_candidate_limit() -> None:
    base_p_black = [1.0] * 361
    lower_eval = [0.4] + base_p_black[1:]
    higher_eval = list(base_p_black)
    placeholder_client = _EngineMoveKataGoClient(candidate_moves=[], ownership_by_move={})
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client_factory=lambda: placeholder_client,
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
        katago_client_factory=lambda: katago_client,
        katago_top_n=1,
    )
    game = service.create_game(preset_id="balanced", human_side=human_side)
    service.apply_human_move(game_id=game.game_id, move=human_move)

    outcome = service.apply_engine_move(game_id=game.game_id)

    assert outcome.move == candidate_b
    assert len(katago_client.analysis_calls) == 3
    evaluated_moves = [call["moves"] for call in katago_client.analysis_calls if call["moves"]]
    assert evaluated_moves == [
        [(game.engine_side, candidate_a)],
        [(game.engine_side, candidate_b)],
    ]
    assert [candidate.move for candidate in outcome.candidates] == [candidate_b]


@pytest.mark.unit
def test_apply_engine_move_uses_game_difficulty_for_visits_and_top_n() -> None:
    p_black = [1.0] * 361
    placeholder_client = _EngineMoveKataGoClient(candidate_moves=[], ownership_by_move={})
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client_factory=lambda: placeholder_client,
        katago_max_visits=99,
        katago_top_n=9,
    )
    human_side = get_preset_by_id("balanced").initial_player_to_move
    custom = DifficultyConfig(max_visits=12, top_n=1, randomness=0.0)
    game = service.create_game(preset_id="balanced", human_side=human_side, difficulty=custom)
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
            candidate_a: p_black,
            candidate_b: [0.4] + p_black[1:],
        },
    )
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client_factory=lambda: katago_client,
        katago_max_visits=99,
        katago_top_n=9,
    )
    game = service.create_game(preset_id="balanced", human_side=human_side, difficulty=custom)
    service.apply_human_move(game_id=game.game_id, move=human_move)

    outcome = service.apply_engine_move(game_id=game.game_id)

    assert outcome.move == candidate_a
    assert len(katago_client.analysis_calls) == 3
    assert katago_client.candidate_calls[0]["max_visits"] == 12
    assert katago_client.analysis_calls[0]["max_visits"] == 12
    assert [call["moves"] for call in katago_client.analysis_calls if call["moves"]] == [
        [(game.engine_side, candidate_a)],
        [(game.engine_side, candidate_b)],
    ]
    assert [candidate.move for candidate in outcome.candidates] == [candidate_a]


@pytest.mark.unit
def test_apply_engine_move_uses_temperature_sampling_for_non_top_choice() -> None:
    base = [1.0] * 361
    weaker = [0.7] + base[1:]
    human_side = get_preset_by_id("balanced").initial_player_to_move
    seed_service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client_factory=lambda: _EngineMoveKataGoClient(
            candidate_moves=[], ownership_by_move={}
        ),
    )
    seed_game = seed_service.create_game(preset_id="balanced", human_side=human_side)
    human_move = _first_legal_move_for_side("balanced", side=human_side)
    seed_service.apply_human_move(game_id=seed_game.game_id, move=human_move)
    best_move, alt_move = _first_n_legal_moves_for_game(
        seed_service,
        seed_game.game_id,
        side=seed_game.engine_side,
        n=2,
    )
    katago_client = _EngineMoveKataGoClient(
        candidate_moves=[best_move, alt_move],
        ownership_by_move={best_move: base, alt_move: weaker},
    )
    random_source = _DeterministicRandom(random_values=[0.99], choice_index=0)
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client_factory=lambda: katago_client,
        random_source=random_source,
    )
    game = service.create_game(
        preset_id="balanced",
        human_side=human_side,
        difficulty=DifficultyConfig(
            max_visits=20,
            top_n=2,
            randomness=0.5,
            temperature=0.5,
            blunder_margin=1.0,
        ),
    )
    service.apply_human_move(game_id=game.game_id, move=human_move)

    outcome = service.apply_engine_move(game_id=game.game_id)

    assert outcome.move in {best_move, alt_move}
    assert random_source.random_calls == 1
    assert random_source.choice_calls == 0


@pytest.mark.unit
def test_apply_engine_move_blunder_margin_filters_low_score_candidates() -> None:
    base = [1.0] * 361
    near_best = [0.985] + base[1:]
    blunder = [0.3] + base[1:]
    human_side = get_preset_by_id("balanced").initial_player_to_move
    seed_service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client_factory=lambda: _EngineMoveKataGoClient(
            candidate_moves=[], ownership_by_move={}
        ),
    )
    seed_game = seed_service.create_game(preset_id="balanced", human_side=human_side)
    human_move = _first_legal_move_for_side("balanced", side=human_side)
    seed_service.apply_human_move(game_id=seed_game.game_id, move=human_move)
    best_move, second_move, third_move = _first_n_legal_moves_for_game(
        seed_service,
        seed_game.game_id,
        side=seed_game.engine_side,
        n=3,
    )
    katago_client = _EngineMoveKataGoClient(
        candidate_moves=[best_move, second_move, third_move],
        ownership_by_move={best_move: base, second_move: near_best, third_move: blunder},
    )
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client_factory=lambda: katago_client,
    )
    game = service.create_game(
        preset_id="balanced",
        human_side=human_side,
        difficulty=DifficultyConfig(
            max_visits=20,
            top_n=3,
            randomness=0.0,
            variant_awareness=1.0,
            blunder_margin=0.02,
            temperature=0.0,
        ),
    )
    service.apply_human_move(game_id=game.game_id, move=human_move)

    outcome = service.apply_engine_move(game_id=game.game_id)

    assert outcome.move == best_move
    assert [candidate.move for candidate in outcome.candidates] == [best_move, second_move]


@pytest.mark.unit
def test_apply_engine_move_black_resigns_when_min_black_below_one_percent() -> None:
    hopeless = [0.005] + [0.5] * 360
    katago_client = _FakeKataGoClient(hopeless)
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client_factory=lambda: katago_client,
    )
    game = service.create_game(preset_id="balanced", human_side="W")
    human_move = _first_legal_move_for_side("balanced", side="W")
    service.apply_human_move(game_id=game.game_id, move=human_move)
    assert game.engine_side == "B"
    moves_before = game.moves_played

    outcome = service.apply_engine_move(game_id=game.game_id)

    assert outcome.resigned is True
    assert outcome.move == ""
    assert outcome.metrics.min_black_probability == pytest.approx(0.005)
    assert outcome.candidates == []
    updated = service.get_game(game.game_id)
    assert updated.status == "finished"
    assert updated.winner == "W"
    assert updated.moves_played == moves_before


@pytest.mark.unit
def test_apply_engine_move_white_resigns_when_min_black_above_ninety_nine_percent() -> None:
    dominant_black = [0.995] + [0.996] * 360
    katago_client = _FakeKataGoClient(dominant_black)
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client_factory=lambda: katago_client,
    )
    game = service.create_game(preset_id="balanced", human_side="B")
    assert game.engine_side == "W"
    moves_before = game.moves_played

    outcome = service.apply_engine_move(game_id=game.game_id)

    assert outcome.resigned is True
    assert outcome.move == ""
    assert outcome.metrics.min_black_probability == pytest.approx(0.995)
    updated = service.get_game(game.game_id)
    assert updated.status == "finished"
    assert updated.winner == "B"
    assert updated.moves_played == moves_before


@pytest.mark.unit
def test_apply_human_move_rejects_finished_game() -> None:
    dominant_black = [0.995] + [0.996] * 360
    katago_client = _FakeKataGoClient(dominant_black)
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client_factory=lambda: katago_client,
    )
    game = service.create_game(preset_id="balanced", human_side="B")
    service.apply_engine_move(game_id=game.game_id)
    move = _first_legal_move_for_side("balanced", side="B")

    with pytest.raises(GameServiceError, match="game is already finished"):
        service.apply_human_move(game_id=game.game_id, move=move)


@pytest.mark.unit
def test_apply_human_resign_finishes_game_with_engine_winner() -> None:
    service = InMemoryGameService(survival_threshold=0.95)
    game = service.create_game(preset_id="balanced", human_side="W")
    human_move = _first_legal_move_for_side("balanced", side="W")
    service.apply_human_move(game_id=game.game_id, move=human_move)
    moves_before = game.moves_played

    updated = service.apply_human_resign(game_id=game.game_id)

    assert updated.status == "finished"
    assert updated.winner == "B"
    assert updated.moves_played == moves_before
    assert updated.next_to_move == "B"


@pytest.mark.unit
def test_apply_human_resign_rejects_finished_game() -> None:
    dominant_black = [0.995] + [0.996] * 360
    katago_client = _FakeKataGoClient(dominant_black)
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client_factory=lambda: katago_client,
    )
    game = service.create_game(preset_id="balanced", human_side="B")
    service.apply_engine_move(game_id=game.game_id)

    with pytest.raises(GameServiceError, match="game is already finished"):
        service.apply_human_resign(game_id=game.game_id)
