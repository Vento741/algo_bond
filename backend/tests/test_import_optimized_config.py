"""Тесты для import_optimized_config.py."""

import json
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

BACKEND_DIR = Path(__file__).parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts.import_optimized_config import (
    parse_args,
    generate_config_name,
)


class TestParseArgs:
    def test_required_args(self) -> None:
        args = parse_args([
            "--results", "/tmp/test.json",
            "--top-n", "3",
            "--target", "https://example.com",
        ])
        assert str(args.results).endswith("test.json")
        assert args.top_n == 3
        assert args.target == "https://example.com"
        assert args.dry_run is False

    def test_dry_run_flag(self) -> None:
        args = parse_args([
            "--results", "/tmp/x.json",
            "--target", "https://example.com",
            "--dry-run",
        ])
        assert args.dry_run is True


class TestGenerateConfigName:
    def test_format(self) -> None:
        results = {"symbol": "WLDUSDT", "timeframe": "5", "timestamp": "2026-04-14T18:30:00+00:00"}
        entry = {
            "metrics": {
                "profit_factor": 2.34,
                "max_drawdown": 8.12,
            },
        }
        name = generate_config_name("Optimized", results, entry, rank=1)
        assert "#1" in name
        assert "WLDUSDT" in name
        assert "5m" in name
        assert "PF2.34" in name
        assert "DD8.1" in name
        assert "2026-04-14" in name
