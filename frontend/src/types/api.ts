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
  started_at: string | null;
  stopped_at: string | null;
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
