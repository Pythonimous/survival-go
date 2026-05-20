from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.app.config import get_settings
from backend.app.difficulty import DifficultyConfig, DifficultyPreset, list_difficulty_presets
from backend.app.engine.board import StoneColor
from backend.app.game_service import (
    BrowserEngineMoveCandidate,
    GameNotFoundError,
    GameState,
    GameServiceError,
    InMemoryGameService,
)

SERVER_INFERENCE_REMOVED = (
    "Server-side KataGo inference was removed. "
    "Send browser ONNX payloads: raw_model_outputs for /analyze "
    "and browser_engine_move for /engine-move."
)


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "survival-go"


class CreateGameRequest(BaseModel):
    preset_id: str
    human_side: StoneColor
    difficulty: DifficultyConfig | None = None


class CreateGameResponse(BaseModel):
    game_id: str


class MoveRequest(BaseModel):
    move: str


class GameStateResponse(BaseModel):
    game_id: str
    preset_id: str
    board_size: int
    human_side: StoneColor
    engine_side: StoneColor
    next_to_move: StoneColor
    moves_played: int
    last_move: str | None = None
    status: str = "active"
    winner: StoneColor | None = None
    difficulty: DifficultyConfig
    stones: list[dict[str, str]]
    legal_moves: list[str]


class MoveResponse(GameStateResponse):
    move: str


class CandidateSummary(BaseModel):
    move: str
    survival_score: int
    min_black_probability: float


class EngineMoveResponse(MoveResponse):
    survival_score: int
    metrics: dict[str, float | int]
    candidates: list[CandidateSummary]
    resigned: bool = False


class AnalyzeResponse(BaseModel):
    game_id: str
    metrics: dict[str, float | int]
    survival_score: int
    policy: list[float] | None = None
    p_black: list[float] | None = None
    score_lead: float | None = None
    winrate: float | None = None


class RawModelOutputsRequest(BaseModel):
    policy: list[float]
    ownership: list[float]
    value: list[float] | None = None
    miscvalue: list[float] | None = None


class AnalyzeRequest(BaseModel):
    raw_model_outputs: RawModelOutputsRequest = Field(
        ...,
        description="Raw ONNX model outputs from browser inference.",
    )


class BrowserEngineMoveCandidateRequest(BaseModel):
    move: str
    policy_prob: float
    raw_model_outputs: RawModelOutputsRequest


class BrowserEngineMoveRequest(BaseModel):
    position_raw: RawModelOutputsRequest
    candidates: list[BrowserEngineMoveCandidateRequest]


class EngineMoveRequest(BaseModel):
    browser_engine_move: BrowserEngineMoveRequest = Field(
        ...,
        description="Browser ONNX engine-move payload (position + candidates).",
    )


def _to_game_state_payload(
    game: GameState, game_service: InMemoryGameService
) -> GameStateResponse:
    return GameStateResponse(
        game_id=game.game_id,
        preset_id=game.preset_id,
        board_size=game.board_size,
        human_side=game.human_side,
        engine_side=game.engine_side,
        next_to_move=game.next_to_move,
        moves_played=game.moves_played,
        last_move=game.last_move,
        status=game.status,
        winner=game.winner,
        difficulty=game.difficulty,
        stones=game.stones(),
        legal_moves=game_service.legal_moves_for_side(game, side=game.next_to_move),
    )


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _register_health_route(application: FastAPI) -> None:
    @application.get("/health", response_model=HealthResponse)
    def health_check() -> HealthResponse:
        return HealthResponse()


def _register_list_presets_route(
    application: FastAPI, game_service: InMemoryGameService
) -> None:
    @application.get("/api/presets")
    def list_presets() -> list[dict[str, object]]:
        try:
            return game_service.list_presets()
        except GameServiceError as exc:
            raise _bad_request(str(exc)) from exc


def _register_list_difficulty_presets_route(application: FastAPI) -> None:
    @application.get("/api/difficulty-presets", response_model=list[DifficultyPreset])
    def list_difficulty_settings() -> list[DifficultyPreset]:
        return list_difficulty_presets()


def _register_create_game_route(
    application: FastAPI, game_service: InMemoryGameService
) -> None:
    @application.post(
        "/api/games",
        response_model=CreateGameResponse,
        status_code=status.HTTP_201_CREATED,
    )
    def create_game(payload: CreateGameRequest) -> CreateGameResponse:
        try:
            game = game_service.create_game(
                preset_id=payload.preset_id,
                human_side=payload.human_side,
                difficulty=payload.difficulty,
            )
        except GameServiceError as exc:
            raise _bad_request(str(exc)) from exc
        return CreateGameResponse(game_id=game.game_id)


def _register_get_game_route(application: FastAPI, game_service: InMemoryGameService) -> None:
    @application.get("/api/games/{game_id}", response_model=GameStateResponse)
    def get_game(game_id: str) -> GameStateResponse:
        try:
            game = game_service.get_game(game_id)
        except GameNotFoundError as exc:
            raise _not_found(str(exc)) from exc
        return _to_game_state_payload(game, game_service)


def _register_delete_game_route(
    application: FastAPI, game_service: InMemoryGameService
) -> None:
    @application.delete("/api/games/{game_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_game(game_id: str) -> Response:
        try:
            game_service.delete_game(game_id)
        except GameNotFoundError as exc:
            raise _not_found(str(exc)) from exc
        return Response(status_code=status.HTTP_204_NO_CONTENT)


def _register_human_move_route(
    application: FastAPI, game_service: InMemoryGameService
) -> None:
    @application.post("/api/games/{game_id}/move", response_model=MoveResponse)
    def apply_human_move(game_id: str, payload: MoveRequest) -> MoveResponse:
        try:
            game = game_service.apply_human_move(game_id=game_id, move=payload.move)
        except GameNotFoundError as exc:
            raise _not_found(str(exc)) from exc
        except GameServiceError as exc:
            raise _bad_request(str(exc)) from exc

        state_payload = _to_game_state_payload(game, game_service)
        return MoveResponse(**state_payload.model_dump(), move=payload.move)


def _register_human_resign_route(
    application: FastAPI, game_service: InMemoryGameService
) -> None:
    @application.post("/api/games/{game_id}/resign", response_model=GameStateResponse)
    def apply_human_resign(game_id: str) -> GameStateResponse:
        try:
            game = game_service.apply_human_resign(game_id=game_id)
        except GameNotFoundError as exc:
            raise _not_found(str(exc)) from exc
        except GameServiceError as exc:
            raise _bad_request(str(exc)) from exc

        return _to_game_state_payload(game, game_service)


def _register_engine_move_route(
    application: FastAPI, game_service: InMemoryGameService
) -> None:
    @application.post("/api/games/{game_id}/engine-move", response_model=EngineMoveResponse)
    def apply_engine_move(game_id: str, payload: EngineMoveRequest) -> EngineMoveResponse:
        try:
            browser_payload = payload.browser_engine_move
            outcome = game_service.apply_engine_move_from_browser_payload(
                game_id=game_id,
                position_policy=browser_payload.position_raw.policy,
                position_ownership=browser_payload.position_raw.ownership,
                position_value=browser_payload.position_raw.value,
                position_miscvalue=browser_payload.position_raw.miscvalue,
                candidates=[
                    BrowserEngineMoveCandidate(
                        move=item.move,
                        policy_prob=item.policy_prob,
                        policy=item.raw_model_outputs.policy,
                        ownership=item.raw_model_outputs.ownership,
                        value=item.raw_model_outputs.value,
                        miscvalue=item.raw_model_outputs.miscvalue,
                    )
                    for item in browser_payload.candidates
                ],
            )
        except GameNotFoundError as exc:
            raise _not_found(str(exc)) from exc
        except GameServiceError as exc:
            raise _bad_request(str(exc)) from exc

        state_payload = _to_game_state_payload(outcome.game, game_service)
        return EngineMoveResponse(
            **state_payload.model_dump(),
            move=outcome.move,
            survival_score=outcome.survival_score,
            metrics={
                "unresolved_count": outcome.metrics.unresolved_count,
                "min_black_probability": outcome.metrics.min_black_probability,
            },
            candidates=[
                CandidateSummary(
                    move=candidate.move,
                    survival_score=candidate.survival_score,
                    min_black_probability=candidate.min_black_probability,
                )
                for candidate in outcome.candidates
            ],
            resigned=outcome.resigned,
        )


def _register_analyze_route(application: FastAPI, game_service: InMemoryGameService) -> None:
    @application.post("/api/games/{game_id}/analyze", response_model=AnalyzeResponse)
    def analyze_game(game_id: str, payload: AnalyzeRequest) -> AnalyzeResponse:
        try:
            evaluation = game_service.analyze_raw_model_outputs(
                game_id=game_id,
                policy=payload.raw_model_outputs.policy,
                ownership=payload.raw_model_outputs.ownership,
                value=payload.raw_model_outputs.value,
                miscvalue=payload.raw_model_outputs.miscvalue,
            )
        except GameNotFoundError as exc:
            raise _not_found(str(exc)) from exc
        except GameServiceError as exc:
            raise _bad_request(str(exc)) from exc

        return AnalyzeResponse(
            game_id=game_id,
            survival_score=evaluation.survival_score,
            metrics={
                "unresolved_count": evaluation.metrics.unresolved_count,
                "min_black_probability": evaluation.metrics.min_black_probability,
            },
            policy=evaluation.policy,
            p_black=evaluation.p_black,
            score_lead=evaluation.score_lead,
            winrate=evaluation.winrate,
        )


def _register_routes(application: FastAPI, game_service: InMemoryGameService) -> None:
    _register_health_route(application)
    _register_list_presets_route(application, game_service)
    _register_list_difficulty_presets_route(application)
    _register_create_game_route(application, game_service)
    _register_get_game_route(application, game_service)
    _register_delete_game_route(application, game_service)
    _register_human_move_route(application, game_service)
    _register_human_resign_route(application, game_service)
    _register_engine_move_route(application, game_service)
    _register_analyze_route(application, game_service)


def create_app(*, game_service: InMemoryGameService | None = None) -> FastAPI:
    settings = get_settings()
    resolved_game_service = game_service or InMemoryGameService(
        survival_threshold=settings.survival_threshold,
        default_top_n=settings.default_top_n,
    )

    @asynccontextmanager
    async def lifespan(_application: FastAPI):
        yield
        resolved_game_service.shutdown()

    application = FastAPI(title="survival-go", lifespan=lifespan)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    _register_routes(application, resolved_game_service)
    return application


app = create_app()
