import { useProviderLocationTracking } from '@/hooks/useProviderLocationTracking';
import { LocationPermissionGuide } from '@/components/LocationPermissionGuide';

/**
 * Componente que activa el tracking global de ubicación
 * para proveedores en cualquier página de la aplicación.
 * También muestra la guía de permisos de ubicación en Android.
 */
export const GlobalProviderTracking = () => {
  const { showPermissionGuide, closePermissionGuide } = useProviderLocationTracking();
  
  return (
    <LocationPermissionGuide 
      open={showPermissionGuide} 
      onClose={closePermissionGuide} 
    />
  );
};
