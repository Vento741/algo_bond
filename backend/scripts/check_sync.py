"""Скрипт проверки синхронизации P&L между БД и Bybit."""
import asyncio
import sys
sys.path.insert(0, "/app")

from pybit.unified_trading import HTTP
from app.config import settings
from app.database import async_session
from sqlalchemy import text
from app.core.security import decrypt_value

# Import all models to register them
from app.modules.auth import models as _  # noqa
from app.modules.billing import models as __  # noqa
from app.modules.strategy import models as ___  # noqa
from app.modules.trading import models as ____  # noqa
from app.modules.market import models as _____  # noqa
from app.modules.backtest import models as ______  # noqa

BOT_ID = "ca55b6bf-58fa-41cb-b215-0e1bed5df2b3"


async def main():
    async with async_session() as db:
        # Get exchange account
        row = await db.execute(text(
            "SELECT ea.api_key_encrypted, ea.api_secret_encrypted, ea.is_testnet "
            "FROM exchange_accounts ea "
            "JOIN bots b ON b.exchange_account_id = ea.id "
            f"WHERE b.id = '{BOT_ID}'"
        ))
        acc = row.fetchone()
        print(f"Account: demo={acc[2]}")

        # Decrypt keys
        api_key = decrypt_value(acc[0])
        api_secret = decrypt_value(acc[1])

        # === BYBIT DATA ===
        client = HTTP(api_key=api_key, api_secret=api_secret, demo=acc[2])
        result = client.get_closed_pnl(
            category="linear", symbol="RIVERUSDT", limit=20
        )

        print("\n=== BYBIT CLOSED PnL ===")
        bybit_total = 0
        for r in result["result"]["list"]:
            pnl = float(r["closedPnl"])
            bybit_total += pnl
            entry = r["avgEntryPrice"]
            exit_p = r["avgExitPrice"]
            qty = r["qty"]
            side = r["side"]
            fee = r.get("totalFee", "?")
            ts = r["createdTime"]
            print(f"  {side} entry={entry} exit={exit_p} qty={qty} pnl={pnl:.4f} fee={fee} ts={ts}")
        print(f"\nBybit total: {bybit_total:.4f}")

        # === CURRENT POSITION ===
        pos_result = client.get_positions(category="linear", symbol="RIVERUSDT")
        for p in pos_result["result"]["list"]:
            if float(p["size"]) > 0:
                print(f"\n=== BYBIT OPEN POSITION ===")
                print(f"  side={p['side']} size={p['size']} entry={p['avgPrice']}")
                print(f"  unrealised={p['unrealisedPnl']} cumRealised={p['cumRealisedPnl']}")
                print(f"  SL={p.get('stopLoss','?')} TP={p.get('takeProfit','?')} trailing={p.get('trailingStop','?')}")

        # === DB DATA ===
        rows = await db.execute(text(
            "SELECT side, entry_price, quantity, realized_pnl, unrealized_pnl, "
            "status, stop_loss, take_profit, trailing_stop, opened_at, closed_at "
            f"FROM positions WHERE bot_id = '{BOT_ID}' ORDER BY opened_at"
        ))
        print("\n=== DB POSITIONS ===")
        db_total = 0
        for r in rows.fetchall():
            rpnl = float(r[3]) if r[3] else 0
            upnl = float(r[4]) if r[4] else 0
            db_total += rpnl
            side = r[0]
            entry = float(r[1])
            qty = float(r[2])
            status = r[5]
            sl = float(r[6]) if r[6] else 0
            tp = float(r[7]) if r[7] else 0
            trail = float(r[8]) if r[8] else 0
            opened = r[9]
            closed = r[10]
            print(f"  {side} entry={entry:.4f} qty={qty:.1f} rpnl={rpnl:.4f} upnl={upnl:.4f} "
                  f"status={status} SL={sl:.3f} TP={tp:.3f} trail={trail:.3f}")
        print(f"\nDB total realized: {db_total:.4f}")

        # === BOT STATS ===
        bot_row = await db.execute(text(
            "SELECT total_pnl, total_trades, win_rate, max_pnl, max_drawdown "
            f"FROM bots WHERE id = '{BOT_ID}'"
        ))
        bot = bot_row.fetchone()
        print(f"\n=== BOT STATS ===")
        print(f"  total_pnl={float(bot[0]):.4f} trades={bot[1]} win_rate={float(bot[2]):.2f}%")
        print(f"  max_pnl={float(bot[3]):.4f} max_dd={float(bot[4]):.4f}")

        # === COMPARISON ===
        print(f"\n=== COMPARISON ===")
        print(f"  Bybit closed PnL total: {bybit_total:.4f}")
        print(f"  DB realized PnL total:  {db_total:.4f}")
        print(f"  Bot total_pnl:          {float(bot[0]):.4f}")
        diff = bybit_total - db_total
        print(f"  Bybit - DB diff:        {diff:.4f}")


asyncio.run(main())
