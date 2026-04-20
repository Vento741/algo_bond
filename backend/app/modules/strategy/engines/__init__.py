"""Движки торговых стратегий — реестр."""

from app.modules.strategy.engines.base import BaseStrategy
from app.modules.strategy.engines.lorentzian_knn import LorentzianKNNStrategy
from app.modules.strategy.engines.supertrend_squeeze import SuperTrendSqueezeStrategy
from app.modules.strategy.engines.hybrid_knn_supertrend import HybridKNNSuperTrendStrategy
from app.modules.strategy.engines.pivot_point_mr import PivotPointMeanReversion
from app.modules.strategy.engines.smc_sweep_scalper import SMCSweepScalperStrategy
from app.modules.strategy.engines.smc_sweep_scalper_v2 import SMCSweepScalperV2Strategy

# Реестр доступных движков: engine_type → class
ENGINE_REGISTRY: dict[str, type[BaseStrategy]] = {
    "lorentzian_knn": LorentzianKNNStrategy,
    "supertrend_squeeze": SuperTrendSqueezeStrategy,
    "hybrid_knn_supertrend": HybridKNNSuperTrendStrategy,
    "pivot_point_mr": PivotPointMeanReversion,
    "smc_sweep_scalper": SMCSweepScalperStrategy,
    "smc_sweep_scalper_v2": SMCSweepScalperV2Strategy,
}


def get_engine(engine_type: str, config: dict) -> BaseStrategy:
    """Получить экземпляр стратегии по типу движка."""
    engine_cls = ENGINE_REGISTRY.get(engine_type)
    if not engine_cls:
        raise ValueError(f"Unknown engine type: {engine_type}. Available: {list(ENGINE_REGISTRY.keys())}")
    return engine_cls(config)
