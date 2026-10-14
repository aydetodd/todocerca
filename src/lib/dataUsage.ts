import { getHermosilloToday } from '@/lib/utils';

const STORAGE_KEY = 'todocerca:data-usage:v1';
const UPDATE_EVENT = 'todocerca:data-usage-updated';
type DailyUsage = { bytes: number; measured: number; unavailable: number };
type UsageStore = { startedOn: string; days: Record<string, DailyUsage> };
let started = false;
let pending: Record<string, DailyUsage> = {};
let timer: ReturnType<typeof setTimeout> | undefined;
let storageAvailable = true;
let supported = false;

function readStore(): UsageStore {
  const fallback = { startedOn: getHermosilloToday(), days: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (typeof parsed.startedOn !== 'string' || !parsed.days || typeof parsed.days !== 'object') return fallback;
    const days: Record<string, DailyUsage> = {};
    for (const [day, value] of Object.entries(parsed.days)) {
      const item = value as DailyUsage;
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && item && [item.bytes, item.measured, item.unavailable].every(n => Number.isFinite(n) && n >= 0)) days[day] = item;
    }
    return { startedOn: parsed.startedOn, days };
  } catch {
    storageAvailable = false;
    return fallback;
  }
}

export function summarizeUsage(days: Record<string, DailyUsage>, today: string) {
  const daily = days[today]?.bytes ?? 0;
  let monthly = 0;
  let measured = 0;
  let unavailable = 0;
  for (const [date, usage] of Object.entries(days)) {
    if (date.slice(0, 7) !== today.slice(0, 7)) continue;
    monthly += usage.bytes;
    measured += usage.measured;
    unavailable += usage.unavailable;
  }
  return { daily, monthly, measured, unavailable };
}

export function classifyTransfer(entry: Pick<PerformanceResourceTiming, 'transferSize' | 'decodedBodySize'>): DailyUsage {
  // Zero transfer with a visible body is a cache hit, not a new download.
  if (entry.transferSize > 0) return { bytes: entry.transferSize, measured: 1, unavailable: 0 };
  if (entry.decodedBodySize > 0) return { bytes: 0, measured: 1, unavailable: 0 };
  // Cross-origin resources without Timing-Allow-Origin cannot be measured.
  return { bytes: 0, measured: 0, unavailable: 1 };
}

function mergePending(store: UsageStore) {
  for (const [day, increment] of Object.entries(pending)) {
    const current = store.days[day] ?? { bytes: 0, measured: 0, unavailable: 0 };
    store.days[day] = {
      bytes: current.bytes + increment.bytes,
      measured: current.measured + increment.measured,
      unavailable: current.unavailable + increment.unavailable,
    };
  }
  return store;
}

function flush() {
  if (timer) clearTimeout(timer);
  timer = undefined;
  if (!Object.keys(pending).length) return;
  const store = mergePending(readStore());
  // Retain thirteen months of daily counters, never URLs or account information.
  const cutoff = `${Number(getHermosilloToday().slice(0, 4)) - 1}${getHermosilloToday().slice(4, 7)}-01`;
  for (const day of Object.keys(store.days)) if (day < cutoff) delete store.days[day];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    pending = {};
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  window.dispatchEvent(new Event(UPDATE_EVENT));
}

export function getDataUsage() {
  const store = mergePending(readStore());
  return { ...summarizeUsage(store.days, getHermosilloToday()), startedOn: store.startedOn, supported, storageAvailable };
}

export function subscribeDataUsage(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener(UPDATE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(UPDATE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function startDataUsageMeter() {
  if (started || typeof window === 'undefined') return;
  started = true;
  if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('resource')) return;
  const record = (entries: PerformanceEntry[]) => {
    const day = getHermosilloToday();
    for (const entry of entries) {
      const increment = classifyTransfer(entry as PerformanceResourceTiming);
      const current = pending[day] ?? { bytes: 0, measured: 0, unavailable: 0 };
      pending[day] = { bytes: current.bytes + increment.bytes, measured: current.measured + increment.measured, unavailable: current.unavailable + increment.unavailable };
    }
    if (!timer) timer = setTimeout(flush, 2000);
  };
  try {
    const observer = new PerformanceObserver(list => record(list.getEntries()));
    observer.observe({ type: 'resource', buffered: true });
    record(performance.getEntriesByType('navigation'));
    supported = true;
    // Persist the starting date even before any measurable traffic arrives.
    const store = readStore();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { storageAvailable = false; }
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  } catch {
    supported = false;
  }
}

export function formatDataBytes(bytes: number) {
  if (bytes === 0) return '0 MB';
  if (bytes < 1_000_000) return `${(bytes / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toLocaleString('es-MX', { maximumFractionDigits: 2 })} MB`;
  return `${(bytes / 1_000_000_000).toLocaleString('es-MX', { maximumFractionDigits: 2 })} GB`;
}