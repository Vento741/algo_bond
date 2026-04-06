import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';

/** Баланс с Bybit, полученный через API */
export interface BalanceData {
  equity: number;
  available: number;
  unrealized_pnl: number;
  wallet_balance: number;
  is_demo: boolean;
  account_label: string;
}

interface UseBalanceResult {
  balance: BalanceData | null;
  isLoading: boolean;
  error: string | null;
}

const POLL_INTERVAL_MS = 60_000; // 60 секунд

/**
 * Хук для получения баланса с Bybit.
 * Поллит /api/trading/balance каждые 60 секунд.
 */
export function useBalance(): UseBalanceResult {
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unmountedRef = useRef(false);

  const fetchBalance = useCallback(async () => {
    try {
      const { data } = await api.get<{ balance: BalanceData | null; error: string | null }>(
        '/trading/balance',
      );

      if (unmountedRef.current) return;

      if (data.error) {
        setError(data.error);
        setBalance(null);
      } else {
        setBalance(data.balance);
        setError(null);
      }
    } catch {
      if (!unmountedRef.current) {
        setError('Failed to fetch balance');
      }
    } finally {
      if (!unmountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    fetchBalance();

    intervalRef.current = setInterval(fetchBalance, POLL_INTERVAL_MS);

    return () => {
      unmountedRef.current = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchBalance]);

  return { balance, isLoading, error };
}
