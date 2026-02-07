import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  isNativeApp, 
  watchPosition, 
  clearWatch 
} from '@/utils/capacitorLocation';

export interface DriverAssignment {
  routeName: string;
  productoId: string;
  unitName: string | null;
  unitPlacas: string | null;
  unitDescripcion: string | null;
  driverName: string | null;
  empresaName: string | null;
}

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
  is_private_route?: boolean;
  route_producto_id?: string | null;
  proveedor_id?: string | null;
  empresa_name?: string | null;
  unit_name?: string | null;
  unit_placas?: string | null;
  unit_descripcion?: string | null;
  driver_name?: string | null;
  all_assignments?: DriverAssignment[];
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
    
    // Phase 1: Fetch profiles + categories in parallel (no dependencies)
    const [profilesResult, taxiCatResult, rutaCatResult] = await Promise.all([
      supabase.from('profiles')
        .select('id, user_id, apodo, estado, telefono, provider_type, route_name, tarifa_km')
        .eq('role', 'proveedor')
        .in('estado', ['available', 'busy']),
      supabase.from('categories')
        .select('id')
        .ilike('name', 'taxi')
        .maybeSingle(),
      supabase.from('product_categories')
        .select('id')
        .ilike('name', '%rutas de transporte%')
        .maybeSingle(),
    ]);

    const activeProfiles = profilesResult.data;
    if (profilesResult.error || !activeProfiles?.length) {
      console.log('⚠️ No hay proveedores activos');
      setLocations([]);
      setLoading(false);
      setInitialLoadDone(true);
      return;
    }

    const activeUserIds = activeProfiles.map(p => p.user_id);
    const taxiCategory = taxiCatResult.data;
    const rutaCategory = rutaCatResult.data;

    // Phase 2: Fetch locations, proveedores, drivers, products in parallel
    const [locResult, provResult, driversResult] = await Promise.all([
      supabase.from('proveedor_locations').select('*').in('user_id', activeUserIds),
      supabase.from('proveedores').select('id, user_id, nombre').in('user_id', activeUserIds),
      supabase.from('choferes_empresa')
        .select('id, user_id, nombre, proveedor_id, proveedores(nombre)')
        .eq('is_active', true)
        .not('user_id', 'is', null),
    ]);

    const locationsData = locResult.data;
    if (locResult.error || !locationsData?.length) {
      setLocations([]);
      setLoading(false);
      setInitialLoadDone(true);
      return;
    }

    const proveedoresData = provResult.data;
    const proveedorMap = new Map(proveedoresData?.map(p => [p.user_id, p.id]) || []);
    const proveedorNameMap = new Map(proveedoresData?.map(p => [p.user_id, p.nombre]) || []);
    const proveedorIds = proveedoresData?.map(p => p.id) || [];

    // Build a map of driver user_id → employer company name (via choferes_empresa)
    const driverEmployerMap = new Map<string, string>();
    const activeDrivers = driversResult.data;
    
    // Buscar productos de taxi y ruta en paralelo
    let taxiQuery = supabase
      .from('productos')
      .select('proveedor_id')
      .in('proveedor_id', proveedorIds);
    
    if (taxiCategory?.id) {
      taxiQuery = taxiQuery.or(`category_id.eq.${taxiCategory.id},nombre.ilike.%taxi%,keywords.ilike.%taxi%`);
    } else {
      taxiQuery = taxiQuery.or('nombre.ilike.%taxi%,keywords.ilike.%taxi%');
    }

    let rutaQuery = supabase
      .from('productos')
      .select('id, proveedor_id, nombre, is_private')
      .in('proveedor_id', proveedorIds);
    
    if (rutaCategory?.id) {
      rutaQuery = rutaQuery.eq('category_id', rutaCategory.id);
    } else {
      rutaQuery = rutaQuery.ilike('nombre', 'Ruta %');
    }
    
    const [taxiResult, rutaResult] = await Promise.all([taxiQuery, rutaQuery]);
    
    const taxiProviderIds = new Set(taxiResult.data?.map(p => p.proveedor_id) || []);
    const rutaProducts = rutaResult.data;
    const rutaProviderMap = new Map<string, { nombre: string; productoId: string; isPrivate: boolean }>(); 
    // Track providers with ANY private route
    const privateRouteOwnerIds = new Set<string>();
    
    rutaProducts?.forEach(p => {
      if (!rutaProviderMap.has(p.proveedor_id)) {
        rutaProviderMap.set(p.proveedor_id, { nombre: p.nombre, productoId: p.id, isPrivate: p.is_private || false });
      }
      if (p.is_private) {
        privateRouteOwnerIds.add(p.proveedor_id);
      }
    });
    
    const privateDriverUserIds = new Set(
      activeDrivers?.map(d => d.user_id).filter(Boolean) || []
    );

    // Map driver user_id → employer company name AND driver name fallback
    const driverNameFallbackMap = new Map<string, string>();
    activeDrivers?.forEach(d => {
      if (d.user_id && (d as any).proveedores?.nombre) {
        driverEmployerMap.set(d.user_id, (d as any).proveedores.nombre);
      }
      if (d.user_id && d.nombre) {
        driverNameFallbackMap.set(d.user_id, d.nombre);
      }
    });

    // Fetch today's driver assignments to get the REAL route name
    const today = new Date().toISOString().split('T')[0];
    const driverIds = activeDrivers?.map(d => d.id) || [];
    
    let driverAssignmentMap = new Map<string, DriverAssignment[]>();
    
    if (driverIds.length > 0) {
      const { data: assignments } = await supabase
        .from('asignaciones_chofer')
        .select('chofer_id, producto_id, unidad_id, productos(nombre)')
        .in('chofer_id', driverIds)
        .eq('fecha', today);
      
      // Fetch unit details (nombre + placas) if any assignment has unidad_id
      const unitIds = assignments?.map(a => a.unidad_id).filter(Boolean) || [];
      let unitDataMap = new Map<string, { nombre: string; placas: string | null; descripcion: string | null }>();
      if (unitIds.length > 0) {
        const { data: unitsData } = await supabase
          .from('unidades_empresa')
          .select('id, nombre, placas, descripcion')
          .in('id', unitIds);
        unitsData?.forEach(u => unitDataMap.set(u.id, { nombre: u.nombre, placas: u.placas, descripcion: u.descripcion }));
      }

      // Fallback: for assignments without unit, get last known unit per chofer (parallel)
      const choferesSinUnidad = assignments?.filter(a => !a.unidad_id).map(a => a.chofer_id) || [];
      let fallbackUnitMap = new Map<string, { nombre: string; placas: string | null; descripcion: string | null }>();
      if (choferesSinUnidad.length > 0) {
        const fallbackResults = await Promise.all(
          choferesSinUnidad.map(choferId =>
            supabase
              .from('asignaciones_chofer')
              .select('unidades_empresa(nombre, placas, descripcion)')
              .eq('chofer_id', choferId)
              .not('unidad_id', 'is', null)
              .order('fecha', { ascending: false })
              .limit(1)
              .maybeSingle()
              .then(res => ({ choferId, data: res.data }))
          )
        );
        for (const { choferId, data: lastUnit } of fallbackResults) {
          if (lastUnit?.unidades_empresa) {
            const u = lastUnit.unidades_empresa as any;
            fallbackUnitMap.set(choferId, { nombre: u.nombre, placas: u.placas, descripcion: u.descripcion });
          }
        }
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
            const unitData = a.unidad_id 
              ? unitDataMap.get(a.unidad_id) 
              : fallbackUnitMap.get(a.chofer_id) || null;
            const driverRec = activeDrivers?.find(d => d.id === a.chofer_id);
            const empresaName = driverRec ? (driverRec as any).proveedores?.nombre : null;
            
            const entry: DriverAssignment = {
              routeName: (a.productos as any)?.nombre || 'Ruta',
              productoId: a.producto_id,
              unitName: unitData?.nombre || null,
              unitPlacas: unitData?.placas || null,
              unitDescripcion: unitData?.descripcion || null,
              driverName: choferNameMap.get(a.chofer_id) || null,
              empresaName: empresaName || null,
            };
            
            const existing = driverAssignmentMap.get(userId) || [];
            existing.push(entry);
            driverAssignmentMap.set(userId, existing);
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
      const isPrivateRouteOwner = proveedorId ? privateRouteOwnerIds.has(proveedorId) : false;
      
      // Determine vehicle type
      const hasRutaProduct = proveedorId ? rutaProviderMap.has(proveedorId) : false;
      const rutaInfo = proveedorId ? rutaProviderMap.get(proveedorId) : null;
      const routeNameFromProduct = rutaInfo?.nombre || null;
      const hasTaxiProduct = proveedorId ? taxiProviderIds.has(proveedorId) : false;
      
      // Private route = chofer assigned to private route OR owner with private routes
      const isPrivateRoute = isPrivateDriver || isPrivateRouteOwner;
      
      const isBus = profile.provider_type === 'ruta' || hasRutaProduct || isPrivateDriver;
      // Private drivers/owners should NOT show as taxis
      const isTaxi = isPrivateRoute ? false : (profile.provider_type === 'taxi' || hasTaxiProduct);
      
      const allAssignments = driverAssignmentMap.get(loc.user_id) || [];
      const firstAssignment = allAssignments[0] || null;
      
      const location: ProveedorLocation = {
        ...loc,
        profiles: {
          apodo: profile.apodo,
          estado: profile.estado as 'available' | 'busy' | 'offline',
          telefono: profile.telefono,
          provider_type: profile.provider_type as 'taxi' | 'ruta' | null,
          // For private drivers, use TODAY's first assignment; otherwise fall back to profile/product
          route_name: isPrivateDriver 
            ? (firstAssignment?.routeName || profile.route_name || null)
            : (profile.route_name || routeNameFromProduct || null),
          tarifa_km: (profile as any).tarifa_km || 15
        },
        is_taxi: isTaxi,
        is_bus: isBus,
        is_private_driver: isPrivateDriver,
        is_private_route: isPrivateRoute,
        // Set route_producto_id for ALL bus providers
        route_producto_id: isPrivateDriver
          ? (firstAssignment?.productoId || rutaInfo?.productoId || null)
          : (isBus && rutaInfo ? rutaInfo.productoId : null),
        // For private drivers, use employer's proveedor_id for favorites/linking
        proveedor_id: isPrivateDriver
          ? (activeDrivers?.find(d => d.user_id === loc.user_id)?.proveedor_id || proveedorId || null)
          : (proveedorId || null),
        // For private drivers, use employer company name instead of their own provider entry
        empresa_name: isPrivateDriver 
          ? (firstAssignment?.empresaName || driverEmployerMap.get(loc.user_id) || proveedorNameMap.get(loc.user_id) || null)
          : (proveedorNameMap.get(loc.user_id) || null),
        unit_name: firstAssignment?.unitName || null,
        unit_placas: firstAssignment?.unitPlacas || null,
        unit_descripcion: firstAssignment?.unitDescripcion || null,
        driver_name: firstAssignment?.driverName || (isPrivateDriver ? driverNameFallbackMap.get(loc.user_id) : null) || null,
        all_assignments: allAssignments.length > 0 ? allAssignments : undefined,
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
    if (!existing) return;
    
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
        if (Math.abs(existing.latitude - loc.latitude) > 0.000001 || 
            Math.abs(existing.longitude - loc.longitude) > 0.000001) {
          existing.latitude = loc.latitude;
          existing.longitude = loc.longitude;
          existing.updated_at = loc.updated_at;
          hasChanges = true;
        }
      }
    }
    
    if (hasChanges && isMounted.current) {
      setLocations(Array.from(locationsMapRef.current.values()));
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    
    fetchFullData();

    const profilesChannel = supabase
      .channel('realtime-profiles-status')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload: any) => {
          const newData = payload.new;
          const oldData = payload.old;
          if (newData?.role !== 'proveedor') return;
          // Refresh on estado change OR route_name change
          if (oldData?.estado !== newData?.estado || oldData?.route_name !== newData?.route_name) {
            console.log(`🔄 [Profile] ${newData.apodo}: estado=${newData.estado}, route=${newData.route_name}`);
            fetchFullData();
          }
        }
      )
      .subscribe();

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

    // Listen for assignment changes to update route names, units, etc. in real-time
    const assignmentsChannel = supabase
      .channel('realtime-assignments-map')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'asignaciones_chofer' },
        () => {
          console.log('🔄 [Map] Assignment changed — refreshing full data');
          fetchFullData();
        }
      )
      .subscribe();

    // Realtime channels handle most updates; polling is a safety net
    const fastPollInterval = setInterval(fetchLocationsOnly, 3000);
    const slowPollInterval = setInterval(fetchFullData, 30000);

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
      supabase.removeChannel(assignmentsChannel);
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