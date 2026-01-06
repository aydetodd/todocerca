import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isNativeApp } from '@/utils/capacitorLocation';

export interface MemberLocation {
  id: string;
  user_id: string;
  group_id: string;
  latitude: number;
  longitude: number;
  updated_at: string;
  member?: {
    nickname: string;
    is_owner: boolean;
    estado?: string;
  };
}

export const useTrackingLocations = (groupId: string | null) => {
  const [locations, setLocations] = useState<MemberLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const isFetching = useRef(false);
  const lastFetchTime = useRef(0);

  const fetchLocations = useCallback(async (source?: string) => {
    if (!groupId) return;
    
    // Evitar fetches simultáneos
    if (isFetching.current) {
      console.log('[REALTIME] Skipping fetch, already in progress');
      return;
    }

    // Throttle: mínimo 200ms entre fetches
    const now = Date.now();
    if (now - lastFetchTime.current < 200) {
      console.log('[REALTIME] Throttling fetch');
      return;
    }

    isFetching.current = true;
    lastFetchTime.current = now;

    try {
      console.log('[REALTIME] Fetching locations, source:', source || 'manual');

      // Obtener miembros del grupo
      const { data: membersData, error: membersError } = await supabase
        .from('tracking_group_members')
        .select('user_id, nickname, is_owner')
        .eq('group_id', groupId);

      if (membersError) throw membersError;

      const memberUserIds = membersData?.map(m => m.user_id) || [];

      if (memberUserIds.length === 0) {
        setLocations([]);
        return;
      }

      // Obtener ubicaciones y perfiles en paralelo
      const [locationsResult, profilesResult] = await Promise.all([
        supabase
          .from('tracking_member_locations')
          .select('*')
          .eq('group_id', groupId),
        supabase
          .from('profiles')
          .select('user_id, estado')
          .in('user_id', memberUserIds)
      ]);

      if (locationsResult.error) throw locationsResult.error;
      if (profilesResult.error) throw profilesResult.error;

      const locationsData = locationsResult.data;
      const profilesData = profilesResult.data;

      console.log('[REALTIME] Profiles states:', profilesData?.map(p => ({
        id: p.user_id.slice(-6),
        estado: p.estado
      })));

      // Combinar datos y filtrar por estado
      const merged = locationsData?.map(loc => {
        const member = membersData?.find(m => m.user_id === loc.user_id);
        const profile = profilesData?.find(p => p.user_id === loc.user_id);
        
        return {
          ...loc,
          member: member ? {
            ...member,
            estado: profile?.estado
          } : undefined
        };
      }).filter(loc => {
        const estado = loc.member?.estado;
        const shouldShow = estado !== 'offline';
        return shouldShow;
      }) || [];

      console.log('[REALTIME] Visible locations:', merged.length, 'of', locationsData?.length);
      setLocations(merged);
    } catch (error) {
      console.error('Error fetching locations:', error);
    } finally {
      isFetching.current = false;
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (!groupId) {
      setLoading(false);
      return;
    }

    // Fetch inicial
    fetchLocations('initial');

    // Canal único para este grupo
    const channelName = `tracking_${groupId}`;
    
    const channel = supabase.channel(channelName, {
      config: { presence: { key: groupId } }
    });

    // Escuchar cambios en ubicaciones
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tracking_member_locations',
        filter: `group_id=eq.${groupId}`
      },
      () => {
        fetchLocations('location_change');
      }
    );

    // Escuchar TODOS los cambios en profiles (INSERT, UPDATE, DELETE)
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'profiles'
      },
      (payload) => {
        console.log('[REALTIME] Profile change:', payload.eventType, (payload.new as any)?.estado || (payload.old as any)?.estado);
        // Delay pequeño para asegurar consistencia
        setTimeout(() => fetchLocations('profile_change'), 150);
      }
    );

    channel.subscribe((status) => {
      console.log('[REALTIME] Channel status:', status);
      if (status === 'SUBSCRIBED') {
        // Refetch cuando se suscribe exitosamente
        fetchLocations('subscribed');
      }
    });

    // Polling de respaldo cada 5 segundos para garantizar sincronización
    const pollInterval = setInterval(() => {
      fetchLocations('poll');
    }, 5000);

    return () => {
      console.log('[REALTIME] Cleanup channel:', channelName);
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [groupId, fetchLocations]);

  const updateMyLocation = async (latitude: number, longitude: number) => {
    if (!groupId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const source = isNativeApp() ? 'capacitor' : 'web';
      console.log(`[${source.toUpperCase()}] Updating location`);

      const { error } = await supabase
        .from('tracking_member_locations')
        .upsert({
          user_id: user.id,
          group_id: groupId,
          latitude,
          longitude,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,group_id'
        });

      if (error) throw error;

      // También actualizar proveedor_locations si es proveedor
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (profileData?.role === 'proveedor') {
        await supabase
          .from('proveedor_locations')
          .upsert({
            user_id: user.id,
            latitude,
            longitude,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id'
          });
      }
    } catch (error) {
      console.error('Error updating location:', error);
    }
  };

  return {
    locations,
    loading,
    updateMyLocation
  };
};
