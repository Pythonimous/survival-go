"""Minimal KataGo subprocess bootstrap client."""

from __future__ import annotations

import json
import subprocess
import threading
import time
from collections.abc import Sequence
from typing import Any

from backend.app.config import Settings
from backend.app.engine.board import StoneColor
from backend.app.katago.ownership import parse_ownership_from_response

EMPTY_BOARD_QUERY_ID = "empty-board"


def build_analysis_query(
    *,
    query_id: str,
    initial_stones: Sequence[tuple[StoneColor, str]],
    moves: Sequence[tuple[StoneColor, str]],
    initial_player: StoneColor,
    board_size: int,
    max_visits: int,
    komi: float = 7.5,
    rules: str = "chinese",
) -> dict[str, Any]:
    """Build a KataGo analysis-engine query for a setup plus move sequence."""
    return {
        "id": query_id,
        "initialStones": [[color, coordinate] for color, coordinate in initial_stones],
        "moves": [[color, coordinate] for color, coordinate in moves],
        "initialPlayer": initial_player,
        "rules": rules,
        "komi": komi,
        "boardXSize": board_size,
        "boardYSize": board_size,
        "analyzeTurns": [len(moves)],
        "includeOwnership": True,
        "maxVisits": max_visits,
    }


def parse_candidate_moves_from_response(response: dict[str, Any]) -> list[str]:
    """Extract ordered KataGo candidate move coordinates from moveInfos."""
    move_infos = response.get("moveInfos")
    if not isinstance(move_infos, list):
        raise ValueError("KataGo response missing moveInfos")
    candidates: list[str] = []
    for move_info in move_infos:
        if not isinstance(move_info, dict):
            continue
        move = move_info.get("move")
        if not isinstance(move, str):
            continue
        normalized = move.strip().upper()
        if not normalized or normalized == "PASS":
            continue
        candidates.append(normalized)
    return candidates


class KataGoClient:
    """Boot and own a KataGo analysis subprocess."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._process: subprocess.Popen[str] | None = None
        self._query_lock = threading.Lock()

    def start(self) -> subprocess.Popen[str]:
        """Start KataGo analysis mode if not already running."""
        if self._process is not None and self._process.poll() is None:
            return self._process

        command = [
            str(self._settings.katago_binary_path),
            "analysis",
            "-config",
            str(self._settings.katago_config_path),
            "-model",
            str(self._settings.katago_model_path),
        ]
        self._process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        return self._process

    def stop(self) -> None:
        """Terminate the managed process when it is running."""
        if self._process is None:
            return
        if self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=2.0)
            except subprocess.TimeoutExpired:
                self._process.kill()
                self._process.wait(timeout=2.0)

    def analyze_empty_board(self, *, max_visits: int = 20, board_size: int = 19) -> list[float]:
        """Analyze an empty board and return black ownership probabilities."""
        return self.analyze_position(
            query_id=EMPTY_BOARD_QUERY_ID,
            initial_stones=[],
            moves=[],
            initial_player="B",
            board_size=board_size,
            max_visits=max_visits,
        )

    def analyze_position(
        self,
        *,
        query_id: str,
        initial_stones: Sequence[tuple[StoneColor, str]],
        moves: Sequence[tuple[StoneColor, str]],
        initial_player: StoneColor,
        board_size: int = 19,
        max_visits: int = 20,
        komi: float = 7.5,
    ) -> list[float]:
        """Analyze a setup plus move sequence and return black ownership probabilities."""
        query = build_analysis_query(
            query_id=query_id,
            initial_stones=initial_stones,
            moves=moves,
            initial_player=initial_player,
            board_size=board_size,
            max_visits=max_visits,
            komi=komi,
        )
        response = self._send_query(query)
        return parse_ownership_from_response(response, board_size=board_size)

    def get_candidate_moves(
        self,
        *,
        query_id: str,
        initial_stones: Sequence[tuple[StoneColor, str]],
        moves: Sequence[tuple[StoneColor, str]],
        initial_player: StoneColor,
        board_size: int = 19,
        max_visits: int = 20,
        komi: float = 7.5,
    ) -> list[str]:
        """Analyze a position and return ordered move candidates from KataGo."""
        query = build_analysis_query(
            query_id=query_id,
            initial_stones=initial_stones,
            moves=moves,
            initial_player=initial_player,
            board_size=board_size,
            max_visits=max_visits,
            komi=komi,
        )
        response = self._send_query(query)
        return parse_candidate_moves_from_response(response)

    def _send_query(self, query: dict[str, Any]) -> dict[str, Any]:
        with self._query_lock:
            process = self.start()
            if process.stdin is None or process.stdout is None:
                raise RuntimeError("KataGo process is missing stdin/stdout pipes")

            query_id = str(query["id"])
            process.stdin.write(json.dumps(query) + "\n")
            process.stdin.flush()
            return self._read_final_response(process, query_id=query_id)

    def _read_final_response(
        self, process: subprocess.Popen[str], *, query_id: str
    ) -> dict[str, Any]:
        if process.stdout is None:
            raise RuntimeError("KataGo process is missing stdout pipe")

        deadline = time.monotonic() + self._settings.katago_analysis_timeout_seconds
        while True:
            if time.monotonic() > deadline:
                raise TimeoutError(
                    f"timed out waiting for KataGo analysis response id={query_id}"
                )
            if process.poll() is not None:
                raise RuntimeError("KataGo process exited before returning analysis")

            line = process.stdout.readline()
            if not line:
                raise RuntimeError("KataGo stdout closed before analysis completed")

            stripped = line.strip()
            if not stripped:
                continue

            payload = json.loads(stripped)
            if payload.get("error"):
                raise RuntimeError(str(payload["error"]))
            if payload.get("id") != query_id:
                continue
            if payload.get("isDuringSearch", False):
                continue
            return payload
