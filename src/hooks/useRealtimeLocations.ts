import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  isNativeApp, 
  watchPosition, 
  clearWatch 
} from '@/utils/capacitorLocation';

export interface ProveedorLocation {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  updated_at: string;
  profiles?: {
    apodo: string | null;
    estado: 'available' | 'busy' | 'offline';
    telefono: string | null;
    provider_type: 'taxi' | 'ruta' | null;
    route_name: string | null;
    tarifa_km: number | null;
  };
  is_taxi?: boolean;
  is_bus?: boolean;
  is_private_driver?: boolean;
  route_producto_id?: string | null;
  proveedor_id?: string | null;
  unit_name?: string | null;
  driver_name?: string | null;
}

export const useRealtimeLocations = () => {
  const [locations, setLocations] = useState<ProveedorLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [watchId, setWatchId] = useState<string | null>(null);
  const isMounted = useRef(true);
  const locationsMapRef = useRef<Map<string, ProveedorLocation>>(new Map());

  // Carga inicial completa (con productos, etc.)
  const fetchFullData = useCallback(async () => {
    if (!isMounted.current) return;
    
    console.log('🔄 [fetchFullData] Carga completa iniciando...');
    
    const { data: activeProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, user_id, apodo, estado, telefono, provider_type, route_name, tarifa_km')
      .eq('role', 'proveedor')
      .in('estado', ['available', 'busy']);

    if (profilesError || !activeProfiles?.length) {
      console.log('⚠️ No hay proveedores activos');
      setLocations([]);
      setLoading(false);
      setInitialLoadDone(true);
      return;
    }

    const activeUserIds = activeProfiles.map(p => p.user_id);

    const { data: locationsData, error: locError } = await supabase
      .from('proveedor_locations')
      .select('*')
      .in('user_id', activeUserIds);

    if (locError || !locationsData?.length) {
      setLocations([]);
      setLoading(false);
      setInitialLoadDone(true);
      return;
    }

    const { data: proveedoresData } = await supabase
      .from('proveedores')
      .select('id, user_id')
      .in('user_id', activeUserIds);

    const proveedorMap = new Map(proveedoresData?.map(p => [p.user_id, p.id]) || []);
    const proveedorIds = proveedoresData?.map(p => p.id) || [];
    
    const { data: taxiCategory } = await supabase
      .from('categories')
      .select('id')
      .ilike('name', 'taxi')
      .maybeSingle();
    
    const { data: rutaCategory } = await supabase
      .from('product_categories')
      .select('id')
      .ilike('name', '%rutas de transporte%')
      .maybeSingle();
    
    // Buscar proveedores con productos de taxi
    let taxiQuery = supabase
      .from('productos')
      .select('proveedor_id')
      .in('proveedor_id', proveedorIds);
    
    if (taxiCategory?.id) {
      taxiQuery = taxiQuery.or(`category_id.eq.${taxiCategory.id},nombre.ilike.%taxi%,keywords.ilike.%taxi%`);
    } else {
      taxiQuery = taxiQuery.or('nombre.ilike.%taxi%,keywords.ilike.%taxi%');
    }
    
    const { data: taxiProducts } = await taxiQuery;
    const taxiProviderIds = new Set(taxiProducts?.map(p => p.proveedor_id) || []);

    // Buscar proveedores con productos de rutas (Ruta 1, Ruta 2, etc.)
    let rutaQuery = supabase
      .from('productos')
      .select('id, proveedor_id, nombre')
      .in('proveedor_id', proveedorIds);
    
    if (rutaCategory?.id) {
      rutaQuery = rutaQuery.eq('category_id', rutaCategory.id);
    } else {
      rutaQuery = rutaQuery.ilike('nombre', 'Ruta %');
    }
    
    const { data: rutaProducts } = await rutaQuery;
    const rutaProviderMap = new Map<string, { nombre: string; productoId: string }>(); // proveedor_id -> route info
    rutaProducts?.forEach(p => {
      if (!rutaProviderMap.has(p.proveedor_id)) {
        rutaProviderMap.set(p.proveedor_id, { nombre: p.nombre, productoId: p.id });
      }
    });

    // Buscar choferes privados activos (linked drivers)
    const { data: activeDrivers } = await supabase
      .from('choferes_empresa')
      .select('id, user_id, nombre')
      .eq('is_active', true)
      .not('user_id', 'is', null);
    
    const privateDriverUserIds = new Set(
      activeDrivers?.map(d => d.user_id).filter(Boolean) || []
    );

    // Fetch today's driver assignments to get the REAL route name
    const today = new Date().toISOString().split('T')[0];
    const driverIds = activeDrivers?.map(d => d.id) || [];
    
    let driverAssignmentMap = new Map<string, { routeName: string; productoId: string; unitName: string | null; driverName: string | null }>();
    
    if (driverIds.length > 0) {
      const { data: assignments } = await supabase
        .from('asignaciones_chofer')
        .select('chofer_id, producto_id, unidad_id, productos(nombre)')
        .in('chofer_id', driverIds)
        .eq('fecha', today);
      
      // Fetch unit names if any assignment has unidad_id
      const unitIds = assignments?.map(a => a.unidad_id).filter(Boolean) || [];
      let unitNameMap = new Map<string, string>();
      if (unitIds.length > 0) {
        const { data: unitsData } = await supabase
          .from('unidades_empresa')
          .select('id, nombre')
          .in('id', unitIds);
        unitsData?.forEach(u => unitNameMap.set(u.id, u.nombre));
      }
      
      if (assignments) {
        // Map chofer_id → user_id
        const choferToUser = new Map(
          activeDrivers?.map(d => [d.id, d.user_id]) || []
        );
        // Map chofer_id → driver name
        const choferNameMap = new Map(
          activeDrivers?.map(d => [d.id, d.nombre || null]) || []
        );
        
        for (const a of assignments) {
          const userId = choferToUser.get(a.chofer_id);
          if (userId) {
            driverAssignmentMap.set(userId, {
              routeName: (a.productos as any)?.nombre || 'Ruta',
              productoId: a.producto_id,
              unitName: a.unidad_id ? (unitNameMap.get(a.unidad_id) || null) : null,
              driverName: choferNameMap.get(a.chofer_id) || null,
            });
          }
        }
      }
    }
    
    console.log('[fetchFullData] Driver assignments today:', driverAssignmentMap.size);

    const newLocationsMap = new Map<string, ProveedorLocation>();
    
    for (const loc of locationsData) {
      const profile = activeProfiles.find(p => p.user_id === loc.user_id);
      if (!profile) continue;
      
      const proveedorId = proveedorMap.get(loc.user_id);
      const isPrivateDriver = privateDriverUserIds.has(loc.user_id);
      
      // Determine vehicle type: provider can be BOTH taxi AND bus if they have products in both categories
      const hasRutaProduct = proveedorId ? rutaProviderMap.has(proveedorId) : false;
      const rutaInfo = proveedorId ? rutaProviderMap.get(proveedorId) : null;
      const routeNameFromProduct = rutaInfo?.nombre || null;
      const hasTaxiProduct = proveedorId ? taxiProviderIds.has(proveedorId) : false;
      
      // A provider can have BOTH flags true if they have products in both categories
      // BUT private drivers should NOT show as taxis
      const isBus = profile.provider_type === 'ruta' || hasRutaProduct || isPrivateDriver;
      const isTaxi = isPrivateDriver ? false : (profile.provider_type === 'taxi' || hasTaxiProduct);
      
      const assignmentData = driverAssignmentMap.get(loc.user_id);
      
      const location: ProveedorLocation = {
        ...loc,
        profiles: {
          apodo: profile.apodo,
          estado: profile.estado as 'available' | 'busy' | 'offline',
          telefono: profile.telefono,
          provider_type: profile.provider_type as 'taxi' | 'ruta' | null,
          // For private drivers, use TODAY's assignment; otherwise fall back to profile/product
          route_name: isPrivateDriver 
            ? (assignmentData?.routeName || profile.route_name || null)
            : (profile.route_name || routeNameFromProduct || null),
          tarifa_km: (profile as any).tarifa_km || 15
        },
        is_taxi: isTaxi,
        is_bus: isBus,
        is_private_driver: isPrivateDriver,
        // Set route_producto_id for ALL bus providers (private drivers AND owners with route products)
        route_producto_id: isPrivateDriver
          ? (assignmentData?.productoId || rutaInfo?.productoId || null)
          : (isBus && rutaInfo ? rutaInfo.productoId : null),
        proveedor_id: proveedorId || null,
        unit_name: assignmentData?.unitName || null,
        driver_name: assignmentData?.driverName || null,
      };
      
      newLocationsMap.set(loc.user_id, location);
    }

    locationsMapRef.current = newLocationsMap;
    
    if (isMounted.current) {
      setLocations(Array.from(newLocationsMap.values()));
      setLoading(false);
      setInitialLoadDone(true);
    }
    
    console.log(`✅ [fetchFullData] ${newLocationsMap.size} proveedores cargados`);
  }, []);

  // Actualización rápida SOLO de coordenadas (para movimiento fluido)
  const updateLocationOnly = useCallback((userId: string, lat: number, lng: number) => {
    const existing = locationsMapRef.current.get(userId);
    if (!existing) return; // No existe, esperar a fetchFullData
    
    // Actualizar solo coordenadas
    existing.latitude = lat;
    existing.longitude = lng;
    existing.updated_at = new Date().toISOString();
    
    console.log(`🚀 [FAST] ${existing.profiles?.apodo}: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    
    if (isMounted.current) {
      setLocations(Array.from(locationsMapRef.current.values()));
    }
  }, []);

  // Polling rápido para ubicaciones (cada 1.5 segundos)
  const fetchLocationsOnly = useCallback(async () => {
    if (!isMounted.current) return;
    
    const { data: locationsData } = await supabase
      .from('proveedor_locations')
      .select('user_id, latitude, longitude, updated_at');
    
    if (!locationsData?.length) return;
    
    let hasChanges = false;
    
    for (const loc of locationsData) {
      const existing = locationsMapRef.current.get(loc.user_id);
      if (existing) {
        // Check if position actually changed
        if (Math.abs(existing.latitude - loc.latitude) > 0.000001 || 
            Math.abs(existing.longitude - loc.longitude) > 0.000001) {
          existing.latitude = loc.latitude;
          existing.longitude = loc.longitude;
          existing.updated_at = loc.updated_at;
          hasChanges = true;
          console.log(`🚀 [Poll] ${existing.profiles?.apodo}: ${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`);
        }
      }
    }
    
    if (hasChanges && isMounted.current) {
      setLocations(Array.from(locationsMapRef.current.values()));
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    
    // Carga inicial completa
    fetchFullData();

    // Suscripción a cambios de profiles (estado) - refetch completo
    const profilesChannel = supabase
      .channel('realtime-profiles-status')
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'profiles'
        },
        (payload: any) => {
          const newData = payload.new;
          const oldData = payload.old;
          
          if (newData?.role !== 'proveedor') return;
          
          if (oldData?.estado !== newData?.estado) {
            console.log(`🔄 [Estado] ${newData.apodo}: ${oldData?.estado} → ${newData.estado}`);
            fetchFullData(); // Refetch completo cuando cambia estado
          }
        }
      )
      .subscribe();

    // Suscripción a cambios de ubicaciones - ACTUALIZACIÓN RÁPIDA
    const locationsChannel = supabase
      .channel('realtime-locations-fast')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'proveedor_locations' },
        (payload: any) => {
          const data = payload.new;
          if (data?.user_id && data?.latitude && data?.longitude) {
            updateLocationOnly(data.user_id, data.latitude, data.longitude);
          }
        }
      )
      .subscribe();

    // Polling RÁPIDO cada 1.5 segundos para ubicaciones
    const fastPollInterval = setInterval(fetchLocationsOnly, 1500);
    
    // Polling lento cada 30 segundos para refetch completo (nuevos proveedores, etc.)
    const slowPollInterval = setInterval(fetchFullData, 30000);

    // Auto-track para proveedores
    const startProviderTracking = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (profile?.role === 'proveedor' && isNativeApp()) {
        try {
          const id = await watchPosition((position) => {
            updateLocation(position.latitude, position.longitude);
          });
          setWatchId(id);
        } catch (error) {
          console.error('[Provider Tracking] Error:', error);
        }
      }
    };

    startProviderTracking();

    return () => {
      isMounted.current = false;
      supabase.removeChannel(profilesChannel);
      supabase.removeChannel(locationsChannel);
      clearInterval(fastPollInterval);
      clearInterval(slowPollInterval);
      if (watchId) {
        clearWatch(watchId);
      }
    };
  }, [fetchFullData, fetchLocationsOnly, updateLocationOnly, watchId]);

  const updateLocation = async (latitude: number, longitude: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('proveedor_locations')
      .upsert({
        user_id: user.id,
        latitude,
        longitude,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      console.error('Error updating location:', error);
    }
  };

  return { locations, loading, initialLoadDone, updateLocation };
};
