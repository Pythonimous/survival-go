"""Unit tests for KataGo subprocess bootstrap client."""

import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import StringIO
from pathlib import Path
from queue import Queue
from subprocess import PIPE
from unittest.mock import Mock

import pytest

from backend.app.config import Settings
from backend.app.katago.client import (
    KataGoClient,
    build_analysis_query,
    parse_candidate_moves_from_response,
)


def _build_settings(tmp_path: Path) -> Settings:
    binary = tmp_path / "katago"
    binary.write_text("#!/bin/sh\n", encoding="utf-8")
    binary.chmod(0o755)
    config = tmp_path / "analysis.cfg"
    config.write_text("numSearchThreads = 1\n", encoding="utf-8")
    model = tmp_path / "model.bin.gz"
    model.write_bytes(b"fake-model")
    return Settings(
        KATAGO_BINARY_PATH=str(binary),
        KATAGO_CONFIG_PATH=str(config),
        KATAGO_MODEL_PATH=str(model),
    )


@pytest.mark.unit
def test_start_wires_analysis_command_and_pipes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = _build_settings(tmp_path)
    process = Mock()
    process.poll.return_value = None
    popen = Mock(return_value=process)
    monkeypatch.setattr("backend.app.katago.client.subprocess.Popen", popen)
    client = KataGoClient(settings=settings)

    returned = client.start()

    assert returned is process
    popen.assert_called_once_with(
        [
            str(settings.katago_binary_path),
            "analysis",
            "-config",
            str(settings.katago_config_path),
            "-model",
            str(settings.katago_model_path),
        ],
        stdin=PIPE,
        stdout=PIPE,
        stderr=PIPE,
        text=True,
        bufsize=1,
    )


@pytest.mark.unit
def test_stop_terminates_running_process(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    settings = _build_settings(tmp_path)
    process = Mock()
    process.poll.return_value = None
    monkeypatch.setattr("backend.app.katago.client.subprocess.Popen", Mock(return_value=process))
    client = KataGoClient(settings=settings)
    client.start()

    client.stop()

    process.terminate.assert_called_once()
    process.wait.assert_called_once_with(timeout=2.0)


@pytest.mark.unit
def test_analyze_empty_board_sends_query_and_parses_ownership(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = _build_settings(tmp_path)
    ownership = [0.0] * 361
    response = {
        "id": "empty-board",
        "isDuringSearch": False,
        "ownership": ownership,
    }
    stdout = StringIO(json.dumps(response) + "\n")
    process = Mock()
    process.poll.return_value = None
    process.stdin = Mock()
    process.stdout = stdout
    monkeypatch.setattr("backend.app.katago.client.subprocess.Popen", Mock(return_value=process))
    client = KataGoClient(settings=settings)

    p_black = client.analyze_empty_board(max_visits=5)

    assert p_black == [0.5] * 361
    process.stdin.write.assert_called_once()
    written = process.stdin.write.call_args[0][0]
    query = json.loads(written.strip())
    assert query["id"] == "empty-board"
    assert query["includeOwnership"] is True
    assert query["maxVisits"] == 5
    process.stdin.flush.assert_called_once()


@pytest.mark.unit
def test_build_analysis_query_maps_setup_stones_moves_and_turn() -> None:
    query = build_analysis_query(
        query_id="preset-with-moves",
        initial_stones=[("B", "D4"), ("W", "Q16")],
        moves=[("W", "P5"), ("B", "C4")],
        initial_player="W",
        board_size=19,
        max_visits=12,
    )

    assert query["id"] == "preset-with-moves"
    assert query["initialStones"] == [["B", "D4"], ["W", "Q16"]]
    assert query["moves"] == [["W", "P5"], ["B", "C4"]]
    assert query["initialPlayer"] == "W"
    assert query["boardXSize"] == 19
    assert query["boardYSize"] == 19
    assert query["analyzeTurns"] == [2]
    assert query["includeOwnership"] is True
    assert query["maxVisits"] == 12
    assert query["rules"] == "chinese"
    assert query["komi"] == 7.5


@pytest.mark.unit
def test_build_analysis_query_uses_turn_zero_for_setup_only_position() -> None:
    query = build_analysis_query(
        query_id="setup-only",
        initial_stones=[("B", "Q4")],
        moves=[],
        initial_player="B",
        board_size=19,
        max_visits=8,
    )

    assert query["analyzeTurns"] == [0]
    assert query["moves"] == []


@pytest.mark.unit
def test_analyze_position_sends_query_and_parses_ownership(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = _build_settings(tmp_path)
    ownership = [0.0] * 361
    ownership[0] = 1.0
    response = {
        "id": "position-abc",
        "isDuringSearch": False,
        "ownership": ownership,
    }
    stdout = StringIO(json.dumps(response) + "\n")
    process = Mock()
    process.poll.return_value = None
    process.stdin = Mock()
    process.stdout = stdout
    monkeypatch.setattr("backend.app.katago.client.subprocess.Popen", Mock(return_value=process))
    client = KataGoClient(settings=settings)

    p_black = client.analyze_position(
        query_id="position-abc",
        initial_stones=[("B", "D4")],
        moves=[("W", "Q16")],
        initial_player="B",
        max_visits=10,
    )

    assert p_black[0] == 1.0
    assert all(value == 0.5 for value in p_black[1:])
    written = process.stdin.write.call_args[0][0]
    query = json.loads(written.strip())
    assert query["id"] == "position-abc"
    assert query["initialStones"] == [["B", "D4"]]
    assert query["moves"] == [["W", "Q16"]]
    assert query["analyzeTurns"] == [1]
    assert query["maxVisits"] == 10


@pytest.mark.unit
def test_get_candidate_moves_parses_move_infos(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = _build_settings(tmp_path)
    response = {
        "id": "candidate-abc",
        "isDuringSearch": False,
        "moveInfos": [
            {"move": "Q16"},
            {"move": " pass "},
            {"move": "d4"},
        ],
        "ownership": [0.0] * 361,
    }
    stdout = StringIO(json.dumps(response) + "\n")
    process = Mock()
    process.poll.return_value = None
    process.stdin = Mock()
    process.stdout = stdout
    monkeypatch.setattr("backend.app.katago.client.subprocess.Popen", Mock(return_value=process))
    client = KataGoClient(settings=settings)

    candidates = client.get_candidate_moves(
        query_id="candidate-abc",
        initial_stones=[("B", "D4")],
        moves=[],
        initial_player="W",
        max_visits=11,
    )

    assert candidates == ["Q16", "D4"]
    written = process.stdin.write.call_args[0][0]
    query = json.loads(written.strip())
    assert query["id"] == "candidate-abc"
    assert query["maxVisits"] == 11


@pytest.mark.unit
def test_parse_candidate_moves_rejects_missing_move_infos() -> None:
    with pytest.raises(ValueError, match="moveInfos"):
        parse_candidate_moves_from_response({"id": "missing"})


@pytest.mark.unit
def test_read_final_response_raises_when_analysis_deadline_expires(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = _build_settings(tmp_path)
    settings = settings.model_copy(update={"katago_analysis_timeout_seconds": 30.0})
    process = Mock()
    process.poll.return_value = None
    process.stdout = StringIO()
    client = KataGoClient(settings=settings)

    state = {"calls": 0}

    def fake_monotonic() -> float:
        state["calls"] += 1
        if state["calls"] == 1:
            return 0.0
        return 1e12

    monkeypatch.setattr("backend.app.katago.client.time.monotonic", fake_monotonic)

    with pytest.raises(TimeoutError, match="timed out waiting for KataGo analysis"):
        client._read_final_response(process, query_id="deadline-test")


def _install_concurrent_process_mock(
    monkeypatch: pytest.MonkeyPatch,
    *,
    responses_by_id: dict[str, list[dict[str, object]]],
) -> dict[str, object]:
    """Mock KataGo process with blocking stdout and per-query response lines."""
    trackers: dict[str, object] = {"peak_active_writes": 0, "write_order": []}
    active_writes = 0
    active_lock = threading.Lock()
    write_order: list[str] = []
    pending_lines: Queue[str] = Queue()

    process = Mock()
    process.poll.return_value = None

    def write(data: str) -> int:
        nonlocal active_writes
        with active_lock:
            active_writes += 1
            trackers["peak_active_writes"] = max(
                int(trackers["peak_active_writes"]), active_writes
            )
        try:
            time.sleep(0.02)
            query_id = str(json.loads(data.strip())["id"])
            write_order.append(query_id)
            for payload in responses_by_id[query_id]:
                pending_lines.put(json.dumps(payload))
            return len(data)
        finally:
            with active_lock:
                active_writes -= 1

    def readline() -> str:
        time.sleep(0.01)
        if pending_lines.empty():
            return ""
        return pending_lines.get_nowait() + "\n"

    process.stdin = Mock()
    process.stdin.write.side_effect = write
    process.stdout = Mock()
    process.stdout.readline.side_effect = readline
    monkeypatch.setattr("backend.app.katago.client.subprocess.Popen", Mock(return_value=process))
    trackers["write_order"] = write_order
    return trackers


@pytest.mark.unit
def test_concurrent_send_query_serializes_stdin_access(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = _build_settings(tmp_path)

    def ownership_response(query_id: str, p_black_first: float) -> list[dict[str, object]]:
        katago_first = (p_black_first * 2.0) - 1.0
        ownership = [katago_first] + [0.0] * 360
        return [
            {"id": "other-query", "isDuringSearch": False, "ownership": [0.0] * 361},
            {"id": query_id, "isDuringSearch": True, "ownership": ownership},
            {"id": query_id, "isDuringSearch": False, "ownership": ownership},
        ]

    trackers = _install_concurrent_process_mock(
        monkeypatch,
        responses_by_id={
            "query-a": ownership_response("query-a", 0.1),
            "query-b": ownership_response("query-b", 0.9),
        },
    )
    client = KataGoClient(settings=settings)

    def analyze(query_id: str, p_black_first: float) -> float:
        result = client.analyze_position(
            query_id=query_id,
            initial_stones=[],
            moves=[],
            initial_player="B",
            max_visits=5,
        )
        return result[0]

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [
            pool.submit(analyze, "query-a", 0.1),
            pool.submit(analyze, "query-b", 0.9),
            pool.submit(analyze, "query-a", 0.1),
            pool.submit(analyze, "query-b", 0.9),
        ]
        results = [future.result() for future in as_completed(futures)]

    assert sorted(results) == pytest.approx([0.1, 0.1, 0.9, 0.9])
    write_order = trackers["write_order"]
    assert write_order == ["query-a", "query-b", "query-a", "query-b"] or write_order == [
        "query-b",
        "query-a",
        "query-b",
        "query-a",
    ]
    assert trackers["peak_active_writes"] <= 1


@pytest.mark.unit
def test_concurrent_send_query_matches_response_by_query_id(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = _build_settings(tmp_path)
    _install_concurrent_process_mock(
        monkeypatch,
        responses_by_id={
            "alpha": [
                {"id": "beta", "isDuringSearch": False, "ownership": [0.0] * 361},
                {"id": "alpha", "isDuringSearch": False, "ownership": [1.0] + [0.0] * 360},
            ],
            "beta": [
                {"id": "alpha", "isDuringSearch": False, "ownership": [1.0] + [0.0] * 360},
                {"id": "beta", "isDuringSearch": False, "ownership": [-1.0] + [0.0] * 360},
            ],
        },
    )
    client = KataGoClient(settings=settings)

    with ThreadPoolExecutor(max_workers=2) as pool:
        alpha_future = pool.submit(
            client.analyze_position,
            query_id="alpha",
            initial_stones=[],
            moves=[],
            initial_player="B",
            max_visits=3,
        )
        beta_future = pool.submit(
            client.analyze_position,
            query_id="beta",
            initial_stones=[],
            moves=[],
            initial_player="B",
            max_visits=3,
        )
        alpha = alpha_future.result()
        beta = beta_future.result()

    assert alpha[0] == 1.0
    assert beta[0] == 0.0
