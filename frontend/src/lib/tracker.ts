/**
 * Легковесный трекер аналитики (~3KB).
 * Собирает pageview, scroll, click, error, conversion, session события.
 * Отправляет батчами через sendBeacon с fallback на fetch.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TrackEvent {
  type: string;
  path?: string;
  title?: string;
  element?: string;
  scroll_depth?: number;
  error?: string;
  conversion_type?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

interface EventBatch {
  session_id?: string;
  events: TrackEvent[];
  screen_width?: number;
  screen_height?: number;
  language?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  user_id?: string;
}

interface UTMParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

const ENDPOINT = '/api/analytics/events';
const SESSION_KEY = '_ab_sid';
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 минут
const FLUSH_INTERVAL = 5_000; // 5 секунд
const SCROLL_THROTTLE = 2_000; // 2 секунды

let initialized = false;
let buffer: TrackEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let utmParams: UTMParams = {};
let maxScrollDepth = 0;
let lastScrollReport = 0;
let lastActivity = Date.now();

/* ------------------------------------------------------------------ */
/*  Session                                                            */
/* ------------------------------------------------------------------ */

function getSessionId(): string {
  const stored = localStorage.getItem(SESSION_KEY);
  if (stored) {
    const elapsed = Date.now() - lastActivity;
    if (elapsed < SESSION_TIMEOUT) {
      return stored;
    }
  }
  const id = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, id);
  return id;
}

function refreshActivity(): void {
  lastActivity = Date.now();
}

/* ------------------------------------------------------------------ */
/*  UTM                                                                */
/* ------------------------------------------------------------------ */

function parseUTM(): UTMParams {
  const params = new URLSearchParams(window.location.search);
  const result: UTMParams = {};
  const src = params.get('utm_source');
  const med = params.get('utm_medium');
  const camp = params.get('utm_campaign');
  if (src) result.utm_source = src;
  if (med) result.utm_medium = med;
  if (camp) result.utm_campaign = camp;
  return result;
}

/* ------------------------------------------------------------------ */
/*  Bot & admin detection                                              */
/* ------------------------------------------------------------------ */

function isBot(): boolean {
  return navigator.webdriver === true;
}

function isAdmin(): boolean {
  try {
    const raw = localStorage.getItem('_ab_user_role');
    return raw === 'admin';
  } catch {
    return false;
  }
}

/** Вызвать из auth store при логине, чтобы tracker знал роль */
export function setTrackerUserRole(role: string): void {
  try {
    localStorage.setItem('_ab_user_role', role);
  } catch {
    // silent
  }
}

export function setTrackerUserId(userId: string): void {
  try {
    localStorage.setItem('_ab_user_id', userId);
  } catch {
    // silent
  }
}

function shouldTrack(): boolean {
  return !isBot() && !isAdmin();
}

/* ------------------------------------------------------------------ */
/*  Buffer & flush                                                     */
/* ------------------------------------------------------------------ */

function pushEvent(event: TrackEvent): void {
  if (!shouldTrack()) return;
  refreshActivity();
  buffer.push(event);
}

function buildBatch(): EventBatch {
  const batch: EventBatch = {
    session_id: getSessionId(),
    events: [...buffer],
    screen_width: window.screen.width,
    screen_height: window.screen.height,
    language: navigator.language,
    referrer: document.referrer || undefined,
  };

  if (utmParams.utm_source) batch.utm_source = utmParams.utm_source;
  if (utmParams.utm_medium) batch.utm_medium = utmParams.utm_medium;
  if (utmParams.utm_campaign) batch.utm_campaign = utmParams.utm_campaign;

  try {
    const userId = localStorage.getItem('_ab_user_id');
    if (userId) batch.user_id = userId;
  } catch {
    // silent
  }

  return batch;
}

function flush(): void {
  if (buffer.length === 0) return;

  const batch = buildBatch();
  buffer = [];

  const payload = JSON.stringify(batch);

  // sendBeacon - надежнее при закрытии страницы
  if (navigator.sendBeacon) {
    const sent = navigator.sendBeacon(
      ENDPOINT,
      new Blob([payload], { type: 'application/json' }),
    );
    if (sent) return;
  }

  // Fallback на fetch (keepalive для надежности при unload)
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Тихо - аналитика не критична
  });
}

/* ------------------------------------------------------------------ */
/*  Event creators                                                     */
/* ------------------------------------------------------------------ */

function now(): string {
  return new Date().toISOString();
}

export function trackPageview(path: string, title: string): void {
  // Не трекаем админские страницы
  if (path.startsWith('/admin')) return;
  // Сбрасываем scroll depth при смене страницы
  maxScrollDepth = 0;
  pushEvent({
    type: 'pageview',
    path,
    title,
    timestamp: now(),
  });
}

export function trackConversion(
  conversionType: string,
  metadata?: Record<string, unknown>,
): void {
  pushEvent({
    type: 'conversion',
    conversion_type: conversionType,
    metadata,
    path: window.location.pathname,
    timestamp: now(),
  });
}

export function trackEvent(
  type: string,
  data?: Partial<Omit<TrackEvent, 'type' | 'timestamp'>>,
): void {
  pushEvent({
    type,
    ...data,
    timestamp: now(),
  });
}

/* ------------------------------------------------------------------ */
/*  Handlers                                                           */
/* ------------------------------------------------------------------ */

function handleClick(e: MouseEvent): void {
  const target = e.target as HTMLElement | null;
  if (!target) return;

  // Ищем ближайший элемент с data-track
  const tracked = target.closest<HTMLElement>('[data-track]');
  if (tracked) {
    const trackValue = tracked.getAttribute('data-track');
    pushEvent({
      type: 'click',
      element: trackValue ?? undefined,
      path: window.location.pathname,
      timestamp: now(),
    });
  }
}

function handleFormSubmit(e: Event): void {
  const target = e.target as HTMLElement | null;
  if (!target) return;

  const form = target.closest<HTMLElement>('[data-track-form]');
  if (form) {
    const formValue = form.getAttribute('data-track-form');
    pushEvent({
      type: 'form_submit',
      element: formValue ?? undefined,
      path: window.location.pathname,
      timestamp: now(),
    });
  }
}

function handleScroll(): void {
  const elapsed = Date.now() - lastScrollReport;
  if (elapsed < SCROLL_THROTTLE) return;

  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  if (docHeight <= 0) return;

  const pct = Math.round((scrollTop / docHeight) * 100);

  // Округляем до порогов 25/50/75/100
  let threshold = 0;
  if (pct >= 100) threshold = 100;
  else if (pct >= 75) threshold = 75;
  else if (pct >= 50) threshold = 50;
  else if (pct >= 25) threshold = 25;

  if (threshold > maxScrollDepth) {
    maxScrollDepth = threshold;
    lastScrollReport = Date.now();
    pushEvent({
      type: 'scroll_depth',
      scroll_depth: threshold,
      path: window.location.pathname,
      timestamp: now(),
    });
  }
}

function handleError(event: ErrorEvent): void {
  pushEvent({
    type: 'error',
    error: `${event.message} at ${event.filename}:${event.lineno}`,
    path: window.location.pathname,
    timestamp: now(),
  });
}

function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  const reason =
    event.reason instanceof Error ? event.reason.message : String(event.reason);
  pushEvent({
    type: 'error',
    error: `Unhandled rejection: ${reason}`,
    path: window.location.pathname,
    timestamp: now(),
  });
}

function handleSessionEnd(): void {
  pushEvent({
    type: 'session_end',
    path: window.location.pathname,
    timestamp: now(),
  });
  flush();
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    handleSessionEnd();
  }
}

/* ------------------------------------------------------------------ */
/*  Init / Destroy                                                     */
/* ------------------------------------------------------------------ */

export function initTracker(): void {
  if (initialized) return;
  if (!shouldTrack()) return;

  initialized = true;
  utmParams = parseUTM();

  // Session start
  pushEvent({
    type: 'session_start',
    path: window.location.pathname,
    title: document.title,
    timestamp: now(),
  });

  // Обработчики
  document.addEventListener('click', handleClick, { passive: true });
  document.addEventListener('submit', handleFormSubmit, { passive: true });
  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);
  window.addEventListener('beforeunload', handleSessionEnd);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Периодический flush
  flushTimer = setInterval(flush, FLUSH_INTERVAL);
}

export function destroyTracker(): void {
  if (!initialized) return;
  initialized = false;

  document.removeEventListener('click', handleClick);
  document.removeEventListener('submit', handleFormSubmit);
  window.removeEventListener('scroll', handleScroll);
  window.removeEventListener('error', handleError);
  window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  window.removeEventListener('beforeunload', handleSessionEnd);
  document.removeEventListener('visibilitychange', handleVisibilityChange);

  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  flush();
}
