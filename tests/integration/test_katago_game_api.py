"""Integration tests for KataGo-backed analyze and engine-move API paths."""

from __future__ import annotations

import re
import types

import pytest
from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.game_service import GameServiceError, InMemoryGameService
from backend.app.katago.client import KataGoClient
from backend.app.presets.loader import get_preset_by_id
from tests.integration.conftest import (
    create_live_game,
    extract_metrics,
    first_legal_move_for_side,
)


@pytest.fixture
def live_api_client(live_katago_env: Settings) -> TestClient:
    from backend.app.main import create_app

    return TestClient(create_app())


@pytest.mark.integration
def test_live_api_analyze_returns_ownership_metrics(live_api_client: TestClient) -> None:
    game_id, _ = create_live_game(live_api_client)

    analyze_response = live_api_client.post(f"/api/games/{game_id}/analyze")

    assert analyze_response.status_code == 200
    payload = analyze_response.json()
    assert payload["game_id"] == game_id
    metrics = extract_metrics(payload)
    assert metrics["unresolved_count"] >= 0
    min_black = float(metrics["min_black_probability"])
    assert 0.0 <= min_black <= 1.0
    assert payload["survival_score"] == metrics["unresolved_count"]


@pytest.mark.integration
def test_live_api_engine_move_selects_legal_move(live_api_client: TestClient) -> None:
    preset_id = "balanced"
    human_side = get_preset_by_id(preset_id).initial_player_to_move
    game_id, _ = create_live_game(live_api_client, preset_id=preset_id)

    engine_response = live_api_client.post(f"/api/games/{game_id}/engine-move")

    assert engine_response.status_code == 200
    payload = engine_response.json()
    assert payload["game_id"] == game_id
    engine_move = payload["move"]
    assert isinstance(engine_move, str)
    assert re.fullmatch(r"[A-HJ-T](1[0-9]|[1-9])", engine_move)

    state_response = live_api_client.get(f"/api/games/{game_id}")
    assert state_response.status_code == 200
    state = state_response.json()
    assert state["next_to_move"] == human_side
    stone_moves = {stone["move"] for stone in state["stones"]}
    assert engine_move in stone_moves


def _force_katago_analysis_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force the read loop to time out after the live subprocess accepts a query."""

    def timed_out(
        self: KataGoClient, process: object, *, query_id: str
    ) -> dict[str, object]:
        del self, process
        raise TimeoutError(f"timed out waiting for KataGo analysis response id={query_id}")

    monkeypatch.setattr(KataGoClient, "_read_final_response", timed_out)


@pytest.mark.integration
def test_live_api_analyze_times_out_when_katago_is_too_slow(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _force_katago_analysis_timeout(monkeypatch)
    from backend.app.main import create_app

    api_client = TestClient(create_app())
    game_id, _ = create_live_game(api_client)

    analyze_response = api_client.post(f"/api/games/{game_id}/analyze")

    assert analyze_response.status_code == 400
    assert "failed to analyze game with KataGo" in analyze_response.json()["detail"]


@pytest.mark.integration
def test_live_api_engine_move_times_out_when_katago_is_too_slow(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _force_katago_analysis_timeout(monkeypatch)
    from backend.app.main import create_app

    api_client = TestClient(create_app())
    game_id, _ = create_live_game(api_client)

    engine_response = api_client.post(f"/api/games/{game_id}/engine-move")

    assert engine_response.status_code == 400
    detail = engine_response.json()["detail"]
    assert "KataGo" in detail


@pytest.mark.integration
def test_live_analyze_surfaces_katago_process_exit(katago_settings: Settings) -> None:
    client = KataGoClient(settings=katago_settings)
    service = InMemoryGameService(
        survival_threshold=katago_settings.survival_threshold,
        katago_client=client,
        katago_top_n=katago_settings.katago_top_n,
    )
    human_side = get_preset_by_id("balanced").initial_player_to_move
    game = service.create_game(preset_id="balanced", human_side=human_side)
    move = first_legal_move_for_side("balanced", side=human_side)
    service.apply_human_move(game_id=game.game_id, move=move)

    client.start()
    client.analyze_empty_board(max_visits=5)
    process = client._process
    assert process is not None
    process.kill()
    process.wait(timeout=5.0)

    def _return_killed_process(self: KataGoClient) -> object:
        assert self._process is not None
        return self._process

    client.start = types.MethodType(_return_killed_process, client)  # type: ignore[method-assign]

    with pytest.raises(GameServiceError, match="failed to analyze game with KataGo"):
        service.analyze_game(game_id=game.game_id)


@pytest.mark.integration
def test_live_engine_move_surfaces_katago_process_exit(katago_settings: Settings) -> None:
    client = KataGoClient(settings=katago_settings)
    service = InMemoryGameService(
        survival_threshold=katago_settings.survival_threshold,
        katago_client=client,
        katago_top_n=katago_settings.katago_top_n,
    )
    human_side = get_preset_by_id("balanced").initial_player_to_move
    game = service.create_game(preset_id="balanced", human_side=human_side)
    move = first_legal_move_for_side("balanced", side=human_side)
    service.apply_human_move(game_id=game.game_id, move=move)

    client.start()
    client.get_candidate_moves(
        query_id="warmup",
        initial_stones=service._board_as_initial_stones(game.board),
        moves=[],
        initial_player=game.engine_side,
        board_size=game.board.side,
        max_visits=5,
    )
    process = client._process
    assert process is not None
    process.kill()
    process.wait(timeout=5.0)

    def _return_killed_process(self: KataGoClient) -> object:
        assert self._process is not None
        return self._process

    client.start = types.MethodType(_return_killed_process, client)  # type: ignore[method-assign]

    with pytest.raises(
        GameServiceError,
        match="failed to fetch engine move candidates from KataGo",
    ):
        service.apply_engine_move(game_id=game.game_id)
