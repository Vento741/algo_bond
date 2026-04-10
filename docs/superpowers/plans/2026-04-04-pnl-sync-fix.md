# PnL Sync Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix realized P&L calculation for multi-TP positions so that partial close (TP1) profit is accumulated correctly, and add Bybit closed P&L API for reconciliation.

**Architecture:** Three fixes: (1) Fix P&L overwrite bug in bybit_listener position close handler, (2) Add `get_closed_pnl()` to BybitClient for historical reconciliation, (3) Add one-time reconciliation endpoint to fix existing data and enable future audits.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0 async, pybit V5, pytest

---

### Task 1: Fix P&L accumulation bug in bybit_listener

**Files:**
- Modify: `backend/app/modules/trading/bybit_listener.py:307-340`
- Test: `backend/tests/test_bybit_listener.py`

The core bug: when position closes (size=0), `realized_pnl` is **overwritten** instead of **added to** the accumulated partial P&L from TP1. Also, `bot.total_pnl` double-counts because it adds the overwritten value on top of the partial P&L already added during the TP1 event.

- [ ] **Step 1: Write failing test — position close after TP1 preserves accumulated P&L**

Add this test to `backend/tests/test_bybit_listener.py`:

```python
@pytest.mark.asyncio
async def test_position_close_after_tp1_accumulates_pnl(
    db_session: AsyncSession, listener_bot: Bot,
) -> None:
    """При закрытии позиции после TP1, realized_pnl = partial + final (не перезаписывается)."""
    # Создать позицию, имитирующую состояние после TP1:
    # original_quantity=2.0, quantity=1.0, realized_pnl=5.0 (от TP1)
    position = Position(
        bot_id=listener_bot.id,
        symbol="BTCUSDT",
        side=PositionSide.SHORT,
        entry_price=Decimal("50000"),
        quantity=Decimal("1.0"),
        original_quantity=Decimal("2.0"),
        stop_loss=Decimal("50000"),  # breakeven after TP1
        take_profit=Decimal("45000"),
        unrealized_pnl=Decimal("2000"),
        realized_pnl=Decimal("5000"),  # accumulated from TP1
        status=PositionStatus.OPEN,
    )
    db_session.add(position)
    await db_session.commit()
    await db_session.refresh(position)

    from app.modules.trading import bybit_listener
    from app.modules.trading.bybit_listener import _handle_position_event

    account_id = listener_bot.exchange_account_id
    bybit_listener._symbol_bot_map = {("BTCUSDT", account_id): [listener_bot.id]}
    bybit_listener._account_user_map = {account_id: listener_bot.user_id}

    with (
        patch("app.database.async_session", test_session),
        patch(
            "app.modules.trading.bybit_listener._publish_event",
            new_callable=AsyncMock,
        ),
        patch(
            "app.modules.trading.bybit_listener._write_bot_log",
            new_callable=AsyncMock,
        ),
    ):
        await _handle_position_event(
            account_id,
            symbol="BTCUSDT",
            side="Sell",
            size="0",  # position closed
            unrealized_pnl="0",  # Bybit demo sends 0 on close
            mark_price="48000",
            stop_loss_ex="0",
            take_profit_ex="0",
            trailing_stop_ex="0",
        )

    await db_session.refresh(position)
    assert position.status == PositionStatus.CLOSED

    # realized_pnl должен НАКОПИТЬ: 5000 (TP1) + 2000 (final close: (50000-48000)*1.0)
    assert position.realized_pnl == Decimal("7000")


@pytest.mark.asyncio
async def test_position_close_after_tp1_bot_total_pnl_correct(
    db_session: AsyncSession, listener_bot: Bot,
) -> None:
    """bot.total_pnl при закрытии после TP1 добавляет только финальную часть, не дублирует."""
    listener_bot.total_pnl = Decimal("5000")  # уже содержит TP1 partial
    db_session.add(listener_bot)

    position = Position(
        bot_id=listener_bot.id,
        symbol="BTCUSDT",
        side=PositionSide.SHORT,
        entry_price=Decimal("50000"),
        quantity=Decimal("1.0"),
        original_quantity=Decimal("2.0"),
        stop_loss=Decimal("50000"),
        take_profit=Decimal("45000"),
        unrealized_pnl=Decimal("2000"),
        realized_pnl=Decimal("5000"),  # TP1 partial
        status=PositionStatus.OPEN,
    )
    db_session.add(position)
    await db_session.commit()
    await db_session.refresh(position)
    await db_session.refresh(listener_bot)

    from app.modules.trading import bybit_listener
    from app.modules.trading.bybit_listener import _handle_position_event

    account_id = listener_bot.exchange_account_id
    bybit_listener._symbol_bot_map = {("BTCUSDT", account_id): [listener_bot.id]}
    bybit_listener._account_user_map = {account_id: listener_bot.user_id}

    with (
        patch("app.database.async_session", test_session),
        patch(
            "app.modules.trading.bybit_listener._publish_event",
            new_callable=AsyncMock,
        ),
        patch(
            "app.modules.trading.bybit_listener._write_bot_log",
            new_callable=AsyncMock,
        ),
    ):
        await _handle_position_event(
            account_id,
            symbol="BTCUSDT",
            side="Sell",
            size="0",
            unrealized_pnl="0",
            mark_price="48000",
            stop_loss_ex="0",
            take_profit_ex="0",
            trailing_stop_ex="0",
        )

    await db_session.refresh(listener_bot)
    # bot.total_pnl: было 5000 (TP1) + добавить 2000 (final) = 7000
    # НЕ 5000 + 7000 = 12000 (старый баг с двойным подсчётом)
    assert listener_bot.total_pnl == Decimal("7000")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_bybit_listener.py::test_position_close_after_tp1_accumulates_pnl tests/test_bybit_listener.py::test_position_close_after_tp1_bot_total_pnl_correct -v`

Expected: FAIL — `realized_pnl` is overwritten (got ~2000 instead of 7000), `total_pnl` double-counts.

- [ ] **Step 3: Fix the P&L logic in bybit_listener.py**

Replace lines 307-339 in `backend/app/modules/trading/bybit_listener.py`. The fix has two parts:

**Part A — Accumulate realized_pnl instead of overwriting:**

Replace the block starting at line 313 (`# Bybit demo отдаёт pnl=0...`) through line 328 (`position.realized_pnl = Decimal("0")`):

```python
                    # Рассчитать P&L финального закрытия.
                    # Если был partial close (TP1), position.realized_pnl уже содержит
                    # частичный P&L — ДОБАВЛЯЕМ финальную часть, не перезаписываем.
                    prior_pnl = position.realized_pnl or Decimal("0")

                    if upnl != Decimal("0"):
                        # Bybit прислал unrealized PnL — используем как финальный PnL
                        final_pnl = upnl
                    elif position.unrealized_pnl and position.unrealized_pnl != Decimal("0"):
                        # Fallback: последний известный unrealized PnL
                        final_pnl = position.unrealized_pnl
                    elif mp and position.entry_price:
                        # Рассчитываем из цен (quantity = оставшееся кол-во после TP1)
                        if position.side.value == "long":
                            final_pnl = (mp - position.entry_price) * position.quantity
                        else:
                            final_pnl = (position.entry_price - mp) * position.quantity
                    else:
                        final_pnl = Decimal("0")

                    # Если был partial close, prior_pnl уже содержит P&L от TP1.
                    # upnl от Bybit — это P&L ВСЕЙ позиции или оставшейся части.
                    # Для demo (upnl=0) мы считаем из цен — это P&L оставшейся части.
                    # Для non-demo (upnl!=0) Bybit может вернуть P&L оставшейся части.
                    if position.original_quantity is not None:
                        # Был partial close — добавляем финальную часть
                        position.realized_pnl = prior_pnl + final_pnl
                    else:
                        # Не было partial close — просто устанавливаем
                        position.realized_pnl = final_pnl
```

**Part B — Fix bot.total_pnl to not double-count:**

Replace lines 334-339 (the `# Обновить статистику бота` block). Instead of blindly adding `position.realized_pnl` (which now includes TP1 P&L already added), recalculate from all closed positions:

```python
                    # Обновить статистику бота (пересчитать из всех закрытых)
                    bot_result = await db.execute(select(Bot).where(Bot.id == bot_id))
                    bot = bot_result.scalar_one_or_none()
                    if bot:
                        # Пересчитать total_pnl из ВСЕХ закрытых позиций
                        # (включая текущую, которая уже CLOSED)
                        all_closed_result = await db.execute(
                            select(Position).where(
                                Position.bot_id == bot_id,
                                Position.status == PositionStatus.CLOSED,
                            )
                        )
                        all_closed = all_closed_result.scalars().all()
                        bot.total_pnl = sum(
                            (p.realized_pnl or Decimal("0")) for p in all_closed
                        )
                        bot.updated_at = now
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_bybit_listener.py -v`

Expected: ALL PASS (including the two new tests).

- [ ] **Step 5: Also fix the partial-close bot.total_pnl update (lines 450-473)**

In the `else` branch (position NOT closed, lines 450-473), the bot.total_pnl recalculation already sums all closed positions + current partial. This is correct and consistent with the new approach. No change needed — just verify it still works.

Run: `cd backend && pytest tests/test_bybit_listener.py -v`

- [ ] **Step 6: Commit**

```bash
git add backend/app/modules/trading/bybit_listener.py backend/tests/test_bybit_listener.py
git commit -m "fix: accumulate realized_pnl on multi-TP close instead of overwriting"
```

---

### Task 2: Add `get_closed_pnl()` to BybitClient

**Files:**
- Modify: `backend/app/modules/market/bybit_client.py`
- Test: `backend/tests/test_bybit_client.py` (if exists, otherwise `backend/tests/test_market.py`)

Bybit V5 API endpoint: `GET /v5/position/closed-pnl` — returns historical closed P&L records. This enables reconciliation.

- [ ] **Step 1: Write failing test**

```python
def test_get_closed_pnl_returns_records(mock_bybit_session: MagicMock) -> None:
    """get_closed_pnl возвращает историю закрытых позиций."""
    mock_bybit_session.get_closed_pnl.return_value = {
        "result": {
            "list": [
                {
                    "symbol": "RIVERUSDT",
                    "orderId": "order-1",
                    "side": "Sell",
                    "qty": "1.8",
                    "entryPrice": "12.288",
                    "exitPrice": "12.000",
                    "closedPnl": "0.4975",
                    "fillCount": "1",
                    "leverage": "10",
                    "createdTime": "1712138400000",
                    "updatedTime": "1712145094000",
                },
                {
                    "symbol": "RIVERUSDT",
                    "orderId": "order-2",
                    "side": "Sell",
                    "qty": "1.7",
                    "entryPrice": "12.288",
                    "exitPrice": "10.717",
                    "closedPnl": "2.6522",
                    "fillCount": "1",
                    "leverage": "10",
                    "createdTime": "1712138400000",
                    "updatedTime": "1712141005000",
                },
            ],
            "nextPageCursor": "",
        },
        "retCode": 0,
    }

    client = BybitClient.__new__(BybitClient)
    client._session = mock_bybit_session

    records = client.get_closed_pnl("RIVERUSDT", limit=50)
    assert len(records) == 2
    assert records[0]["closedPnl"] == "0.4975"
    mock_bybit_session.get_closed_pnl.assert_called_once_with(
        category="linear", symbol="RIVERUSDT", limit=50,
    )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_bybit_client.py::test_get_closed_pnl_returns_records -v` (or wherever market tests live)

Expected: FAIL — `AttributeError: 'BybitClient' object has no attribute 'get_closed_pnl'`

- [ ] **Step 3: Implement `get_closed_pnl` in BybitClient**

Add to `backend/app/modules/market/bybit_client.py` after the `get_positions()` method (after line 226):

```python
    def get_closed_pnl(
        self, symbol: str | None = None, limit: int = 50,
    ) -> list[dict]:
        """Получить историю закрытых P&L (для reconciliation).

        Bybit V5 endpoint: /v5/position/closed-pnl
        Возвращает записи с closedPnl, entryPrice, exitPrice, qty, side.
        """
        try:
            kwargs: dict = {"category": "linear", "limit": limit}
            if symbol:
                kwargs["symbol"] = symbol
            result = self._session.get_closed_pnl(**kwargs)
            return result["result"]["list"]
        except InvalidRequestError as e:
            raise BybitAPIError(e.status_code, str(e.message)) from e
        except FailedRequestError as e:
            raise BybitAPIError(-1, f"Network error: {e.message}") from e
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/ -k "closed_pnl" -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/market/bybit_client.py backend/tests/test_bybit_client.py
git commit -m "feat: add get_closed_pnl() to BybitClient for P&L reconciliation"
```

---

### Task 3: Add reconciliation endpoint

**Files:**
- Modify: `backend/app/modules/trading/router.py`
- Modify: `backend/app/modules/trading/service.py`

One-time (and future-use) endpoint that fetches closed P&L from Bybit, compares with DB, and updates mismatched records.

- [ ] **Step 1: Add reconciliation method to TradingService**

Add to `backend/app/modules/trading/service.py`:

```python
    async def reconcile_bot_pnl(
        self, bot_id: uuid.UUID, user_id: uuid.UUID,
    ) -> dict:
        """Сверка P&L бота с данными Bybit. Обновляет расхождения."""
        bot = await self._get_bot_or_raise(bot_id, user_id)
        client = self._get_client(bot)

        # Получить закрытые P&L с Bybit
        symbol = bot.strategy_config.symbol
        bybit_records = await asyncio.to_thread(
            client.get_closed_pnl, symbol, limit=100,
        )

        # Получить закрытые позиции из БД
        result = await self.db.execute(
            select(Position).where(
                Position.bot_id == bot_id,
                Position.status == PositionStatus.CLOSED,
            ).order_by(Position.opened_at)
        )
        db_positions = result.scalars().all()

        # Группировать Bybit записи по entry_price (для матчинга с позициями)
        # Bybit создаёт отдельную запись на каждый partial/full close
        from collections import defaultdict
        bybit_by_entry: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
        for rec in bybit_records:
            entry_key = rec["entryPrice"]
            bybit_by_entry[entry_key] += Decimal(rec["closedPnl"])

        corrections = []
        for pos in db_positions:
            entry_key = str(pos.entry_price)
            if entry_key in bybit_by_entry:
                bybit_total = bybit_by_entry[entry_key]
                db_pnl = pos.realized_pnl or Decimal("0")
                diff = bybit_total - db_pnl
                if abs(diff) > Decimal("0.01"):  # > 1 cent difference
                    corrections.append({
                        "position_id": str(pos.id),
                        "entry_price": entry_key,
                        "db_pnl": str(db_pnl),
                        "bybit_pnl": str(bybit_total),
                        "diff": str(diff),
                    })
                    pos.realized_pnl = bybit_total

        # Пересчитать bot.total_pnl
        if corrections:
            total = sum(
                (p.realized_pnl or Decimal("0"))
                for p in db_positions
            )
            bot.total_pnl = total

            # Пересчитать win_rate
            wins = sum(1 for p in db_positions if (p.realized_pnl or Decimal("0")) > 0)
            bot.win_rate = Decimal(str(round(wins / len(db_positions) * 100, 2))) if db_positions else Decimal("0")

            # Обновить max_pnl
            if total > bot.max_pnl:
                bot.max_pnl = total

            await self.db.commit()

        return {
            "bot_id": str(bot_id),
            "positions_checked": len(db_positions),
            "bybit_records": len(bybit_records),
            "corrections": corrections,
            "new_total_pnl": str(bot.total_pnl),
        }
```

- [ ] **Step 2: Add endpoint to router**

Add to `backend/app/modules/trading/router.py`:

```python
@router.post("/bots/{bot_id}/reconcile")
async def reconcile_bot_pnl(
    bot_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Сверка P&L бота с данными Bybit и исправление расхождений."""
    service = TradingService(db)
    return await service.reconcile_bot_pnl(bot_id, user.id)
```

- [ ] **Step 3: Run full test suite**

Run: `cd backend && pytest tests/ -v --tb=short`

Expected: ALL PASS (142+ tests)

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/trading/router.py backend/app/modules/trading/service.py
git commit -m "feat: add /bots/{id}/reconcile endpoint for Bybit P&L sync"
```

---

### Task 4: Run reconciliation on live data

- [ ] **Step 1: Deploy to VPS**

```bash
git push origin main
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && git pull && docker compose up -d --build api"
```

- [ ] **Step 2: Execute reconciliation for the active RIVERUSDT bot**

```bash
ssh jeremy-vps 'curl -s -X POST http://localhost:8100/api/trading/bots/b37f72e0-.../reconcile -H "Authorization: Bearer <token>" | python3 -m json.tool'
```

- [ ] **Step 3: Verify P&L matches Bybit**

Check the corrections output — should show ~$3.57 total correction across 3 positions with partial closes.

- [ ] **Step 4: Commit reconciliation docs/notes if needed**

---

### Task 5: Reduce deduplication aggressiveness

**Files:**
- Modify: `backend/app/modules/trading/bybit_listener.py:68, 264-270`

- [ ] **Step 1: Reduce POSITION_DEDUP_INTERVAL**

Change line 68:
```python
POSITION_DEDUP_INTERVAL = 0.5  # секунды — игнорировать одинаковые events
```

The 2-second window is too aggressive and can filter out legitimate TP2 close events that arrive right after TP1 with the same size (in edge cases).

- [ ] **Step 2: Run tests**

Run: `cd backend && pytest tests/test_bybit_listener.py -v`

Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add backend/app/modules/trading/bybit_listener.py
git commit -m "fix: reduce position dedup interval from 2s to 0.5s to prevent event loss"
```
