"""Unit tests for game lifecycle orchestration."""

from __future__ import annotations

from collections.abc import Sequence

import pytest

from backend.app.engine.board import format_gtp_coordinate, to_sgfmill_color
from backend.app.difficulty import DifficultyConfig
from backend.app.game_service import (
    BrowserEngineMoveCandidate,
    GameServiceError,
    InMemoryGameService,
)
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


def _policy_logits() -> list[float]:
    return [0.0] * 362


def _p_black_to_raw_ownership(p_black: float) -> float:
    """Map black probability in [0, 1] to KataGo raw ownership in [-1, 1]."""
    return max(-1.0, min(1.0, 2.0 * p_black - 1.0))


def _ownership_from_p_black(values: Sequence[float]) -> list[float]:
    return [_p_black_to_raw_ownership(value) for value in values]


def _browser_candidate(
    move: str,
    ownership: Sequence[float],
    *,
    policy_prob: float = 0.5,
) -> BrowserEngineMoveCandidate:
    return BrowserEngineMoveCandidate(
        move=move,
        policy_prob=policy_prob,
        policy=_policy_logits(),
        ownership=list(ownership),
    )


def _apply_browser_engine_move(
    service: InMemoryGameService,
    *,
    game_id: str,
    position_ownership: Sequence[float],
    position_value: Sequence[float] | None = None,
    position_miscvalue: Sequence[float] | None = None,
    candidates: Sequence[BrowserEngineMoveCandidate],
) -> object:
    return service.apply_engine_move_from_browser_payload(
        game_id=game_id,
        position_policy=_policy_logits(),
        position_ownership=list(position_ownership),
        position_value=position_value,
        position_miscvalue=position_miscvalue,
        candidates=candidates,
    )


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


@pytest.mark.unit
def test_legal_moves_for_side_lists_every_playable_intersection() -> None:
    service = InMemoryGameService(survival_threshold=0.95)
    human_side = get_preset_by_id("balanced").initial_player_to_move
    game = service.create_game(preset_id="balanced", human_side=human_side)
    human_move = _first_legal_move_for_side("balanced", side=human_side)
    service.apply_human_move(game_id=game.game_id, move=human_move)
    game = service.get_game(game.game_id)

    legal_moves = service.legal_moves_for_side(game, side=game.engine_side)

    assert legal_moves
    assert len(legal_moves) > game.difficulty.top_n
    assert all(
        service._is_legal_candidate_move(game, move=move, side=game.engine_side)
        for move in legal_moves
    )


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
    service = InMemoryGameService(survival_threshold=0.95)
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

    _apply_browser_engine_move(
        service,
        game_id=game.game_id,
        position_ownership=_ownership_from_p_black([0.5] * 361),
        candidates=[
            _browser_candidate(
                engine_move,
                _ownership_from_p_black([0.4] + [1.0] * 360),
            )
        ],
    )

    updated = service.get_game(game.game_id)
    assert updated.last_move == engine_move


@pytest.mark.unit
def test_analyze_raw_model_outputs_uses_backend_interpretation() -> None:
    service = InMemoryGameService(survival_threshold=0.95)
    game = service.create_game(preset_id="balanced", human_side="W")
    policy_logits = [2.0, 1.0, 0.0] + [0.0] * (362 - 3)

    evaluation = service.analyze_raw_model_outputs(
        game_id=game.game_id,
        policy=policy_logits,
        ownership=[-0.2] + [1.0] * 360,
        value=[2.0, 1.0, 0.0],
        miscvalue=[0.0, 0.0, -0.5] + [0.0] * 7,
    )

    assert evaluation.survival_score == 1
    assert evaluation.metrics.min_black_probability == pytest.approx(0.4)
    assert len(evaluation.policy) == 362
    assert sum(evaluation.policy) == pytest.approx(1.0)
    assert evaluation.winrate == pytest.approx(0.66524096, rel=1e-6)
    assert evaluation.score_lead == pytest.approx(-10.0)


@pytest.mark.unit
def test_analyze_raw_model_outputs_interprets_kaya_ownership_scale() -> None:
    service = InMemoryGameService(survival_threshold=0.95)
    game = service.create_game(preset_id="balanced", human_side="W")

    evaluation = service.analyze_raw_model_outputs(
        game_id=game.game_id,
        policy=[0.0] * 362,
        ownership=[-0.2] + [1.0] * 360,
        value=[2.0, 1.0, 0.0],
        miscvalue=[0.0] * 10,
    )

    assert evaluation.survival_score == 1
    assert evaluation.metrics.unresolved_count == 1
    assert evaluation.metrics.min_black_probability == pytest.approx(0.4)
    assert evaluation.p_black is not None
    assert evaluation.p_black[0] == pytest.approx(0.4)


@pytest.mark.unit
def test_analyze_raw_model_outputs_rejects_short_policy_logits() -> None:
    service = InMemoryGameService(survival_threshold=0.95)
    game = service.create_game(preset_id="balanced", human_side="W")

    with pytest.raises(GameServiceError, match="raw policy length"):
        service.analyze_raw_model_outputs(
            game_id=game.game_id,
            policy=[0.0] * 361,
            ownership=[0.0] * 361,
        )


@pytest.mark.unit
def test_apply_engine_move_uses_browser_candidates_and_survival_rerank() -> None:
    base_p_black = [1.0] * 361
    worse_eval = _ownership_from_p_black([0.4] + base_p_black[1:])
    better_eval = _ownership_from_p_black(base_p_black)
    service = InMemoryGameService(survival_threshold=0.95)
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

    outcome = _apply_browser_engine_move(
        service,
        game_id=game.game_id,
        position_ownership=_ownership_from_p_black([0.5] * 361),
        candidates=[
            _browser_candidate(candidate_a, worse_eval),
            _browser_candidate(candidate_b, better_eval),
        ],
    )

    assert outcome.move == candidate_b
    assert outcome.survival_score == 0
    assert [candidate.move for candidate in outcome.candidates] == [candidate_b]


@pytest.mark.unit
def test_apply_engine_move_black_prefers_higher_min_over_lower_survival_score() -> None:
    mostly_resolved = [0.96] * 361
    low_min_few_unresolved = _ownership_from_p_black([0.2] + mostly_resolved[1:])
    higher_min_more_unresolved = _ownership_from_p_black(
        [0.5] + [0.94] * 200 + mostly_resolved[201:]
    )
    service = InMemoryGameService(survival_threshold=0.95)
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

    outcome = _apply_browser_engine_move(
        service,
        game_id=game.game_id,
        position_ownership=_ownership_from_p_black([0.5] * 361),
        candidates=[
            _browser_candidate(candidate_a, low_min_few_unresolved),
            _browser_candidate(candidate_b, higher_min_more_unresolved),
        ],
    )

    assert outcome.move == candidate_b
    assert outcome.metrics.min_black_probability == pytest.approx(0.5)
    assert outcome.survival_score > 1


@pytest.mark.unit
def test_apply_engine_move_enforces_top_n_candidate_limit() -> None:
    base_p_black = [1.0] * 361
    lower_eval = _ownership_from_p_black([0.4] + base_p_black[1:])
    higher_eval = _ownership_from_p_black(base_p_black)
    service = InMemoryGameService(survival_threshold=0.95, default_top_n=1)
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

    outcome = _apply_browser_engine_move(
        service,
        game_id=game.game_id,
        position_ownership=_ownership_from_p_black([0.5] * 361),
        candidates=[
            _browser_candidate(candidate_a, lower_eval),
            _browser_candidate(candidate_b, higher_eval),
        ],
    )

    assert outcome.move == candidate_b
    assert [candidate.move for candidate in outcome.candidates] == [candidate_b]


@pytest.mark.unit
def test_apply_engine_move_uses_game_difficulty_top_n() -> None:
    p_black = [1.0] * 361
    service = InMemoryGameService(survival_threshold=0.95, default_top_n=9)
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

    outcome = _apply_browser_engine_move(
        service,
        game_id=game.game_id,
        position_ownership=_ownership_from_p_black([0.5] * 361),
        candidates=[
            _browser_candidate(candidate_a, _ownership_from_p_black(p_black)),
            _browser_candidate(
                candidate_b,
                _ownership_from_p_black([0.4] + p_black[1:]),
            ),
        ],
    )

    assert outcome.move == candidate_a
    assert [candidate.move for candidate in outcome.candidates] == [candidate_a]


@pytest.mark.unit
def test_apply_engine_move_uses_temperature_sampling_for_non_top_choice() -> None:
    base = [1.0] * 361
    weaker = _ownership_from_p_black([0.7] + base[1:])
    base_raw = _ownership_from_p_black(base)
    human_side = get_preset_by_id("balanced").initial_player_to_move
    service = InMemoryGameService(
        survival_threshold=0.95,
        random_source=_DeterministicRandom(random_values=[0.99], choice_index=0),
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
    human_move = _first_legal_move_for_side("balanced", side=human_side)
    service.apply_human_move(game_id=game.game_id, move=human_move)
    best_move, alt_move = _first_n_legal_moves_for_game(
        service,
        game.game_id,
        side=game.engine_side,
        n=2,
    )

    outcome = _apply_browser_engine_move(
        service,
        game_id=game.game_id,
        position_ownership=_ownership_from_p_black([0.5] * 361),
        candidates=[
            _browser_candidate(best_move, base_raw),
            _browser_candidate(alt_move, weaker),
        ],
    )

    assert outcome.move in {best_move, alt_move}


@pytest.mark.unit
def test_apply_engine_move_blunder_margin_filters_low_score_candidates() -> None:
    base = [1.0] * 361
    near_best = _ownership_from_p_black([0.985] + base[1:])
    blunder = _ownership_from_p_black([0.3] + base[1:])
    base_raw = _ownership_from_p_black(base)
    human_side = get_preset_by_id("balanced").initial_player_to_move
    service = InMemoryGameService(survival_threshold=0.95)
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
    human_move = _first_legal_move_for_side("balanced", side=human_side)
    service.apply_human_move(game_id=game.game_id, move=human_move)
    best_move, second_move, third_move = _first_n_legal_moves_for_game(
        service,
        game.game_id,
        side=game.engine_side,
        n=3,
    )

    outcome = _apply_browser_engine_move(
        service,
        game_id=game.game_id,
        position_ownership=_ownership_from_p_black([0.5] * 361),
        candidates=[
            _browser_candidate(best_move, base_raw),
            _browser_candidate(second_move, near_best),
            _browser_candidate(third_move, blunder),
        ],
    )

    assert outcome.move == best_move
    assert [candidate.move for candidate in outcome.candidates] == [best_move, second_move]


@pytest.mark.unit
def test_apply_engine_move_black_resigns_when_min_black_below_one_percent() -> None:
    hopeless = _ownership_from_p_black([0.005] + [0.5] * 360)
    service = InMemoryGameService(survival_threshold=0.95)
    game = service.create_game(preset_id="balanced", human_side="W")
    human_move = _first_legal_move_for_side("balanced", side="W")
    service.apply_human_move(game_id=game.game_id, move=human_move)

    outcome = _apply_browser_engine_move(
        service,
        game_id=game.game_id,
        position_ownership=hopeless,
        candidates=[],
    )

    assert outcome.resigned is True
    assert outcome.move == ""
    assert outcome.metrics.min_black_probability == pytest.approx(0.005)


@pytest.mark.unit
def test_apply_engine_move_black_does_not_resign_on_neutral_kaya_ownership() -> None:
    neutral_kaya_ownership = [0.0] * 361
    service = InMemoryGameService(survival_threshold=0.95)
    game = service.create_game(preset_id="balanced", human_side="W")
    human_move = _first_legal_move_for_side("balanced", side="W")
    service.apply_human_move(game_id=game.game_id, move=human_move)
    engine_move = _first_n_legal_moves_for_game(
        service,
        game.game_id,
        side=game.engine_side,
        n=1,
    )[0]

    outcome = _apply_browser_engine_move(
        service,
        game_id=game.game_id,
        position_ownership=neutral_kaya_ownership,
        position_value=[0.0, 0.0, 0.0],
        position_miscvalue=[0.0] * 10,
        candidates=[
            _browser_candidate(
                engine_move,
                _ownership_from_p_black([0.5] * 361),
            )
        ],
    )

    assert outcome.resigned is False
    assert outcome.move == engine_move
    assert outcome.metrics.min_black_probability == pytest.approx(0.5)


@pytest.mark.unit
def test_apply_engine_move_white_resigns_when_min_black_above_ninety_nine_percent() -> None:
    dominant_black = _ownership_from_p_black([0.995] + [0.996] * 360)
    service = InMemoryGameService(survival_threshold=0.95)
    game = service.create_game(preset_id="balanced", human_side="B")

    outcome = _apply_browser_engine_move(
        service,
        game_id=game.game_id,
        position_ownership=dominant_black,
        candidates=[],
    )

    assert outcome.resigned is True
    assert outcome.move == ""
    updated = service.get_game(game.game_id)
    assert updated.status == "finished"
    assert updated.winner == "B"


@pytest.mark.unit
def test_apply_human_move_rejects_finished_game() -> None:
    dominant_black = _ownership_from_p_black([0.995] + [0.996] * 360)
    service = InMemoryGameService(survival_threshold=0.95)
    game = service.create_game(preset_id="balanced", human_side="B")
    _apply_browser_engine_move(
        service,
        game_id=game.game_id,
        position_ownership=dominant_black,
        candidates=[],
    )
    move = _first_legal_move_for_side("balanced", side="B")

    with pytest.raises(GameServiceError, match="game is already finished"):
        service.apply_human_move(game_id=game.game_id, move=move)


@pytest.mark.unit
def test_apply_human_resign_finishes_game_with_engine_winner() -> None:
    service = InMemoryGameService(survival_threshold=0.95)
    game = service.create_game(preset_id="balanced", human_side="W")
    human_move = _first_legal_move_for_side("balanced", side="W")
    service.apply_human_move(game_id=game.game_id, move=human_move)

    updated = service.apply_human_resign(game_id=game.game_id)

    assert updated.status == "finished"
    assert updated.winner == "B"


@pytest.mark.unit
def test_apply_human_resign_rejects_finished_game() -> None:
    dominant_black = _ownership_from_p_black([0.995] + [0.996] * 360)
    service = InMemoryGameService(survival_threshold=0.95)
    game = service.create_game(preset_id="balanced", human_side="B")
    _apply_browser_engine_move(
        service,
        game_id=game.game_id,
        position_ownership=dominant_black,
        candidates=[],
    )

    with pytest.raises(GameServiceError, match="game is already finished"):
        service.apply_human_resign(game_id=game.game_id)
