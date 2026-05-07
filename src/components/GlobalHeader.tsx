import { useNavigate } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { useProviderStatus } from '@/hooks/useProviderStatus';

interface GlobalHeaderProps {
  title?: string;
  children?: React.ReactNode;
}

export const GlobalHeader = ({ title = "TodoCerca", children }: GlobalHeaderProps) => {
  const navigate = useNavigate();
  const { isProvider, status, loading, updateStatus } = useProviderStatus();

  return (
    <header className="bg-card shadow-sm border-b border-border sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/home')}>
          <MapPin className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">{title}</h1>
        </div>

        <div className="flex items-center gap-3">
          {children}
          {isProvider && (
            <div className="flex items-center gap-3 bg-muted/40 rounded-2xl px-4 py-2">
              <button
                onClick={() => updateStatus('available')}
                disabled={loading}
                aria-label="Disponible"
                title="Disponible"
                className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full transition-all duration-200 border-2 ${
                  status === 'available'
                    ? 'bg-green-500 border-white shadow-[0_0_18px_rgba(34,197,94,0.95)] scale-110'
                    : 'bg-green-700/40 border-green-300/40 hover:bg-green-500/70'
                }`}
              />
              <button
                onClick={() => updateStatus('busy')}
                disabled={loading}
                aria-label="Ocupado"
                title="Ocupado"
                className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full transition-all duration-200 border-2 ${
                  status === 'busy'
                    ? 'bg-yellow-400 border-white shadow-[0_0_18px_rgba(234,179,8,0.95)] scale-110'
                    : 'bg-yellow-600/40 border-yellow-300/40 hover:bg-yellow-400/70'
                }`}
              />
              <button
                onClick={() => updateStatus('offline')}
                disabled={loading}
                aria-label="Fuera de servicio"
                title="Fuera de servicio"
                className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full transition-all duration-200 border-2 ${
                  status === 'offline'
                    ? 'bg-red-500 border-white shadow-[0_0_18px_rgba(239,68,68,0.95)] scale-110'
                    : 'bg-red-700/40 border-red-300/40 hover:bg-red-500/70'
                }`}
              />
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
