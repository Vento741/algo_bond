"""Движок бэктестирования — симуляция стратегии на исторических данных."""

import math
from dataclasses import dataclass, field

import numpy as np

from app.modules.strategy.engines.base import OHLCV, Signal


@dataclass
class Trade:
    """Одна завершённая сделка."""
    entry_bar: int
    exit_bar: int
    direction: str  # "long" or "short"
    entry_price: float
    exit_price: float
    quantity: float
    pnl: float
    pnl_pct: float
    exit_reason: str  # "signal", "stop_loss", "take_profit", "trailing_stop", "end_of_data"


@dataclass
class BacktestMetrics:
    """Результаты бэктеста."""
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0
    profit_factor: float = 0.0
    total_pnl: float = 0.0
    total_pnl_pct: float = 0.0
    max_drawdown: float = 0.0
    sharpe_ratio: float = 0.0
    equity_curve: list[dict] = field(default_factory=list)
    trades_log: list[dict] = field(default_factory=list)


def run_backtest(
    ohlcv: OHLCV,
    signals: list[Signal],
    initial_capital: float = 100.0,
    commission_pct: float = 0.05,
    order_size_pct: float = 75.0,
    min_bars_trailing: int = 0,
) -> BacktestMetrics:
    """Запустить бэктест.

    Логика:
    1. Для каждого сигнала — открыть позицию по close текущего бара
    2. На каждом баре проверить: пробило ли SL, TP, или trailing stop
    3. Закрыть позицию при: SL/TP hit, opposing signal, or end of data
    4. Учесть комиссию (commission_pct от notional)
    5. Вычислить метрики
    """
    n = len(ohlcv)
    if n == 0:
        return BacktestMetrics()

    equity = initial_capital
    peak_equity = initial_capital
    max_dd = 0.0
    trades: list[Trade] = []
    equity_points: list[dict] = []
    returns: list[float] = []

    # Сортируем сигналы по bar_index
    sorted_signals = sorted(signals, key=lambda s: s.bar_index)

    # Текущая позиция
    in_position = False
    position_direction = ""
    position_entry_price = 0.0
    position_qty = 0.0
    position_sl = 0.0
    position_tp = 0.0
    position_trailing = 0.0
    position_trailing_active = 0.0  # trailing stop activation price
    position_entry_bar = 0
    signal_idx = 0

    def _close_position(
        exit_price: float, exit_bar: int, exit_reason: str,
    ) -> None:
        """Закрыть текущую позицию и обновить equity."""
        nonlocal equity, in_position

        if position_direction == "long":
            pnl_raw = (exit_price - position_entry_price) * position_qty
        else:
            pnl_raw = (position_entry_price - exit_price) * position_qty

        commission = abs(exit_price * position_qty) * commission_pct / 100
        pnl = pnl_raw - commission
        pnl_pct = pnl / equity * 100 if equity > 0 else 0

        trades.append(Trade(
            entry_bar=position_entry_bar, exit_bar=exit_bar,
            direction=position_direction,
            entry_price=position_entry_price, exit_price=exit_price,
            quantity=position_qty, pnl=pnl, pnl_pct=pnl_pct,
            exit_reason=exit_reason,
        ))

        equity += pnl
        returns.append(pnl_pct / 100)
        in_position = False

    for i in range(n):
        bar_high = float(ohlcv.high[i])
        bar_low = float(ohlcv.low[i])
        bar_close = float(ohlcv.close[i])

        # Проверить SL/TP на текущем баре
        if in_position:
            exit_price = None
            exit_reason = ""

            bars_in_trade = i - position_entry_bar
            trailing_ready = bars_in_trade >= min_bars_trailing

            if position_direction == "long":
                # Trailing stop update (только после min_bars_trailing баров)
                if position_trailing > 0 and trailing_ready and bar_high > position_trailing_active:
                    position_trailing_active = bar_high
                    new_sl = bar_high - position_trailing
                    if new_sl > position_sl:
                        position_sl = new_sl

                if position_sl > 0 and bar_low <= position_sl:
                    exit_price = position_sl
                    exit_reason = "trailing_stop" if position_trailing > 0 and trailing_ready else "stop_loss"
                elif position_tp > 0 and bar_high >= position_tp:
                    exit_price = position_tp
                    exit_reason = "take_profit"

            elif position_direction == "short":
                if position_trailing > 0 and trailing_ready and bar_low < position_trailing_active:
                    position_trailing_active = bar_low
                    new_sl = bar_low + position_trailing
                    if new_sl < position_sl:
                        position_sl = new_sl

                if position_sl > 0 and bar_high >= position_sl:
                    exit_price = position_sl
                    exit_reason = "trailing_stop" if position_trailing > 0 and trailing_ready else "stop_loss"
                elif position_tp > 0 and bar_low <= position_tp:
                    exit_price = position_tp
                    exit_reason = "take_profit"

            if exit_price is not None:
                _close_position(exit_price, i, exit_reason)

        # Проверить новый сигнал
        while signal_idx < len(sorted_signals) and sorted_signals[signal_idx].bar_index <= i:
            sig = sorted_signals[signal_idx]
            signal_idx += 1

            if sig.bar_index == i and not in_position:
                # Открыть позицию
                entry_price = bar_close  # входим по close текущего бара
                position_value = equity * order_size_pct / 100
                qty = position_value / entry_price if entry_price > 0 else 0

                if qty <= 0:
                    continue

                commission = abs(entry_price * qty) * commission_pct / 100
                equity -= commission

                in_position = True
                position_direction = sig.direction
                position_entry_price = entry_price
                position_qty = qty
                position_sl = sig.stop_loss
                position_tp = sig.take_profit
                position_trailing = sig.trailing_atr or 0.0
                if position_trailing > 0:
                    position_trailing_active = (
                        entry_price + position_trailing
                        if sig.direction == "long"
                        else entry_price - position_trailing
                    )
                else:
                    position_trailing_active = 0.0
                position_entry_bar = i

            elif sig.bar_index == i and in_position and sig.direction != position_direction:
                # Противоположный сигнал → закрыть текущую позицию
                _close_position(bar_close, i, "signal")

        # Записать точку equity
        unrealized = 0.0
        if in_position:
            if position_direction == "long":
                unrealized = (bar_close - position_entry_price) * position_qty
            else:
                unrealized = (position_entry_price - bar_close) * position_qty

        current_equity = equity + unrealized
        equity_points.append({
            "bar": i,
            "equity": round(current_equity, 4),
            "timestamp": (
                int(ohlcv.timestamps[i])
                if ohlcv.timestamps is not None and i < len(ohlcv.timestamps)
                else i
            ),
        })

        # Max drawdown
        if current_equity > peak_equity:
            peak_equity = current_equity
        dd = (peak_equity - current_equity) / peak_equity * 100 if peak_equity > 0 else 0
        if dd > max_dd:
            max_dd = dd

    # Закрыть открытую позицию в конце данных
    if in_position:
        exit_price = float(ohlcv.close[-1])
        _close_position(exit_price, n - 1, "end_of_data")

    # Вычислить метрики
    total_trades = len(trades)
    winning = [t for t in trades if t.pnl > 0]
    losing = [t for t in trades if t.pnl <= 0]
    win_rate = len(winning) / total_trades if total_trades > 0 else 0

    gross_profit = sum(t.pnl for t in winning)
    gross_loss = abs(sum(t.pnl for t in losing))
    profit_factor = (
        gross_profit / gross_loss
        if gross_loss > 0
        else (float("inf") if gross_profit > 0 else 0)
    )

    total_pnl = equity - initial_capital
    total_pnl_pct = total_pnl / initial_capital * 100 if initial_capital > 0 else 0

    # Sharpe ratio (annualized, sqrt(N) scaling)
    sharpe = 0.0
    if len(returns) > 1:
        avg_return = float(np.mean(returns))
        std_return = float(np.std(returns, ddof=1))
        if std_return > 0:
            sharpe = avg_return / std_return * math.sqrt(min(len(returns), 252))

    trades_log = [
        {
            "entry_bar": t.entry_bar,
            "exit_bar": t.exit_bar,
            "direction": t.direction,
            "entry_price": round(t.entry_price, 6),
            "exit_price": round(t.exit_price, 6),
            "quantity": round(t.quantity, 8),
            "pnl": round(t.pnl, 4),
            "pnl_pct": round(t.pnl_pct, 2),
            "exit_reason": t.exit_reason,
        }
        for t in trades
    ]

    # Downsample equity curve если слишком большой (max 500 точек)
    if len(equity_points) > 500:
        step = len(equity_points) // 500
        equity_points = equity_points[::step] + [equity_points[-1]]

    return BacktestMetrics(
        total_trades=total_trades,
        winning_trades=len(winning),
        losing_trades=len(losing),
        win_rate=round(win_rate, 4),
        profit_factor=round(profit_factor, 2) if profit_factor != float("inf") else 999.99,
        total_pnl=round(total_pnl, 4),
        total_pnl_pct=round(total_pnl_pct, 2),
        max_drawdown=round(max_dd, 2),
        sharpe_ratio=round(sharpe, 2),
        equity_curve=equity_points,
        trades_log=trades_log,
    )
