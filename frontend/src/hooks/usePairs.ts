import { useState, useEffect } from 'react';
import api from '@/lib/api';
import type { TradingPair } from '@/types/api';

/** Кэш на уровне модуля — не рефетчим при каждом маунте */
let cachedPairs: TradingPair[] | null = null;
let fetchPromise: Promise<TradingPair[]> | null = null;

async function fetchPairs(): Promise<TradingPair[]> {
  if (cachedPairs) return cachedPairs;
  if (fetchPromise) return fetchPromise;

  fetchPromise = api
    .get<TradingPair[]>('/market/pairs')
    .then((res) => {
      cachedPairs = res.data;
      fetchPromise = null;
      return res.data;
    })
    .catch(() => {
      fetchPromise = null;
      return [];
    });

  return fetchPromise;
}

export function usePairs() {
  const [pairs, setPairs] = useState<TradingPair[]>(cachedPairs || []);
  const [loading, setLoading] = useState(!cachedPairs);

  useEffect(() => {
    if (cachedPairs) {
      setPairs(cachedPairs);
      setLoading(false);
      return;
    }

    fetchPairs().then((data) => {
      setPairs(data);
      setLoading(false);
    });
  }, []);

  return { pairs, loading };
}
