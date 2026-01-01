// 10 minutos - si no hay señal en 10 min, se considera offline
export const GPS_TRACKER_ONLINE_WINDOW_MS = 10 * 60 * 1000;

export const isGpsTrackerOnline = (
  lastSeen: string | null | undefined,
  windowMs: number = GPS_TRACKER_ONLINE_WINDOW_MS
) => {
  if (!lastSeen) return false;
  const diff = Date.now() - new Date(lastSeen).getTime();
  return diff < windowMs;
};

// Ventana extendida para considerar "recientemente activo" (1 hora)
export const GPS_TRACKER_RECENTLY_ACTIVE_WINDOW_MS = 60 * 60 * 1000;

export const isGpsTrackerRecentlyActive = (
  lastSeen: string | null | undefined
) => {
  if (!lastSeen) return false;
  const diff = Date.now() - new Date(lastSeen).getTime();
  return diff < GPS_TRACKER_RECENTLY_ACTIVE_WINDOW_MS;
};
