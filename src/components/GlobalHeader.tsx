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
            <div className="flex items-center gap-2 bg-muted/50 rounded-full px-3 py-2 border border-border">
              <button
                onClick={() => updateStatus('available')}
                disabled={loading}
                className={`
                  w-10 h-10 rounded-full transition-all duration-200 border-2
                  ${status === 'available'
                    ? 'bg-green-500 border-green-300 shadow-[0_0_12px_rgba(34,197,94,0.9)] scale-110'
                    : 'bg-green-950/40 border-green-900/50 hover:bg-green-900/60'
                  }
                `}
                aria-label="Disponible"
                title="Disponible"
              />
              <button
                onClick={() => updateStatus('busy')}
                disabled={loading}
                className={`
                  w-10 h-10 rounded-full transition-all duration-200 border-2
                  ${status === 'busy'
                    ? 'bg-yellow-400 border-yellow-200 shadow-[0_0_12px_rgba(234,179,8,0.9)] scale-110'
                    : 'bg-yellow-950/40 border-yellow-900/50 hover:bg-yellow-900/60'
                  }
                `}
                aria-label="Ocupado"
                title="Ocupado"
              />
              <button
                onClick={() => updateStatus('offline')}
                disabled={loading}
                className={`
                  w-10 h-10 rounded-full transition-all duration-200 border-2
                  ${status === 'offline'
                    ? 'bg-red-500 border-red-300 shadow-[0_0_12px_rgba(239,68,68,0.9)] scale-110'
                    : 'bg-red-950/40 border-red-900/50 hover:bg-red-900/60'
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
