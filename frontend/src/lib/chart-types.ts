import type { Time } from 'lightweight-charts';

/** Формат свечи, приходящей из REST / WebSocket */
export interface KlineData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Данные crosshair для отображения OHLCV */
export interface CrosshairData {
  time: Time | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

/** Группа индикатора: overlay рисуется поверх свечей, oscillator - на отдельной панели */
export type IndicatorGroup = 'overlay' | 'oscillator';

/** Определение индикатора */
export interface IndicatorDefinition {
  id: string;
  label: string;
  group: IndicatorGroup;
  /** Индекс панели: 0 = основная, 1 = volume (зарезервировано), 2+ = осцилляторы */
  paneIndex: number;
  colors: string[];
  defaultParams: Record<string, number>;
}

/** Состояние индикатора в стор */
export interface IndicatorState {
  enabled: boolean;
  params: Record<string, number>;
}

/** Конфигурация темы графика */
export interface ChartTheme {
  background: string;
  textColor: string;
  gridColor: string;
  borderColor: string;
  crosshairColor: string;
  upColor: string;
  downColor: string;
  volumeUpColor: string;
  volumeDownColor: string;
  fontFamily: string;
  fontSize: number;
}
