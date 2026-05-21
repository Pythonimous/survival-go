"""Unit tests for structured backend logging."""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator

import pytest

from backend.app.game_service import (
    BrowserEngineMoveCandidate,
    GameNotFoundError,
    GameServiceError,
    InMemoryGameService,
)
from backend.app.logging import (
    GAME_LOGGER_NAME,
    StructuredJsonFormatter,
    configure_logging,
    log_game_event,
    reset_logging_for_tests,
)
from backend.app.presets.loader import get_preset_by_id
from tests.unit.test_game_service import (
    _browser_candidate,
    _first_legal_move_for_side,
    _first_n_legal_moves_for_game,
    _ownership_from_p_black,
    _policy_logits,
)


@pytest.fixture
def game_log_records() -> Iterator[list[dict[str, object]]]:
    records: list[dict[str, object]] = []
    handler = logging.Handler()
    handler.setFormatter(StructuredJsonFormatter())

    def emit(record: logging.LogRecord) -> None:
        payload = json.loads(handler.format(record))
        records.append(payload)

    handler.emit = emit  # type: ignore[method-assign]

    logger = logging.getLogger(GAME_LOGGER_NAME)
    previous_level = logger.level
    previous_handlers = list(logger.handlers)
    previous_propagate = logger.propagate
    logger.handlers = [handler]
    logger.setLevel(logging.DEBUG)
    logger.propagate = False
    yield records
    logger.handlers = previous_handlers
    logger.setLevel(previous_level)
    logger.propagate = previous_propagate


def _events(records: list[dict[str, object]]) -> list[str]:
    return [str(record["event"]) for record in records]


@pytest.mark.unit
def test_configure_logging_emits_json_with_event_field(
    capsys: pytest.CaptureFixture[str],
) -> None:
    reset_logging_for_tests()
    configure_logging(level="INFO")
    logger = logging.getLogger("survival.test")
    log_game_event(logger, logging.INFO, "test.ping", detail="ok")
    captured = capsys.readouterr().out.strip()
    payload = json.loads(captured)
    assert payload["event"] == "test.ping"
    assert payload["level"] == "INFO"
    assert payload["detail"] == "ok"


@pytest.mark.unit
def test_create_game_logs_game_created(game_log_records: list[dict[str, object]]) -> None:
    service = InMemoryGameService(survival_threshold=0.95)
    game = service.create_game(preset_id="balanced", human_side="B")

    assert "game.created" in _events(game_log_records)
    created = next(record for record in game_log_records if record["event"] == "game.created")
    assert created["game_id"] == game.game_id
    assert created["preset_id"] == "balanced"
    assert created["human_side"] == "B"
    assert created["engine_side"] == "W"


@pytest.mark.unit
def test_delete_game_logs_game_deleted(game_log_records: list[dict[str, object]]) -> None:
    service = InMemoryGameService(survival_threshold=0.95)
    game = service.create_game(preset_id="balanced", human_side="W")
    game_log_records.clear()

    service.delete_game(game.game_id)

    assert _events(game_log_records) == ["game.deleted"]
    deleted = game_log_records[0]
    assert deleted["game_id"] == game.game_id
    assert deleted["moves_played"] == 0


@pytest.mark.unit
def test_shutdown_logs_games_cleared(game_log_records: list[dict[str, object]]) -> None:
    service = InMemoryGameService(survival_threshold=0.95)
    service.create_game(preset_id="balanced", human_side="B")
    service.create_game(preset_id="balanced", human_side="W")
    game_log_records.clear()

    service.shutdown()

    assert _events(game_log_records) == ["game.shutdown"]
    assert game_log_records[0]["games_cleared"] == 2


@pytest.mark.unit
def test_human_move_logs_success(game_log_records: list[dict[str, object]]) -> None:
    service = InMemoryGameService(survival_threshold=0.95)
    human_side = get_preset_by_id("balanced").initial_player_to_move
    game = service.create_game(preset_id="balanced", human_side=human_side)
    move = _first_legal_move_for_side("balanced", side=human_side)
    game_log_records.clear()

    service.apply_human_move(game_id=game.game_id, move=move)

    assert "game.human_move" in _events(game_log_records)
    move_event = next(record for record in game_log_records if record["event"] == "game.human_move")
    assert move_event["game_id"] == game.game_id
    assert move_event["move"] == move
    assert move_event["moves_played"] == 1


@pytest.mark.unit
def test_get_game_not_found_logs_failure(game_log_records: list[dict[str, object]]) -> None:
    service = InMemoryGameService(survival_threshold=0.95)

    with pytest.raises(GameNotFoundError):
        service.get_game("missing-game")

    failure = next(record for record in game_log_records if record["event"] == "game.not_found")
    assert failure["operation"] == "get_game"
    assert failure["game_id"] == "missing-game"
    assert failure["error_type"] == "GameNotFoundError"


@pytest.mark.unit
def test_analyze_logs_request(game_log_records: list[dict[str, object]]) -> None:
    service = InMemoryGameService(survival_threshold=0.95)
    game = service.create_game(preset_id="balanced", human_side="B")
    game_log_records.clear()

    service.analyze_raw_model_outputs(
        game_id=game.game_id,
        policy=_policy_logits(),
        ownership=_ownership_from_p_black([0.5] * 361),
    )

    assert "game.analyze" in _events(game_log_records)
    analyze_event = next(record for record in game_log_records if record["event"] == "game.analyze")
    assert analyze_event["game_id"] == game.game_id
    assert "survival_score" in analyze_event


@pytest.mark.unit
def test_engine_move_logs_request_and_outcome(game_log_records: list[dict[str, object]]) -> None:
    service = InMemoryGameService(survival_threshold=0.95)
    human_side = get_preset_by_id("balanced").initial_player_to_move
    game = service.create_game(preset_id="balanced", human_side=human_side)
    human_move = _first_legal_move_for_side("balanced", side=human_side)
    service.apply_human_move(game_id=game.game_id, move=human_move)
    game_log_records.clear()

    ownership = _ownership_from_p_black([0.5] * 361)
    engine_move, alternate_move = _first_n_legal_moves_for_game(
        service,
        game.game_id,
        side=game.engine_side,
        n=2,
    )
    outcome = service.apply_engine_move_from_browser_payload(
        game_id=game.game_id,
        position_policy=_policy_logits(),
        position_ownership=ownership,
        position_value=None,
        position_miscvalue=None,
        candidates=[
            BrowserEngineMoveCandidate(
                move=engine_move,
                policy_prob=0.4,
                policy=_policy_logits(),
                ownership=ownership,
            ),
            _browser_candidate(
                move=alternate_move,
                policy_prob=0.3,
                ownership=ownership,
            ),
        ],
    )

    events = _events(game_log_records)
    assert "game.engine_move.request" in events
    assert "game.engine_move.completed" in events
    completed = next(
        record for record in game_log_records if record["event"] == "game.engine_move.completed"
    )
    assert completed["game_id"] == game.game_id
    assert completed["move"] == outcome.move
    assert completed["resigned"] is False
    assert completed["candidate_count"] == 2


@pytest.mark.unit
def test_invalid_human_move_logs_operation_failed(
    game_log_records: list[dict[str, object]],
) -> None:
    service = InMemoryGameService(survival_threshold=0.95)
    human_side = get_preset_by_id("balanced").initial_player_to_move
    game = service.create_game(preset_id="balanced", human_side=human_side)
    game_log_records.clear()

    with pytest.raises(GameServiceError):
        service.apply_human_move(game_id=game.game_id, move="Z99")

    failure = next(
        record for record in game_log_records if record["event"] == "game.operation_failed"
    )
    assert failure["operation"] == "human_move"
    assert failure["game_id"] == game.game_id
    assert failure["error_type"] == "GameServiceError"
    assert failure["error_code"] == "illegal_move"
