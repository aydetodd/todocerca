import { useProviderStatus } from '@/hooks/useProviderStatus';

const STATUS_LABEL: Record<string, string> = {
  available: 'Disponible',
  busy: 'Ocupado',
  offline: 'Fuera de servicio',
};

/**
 * Semáforo GRANDE (versión original) para Dashboard, Panel, MapView,
 * ProductSearch y TrackingGPS. Mismo hook compartido useProviderStatus
 * para sincronización en tiempo real entre todas las instancias.
 */
export const StatusControl = () => {
  const { status, loading, updateStatus } = useProviderStatus();
  const current = status ?? 'available';

  return (
    <div className="w-full">
      <div className="bg-muted/40 rounded-2xl px-6 py-4 flex items-center justify-center gap-6">
        <button
          onClick={() => updateStatus('available')}
          disabled={loading}
          aria-label="Disponible"
          title="Disponible"
          className={`w-14 h-14 rounded-full transition-all duration-200 border-2 ${
            current === 'available'
              ? 'bg-green-500 border-white shadow-[0_0_22px_rgba(34,197,94,0.95)] scale-110'
              : 'bg-green-700/40 border-green-300/40 hover:bg-green-500/70'
          }`}
        />
        <button
          onClick={() => updateStatus('busy')}
          disabled={loading}
          aria-label="Ocupado"
          title="Ocupado"
          className={`w-14 h-14 rounded-full transition-all duration-200 border-2 ${
            current === 'busy'
              ? 'bg-yellow-400 border-white shadow-[0_0_22px_rgba(234,179,8,0.95)] scale-110'
              : 'bg-yellow-600/40 border-yellow-300/40 hover:bg-yellow-400/70'
          }`}
        />
        <button
          onClick={() => updateStatus('offline')}
          disabled={loading}
          aria-label="Fuera de servicio"
          title="Fuera de servicio"
          className={`w-14 h-14 rounded-full transition-all duration-200 border-2 ${
            current === 'offline'
              ? 'bg-red-500 border-white shadow-[0_0_22px_rgba(239,68,68,0.95)] scale-110'
              : 'bg-red-700/40 border-red-300/40 hover:bg-red-500/70'
          }`}
        />
      </div>
      <div className="mt-2 text-sm text-muted-foreground text-center">
        Estado actual:{' '}
        <span
          className={
            current === 'available'
              ? 'text-green-500 font-semibold'
              : current === 'busy'
              ? 'text-yellow-500 font-semibold'
              : 'text-red-500 font-semibold'
          }
        >
          {STATUS_LABEL[current]}
        </span>
      </div>
    </div>
  );
};
