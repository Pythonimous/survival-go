"""Unit tests for shared KataGo client lifecycle."""

from __future__ import annotations

from unittest.mock import Mock

import pytest

from backend.app.game_service import GameNotFoundError, InMemoryGameService
from backend.app.presets.loader import get_preset_by_id


@pytest.mark.unit
def test_create_game_allocates_single_shared_katago_client() -> None:
    created: list[Mock] = []

    def factory() -> Mock:
        client = Mock(name=f"katago-{len(created)}")
        created.append(client)
        return client

    service = InMemoryGameService(survival_threshold=0.95, katago_client_factory=factory)
    game = service.create_game(
        preset_id="balanced",
        human_side=get_preset_by_id("balanced").initial_player_to_move,
    )

    assert len(created) == 1
    assert service.get_game(game.game_id).game_id == game.game_id


@pytest.mark.unit
def test_two_games_share_same_katago_client() -> None:
    created: list[Mock] = []

    def factory() -> Mock:
        client = Mock(name=f"katago-{len(created)}")
        created.append(client)
        return client

    service = InMemoryGameService(survival_threshold=0.95, katago_client_factory=factory)
    human_side = get_preset_by_id("balanced").initial_player_to_move
    first = service.create_game(preset_id="balanced", human_side=human_side)
    second = service.create_game(preset_id="balanced", human_side=human_side)

    assert len(created) == 1
    assert first.game_id != second.game_id


@pytest.mark.unit
def test_delete_game_removes_game_without_stopping_shared_katago_client() -> None:
    client = Mock()
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client_factory=lambda: client,
    )
    human_side = get_preset_by_id("balanced").initial_player_to_move
    game = service.create_game(preset_id="balanced", human_side=human_side)

    service.delete_game(game.game_id)

    client.stop.assert_not_called()
    with pytest.raises(GameNotFoundError):
        service.get_game(game.game_id)


@pytest.mark.unit
def test_delete_unknown_game_raises_not_found() -> None:
    service = InMemoryGameService(survival_threshold=0.95, katago_client_factory=lambda: Mock())

    with pytest.raises(GameNotFoundError, match="game not found"):
        service.delete_game("missing-game")


@pytest.mark.unit
def test_shutdown_stops_single_shared_katago_client() -> None:
    client = Mock()
    service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client_factory=lambda: client,
    )
    human_side = get_preset_by_id("balanced").initial_player_to_move
    service.create_game(preset_id="balanced", human_side=human_side)
    service.create_game(preset_id="balanced", human_side=human_side)

    service.shutdown()

    client.stop.assert_called_once()
    assert not service._games
