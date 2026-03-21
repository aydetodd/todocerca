import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getHermosilloToday } from '@/lib/utils';
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
  route_type?: string | null;
  route_producto_id?: string | null;
  proveedor_id?: string | null;
  empresa_name?: string | null;
  unit_name?: string | null;
  unit_placas?: string | null;
  unit_descripcion?: string | null;
  driver_name?: string | null;
  all_assignments?: DriverAssignment[];
  all_route_producto_ids?: string[];
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
      supabase.from('product_categories')
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
    const proveedorByIdNameMap = new Map(proveedoresData?.map(p => [p.id, p.nombre]) || []);
    const proveedorIds = proveedoresData?.map(p => p.id) || [];

    // Build a map of driver user_id → employer company name (via choferes_empresa)
    const driverEmployerMap = new Map<string, string>();
    const activeDrivers = driversResult.data;

    // Buscar productos de taxi y ruta en paralelo
    let taxiQuery = supabase
      .from('productos')
      .select('proveedor_id, precio')
      .in('proveedor_id', proveedorIds);

    if (taxiCategory?.id) {
      taxiQuery = taxiQuery.or(`category_id.eq.${taxiCategory.id},nombre.ilike.%taxi%,keywords.ilike.%taxi%,route_type.eq.taxi`);
    } else {
      taxiQuery = taxiQuery.or('nombre.ilike.%taxi%,keywords.ilike.%taxi%,route_type.eq.taxi');
    }

    let rutaQuery = supabase
      .from('productos')
      .select('id, proveedor_id, nombre, is_private, route_type')
      .in('proveedor_id', proveedorIds);

    if (rutaCategory?.id) {
      rutaQuery = rutaQuery.eq('category_id', rutaCategory.id);
    } else {
      rutaQuery = rutaQuery.ilike('nombre', 'Ruta %');
    }

    const [taxiResult, rutaResult] = await Promise.all([taxiQuery, rutaQuery]);

    const taxiProviderIds = new Set(taxiResult.data?.map(p => p.proveedor_id) || []);
    console.log('[fetchFullData] Taxi detection:', { taxiCategoryId: taxiCategory?.id, taxiProducts: taxiResult.data?.length, taxiProviderCount: taxiProviderIds.size });
    // Build map of proveedor_id → taxi product price (use the product's precio, not profiles.tarifa_km)
    const taxiPriceMap = new Map<string, number>();
    taxiResult.data?.forEach(p => {
      if (!taxiPriceMap.has(p.proveedor_id)) {
        taxiPriceMap.set(p.proveedor_id, p.precio);
      }
    });

    const rutaProducts = rutaResult.data;
    const rutaProviderMap = new Map<string, { nombre: string; productoId: string; isPrivate: boolean; routeType: string | null }>();
    const providerRouteProductsMap = new Map<string, Array<{ id: string; nombre: string; isPrivate: boolean; routeType: string | null }>>();
    // Track ALL route product IDs per provider (for multi-route filtering)
    const providerAllRouteIds = new Map<string, string[]>();
    // Track individual product privacy: productoId → isPrivate
    const productoPrivacyMap = new Map<string, boolean>();
    const productoRouteTypeMap = new Map<string, string | null>();

    rutaProducts?.forEach(p => {
      if (!rutaProviderMap.has(p.proveedor_id)) {
        rutaProviderMap.set(p.proveedor_id, {
          nombre: p.nombre,
          productoId: p.id,
          isPrivate: p.is_private || false,
          routeType: (p as any).route_type || null,
        });
      }

      const existing = providerAllRouteIds.get(p.proveedor_id) || [];
      existing.push(p.id);
      providerAllRouteIds.set(p.proveedor_id, existing);

      const existingRouteProducts = providerRouteProductsMap.get(p.proveedor_id) || [];
      existingRouteProducts.push({
        id: p.id,
        nombre: p.nombre,
        isPrivate: p.is_private || false,
        routeType: (p as any).route_type || null,
      });
      providerRouteProductsMap.set(p.proveedor_id, existingRouteProducts);

      productoPrivacyMap.set(p.id, p.is_private || false);
      productoRouteTypeMap.set(p.id, (p as any).route_type || null);
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
    const today = getHermosilloToday();
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

    const normalizeRouteName = (name: string | null | undefined) => name?.trim().toLowerCase() || '';
    const newLocationsMap = new Map<string, ProveedorLocation>();

    for (const loc of locationsData) {
      const profile = activeProfiles.find(p => p.user_id === loc.user_id);
      if (!profile) continue;

      const proveedorId = proveedorMap.get(loc.user_id);
      const isPrivateDriver = privateDriverUserIds.has(loc.user_id);
      const driverRecord = activeDrivers?.find(d => d.user_id === loc.user_id) || null;
      const effectiveProveedorId = isPrivateDriver
        ? (driverRecord?.proveedor_id || proveedorId || null)
        : (proveedorId || null);

      // Determine vehicle type with employer provider context for choferes
      const hasRutaProduct = effectiveProveedorId ? rutaProviderMap.has(effectiveProveedorId) : false;
      const rutaInfo = effectiveProveedorId ? rutaProviderMap.get(effectiveProveedorId) : null;
      const routeNameFromProduct = rutaInfo?.nombre || null;
      const hasTaxiProduct = effectiveProveedorId ? taxiProviderIds.has(effectiveProveedorId) : false;
      const routeProductsForProvider = effectiveProveedorId ? (providerRouteProductsMap.get(effectiveProveedorId) || []) : [];

      const allAssignments = driverAssignmentMap.get(loc.user_id) || [];
      const normalizedProfileRouteName = normalizeRouteName(profile.route_name);
      const profileMatchedAssignment = normalizedProfileRouteName
        ? allAssignments.find(a => normalizeRouteName(a.routeName) === normalizedProfileRouteName)
        : null;
      const activeAssignment = profileMatchedAssignment || allAssignments[0] || null;
      const orderedAssignments = activeAssignment
        ? [
            activeAssignment,
            ...allAssignments.filter(
              a => !(a.productoId === activeAssignment.productoId && a.routeName === activeAssignment.routeName)
            ),
          ]
        : allAssignments;

      // Fallback when assignment rows are not readable (RLS): use profile.route_name + provider route catalog
      const profileMatchedRouteProduct = normalizedProfileRouteName
        ? routeProductsForProvider.find(r => normalizeRouteName(r.nombre) === normalizedProfileRouteName) || null
        : null;

      // Determine the specific route/product currently ACTIVE for this location
      const specificProductoId = isPrivateDriver
        ? (activeAssignment?.productoId || profileMatchedRouteProduct?.id || null)
        : (hasRutaProduct && rutaInfo ? rutaInfo.productoId : null);

      // Private/public route is determined by the exact active product
      const isPrivateRoute = specificProductoId
        ? (productoPrivacyMap.get(specificProductoId) ?? false)
        : false;

      // Drivers appear as bus only when there is an active route assignment/product context
      const isBus = isPrivateDriver
        ? !!specificProductoId
        : (profile.provider_type === 'ruta' || hasRutaProduct);

      // Keep taxi behavior for non-private-route contexts
      const isTaxi = isPrivateRoute ? false : (profile.provider_type === 'taxi' || hasTaxiProduct);

      const fallbackEmpresaName = isPrivateDriver
        ? (driverEmployerMap.get(loc.user_id)
            || (effectiveProveedorId ? proveedorByIdNameMap.get(effectiveProveedorId) : null)
            || proveedorNameMap.get(loc.user_id)
            || null)
        : (proveedorNameMap.get(loc.user_id)
            || (effectiveProveedorId ? proveedorByIdNameMap.get(effectiveProveedorId) : null)
            || null);

      const fallbackAssignment: DriverAssignment[] = (!orderedAssignments.length && specificProductoId)
        ? [{
            routeName: profileMatchedRouteProduct?.nombre || profile.route_name || routeNameFromProduct || 'Ruta',
            productoId: specificProductoId,
            unitName: null,
            unitPlacas: null,
            unitDescripcion: null,
            driverName: isPrivateDriver ? (driverNameFallbackMap.get(loc.user_id) || null) : null,
            empresaName: fallbackEmpresaName,
          }]
        : [];

      const assignmentsForLocation = orderedAssignments.length > 0 ? orderedAssignments : fallbackAssignment;
      const activeAssignmentForDisplay = assignmentsForLocation[0] || null;

      const location: ProveedorLocation = {
        ...loc,
        profiles: {
          apodo: profile.apodo,
          estado: profile.estado as 'available' | 'busy' | 'offline',
          telefono: profile.telefono,
          provider_type: profile.provider_type as 'taxi' | 'ruta' | null,
          // Keep strict route source but recover from profile.route_name when assignment rows are not visible
          route_name: isPrivateDriver
            ? (activeAssignmentForDisplay?.routeName || profile.route_name || profileMatchedRouteProduct?.nombre || null)
            : (profile.route_name || routeNameFromProduct || null),
          // Use taxi product price first, then profile tarifa_km, then default 15
          tarifa_km: (effectiveProveedorId && taxiPriceMap.get(effectiveProveedorId)) || (profile as any).tarifa_km || 15
        },
        is_taxi: isTaxi,
        is_bus: isBus,
        is_private_driver: isPrivateDriver,
        is_private_route: isPrivateRoute,
        route_type: specificProductoId
          ? (productoRouteTypeMap.get(specificProductoId) ?? profileMatchedRouteProduct?.routeType ?? null)
          : (rutaInfo?.routeType || null),
        route_producto_id: specificProductoId,
        // For private drivers, use employer's proveedor_id for favorites/linking
        proveedor_id: isPrivateDriver
          ? (driverRecord?.proveedor_id || effectiveProveedorId || null)
          : (effectiveProveedorId || null),
        // For private drivers, use employer company name instead of their own provider entry
        empresa_name: isPrivateDriver
          ? (activeAssignmentForDisplay?.empresaName || fallbackEmpresaName)
          : fallbackEmpresaName,
        unit_name: activeAssignmentForDisplay?.unitName || null,
        unit_placas: activeAssignmentForDisplay?.unitPlacas || null,
        unit_descripcion: activeAssignmentForDisplay?.unitDescripcion || null,
        driver_name: activeAssignmentForDisplay?.driverName || (isPrivateDriver ? driverNameFallbackMap.get(loc.user_id) : null) || null,
        all_assignments: assignmentsForLocation.length > 0 ? assignmentsForLocation : undefined,
        // For strict route isolation, private drivers expose only their active route id.
        all_route_producto_ids: isPrivateDriver
          ? (specificProductoId ? [specificProductoId] : [])
          : (effectiveProveedorId ? providerAllRouteIds.get(effectiveProveedorId) || [] : []),
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