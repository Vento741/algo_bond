#!/bin/bash
# Hybrid KNN+SuperTrend frequency optimization
# Goal: 100+ trades, 45%+ WR, positive PnL

set -e

API="https://algo.dev-james.bond/api"
STRAT_API="$API/strategies"
TOKEN="$1"
STRATEGY_ID="b1c2d3e4-f5a6-7890-abcd-ef1234567890"
SYMBOL="TRUMPUSDT"
TIMEFRAME="15"
START="2025-11-10T00:00:00Z"
END="2026-04-10T00:00:00Z"
CAPITAL="100"

# Use Python's temp directory with forward slashes
PY_TEMP=$(python -c "import tempfile; print(tempfile.gettempdir().replace(chr(92),'/'))")
RESULTS_FILE="$PY_TEMP/freq_results.json"
BEST_PARAMS_FILE="$PY_TEMP/freq_best_params.json"

echo "[]" > "$RESULTS_FILE"

# Base config
BASE_KNN='{"neighbors":8,"lookback":50,"weight":0.5,"rsi_period":15,"wt_ch_len":10,"wt_avg_len":21,"cci_period":20,"adx_period":14}'
BASE_HYBRID='{"knn_min_confidence":55,"knn_min_score":0.1,"use_knn_direction":true}'
BASE_ST='{"st2_mult":3.25,"st3_mult":7.0}'
BASE_ENTRY='{"rsi_long_max":28,"rsi_short_min":28}'
BASE_TREND='{"adx_threshold":15}'
BASE_SQUEEZE='{"use":true}'
BASE_RISK='{"trailing_atr_mult":20,"tp_atr_mult":20,"stop_atr_mult":5.0,"cooldown_bars":5}'
BASE_BT='{"commission":0.05,"slippage":0.05,"order_size":75}'

run_backtest() {
    local name="$1"
    local config="$2"

    echo "=== [$name] Creating config..."

    local cfg_resp
    cfg_resp=$(curl -sL -X POST "$STRAT_API/configs" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"strategy_id\":\"$STRATEGY_ID\",\"name\":\"OPT: $name\",\"symbol\":\"$SYMBOL\",\"timeframe\":\"$TIMEFRAME\",\"config\":$config}")

    local cfg_id
    cfg_id=$(echo "$cfg_resp" | python -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)

    if [ -z "$cfg_id" ]; then
        echo "  FAILED to create config: $cfg_resp"
        return 0
    fi

    local run_resp
    run_resp=$(curl -sL -X POST "$API/backtest/runs" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"strategy_config_id\":\"$cfg_id\",\"symbol\":\"$SYMBOL\",\"timeframe\":\"$TIMEFRAME\",\"start_date\":\"$START\",\"end_date\":\"$END\",\"initial_capital\":$CAPITAL}")

    local run_id
    run_id=$(echo "$run_resp" | python -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)

    if [ -z "$run_id" ]; then
        echo "  FAILED to create run: $run_resp"
        curl -sL -X DELETE "$STRAT_API/configs/$cfg_id" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
        return 0
    fi

    # Poll for completion
    local status="pending"
    local polls=0
    local status_resp=""
    while [ "$status" != "completed" ] && [ "$status" != "failed" ] && [ $polls -lt 60 ]; do
        sleep 8
        polls=$((polls + 1))
        status_resp=$(curl -sL "$API/backtest/runs/$run_id" -H "Authorization: Bearer $TOKEN")
        status=$(echo "$status_resp" | python -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
        local progress
        progress=$(echo "$status_resp" | python -c "import sys,json; print(json.load(sys.stdin).get('progress',0))" 2>/dev/null)
        echo -ne "  Polling: $status ($progress%) [$polls]    \r"
    done
    echo ""

    if [ "$status" != "completed" ]; then
        echo "  FAILED/TIMEOUT: $status"
        curl -sL -X DELETE "$API/backtest/runs/$run_id" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
        curl -sL -X DELETE "$STRAT_API/configs/$cfg_id" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
        return 0
    fi

    # Get result
    local result
    result=$(curl -sL "$API/backtest/runs/$run_id/result" -H "Authorization: Bearer $TOKEN")

    local trades wr pnl dd pf
    trades=$(echo "$result" | python -c "import sys,json; print(json.load(sys.stdin)['total_trades'])" 2>/dev/null)
    wr=$(echo "$result" | python -c "import sys,json; d=json.load(sys.stdin); print(round(float(d['win_rate'])*100, 2))" 2>/dev/null)
    pnl=$(echo "$result" | python -c "import sys,json; print(json.load(sys.stdin)['total_pnl_pct'])" 2>/dev/null)
    dd=$(echo "$result" | python -c "import sys,json; print(json.load(sys.stdin)['max_drawdown'])" 2>/dev/null)
    pf=$(echo "$result" | python -c "import sys,json; print(json.load(sys.stdin)['profit_factor'])" 2>/dev/null)

    echo "  >> trades=$trades WR=$wr% PnL=$pnl% DD=$dd% PF=$pf"

    # Append to results (wr already as percentage 0-100)
    python -c "
import json
rf='$RESULTS_FILE'
with open(rf,'r') as f: data=json.load(f)
data.append({'name':'$name','trades':$trades,'win_rate':float('$wr'),'pnl_pct':float('$pnl'),'max_dd':float('$dd'),'profit_factor':float('$pf')})
with open(rf,'w') as f: json.dump(data,f,indent=2)
"

    # Cleanup
    curl -sL -X DELETE "$API/backtest/runs/$run_id" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
    curl -sL -X DELETE "$STRAT_API/configs/$cfg_id" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
    echo "  Cleaned up."
}

build_config() {
    local hybrid="${1:-$BASE_HYBRID}"
    local knn="${2:-$BASE_KNN}"
    local st="${3:-$BASE_ST}"
    local entry="${4:-$BASE_ENTRY}"
    local trend="${5:-$BASE_TREND}"
    local squeeze="${6:-$BASE_SQUEEZE}"
    local risk="${7:-$BASE_RISK}"
    local bt="${8:-$BASE_BT}"
    echo "{\"hybrid\":$hybrid,\"knn\":$knn,\"supertrend\":$st,\"entry\":$entry,\"trend_filter\":$trend,\"squeeze\":$squeeze,\"risk\":$risk,\"backtest\":$bt}"
}

echo "========================================"
echo "  FREQUENCY OPTIMIZATION - 26 configs"
echo "  $SYMBOL $TIMEFRAME m | $START -> $END"
echo "========================================"

# Baseline
echo ""
echo "--- BASELINE ---"
run_backtest "BASELINE" "$(build_config)"

# Group A: RSI loosening (5 configs)
echo ""
echo "--- GROUP A: RSI Loosening ---"
for rsi in 35 40 45 50 55; do
    run_backtest "A-RSI$rsi" "$(build_config "$BASE_HYBRID" "$BASE_KNN" "$BASE_ST" "{\"rsi_long_max\":$rsi,\"rsi_short_min\":$rsi}" "$BASE_TREND" "$BASE_SQUEEZE" "$BASE_RISK" "$BASE_BT")"
done

echo ""
echo ">>> Progress: 6/26 done (Baseline + Group A)"

# Group B: KNN loosening (5 configs)
echo ""
echo "--- GROUP B: KNN Loosening ---"
for knn_conf in 40 45 48 50 52; do
    run_backtest "B-KNN$knn_conf" "$(build_config "{\"knn_min_confidence\":$knn_conf,\"knn_min_score\":0.1,\"use_knn_direction\":true}" "$BASE_KNN" "$BASE_ST" "$BASE_ENTRY" "$BASE_TREND" "$BASE_SQUEEZE" "$BASE_RISK" "$BASE_BT")"
done

echo ""
echo ">>> Progress: 11/26 done (+ Group B)"

# Group C: Cooldown (4 configs)
echo ""
echo "--- GROUP C: Cooldown ---"
for cd_val in 2 3 4 8; do
    run_backtest "C-CD$cd_val" "$(build_config "$BASE_HYBRID" "$BASE_KNN" "$BASE_ST" "$BASE_ENTRY" "$BASE_TREND" "$BASE_SQUEEZE" "{\"trailing_atr_mult\":20,\"tp_atr_mult\":20,\"stop_atr_mult\":5.0,\"cooldown_bars\":$cd_val}" "$BASE_BT")"
done

echo ""
echo ">>> Progress: 15/26 done (+ Group C)"

# Group D: ADX + SuperTrend (4 configs)
echo ""
echo "--- GROUP D: ADX + SuperTrend ---"
run_backtest "D-ADX10" "$(build_config "$BASE_HYBRID" "$BASE_KNN" "$BASE_ST" "$BASE_ENTRY" "{\"adx_threshold\":10}" "$BASE_SQUEEZE" "$BASE_RISK" "$BASE_BT")"
run_backtest "D-ADX12" "$(build_config "$BASE_HYBRID" "$BASE_KNN" "$BASE_ST" "$BASE_ENTRY" "{\"adx_threshold\":12}" "$BASE_SQUEEZE" "$BASE_RISK" "$BASE_BT")"
run_backtest "D-ST5" "$(build_config "$BASE_HYBRID" "$BASE_KNN" "{\"st2_mult\":3.25,\"st3_mult\":5.0}" "$BASE_ENTRY" "$BASE_TREND" "$BASE_SQUEEZE" "$BASE_RISK" "$BASE_BT")"
run_backtest "D-ST6" "$(build_config "$BASE_HYBRID" "$BASE_KNN" "{\"st2_mult\":3.25,\"st3_mult\":6.0}" "$BASE_ENTRY" "$BASE_TREND" "$BASE_SQUEEZE" "$BASE_RISK" "$BASE_BT")"

echo ""
echo ">>> Progress: 19/26 done (+ Group D)"

# Determine best params for Group E
echo ""
echo "=== INTERMEDIATE ANALYSIS ==="
python -c "
import json
rf='$RESULTS_FILE'
bp='$BEST_PARAMS_FILE'
with open(rf) as f: data=json.load(f)

def score(x):
    return 0.25*(x['pnl_pct']/max(1,max(abs(d['pnl_pct']) for d in data)))+0.25*(x['win_rate']/100)+0.25*(x['trades']/max(d['trades'] for d in data))+0.25*(1-abs(x['max_dd'])/max(abs(d['max_dd']) for d in data))

best_a = max([d for d in data if d['name'].startswith('A-')], key=score, default=None)
best_b = max([d for d in data if d['name'].startswith('B-')], key=score, default=None)
best_c = max([d for d in data if d['name'].startswith('C-')], key=score, default=None)

print(f'Best A: {best_a[\"name\"] if best_a else \"none\"} ({best_a})')
print(f'Best B: {best_b[\"name\"] if best_b else \"none\"} ({best_b})')
print(f'Best C: {best_c[\"name\"] if best_c else \"none\"} ({best_c})')

rsi_val = int(best_a['name'].split('RSI')[1]) if best_a else 28
knn_val = int(best_b['name'].split('KNN')[1]) if best_b else 55
cd_val = int(best_c['name'].split('CD')[1]) if best_c else 5

with open(bp,'w') as f:
    json.dump({'rsi':rsi_val,'knn':knn_val,'cd':cd_val}, f)
print(f'Selected: RSI={rsi_val}, KNN={knn_val}, CD={cd_val}')
"

BEST_RSI=$(python -c "import json; print(json.load(open('$BEST_PARAMS_FILE'))['rsi'])")
BEST_KNN=$(python -c "import json; print(json.load(open('$BEST_PARAMS_FILE'))['knn'])")
BEST_CD=$(python -c "import json; print(json.load(open('$BEST_PARAMS_FILE'))['cd'])")

echo "Group E params: RSI=$BEST_RSI, KNN=$BEST_KNN, CD=$BEST_CD"

# Group E: Combined (4 configs)
echo ""
echo "--- GROUP E: Combined ---"
run_backtest "E1-RSI${BEST_RSI}+KNN${BEST_KNN}" "$(build_config "{\"knn_min_confidence\":$BEST_KNN,\"knn_min_score\":0.1,\"use_knn_direction\":true}" "$BASE_KNN" "$BASE_ST" "{\"rsi_long_max\":$BEST_RSI,\"rsi_short_min\":$BEST_RSI}" "$BASE_TREND" "$BASE_SQUEEZE" "$BASE_RISK" "$BASE_BT")"

run_backtest "E2-RSI${BEST_RSI}+CD${BEST_CD}" "$(build_config "$BASE_HYBRID" "$BASE_KNN" "$BASE_ST" "{\"rsi_long_max\":$BEST_RSI,\"rsi_short_min\":$BEST_RSI}" "$BASE_TREND" "$BASE_SQUEEZE" "{\"trailing_atr_mult\":20,\"tp_atr_mult\":20,\"stop_atr_mult\":5.0,\"cooldown_bars\":$BEST_CD}" "$BASE_BT")"

run_backtest "E3-ALL3" "$(build_config "{\"knn_min_confidence\":$BEST_KNN,\"knn_min_score\":0.1,\"use_knn_direction\":true}" "$BASE_KNN" "$BASE_ST" "{\"rsi_long_max\":$BEST_RSI,\"rsi_short_min\":$BEST_RSI}" "$BASE_TREND" "$BASE_SQUEEZE" "{\"trailing_atr_mult\":20,\"tp_atr_mult\":20,\"stop_atr_mult\":5.0,\"cooldown_bars\":$BEST_CD}" "$BASE_BT")"

run_backtest "E4-ALL3+ADX12" "$(build_config "{\"knn_min_confidence\":$BEST_KNN,\"knn_min_score\":0.1,\"use_knn_direction\":true}" "$BASE_KNN" "$BASE_ST" "{\"rsi_long_max\":$BEST_RSI,\"rsi_short_min\":$BEST_RSI}" "{\"adx_threshold\":12}" "$BASE_SQUEEZE" "{\"trailing_atr_mult\":20,\"tp_atr_mult\":20,\"stop_atr_mult\":5.0,\"cooldown_bars\":$BEST_CD}" "$BASE_BT")"

echo ""
echo ">>> Progress: 23/26 done (+ Group E)"

# Group F: Risk tuning (3 configs) - use best combo
echo ""
echo "--- GROUP F: Risk Tuning (TP) ---"
for tp in 10 12 15; do
    run_backtest "F-TP${tp}" "$(build_config "{\"knn_min_confidence\":$BEST_KNN,\"knn_min_score\":0.1,\"use_knn_direction\":true}" "$BASE_KNN" "$BASE_ST" "{\"rsi_long_max\":$BEST_RSI,\"rsi_short_min\":$BEST_RSI}" "$BASE_TREND" "$BASE_SQUEEZE" "{\"trailing_atr_mult\":20,\"tp_atr_mult\":$tp,\"stop_atr_mult\":5.0,\"cooldown_bars\":$BEST_CD}" "$BASE_BT")"
done

echo ""
echo "=========================================="
echo "  ALL 26 CONFIGS DONE"
echo "=========================================="

# Final analysis
python -c "
import json

rf='$RESULTS_FILE'
with open(rf) as f:
    data = json.load(f)

if not data:
    print('No results!')
    exit(1)

max_pnl = max(abs(d['pnl_pct']) for d in data) or 1
max_trades = max(d['trades'] for d in data) or 1
max_dd = max(abs(d['max_dd']) for d in data) or 1

for d in data:
    pnl_n = d['pnl_pct'] / max_pnl
    wr_n = d['win_rate'] / 100  # win_rate is already 0-100 percentage
    tr_n = d['trades'] / max_trades
    dd_n = abs(d['max_dd']) / max_dd
    d['composite'] = round(0.25 * pnl_n + 0.25 * wr_n + 0.25 * tr_n + 0.25 * (1 - dd_n), 4)

data.sort(key=lambda x: x['composite'], reverse=True)

print('='*105)
print(f'{\"#\":<4} {\"Name\":<35} {\"Trades\":<8} {\"WR%\":<8} {\"PnL%\":<10} {\"DD%\":<8} {\"PF\":<8} {\"Score\":<8}')
print('-'*105)
for i, d in enumerate(data, 1):
    wr_str = f\"{d['win_rate']:.1f}\"
    pnl_str = f\"{d['pnl_pct']:.2f}\"
    dd_str = f\"{d['max_dd']:.2f}\"
    pf_str = f\"{d['profit_factor']:.2f}\"
    sc_str = f\"{d['composite']:.4f}\"
    print(f'{i:<4} {d[\"name\"]:<35} {d[\"trades\"]:<8} {wr_str:<8} {pnl_str:<10} {dd_str:<8} {pf_str:<8} {sc_str:<8}')
print('='*105)

with open(rf, 'w') as f:
    json.dump(data, f, indent=2)

b = data[0]
print(f'')
print(f'BEST: {b[\"name\"]}')
print(f'  Trades={b[\"trades\"]}, WR={b[\"win_rate\"]:.1f}%, PnL={b[\"pnl_pct\"]:.2f}%, DD={b[\"max_dd\"]:.2f}%, PF={b[\"profit_factor\"]:.2f}')
"

echo ""
echo "Results: $RESULTS_FILE"
