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


class TestImportFlow:
    def _make_results_file(self, tmp_path: Path, n_configs: int = 3) -> Path:
        """Create a fake results JSON file."""
        results = {
            "symbol": "WLDUSDT",
            "timeframe": "5",
            "timestamp": "2026-04-14T18:30:00+00:00",
            "final_top_10": [
                {
                    "config": {"pivot": {"period": 48}, "risk": {"sl_max_pct": 0.02}},
                    "metrics": {
                        "profit_factor": 2.0 + i * 0.1,
                        "max_drawdown": 10.0 - i,
                        "win_rate": 0.6,
                        "total_trades": 25,
                    },
                    "score": 50.0 - i,
                }
                for i in range(n_configs)
            ],
        }
        path = tmp_path / "fake_results.json"
        with path.open("w") as f:
            json.dump(results, f)
        return path

    def test_dry_run_does_not_call_post(self, tmp_path) -> None:
        """--dry-run prints payloads without HTTP."""
        from scripts.import_optimized_config import main

        results_file = self._make_results_file(tmp_path)
        argv = [
            "import_optimized_config.py",
            "--results", str(results_file),
            "--target", "https://example.com",
            "--top-n", "3",
            "--dry-run",
        ]

        with patch("sys.argv", argv):
            with patch("httpx.Client") as mock_client:
                exit_code = main()
        assert exit_code == 0
        # httpx.Client should NOT have been instantiated in dry-run mode
        mock_client.assert_not_called()

    def test_auth_fails_without_token_or_login(self, tmp_path) -> None:
        """No ALGOBOND_TOKEN, no --login → fails gracefully."""
        from scripts.import_optimized_config import main

        results_file = self._make_results_file(tmp_path)

        os.environ.pop("ALGOBOND_TOKEN", None)

        argv = [
            "import_optimized_config.py",
            "--results", str(results_file),
            "--target", "https://example.com",
            "--top-n", "1",
        ]
        with patch("sys.argv", argv):
            exit_code = main()
        assert exit_code == 1  # auth failure

    def test_no_configs_in_results_file(self, tmp_path) -> None:
        """Empty final_top_10 → error exit."""
        from scripts.import_optimized_config import main

        path = tmp_path / "empty.json"
        with path.open("w") as f:
            json.dump({"symbol": "X", "timeframe": "5", "timestamp": "2026-04-14T00:00:00Z", "final_top_10": []}, f)

        argv = [
            "import_optimized_config.py",
            "--results", str(path),
            "--target", "https://example.com",
        ]
        with patch("sys.argv", argv):
            exit_code = main()
        assert exit_code == 1

    def test_missing_results_file(self, tmp_path) -> None:
        """Missing input file → error exit."""
        from scripts.import_optimized_config import main

        argv = [
            "import_optimized_config.py",
            "--results", str(tmp_path / "nonexistent.json"),
            "--target", "https://example.com",
        ]
        with patch("sys.argv", argv):
            exit_code = main()
        assert exit_code == 1
