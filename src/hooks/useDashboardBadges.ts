import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface DashboardBadges {
  apartados: number;
  citas: number;
  taxi: number;
  mensajes: number;
}

export const useDashboardBadges = (proveedorId: string | null, userId: string | null, isTaxi: boolean) => {
  const [badges, setBadges] = useState<DashboardBadges>({ apartados: 0, citas: 0, taxi: 0, mensajes: 0 });
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);

  useEffect(() => {
    if (!userId) return;

    const fetchCounts = async () => {
      const newBadges: DashboardBadges = { apartados: 0, citas: 0, taxi: 0, mensajes: 0 };

      // Unread messages
      const { count: msgCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', userId)
        .eq('is_read', false);
      newBadges.mensajes = msgCount || 0;

      if (proveedorId) {
        // Pending orders (not yet seen/prepared)
        const { count: orderCount } = await supabase
          .from('pedidos')
          .select('*', { count: 'exact', head: true })
          .eq('proveedor_id', proveedorId)
          .eq('estado', 'pendiente');
        newBadges.apartados = orderCount || 0;

        // Pending appointments
        const { count: citaCount } = await supabase
          .from('citas')
          .select('*', { count: 'exact', head: true })
          .eq('proveedor_id', proveedorId)
          .eq('estado', 'pendiente');
        newBadges.citas = citaCount || 0;
      }

      if (isTaxi) {
        // Pending taxi requests
        const { count: taxiCount } = await supabase
          .from('taxi_requests')
          .select('*', { count: 'exact', head: true })
          .eq('driver_id', userId)
          .eq('status', 'pending');
        newBadges.taxi = taxiCount || 0;
      }

      setBadges(newBadges);
    };

    fetchCounts();

    // Real-time subscriptions
    const channels: ReturnType<typeof supabase.channel>[] = [];

    // Messages channel
    const msgCh = supabase
      .channel('badge-messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${userId}` }, () => fetchCounts())
      .subscribe();
    channels.push(msgCh);

    if (proveedorId) {
      const orderCh = supabase
        .channel('badge-orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `proveedor_id=eq.${proveedorId}` }, () => fetchCounts())
        .subscribe();
      channels.push(orderCh);

      const citaCh = supabase
        .channel('badge-citas')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'citas', filter: `proveedor_id=eq.${proveedorId}` }, () => fetchCounts())
        .subscribe();
      channels.push(citaCh);
    }

    if (isTaxi) {
      const taxiCh = supabase
        .channel('badge-taxi')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'taxi_requests', filter: `driver_id=eq.${userId}` }, () => fetchCounts())
        .subscribe();
      channels.push(taxiCh);
    }

    channelsRef.current = channels;

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [userId, proveedorId, isTaxi]);

  return badges;
};
