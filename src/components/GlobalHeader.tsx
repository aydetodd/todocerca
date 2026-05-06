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
            <div className="flex items-center gap-1.5 sm:gap-2 bg-background rounded-full px-2 py-1.5 sm:px-3 sm:py-2 border-2 border-foreground/30 shadow-md">
              <button
                onClick={() => updateStatus('available')}
                disabled={loading}
                className={`
                  w-7 h-7 sm:w-9 sm:h-9 rounded-full transition-all duration-200 border-2
                  ${status === 'available'
                    ? 'bg-green-500 border-white shadow-[0_0_14px_rgba(34,197,94,1)] scale-110'
                    : 'bg-green-600/70 border-green-200 hover:bg-green-500'
                  }
                `}
                aria-label="Disponible"
                title="Disponible"
              />
              <button
                onClick={() => updateStatus('busy')}
                disabled={loading}
                className={`
                  w-7 h-7 sm:w-9 sm:h-9 rounded-full transition-all duration-200 border-2
                  ${status === 'busy'
                    ? 'bg-yellow-400 border-white shadow-[0_0_14px_rgba(234,179,8,1)] scale-110'
                    : 'bg-yellow-500/70 border-yellow-200 hover:bg-yellow-400'
                  }
                `}
                aria-label="Ocupado"
                title="Ocupado"
              />
              <button
                onClick={() => updateStatus('offline')}
                disabled={loading}
                className={`
                  w-7 h-7 sm:w-9 sm:h-9 rounded-full transition-all duration-200 border-2
                  ${status === 'offline'
                    ? 'bg-red-500 border-white shadow-[0_0_14px_rgba(239,68,68,1)] scale-110'
                    : 'bg-red-600/70 border-red-200 hover:bg-red-500'
                  }
                `}
                aria-label="Desconectado"
                title="Desconectado"
              />
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
