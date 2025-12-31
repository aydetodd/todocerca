export const GPS_TRACKER_ONLINE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 horas

export const isGpsTrackerOnline = (
  lastSeen: string | null | undefined,
  windowMs: number = GPS_TRACKER_ONLINE_WINDOW_MS
) => {
  if (!lastSeen) return false;
  const diff = Date.now() - new Date(lastSeen).getTime();
  return diff < windowMs;
};
