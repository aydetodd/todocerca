import { useProviderLocationTracking } from '@/hooks/useProviderLocationTracking';

/**
 * Componente invisible que activa el tracking global de ubicación
 * para proveedores en cualquier página de la aplicación.
 */
export const GlobalProviderTracking = () => {
  useProviderLocationTracking();
  return null;
};
