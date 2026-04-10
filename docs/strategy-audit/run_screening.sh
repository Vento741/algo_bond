#!/bin/bash
# Pair screening script for SuperTrend Squeeze v2
# Runs backtests sequentially (single Celery worker)

TOKEN="$1"
STRATEGY_ID="a3a59dd1-ca06-42fb-a036-a3d37c2864b1"
API="http://localhost:8100/api"

CONFIG='{"risk":{"trailing_atr_mult":20,"tp_atr_mult":20,"stop_atr_mult":5.0,"cooldown_bars":5,"adaptive_trailing":true,"trail_low_mult":10,"trail_high_mult":25},"entry":{"rsi_long_max":45,"rsi_short_min":45},"supertrend":{"st2_mult":3.0,"st3_mult":7.0},"trend_filter":{"adx_threshold":15},"squeeze":{"use":true,"min_duration":10,"duration_norm":20,"max_weight":2.0},"regime":{"use":true,"adx_ranging":20,"atr_high_vol_pct":75,"vol_scale":1.5,"skip_ranging":true}}'

PAIR="$2"
TF="$3"

echo "=== Testing $PAIR on $TF ==="

# Create config
CONFIG_ID=$(curl -s -X POST "$API/strategies/configs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"strategy_id\":\"$STRATEGY_ID\",\"name\":\"Screen_${PAIR}_${TF}\",\"symbol\":\"$PAIR\",\"timeframe\":\"$TF\",\"config\":$CONFIG}" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

echo "Config ID: $CONFIG_ID"

# Start backtest
RUN_ID=$(curl -s -X POST "$API/backtest/runs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"strategy_config_id\":\"$CONFIG_ID\",\"symbol\":\"$PAIR\",\"timeframe\":\"$TF\",\"start_date\":\"2025-11-10\",\"end_date\":\"2026-04-10\",\"initial_capital\":100}" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

echo "Run ID: $RUN_ID"

# Poll until completed
for i in $(seq 1 120); do
  sleep 8
  STATUS=$(curl -s "$API/backtest/runs/$RUN_ID" \
    -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('status','unknown'))")

  if [ "$STATUS" = "completed" ]; then
    echo "Completed!"
    # Get results
    curl -s "$API/backtest/runs/$RUN_ID" \
      -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
d=json.load(sys.stdin)
r=d.get('result',{}) or {}
m=r.get('metrics',{}) or {}
print(json.dumps({
  'pair': '$PAIR',
  'tf': '$TF',
  'pnl_pct': m.get('total_return_pct', 0),
  'max_dd': m.get('max_drawdown_pct', 0),
  'sharpe': m.get('sharpe_ratio', 0),
  'win_rate': m.get('win_rate', 0),
  'profit_factor': m.get('profit_factor', 0),
  'trades': m.get('total_trades', 0)
}))"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "FAILED"
    curl -s "$API/backtest/runs/$RUN_ID" \
      -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('error','no error info'))"
    break
  else
    echo "  Status: $STATUS (poll $i)"
  fi
done
