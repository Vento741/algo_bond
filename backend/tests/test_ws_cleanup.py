"""Тесты очистки Bybit WebSocket стримов при отключении всех клиентов."""

from unittest.mock import MagicMock, patch

import pytest

from app.modules.market.ws_manager import ConnectionManager
from app.modules.market.ws_router import (
    _active_streams,
    _cleanup_stream_if_empty,
    _stop_bybit_stream,
)


@pytest.fixture(autouse=True)
def _clear_active_streams():
    """Очистить _active_streams перед и после каждого теста."""
    _active_streams.clear()
    yield
    _active_streams.clear()


class TestStopBybitStream:
    """Тесты функции _stop_bybit_stream."""

    def test_stop_calls_close_on_ws_instance(self) -> None:
        """При остановке стрима вызывается close() на экземпляре WS."""
        mock_ws = MagicMock()
        channel = "market:BTCUSDT:5"
        _active_streams[channel] = mock_ws

        _stop_bybit_stream(channel)

        mock_ws.close.assert_called_once()
        assert channel not in _active_streams

    def test_stop_nonexistent_channel_is_noop(self) -> None:
        """Остановка несуществующего канала не вызывает ошибки."""
        _stop_bybit_stream("market:NONEXISTENT:1")
        # Не должно бросать исключение

    def test_stop_removes_channel_from_active_streams(self) -> None:
        """После остановки канал удаляется из _active_streams."""
        mock_ws = MagicMock()
        channel = "market:ETHUSDT:15"
        _active_streams[channel] = mock_ws

        _stop_bybit_stream(channel)

        assert channel not in _active_streams

    def test_stop_handles_close_exception(self) -> None:
        """Если close() бросает исключение, канал всё равно удаляется."""
        mock_ws = MagicMock()
        mock_ws.close.side_effect = RuntimeError("connection error")
        channel = "market:BTCUSDT:5"
        _active_streams[channel] = mock_ws

        # Не должно бросать исключение наружу
        _stop_bybit_stream(channel)

        assert channel not in _active_streams

    def test_stop_idempotent(self) -> None:
        """Повторный вызов _stop_bybit_stream для того же канала — безопасен."""
        mock_ws = MagicMock()
        channel = "market:BTCUSDT:5"
        _active_streams[channel] = mock_ws

        _stop_bybit_stream(channel)
        _stop_bybit_stream(channel)  # повторный вызов

        mock_ws.close.assert_called_once()
        assert channel not in _active_streams


class TestCleanupStreamIfEmpty:
    """Тесты функции _cleanup_stream_if_empty."""

    def test_cleanup_stops_stream_when_no_clients(self) -> None:
        """Стрим останавливается, когда клиентов не осталось."""
        mock_ws = MagicMock()
        channel = "market:BTCUSDT:5"
        _active_streams[channel] = mock_ws

        with patch(
            "app.modules.market.ws_router.manager"
        ) as mock_manager:
            mock_manager.get_client_count.return_value = 0
            _cleanup_stream_if_empty(channel)

        mock_ws.close.assert_called_once()
        assert channel not in _active_streams

    def test_cleanup_keeps_stream_when_clients_exist(self) -> None:
        """Стрим НЕ останавливается, если есть подключённые клиенты."""
        mock_ws = MagicMock()
        channel = "market:BTCUSDT:5"
        _active_streams[channel] = mock_ws

        with patch(
            "app.modules.market.ws_router.manager"
        ) as mock_manager:
            mock_manager.get_client_count.return_value = 3
            _cleanup_stream_if_empty(channel)

        mock_ws.close.assert_not_called()
        assert channel in _active_streams

    def test_cleanup_noop_when_no_active_stream(self) -> None:
        """Если для канала нет активного стрима — ничего не делать."""
        channel = "trading:some-user-id"

        with patch(
            "app.modules.market.ws_router.manager"
        ) as mock_manager:
            mock_manager.get_client_count.return_value = 0
            # Не должно бросать исключение
            _cleanup_stream_if_empty(channel)


class TestConnectionManagerClientCount:
    """Тесты подсчёта клиентов в ConnectionManager (вспомогательные)."""

    def test_count_zero_for_empty_channel(self) -> None:
        """Пустой канал возвращает 0 клиентов."""
        mgr = ConnectionManager()
        assert mgr.get_client_count("market:BTCUSDT:5") == 0

    def test_disconnect_removes_from_count(self) -> None:
        """После disconnect клиент больше не считается."""
        mgr = ConnectionManager()
        mock_ws = MagicMock()
        # Напрямую добавляем, минуя accept() (юнит-тест)
        mgr._connections["test-channel"].add(mock_ws)
        assert mgr.get_client_count("test-channel") == 1

        mgr.disconnect(mock_ws, "test-channel")
        assert mgr.get_client_count("test-channel") == 0
