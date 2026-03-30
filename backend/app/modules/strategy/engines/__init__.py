"""Движки торговых стратегий — реестр."""

from app.modules.strategy.engines.base import BaseStrategy
from app.modules.strategy.engines.lorentzian_knn import LorentzianKNNStrategy
from app.modules.strategy.engines.supertrend_squeeze import SuperTrendSqueezeStrategy

# Реестр доступных движков: engine_type → class
ENGINE_REGISTRY: dict[str, type[BaseStrategy]] = {
    "lorentzian_knn": LorentzianKNNStrategy,
    "supertrend_squeeze": SuperTrendSqueezeStrategy,
}


def get_engine(engine_type: str, config: dict) -> BaseStrategy:
    """Получить экземпляр стратегии по типу движка."""
    engine_cls = ENGINE_REGISTRY.get(engine_type)
    if not engine_cls:
        raise ValueError(f"Unknown engine type: {engine_type}. Available: {list(ENGINE_REGISTRY.keys())}")
    return engine_cls(config)
