import { useNavigate } from 'react-router-dom';
import { useProviderStatus } from '@/hooks/useProviderStatus';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BrandIcon } from '@/components/BrandIcon';

interface GlobalHeaderProps {
  title?: string;
  children?: React.ReactNode;
}

export const GlobalHeader = ({ title = "TodoCerca", children }: GlobalHeaderProps) => {
  const navigate = useNavigate();
  const { isProvider, status, loading, updateStatus } = useProviderStatus();

  return (
    <header className="app-header border-b border-border sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/home')}>
          <BrandIcon className="h-8 w-8" />
          <h1 className="text-[28px] leading-none font-bold text-foreground">{title}</h1>
        </div>


        <div className="flex items-center gap-3">
          {children}
          <ThemeToggle />
          {isProvider && (
            <div className="flex items-center gap-2 bg-card rounded-full px-3 py-2 border border-border shadow-[var(--shadow-card)]">
              <button
                onClick={() => updateStatus('available')}
                disabled={loading}
                className={`
                  w-10 h-10 rounded-full transition-all duration-200 border-2
                  ${status === 'available'
                    ? 'bg-emerald-500 border-emerald-200 shadow-[0_0_12px_hsl(142_71%_45%_/_0.45)] scale-110'
                    : 'bg-emerald-100 border-emerald-200 hover:bg-emerald-200'
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
                    ? 'bg-amber-400 border-amber-200 shadow-[0_0_12px_hsl(38_92%_50%_/_0.45)] scale-110'
                    : 'bg-amber-100 border-amber-200 hover:bg-amber-200'
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
                    ? 'bg-rose-400 border-rose-200 shadow-[0_0_12px_hsl(351_83%_61%_/_0.40)] scale-110'
                    : 'bg-rose-100 border-rose-200 hover:bg-rose-200'
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
