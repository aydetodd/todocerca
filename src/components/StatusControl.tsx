import { useProviderStatus } from '@/hooks/useProviderStatus';

/**
 * Semáforo compacto unificado: mismo tamaño y estilo que el del GlobalHeader,
 * para que se vea igual en Dashboard, Panel, MapView, ProductSearch y TrackingGPS.
 * Sincronización en tiempo real via useProviderStatus (postgres_changes + broadcast local).
 */
export const StatusControl = () => {
  const { status, loading, updateStatus } = useProviderStatus();

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 bg-muted/50 rounded-full px-2 py-1 sm:px-3 sm:py-1.5">
      <button
        onClick={() => updateStatus('available')}
        disabled={loading}
        className={`
          w-6 h-6 sm:w-8 sm:h-8 rounded-full transition-all duration-200 border-2
          ${status === 'available'
            ? 'bg-green-500 border-white shadow-[0_0_10px_rgba(34,197,94,0.8)]'
            : 'bg-green-600/40 border-green-200/50 hover:bg-green-500/70'
          }
        `}
        aria-label="Disponible"
        title="Disponible"
      />
      <button
        onClick={() => updateStatus('busy')}
        disabled={loading}
        className={`
          w-6 h-6 sm:w-8 sm:h-8 rounded-full transition-all duration-200 border-2
          ${status === 'busy'
            ? 'bg-yellow-400 border-white shadow-[0_0_10px_rgba(234,179,8,0.8)]'
            : 'bg-yellow-500/40 border-yellow-200/50 hover:bg-yellow-400/70'
          }
        `}
        aria-label="Ocupado"
        title="Ocupado"
      />
      <button
        onClick={() => updateStatus('offline')}
        disabled={loading}
        className={`
          w-6 h-6 sm:w-8 sm:h-8 rounded-full transition-all duration-200 border-2
          ${status === 'offline'
            ? 'bg-red-500 border-white shadow-[0_0_10px_rgba(239,68,68,0.8)]'
            : 'bg-red-600/40 border-red-200/50 hover:bg-red-500/70'
          }
        `}
        aria-label="Desconectado"
        title="Desconectado"
      />
    </div>
  );
};
