/** Типы, отражающие бэкенд Pydantic-схемы */

export interface User {
  id: string;
  email: string;
  username: string;
  is_active: boolean;
  is_verified: boolean;
  role: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  invite_code: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface Strategy {
  id: string;
  name: string;
  slug: string;
  engine_type: string;
  description: string | null;
  is_public: boolean;
  version: string;
}

export interface StrategyDetail extends Strategy {
  author_id: string | null;
  default_config: Record<string, unknown>;
  created_at: string;
}

export interface StrategyConfig {
  id: string;
  user_id: string;
  strategy_id: string;
  name: string;
  symbol: string;
  timeframe: string;
  config: Record<string, unknown>;
  created_at: string;
}

export interface StrategyConfigCreate {
  strategy_id: string;
  name: string;
  symbol: string;
  timeframe: string;
  config: Record<string, unknown>;
}

export interface StrategyConfigUpdate {
  name?: string;
  symbol?: string;
  timeframe?: string;
  config?: Record<string, unknown>;
}

export interface ExchangeAccount {
  id: string;
  exchange: string;
  label: string;
  is_testnet: boolean;
  is_active: boolean;
  created_at: string;
}

export interface ExchangeAccountCreate {
  exchange: string;
  label: string;
  api_key: string;
  api_secret: string;
  is_testnet: boolean;
}

export interface UserSettings {
  timezone: string;
  notification_channels: { email: boolean; websocket: boolean };
  default_symbol: string;
  default_timeframe: string;
  ui_preferences: { theme: string; chart_style: string };
}

export type BotStatus = 'idle' | 'running' | 'stopped' | 'error';
export type BotMode = 'demo' | 'live' | 'paper';

export interface BotCreate {
  strategy_config_id: string;
  exchange_account_id: string;
  mode: BotMode;
}

export interface BotResponse {
  id: string;
  user_id: string;
  strategy_config_id: string;
  exchange_account_id: string;
  status: BotStatus;
  mode: BotMode;
  total_pnl: number;
  total_trades: number;
  win_rate: number;
  max_pnl: number;
  max_drawdown: number;
  started_at: string | null;
  stopped_at: string | null;
  updated_at: string | null;
  created_at: string;
}

/* ---- Backtest ---- */

export type BacktestStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface BacktestRunResponse {
  id: string;
  user_id: string;
  strategy_config_id: string;
  symbol: string;
  timeframe: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  status: BacktestStatus;
  progress: number;
  error_message: string | null;
  created_at: string;
}

export interface BacktestResultEquityPoint {
  bar: number;
  equity: number;
  timestamp: number;
}

export interface BacktestResultTradeEntry {
  entry_bar: number;
  exit_bar: number;
  direction: string;
  entry_price: number;
  exit_price: number;
  quantity: number;
  pnl: number;
  pnl_pct: number;
  exit_reason: string;
  entry_time?: number;
  exit_time?: number;
}

export interface BacktestResultResponse {
  id: string;
  run_id: string;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  profit_factor: number;
  total_pnl: number;
  total_pnl_pct: number;
  max_drawdown: number;
  sharpe_ratio: number;
  equity_curve: BacktestResultEquityPoint[];
  trades_log: BacktestResultTradeEntry[];
}

/* ---- Trading: Signals, Orders, Positions, Logs ---- */

export interface TradeSignalResponse {
  id: string;
  bot_id: string;
  strategy_config_id: string;
  symbol: string;
  direction: 'long' | 'short';
  signal_strength: number;
  knn_class: string;
  knn_confidence: number;
  indicators_snapshot: Record<string, unknown>;
  was_executed: boolean;
  created_at: string;
}

export interface OrderResponse {
  id: string;
  bot_id: string;
  exchange_order_id: string | null;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  quantity: number;
  price: number;
  filled_price: number | null;
  status: 'open' | 'filled' | 'cancelled' | 'error';
  filled_at: string | null;
  created_at: string;
}

export interface PositionResponse {
  id: string;
  bot_id: string;
  symbol: string;
  side: 'long' | 'short';
  entry_price: number;
  quantity: number;
  original_quantity: number | null;
  stop_loss: number;
  take_profit: number;
  trailing_stop: number | null;
  unrealized_pnl: number;
  realized_pnl: number | null;
  max_pnl: number;
  min_pnl: number;
  current_price: number | null;
  max_price: number | null;
  min_price: number | null;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at: string | null;
  updated_at: string | null;
  // Multi-TP info
  tp1_price: number | null;
  tp1_hit: boolean;
  tp2_price: number | null;
}

export type BotLogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface BotLogResponse {
  id: string;
  bot_id: string;
  level: BotLogLevel;
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

/* ---- Chart Signals ---- */

export interface ChartSignal {
  time: number;
  direction: 'long' | 'short';
  entry_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  tp1_price: number | null;
  tp2_price: number | null;
  signal_strength: number;
  knn_class: string;
  knn_confidence: number;
  was_executed: boolean;
}

export interface ChartSignalsResponse {
  config_id: string;
  symbol: string;
  timeframe: string;
  signals: ChartSignal[];
  cached: boolean;
  evaluated_at: string;
}

/* ---- Market: Trading Pairs ---- */

export interface TradingPair {
  symbol: string;
  base_currency: string;
  quote_currency: string;
  tick_size: number;
  qty_step: number;
  min_qty: number;
  max_qty: number;
  min_notional: number;
  max_leverage: number;
  is_active: boolean;
  status: string;
}

/* ---- Admin ---- */

export interface AdminStats {
  users_count: number;
  active_bots: number;
  pending_requests: number;
  total_trades: number;
  total_pnl: number;
  active_invites: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
  bots_count: number;
  subscription_plan: string | null;
}

export interface AdminUserDetail extends AdminUser {
  updated_at: string;
  exchange_accounts_count: number;
  subscription_status: string | null;
  subscription_expires_at: string | null;
  total_pnl: number;
  total_trades: number;
}

export interface AccessRequestItem {
  id: string;
  telegram: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  reject_reason: string | null;
}

export interface InviteCodeItem {
  id: string;
  code: string;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
  used_at: string | null;
  created_by_email: string | null;
  used_by_email: string | null;
}

export interface AdminLogEntry {
  id: string;
  bot_id: string;
  level: BotLogLevel;
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
  user_email: string | null;
}
