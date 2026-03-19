import { useProviderStatus } from '@/hooks/useProviderStatus';

export const StatusControl = () => {
  const { status, loading, updateStatus } = useProviderStatus();

  const buttons = [
    { key: 'available' as const, color: 'bg-green-500', glow: 'shadow-[0_0_20px_6px_rgba(34,197,94,0.9)]', border: 'border-green-300', dim: 'bg-green-900/30 border-green-800/40' },
    { key: 'busy' as const, color: 'bg-yellow-400', glow: 'shadow-[0_0_20px_6px_rgba(234,179,8,0.9)]', border: 'border-yellow-200', dim: 'bg-yellow-900/30 border-yellow-800/40' },
    { key: 'offline' as const, color: 'bg-red-500', glow: 'shadow-[0_0_20px_6px_rgba(239,68,68,0.9)]', border: 'border-red-300', dim: 'bg-red-900/30 border-red-800/40' },
  ] as const;

  return (
    <div className="flex flex-row gap-3 bg-gray-900/95 rounded-2xl p-3 shadow-2xl border border-gray-700 backdrop-blur-md">
      {buttons.map(({ key, color, glow, border, dim }) => (
        <button
          key={key}
          onClick={() => updateStatus(key)}
          disabled={loading}
          className={`
            w-12 h-12 rounded-full transition-all duration-300 ease-in-out border-2
            ${status === key
              ? `${color} ${border} ${glow} scale-110 animate-pulse`
              : `${dim} hover:opacity-70`
            }
          `}
          aria-label={key}
        />
      ))}
    </div>
  );
};
