from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.app.config import get_settings
from backend.app.engine.board import StoneColor
from backend.app.game_service import (
    GameNotFoundError,
    GameState,
    GameServiceError,
    InMemoryGameService,
)
from backend.app.katago.client import KataGoClient


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "survival-katago"


class CreateGameRequest(BaseModel):
    preset_id: str
    human_side: StoneColor


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
    stones: list[dict[str, str]]


class MoveResponse(GameStateResponse):
    move: str


class AnalyzeResponse(BaseModel):
    game_id: str
    metrics: dict[str, float | int]
    survival_score: int


def _to_game_state_payload(game: GameState) -> GameStateResponse:
    # Keep handlers thin: game serialization stays in one place.
    return GameStateResponse(
        game_id=game.game_id,
        preset_id=game.preset_id,
        board_size=game.board_size,
        human_side=game.human_side,
        engine_side=game.engine_side,
        next_to_move=game.next_to_move,
        stones=game.stones(),
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
        return _to_game_state_payload(game)


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

        state_payload = _to_game_state_payload(game)
        return MoveResponse(**state_payload.model_dump(), move=payload.move)


def _register_engine_move_route(
    application: FastAPI, game_service: InMemoryGameService
) -> None:
    @application.post("/api/games/{game_id}/engine-move", response_model=MoveResponse)
    def apply_engine_move(game_id: str) -> MoveResponse:
        try:
            game, move = game_service.apply_engine_move(game_id=game_id)
        except GameNotFoundError as exc:
            raise _not_found(str(exc)) from exc
        except GameServiceError as exc:
            raise _bad_request(str(exc)) from exc

        state_payload = _to_game_state_payload(game)
        return MoveResponse(**state_payload.model_dump(), move=move)


def _register_analyze_route(application: FastAPI, game_service: InMemoryGameService) -> None:
    @application.post("/api/games/{game_id}/analyze", response_model=AnalyzeResponse)
    def analyze_game(game_id: str) -> AnalyzeResponse:
        try:
            evaluation = game_service.analyze_game(game_id=game_id)
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
        )


def _register_routes(application: FastAPI, game_service: InMemoryGameService) -> None:
    _register_health_route(application)
    _register_list_presets_route(application, game_service)
    _register_create_game_route(application, game_service)
    _register_get_game_route(application, game_service)
    _register_human_move_route(application, game_service)
    _register_engine_move_route(application, game_service)
    _register_analyze_route(application, game_service)


def create_app() -> FastAPI:
    settings = get_settings()
    game_service = InMemoryGameService(
        survival_threshold=settings.survival_threshold,
        katago_client=KataGoClient(settings=settings),
        katago_top_n=settings.katago_top_n,
    )
    application = FastAPI(title="survival-katago")
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    _register_routes(application, game_service)
    return application


app = create_app()
