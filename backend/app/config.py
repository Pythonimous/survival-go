"""Application settings loaded from environment variables."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for KataGo integration and Survival scoring."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        populate_by_name=True,
        extra="ignore",
    )

    katago_binary_path: Path = Field(alias="KATAGO_BINARY_PATH")
    katago_config_path: Path = Field(alias="KATAGO_CONFIG_PATH")
    katago_model_path: Path = Field(alias="KATAGO_MODEL_PATH")
    survival_threshold: float = Field(default=0.95, alias="SURVIVAL_THRESHOLD")
    katago_top_n: int = Field(default=8, alias="KATAGO_TOP_N")
    katago_analysis_timeout_seconds: float = Field(
        default=30.0,
        alias="KATAGO_ANALYSIS_TIMEOUT_SECONDS",
    )

    @field_validator(
        "katago_binary_path",
        "katago_config_path",
        "katago_model_path",
        mode="before",
    )
    @classmethod
    def _coerce_path(cls, value: object) -> Path:
        if isinstance(value, Path):
            return value
        if isinstance(value, str):
            return Path(value)
        raise TypeError(f"expected path string, got {type(value).__name__}")

    @field_validator(
        "katago_binary_path",
        "katago_config_path",
        "katago_model_path",
    )
    @classmethod
    def _path_must_exist(cls, value: Path) -> Path:
        resolved = value.expanduser().resolve()
        if not resolved.is_file():
            raise ValueError(f"path does not exist or is not a file: {value}")
        return resolved

    @field_validator("survival_threshold")
    @classmethod
    def _survival_threshold_in_range(cls, value: float) -> float:
        if not 0.0 < value <= 1.0:
            raise ValueError("SURVIVAL_THRESHOLD must be greater than 0 and at most 1")
        return value

    @field_validator("katago_top_n")
    @classmethod
    def _katago_top_n_positive(cls, value: int) -> int:
        if value < 1:
            raise ValueError("KATAGO_TOP_N must be at least 1")
        return value

    @field_validator("katago_analysis_timeout_seconds")
    @classmethod
    def _timeout_positive(cls, value: float) -> float:
        if value <= 0.0:
            raise ValueError("KATAGO_ANALYSIS_TIMEOUT_SECONDS must be positive")
        return value


def reset_settings_cache() -> None:
    """Clear cached settings (for tests)."""
    get_settings.cache_clear()


@lru_cache
def get_settings() -> Settings:
    """Return validated application settings."""
    return Settings()
