import { create } from 'zustand';

/** Zustand store для приватного торгового WebSocket-потока */

export interface OrderRecord {
  id?: string;
  symbol?: string;
  side?: string;
  price?: number;
  qty?: number;
  status?: string;
  [key: string]: unknown;
}

export interface PositionRecord {
  symbol?: string;
  side?: string;
  size?: number;
  entry_price?: number;
  unrealised_pnl?: number;
  [key: string]: unknown;
}

export interface ExecutionRecord {
  id?: string;
  symbol?: string;
  side?: string;
  price?: number;
  qty?: number;
  timestamp?: string;
  [key: string]: unknown;
}

interface TradingState {
  isConnected: boolean;
  orders: OrderRecord[];
  positions: PositionRecord[];
  executions: ExecutionRecord[];

  setConnected: (v: boolean) => void;
  addOrder: (data: Record<string, unknown>) => void;
  updatePosition: (data: Record<string, unknown>) => void;
  addExecution: (data: Record<string, unknown>) => void;
  clearAll: () => void;
}

export const useTradingStore = create<TradingState>((set) => ({
  isConnected: false,
  orders: [],
  positions: [],
  executions: [],

  setConnected: (v) => set({ isConnected: v }),

  addOrder: (data) =>
    set((s) => ({
      orders: [data as OrderRecord, ...s.orders].slice(0, 100),
    })),

  updatePosition: (data) =>
    set((s) => {
      const pos = data as PositionRecord;
      const idx = s.positions.findIndex((p) => p.symbol === pos.symbol);
      if (idx >= 0) {
        const updated = [...s.positions];
        updated[idx] = pos;
        return { positions: updated };
      }
      return { positions: [...s.positions, pos] };
    }),

  addExecution: (data) =>
    set((s) => ({
      executions: [data as ExecutionRecord, ...s.executions].slice(0, 200),
    })),

  clearAll: () => set({ orders: [], positions: [], executions: [] }),
}));
