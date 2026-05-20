"""Integration: browser engine-move fixtures align with backend Survival reranking."""

from __future__ import annotations

import copy

import pytest

from backend.app.difficulty import DifficultyConfig
from backend.app.engine.move_selector import (
    CandidateMove,
    filter_blunders,
    rank_candidates_for_side,
    select_candidate_for_side,
)
from backend.app.engine.resignation import should_engine_resign
from backend.app.game_service import InMemoryGameService
from tests.fixtures.onnx_engine_move.loader import (
    EngineMoveFixture,
    load_all_engine_move_fixtures,
    resolve_candidate_raw,
    resolve_position_raw,
)
from tests.integration.conftest import first_legal_move_for_side


def _first_n_legal_engine_moves(
    service: InMemoryGameService,
    *,
    game_id: str,
    side: str,
    n: int,
) -> list[str]:
    game = service.get_game(game_id)
    board = copy.deepcopy(game.board)
    from backend.app.engine.board import format_gtp_coordinate, to_sgfmill_color

    sgf_color = to_sgfmill_color(side)
    moves: list[str] = []
    for row in range(board.side):
        for col in range(board.side):
            if board.get(row, col) is not None:
                continue
            trial = board.copy()
            try:
                trial.play(row, col, sgf_color)
            except ValueError:
                continue
            moves.append(format_gtp_coordinate(row, col, size=board.side))
            if len(moves) >= n:
                return moves
    raise AssertionError(f"expected {n} legal moves for side {side}")


def _difficulty_from_fixture(fixture: EngineMoveFixture) -> DifficultyConfig:
    difficulty = fixture["difficulty"]
    return DifficultyConfig(
        max_visits=difficulty["maxVisits"],
        top_n=difficulty["topN"],
        randomness=difficulty["randomness"],
        variant_awareness=difficulty["variantAwareness"],
        temperature=difficulty["temperature"],
        blunder_margin=difficulty["blunderMargin"],
    )


def _resolve_move_slots(
    service: InMemoryGameService,
    *,
    game_id: str,
    engine_side: str,
    slots: list[int],
) -> list[str]:
    legal = _first_n_legal_engine_moves(
        service,
        game_id=game_id,
        side=engine_side,
        n=max(slots) + 1,
    )
    return [legal[slot] for slot in slots]


def _candidates_from_fixture(
    service: InMemoryGameService,
    *,
    game_id: str,
    fixture: EngineMoveFixture,
) -> list[CandidateMove]:
    game = service.get_game(game_id)
    slots = [item["moveSlot"] for item in fixture["policyCandidates"]]
    moves = _resolve_move_slots(
        service,
        game_id=game_id,
        engine_side=game.engine_side,
        slots=slots,
    )
    from backend.app.game_service import BrowserEngineMoveCandidate

    candidates: list[CandidateMove] = []
    for move, item in zip(moves, fixture["policyCandidates"], strict=True):
        raw = resolve_candidate_raw(item)
        browser_candidate = BrowserEngineMoveCandidate(
            move=move,
            policy_prob=float(item["policyProb"]),
            policy=raw["policy"],
            ownership=raw["ownership"],
            value=raw.get("value"),
            miscvalue=raw.get("miscvalue"),
        )
        candidates.append(service._candidate_move_from_browser_stats(browser_candidate))
    return candidates


@pytest.mark.integration
@pytest.mark.parametrize("fixture", load_all_engine_move_fixtures(), ids=lambda item: item["id"])
def test_browser_engine_move_fixture_matches_survival_rerank(
    fixture: EngineMoveFixture,
) -> None:
    """Mirrors browser path: MCTS stats per candidate -> winrate/policy rerank."""
    service = InMemoryGameService(survival_threshold=0.95)
    game_cfg = fixture["game"]
    difficulty = _difficulty_from_fixture(fixture)
    game = service.create_game(
        preset_id=game_cfg["presetId"],
        human_side=game_cfg["humanSide"],
        difficulty=difficulty,
    )
    human_move = first_legal_move_for_side(game_cfg["presetId"], side=game_cfg["humanSide"])
    service.apply_human_move(game_id=game.game_id, move=human_move)

    root_raw = resolve_position_raw(fixture)
    root_eval = service.analyze_raw_model_outputs(
        game_id=game.game_id,
        policy=root_raw["policy"],
        ownership=root_raw["ownership"],
        value=root_raw.get("value"),
        miscvalue=root_raw.get("miscvalue"),
    )
    expected = fixture["expected"]

    if expected.get("resigned"):
        assert should_engine_resign(
            engine_side=game.engine_side,
            min_black_probability=root_eval.metrics.min_black_probability,
        )
        return

    candidates = _candidates_from_fixture(service, game_id=game.game_id, fixture=fixture)
    ranked = rank_candidates_for_side(
        candidates,
        engine_side=game.engine_side,
        difficulty=difficulty,
    )
    shortlist = ranked[: min(difficulty.top_n, len(ranked))]
    selected = select_candidate_for_side(
        shortlist,
        engine_side=game.engine_side,
        difficulty=difficulty,
        random_source=service._random_source,
    )
    filtered = filter_blunders(
        ranked,
        engine_side=game.engine_side,
        difficulty=difficulty,
    )

    selected_slot = expected["selectedMoveSlot"]
    ranked_slots = expected.get("rankedMoveSlots", [])
    resolved_ranked = _resolve_move_slots(
        service,
        game_id=game.game_id,
        engine_side=game.engine_side,
        slots=ranked_slots,
    )
    resolved_selected = _resolve_move_slots(
        service,
        game_id=game.game_id,
        engine_side=game.engine_side,
        slots=[selected_slot],
    )[0]

    assert selected.move == resolved_selected
    assert [candidate.move for candidate in ranked[: len(resolved_ranked)]] == resolved_ranked
    if "filteredMoveSlots" in expected:
        resolved_filtered = _resolve_move_slots(
            service,
            game_id=game.game_id,
            engine_side=game.engine_side,
            slots=expected["filteredMoveSlots"],
        )
        assert [candidate.move for candidate in filtered] == resolved_filtered
