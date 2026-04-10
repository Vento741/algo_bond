"""Real live order test: 1x vs 10x leverage with full config params."""
import os
import time
import json

keys = os.environ["KEYS"].strip().split("|")
enc_key, enc_secret, is_test = keys[0], keys[1], keys[2] == "t"

from app.core.security import decrypt_value
from app.modules.market.bybit_client import BybitClient
from app.modules.trading.bot_worker import _round_price

client = BybitClient(
    api_key=decrypt_value(enc_key),
    api_secret=decrypt_value(enc_secret),
    demo=is_test,
)
info = client.get_symbol_info("RIVERUSDT")
tick = info.tick_size
step = info.qty_step


def rp(p):
    return _round_price(p, tick)


def rq(q):
    return round(q // step * step, 8)


# Config from bot strategy
STOP_ATR_MULT = 3
TP1_ATR_MULT = 6
TP2_ATR_MULT = 12
TRAILING_ATR_MULT = 6
TP1_CLOSE_PCT = 50
ORDER_SIZE_PCT = 0.30

# Compute ATR
candles = client.get_klines("RIVERUSDT", "15", 200)
h = [c["high"] for c in candles[-14:]]
lo = [c["low"] for c in candles[-14:]]
cl = [c["close"] for c in candles[-14:]]
tr = [max(h[i] - lo[i], abs(h[i] - cl[max(0, i - 1)]), abs(lo[i] - cl[max(0, i - 1)])) for i in range(14)]
atr = sum(tr) / len(tr)

ticker = client.get_ticker("RIVERUSDT")
price = ticker.last_price
bal = client.get_wallet_balance("USDT")
avail = bal["available"]

print("=" * 60)
print("CONFIG:")
print(f"  stop_atr_mult={STOP_ATR_MULT}, tp1={TP1_ATR_MULT}x, tp2={TP2_ATR_MULT}x")
print(f"  trailing={TRAILING_ATR_MULT}x, breakeven=on, order_size=30%")
print(f"  ATR(14) = {round(atr, 4)} ({round(atr / price * 100, 2)}% of price)")
print(f"  Price = {price}, Available = {avail} USDT")
print("=" * 60)


def run_test(label, leverage):
    global avail
    current_bal = client.get_wallet_balance("USDT")
    avail_now = current_bal["available"]
    t = client.get_ticker("RIVERUSDT")
    p = t.last_price

    print()
    print("#" * 60)
    print(f"# {label}: {leverage}x LEVERAGE")
    print("#" * 60)

    print(f"\n[1] Setting leverage {leverage}x...")
    client.set_leverage("RIVERUSDT", leverage)
    time.sleep(2)

    margin = avail_now * ORDER_SIZE_PCT
    notional = margin * leverage
    qty = rq(notional / p)
    sl = rp(p + atr * STOP_ATR_MULT)
    tp1_p = rp(p - atr * TP1_ATR_MULT)
    tp1_q = rq(qty * TP1_CLOSE_PCT / 100)
    trail_off = round(atr * TRAILING_ATR_MULT, 8)
    trail_act = rp(p - trail_off)

    print(f"[2] Order params:")
    print(f"  Qty: {qty} RIVER (notional {round(qty * p, 2)} USDT)")
    print(f"  Margin: {round(qty * p / leverage, 2)} USDT ({round(qty * p / leverage / avail_now * 100, 1)}% bal)")
    print(f"  SL: {sl} (+{round(atr * STOP_ATR_MULT / p * 100, 2)}%)")
    print(f"  TP1: {tp1_p} (-{round(atr * TP1_ATR_MULT / p * 100, 2)}%) qty={tp1_q}")
    print(f"  Trailing: offset={trail_off} active={trail_act}")

    # Place order (multi-TP mode: no SL/TP on order)
    print(f"\n[3] Placing SHORT MARKET {qty} RIVERUSDT...")
    r = client.place_order(
        symbol="RIVERUSDT", side="Sell", order_type="Market", qty=qty,
    )
    print(f"  Order ID: {r.get('orderId', '')}")
    time.sleep(3)

    # Set SL (Full) then TP1 (Partial) - two separate calls
    print(f"[4a] Setting SL={sl} (Full mode)...")
    try:
        client.set_trading_stop(
            symbol="RIVERUSDT",
            stop_loss=sl,
            tpsl_mode="Full",
        )
        print(f"  SL={sl} -> OK")
    except Exception as e:
        print(f"  SL FAILED: {e}")
    time.sleep(2)

    print(f"[4b] Setting TP1={tp1_p} (Partial, qty={tp1_q})...")
    try:
        client.set_trading_stop(
            symbol="RIVERUSDT",
            take_profit=tp1_p,
            tpsl_mode="Partial",
            tp_size=tp1_q,
        )
        print(f"  TP1={tp1_p} qty={tp1_q} -> OK")
    except Exception as e:
        print(f"  TP1 FAILED: {e}")
    time.sleep(2)

    # Set trailing stop
    print(f"[5] Setting trailing stop...")
    try:
        client.set_trading_stop(
            symbol="RIVERUSDT",
            trailing_stop=trail_off,
            active_price=trail_act,
        )
        print(f"  Trailing offset={trail_off} activate={trail_act} -> OK")
    except Exception as e:
        print(f"  FAILED: {e}")
    time.sleep(3)

    # Check position
    print(f"\n[6] Position on Bybit:")
    positions = client.get_positions("RIVERUSDT")
    entry_actual = None
    for pos in positions:
        entry_actual = pos["avgPrice"]
        print(f"  Side: {pos['side']} | Size: {pos['size']} | Entry: {pos['avgPrice']}")
        print(f"  Leverage: {pos['leverage']}x | Margin: {pos.get('positionIM', '?')}")
        print(f"  SL: {pos.get('stopLoss', '?')} | TP: {pos.get('takeProfit', '?')}")
        print(f"  Trailing: {pos.get('trailingStop', '?')}")
        print(f"  Liq: {pos.get('liqPrice', '?')} | UPnL: {pos['unrealisedPnl']}")
    time.sleep(5)

    # Close
    print(f"\n[7] Closing position (BUY {qty})...")
    client.place_order(symbol="RIVERUSDT", side="Buy", order_type="Market", qty=qty)
    time.sleep(3)

    # Results
    closed = client.get_closed_pnl("RIVERUSDT", limit=1)
    bal_after = client.get_wallet_balance("USDT")
    c = closed[0] if closed else {}
    change = bal_after["available"] - avail_now
    print(f"[8] Closed trade:")
    print(f"  Entry: {c.get('avgEntryPrice', '?')} | Exit: {c.get('avgExitPrice', '?')}")
    print(f"  PnL: {c.get('closedPnl', '?')} | Leverage: {c.get('leverage', '?')}")
    print(f"  Balance: {avail_now} -> {bal_after['available']} (change: {round(change, 6)})")

    return {
        "leverage": leverage,
        "qty": qty,
        "notional": round(qty * p, 2),
        "margin": round(qty * p / leverage, 2),
        "margin_pct": round(qty * p / leverage / avail_now * 100, 1),
        "entry": c.get("avgEntryPrice", "?"),
        "exit": c.get("avgExitPrice", "?"),
        "pnl": c.get("closedPnl", "?"),
        "change": round(change, 6),
        "sl_set": any(pos.get("stopLoss", "0") != "0" for pos in positions),
        "tp_set": any(pos.get("takeProfit", "0") != "0" for pos in positions),
        "trail_set": any(pos.get("trailingStop", "0") != "0" for pos in positions),
    }


# Run both tests
result_a = run_test("TEST A", leverage=1)
time.sleep(5)
result_b = run_test("TEST B", leverage=10)

# Summary
print()
print("=" * 60)
print("SUMMARY")
print("=" * 60)
print(f"ATR(14): {round(atr, 4)} ({round(atr / price * 100, 2)}%)")
print(f"SL dist: {STOP_ATR_MULT}x ATR = {round(atr * STOP_ATR_MULT / price * 100, 2)}%")
print()
header = f"{'Test':>6} {'Lev':>4} {'Qty':>8} {'Notional':>10} {'Margin':>10} {'Mar%':>6} {'PnL':>12} {'SL':>4} {'TP':>4} {'Trail':>6}"
print(header)
for label, r in [("A", result_a), ("B", result_b)]:
    sl_ok = "OK" if r["sl_set"] else "FAIL"
    tp_ok = "OK" if r["tp_set"] else "FAIL"
    tr_ok = "OK" if r["trail_set"] else "FAIL"
    print(f"{label:>6} {r['leverage']:>3}x {r['qty']:>8} {r['notional']:>10} {r['margin']:>10} {r['margin_pct']:>5}% {r['pnl']:>12} {sl_ok:>4} {tp_ok:>4} {tr_ok:>6}")

ratio = result_b["qty"] / result_a["qty"] if result_a["qty"] > 0 else 0
print(f"\nQty ratio B/A: {round(ratio, 1)}x (expected: 10x)")
total_cost = result_a["change"] + result_b["change"]
print(f"Total test cost: {round(total_cost, 6)} USDT")
