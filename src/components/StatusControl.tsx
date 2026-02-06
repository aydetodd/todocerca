import { useProviderStatus } from '@/hooks/useProviderStatus';

export const StatusControl = () => {
  const { status, loading, updateStatus } = useProviderStatus();

  return (
    <div className="relative flex flex-row gap-3 bg-gray-900/98 rounded-2xl p-3 shadow-2xl border-2 border-gray-600 backdrop-blur-md">
      <button
        onClick={() => updateStatus('available')}
        disabled={loading}
        className={`
          w-14 h-14 rounded-full transition-all duration-300 border-2
          ${status === 'available' 
            ? 'bg-green-500 border-green-300 shadow-[0_0_25px_rgba(34,197,94,1)] scale-110' 
            : 'bg-green-950/40 border-green-950/60 hover:bg-green-950/60'
          }
        `}
        aria-label="Disponible"
        title="Disponible"
      />
      <button
        onClick={() => updateStatus('busy')}
        disabled={loading}
        className={`
          w-14 h-14 rounded-full transition-all duration-300 border-2
          ${status === 'busy' 
            ? 'bg-yellow-400 border-yellow-200 shadow-[0_0_25px_rgba(234,179,8,1)] scale-110' 
            : 'bg-yellow-950/40 border-yellow-950/60 hover:bg-yellow-950/60'
          }
        `}
        aria-label="Ocupado"
        title="Ocupado"
      />
      <button
        onClick={() => updateStatus('offline')}
        disabled={loading}
        className={`
          w-14 h-14 rounded-full transition-all duration-300 border-2
          ${status === 'offline' 
            ? 'bg-red-500 border-red-300 shadow-[0_0_25px_rgba(239,68,68,1)] scale-110' 
            : 'bg-red-950/40 border-red-950/60 hover:bg-red-950/60'
          }
        `}
        aria-label="Desconectado"
        title="Desconectado"
      />
    </div>
  );
};
