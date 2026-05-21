"""Application settings loaded from environment variables."""

from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for Survival scoring and API behavior."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        populate_by_name=True,
        extra="ignore",
    )

    survival_threshold: float = Field(default=0.95, alias="SURVIVAL_THRESHOLD")
    default_top_n: int = Field(default=8, alias="DEFAULT_TOP_N")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    cors_allow_origins: Annotated[
        list[str],
        NoDecode,
    ] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8080",
            "http://127.0.0.1:8080",
        ],
        alias="CORS_ALLOW_ORIGINS",
    )

    @field_validator("survival_threshold")
    @classmethod
    def _survival_threshold_in_range(cls, value: float) -> float:
        if not 0.0 < value <= 1.0:
            raise ValueError("SURVIVAL_THRESHOLD must be greater than 0 and at most 1")
        return value

    @field_validator("default_top_n")
    @classmethod
    def _default_top_n_positive(cls, value: int) -> int:
        if value < 1:
            raise ValueError("DEFAULT_TOP_N must be at least 1")
        return value

    @field_validator("cors_allow_origins", mode="before")
    @classmethod
    def _parse_cors_allow_origins(cls, value: object) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        if isinstance(value, list):
            return [str(origin).strip() for origin in value if str(origin).strip()]
        raise TypeError(f"expected comma-separated string or list, got {type(value).__name__}")


def reset_settings_cache() -> None:
    """Clear cached settings (for tests)."""
    get_settings.cache_clear()


@lru_cache
def get_settings() -> Settings:
    """Return validated application settings."""
    return Settings()
