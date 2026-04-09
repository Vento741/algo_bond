"""Движок бэктестирования — симуляция стратегии на исторических данных."""

import math
from dataclasses import dataclass, field

import numpy as np

from app.modules.strategy.engines.base import OHLCV, Signal


@dataclass
class Trade:
    """Одна завершённая сделка (или частичное закрытие)."""
    entry_bar: int
    exit_bar: int
    direction: str  # "long" or "short"
    entry_price: float
    exit_price: float
    quantity: float
    pnl: float
    pnl_pct: float
    exit_reason: str  # "signal", "stop_loss", "take_profit", "take_profit_1", "take_profit_2", "trailing_stop", "breakeven", "end_of_data"


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
    use_multi_tp: bool = False,
    tp_levels: list[dict] | None = None,
    use_breakeven: bool = False,
    timeframe_minutes: int = 15,
    leverage: int = 1,
    on_reverse: str = "close",
) -> BacktestMetrics:
    """Запустить бэктест.

    Логика:
    1. Для каждого сигнала — открыть позицию по close текущего бара
    2. На каждом баре проверить: пробило ли SL, TP, или trailing stop
    3. Multi-TP: частичное закрытие на каждом уровне, breakeven при TP1
    4. Закрыть позицию при: SL/TP hit, opposing signal, or end of data
    5. Учесть комиссию (commission_pct от notional)
    6. Вычислить метрики
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

    sorted_signals = sorted(signals, key=lambda s: s.bar_index)

    # Текущая позиция
    in_position = False
    position_direction = ""
    position_entry_price = 0.0
    position_qty = 0.0        # текущий остаток qty
    position_orig_qty = 0.0   # исходный qty при открытии
    position_sl = 0.0
    position_tp = 0.0         # single-TP price (fallback)
    position_trailing = 0.0
    position_trailing_active = 0.0
    position_entry_bar = 0
    signal_idx = 0

    # Multi-TP state
    position_tp_levels: list[dict] = []  # [{"price": float, "close_pct": int, "hit": bool}]
    breakeven_active = False

    def _record_trade(
        exit_price: float, exit_bar: int, exit_reason: str, qty: float,
    ) -> None:
        """Записать сделку (полную или частичную) и обновить equity."""
        nonlocal equity

        if position_direction == "long":
            pnl_raw = (exit_price - position_entry_price) * qty
        else:
            pnl_raw = (position_entry_price - exit_price) * qty

        # Комиссия: вход + выход (как на бирже, closedPnl включает обе)
        entry_commission = abs(position_entry_price * qty) * commission_pct / 100
        exit_commission = abs(exit_price * qty) * commission_pct / 100
        pnl = pnl_raw - entry_commission - exit_commission
        pnl_pct = pnl / equity * 100 if equity > 0 else 0

        trades.append(Trade(
            entry_bar=position_entry_bar, exit_bar=exit_bar,
            direction=position_direction,
            entry_price=position_entry_price, exit_price=exit_price,
            quantity=qty, pnl=pnl, pnl_pct=pnl_pct,
            exit_reason=exit_reason,
        ))

        equity += pnl
        returns.append(pnl_pct / 100)

    def _close_full(exit_price: float, exit_bar: int, exit_reason: str) -> None:
        """Закрыть весь остаток позиции."""
        nonlocal in_position, position_qty
        if position_qty <= 0:
            in_position = False
            return
        _record_trade(exit_price, exit_bar, exit_reason, position_qty)
        position_qty = 0.0
        in_position = False

    def _close_partial(exit_price: float, exit_bar: int, exit_reason: str, close_pct: int) -> None:
        """Частичное закрытие позиции (close_pct % от ИСХОДНОГО qty)."""
        nonlocal position_qty, position_sl, breakeven_active
        qty_to_close = position_orig_qty * close_pct / 100
        qty_to_close = min(qty_to_close, position_qty)
        if qty_to_close <= 0:
            return
        _record_trade(exit_price, exit_bar, exit_reason, qty_to_close)
        position_qty -= qty_to_close

    for i in range(n):
        bar_high = float(ohlcv.high[i])
        bar_low = float(ohlcv.low[i])
        bar_close = float(ohlcv.close[i])

        if in_position:
            bars_in_trade = i - position_entry_bar
            trailing_ready = bars_in_trade >= min_bars_trailing

            # --- Multi-TP: проверить уровни частичного закрытия ---
            if use_multi_tp and position_tp_levels:
                for lvl_idx, lvl in enumerate(position_tp_levels):
                    if lvl["hit"]:
                        continue
                    tp_price = lvl["price"]
                    hit = False
                    if position_direction == "long" and bar_high >= tp_price:
                        hit = True
                    elif position_direction == "short" and bar_low <= tp_price:
                        hit = True

                    if hit:
                        lvl["hit"] = True
                        reason = f"take_profit_{lvl_idx + 1}"
                        _close_partial(tp_price, i, reason, lvl["close_pct"])

                        # Breakeven при первом TP
                        if lvl_idx == 0 and use_breakeven:
                            position_sl = position_entry_price
                            breakeven_active = True

                        # Если весь объём закрыт → позиция закрыта
                        if position_qty <= 0:
                            in_position = False
                            break

                if not in_position:
                    # Все TP сработали, позиция полностью закрыта
                    pass
                    # Переходим к проверке нового сигнала ниже
                else:
                    # Есть остаток — проверяем SL/trailing для него
                    pass

            # --- SL / Trailing для оставшегося объёма ---
            if in_position:
                exit_price = None
                exit_reason = ""

                if position_direction == "long":
                    if position_trailing > 0 and trailing_ready and bar_high > position_trailing_active:
                        position_trailing_active = bar_high
                        new_sl = bar_high - position_trailing
                        if new_sl > position_sl:
                            position_sl = new_sl

                    if position_sl > 0 and bar_low <= position_sl:
                        exit_price = position_sl
                        if breakeven_active and abs(position_sl - position_entry_price) < 0.0001 * position_entry_price:
                            exit_reason = "breakeven"
                        elif position_trailing > 0 and trailing_ready:
                            exit_reason = "trailing_stop"
                        else:
                            exit_reason = "stop_loss"
                    elif not use_multi_tp and position_tp > 0 and bar_high >= position_tp:
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
                        if breakeven_active and abs(position_sl - position_entry_price) < 0.0001 * position_entry_price:
                            exit_reason = "breakeven"
                        elif position_trailing > 0 and trailing_ready:
                            exit_reason = "trailing_stop"
                        else:
                            exit_reason = "stop_loss"
                    elif not use_multi_tp and position_tp > 0 and bar_low <= position_tp:
                        exit_price = position_tp
                        exit_reason = "take_profit"

                if exit_price is not None:
                    _close_full(exit_price, i, exit_reason)

        # Проверить новый сигнал
        while signal_idx < len(sorted_signals) and sorted_signals[signal_idx].bar_index <= i:
            sig = sorted_signals[signal_idx]
            signal_idx += 1

            if sig.bar_index == i and not in_position:
                entry_price = bar_close
                position_value = equity * order_size_pct / 100 * leverage
                qty = position_value / entry_price if entry_price > 0 else 0
                if qty <= 0:
                    continue

                # Комиссия учитывается в _record_trade при закрытии (entry + exit)
                in_position = True
                position_direction = sig.direction
                position_entry_price = entry_price
                position_qty = qty
                position_orig_qty = qty
                position_sl = sig.stop_loss
                position_tp = sig.take_profit
                position_trailing = sig.trailing_atr or 0.0
                # Trailing активируется от entry_price (как на Bybit)
                # trailing_active отслеживает максимум/минимум цены
                position_trailing_active = entry_price if position_trailing > 0 else 0.0
                position_entry_bar = i
                breakeven_active = False

                # Инициализация multi-TP уровней
                if use_multi_tp and sig.tp_levels:
                    position_tp_levels = []
                    for lvl in sig.tp_levels:
                        atr_dist = lvl["atr_mult"]  # уже рассчитано как price distance
                        if sig.direction == "long":
                            tp_price = entry_price + atr_dist
                        else:
                            tp_price = entry_price - atr_dist
                        position_tp_levels.append({
                            "price": tp_price,
                            "close_pct": lvl["close_pct"],
                            "hit": False,
                        })
                else:
                    position_tp_levels = []

            elif sig.bar_index == i and in_position and sig.direction != position_direction:
                if on_reverse == "close" or on_reverse == "reverse":
                    _close_full(bar_close, i, "signal")
                # on_reverse == "ignore" - пропускаем обратный сигнал

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

        if current_equity > peak_equity:
            peak_equity = current_equity
        dd = (peak_equity - current_equity) / peak_equity * 100 if peak_equity > 0 else 0
        if dd > max_dd:
            max_dd = dd

    # Закрыть открытую позицию в конце данных
    if in_position:
        exit_price = float(ohlcv.close[-1])
        _close_full(exit_price, n - 1, "end_of_data")

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

    sharpe = 0.0
    if len(returns) > 1:
        avg_return = float(np.mean(returns))
        std_return = float(np.std(returns, ddof=1))
        if std_return > 0:
            # Annualization: баров в году = 365 * 24 * 60 / timeframe_minutes
            bars_per_year = 365 * 24 * 60 / timeframe_minutes
            # Используем кол-во сделок, но масштабируем по реальному времени
            annualization = math.sqrt(min(len(returns), bars_per_year))
            sharpe = avg_return / std_return * annualization

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
