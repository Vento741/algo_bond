"""Базовый класс стратегии (ABC).

Все торговые стратегии наследуют BaseStrategy и реализуют generate_signals().
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray


@dataclass
class OHLCV:
    """Свечные данные. Все массивы одинаковой длины."""
    open: NDArray
    high: NDArray
    low: NDArray
    close: NDArray
    volume: NDArray
    timestamps: NDArray | None = None

    def __len__(self) -> int:
        return len(self.close)

    @property
    def hlc3(self) -> NDArray:
        """Typical price."""
        return (self.high + self.low + self.close) / 3


@dataclass
class Signal:
    """Торговый сигнал."""
    bar_index: int
    direction: str  # "long", "short"
    entry_price: float
    stop_loss: float
    take_profit: float
    trailing_atr: float | None = None
    confluence_score: float = 0.0
    signal_type: str = ""  # "trend", "breakout", "mean_reversion"


@dataclass
class StrategyResult:
    """Результат работы стратегии на данных."""
    signals: list[Signal] = field(default_factory=list)
    confluence_scores_long: NDArray = field(default_factory=lambda: np.array([]))
    confluence_scores_short: NDArray = field(default_factory=lambda: np.array([]))
    knn_scores: NDArray = field(default_factory=lambda: np.array([]))
    knn_classes: NDArray = field(default_factory=lambda: np.array([]))


class BaseStrategy(ABC):
    """Абстрактный базовый класс торговой стратегии."""

    def __init__(self, config: dict) -> None:
        self.config = config

    @abstractmethod
    def generate_signals(self, data: OHLCV) -> StrategyResult:
        """Генерация торговых сигналов на исторических данных."""
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        """Название стратегии."""
        ...

    @property
    @abstractmethod
    def engine_type(self) -> str:
        """Тип движка (для матчинга с БД)."""
        ...
