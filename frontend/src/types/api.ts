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
