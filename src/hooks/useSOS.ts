import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useContacts } from './useContacts';

interface SOSAlert {
  id: string;
  user_id: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  created_at: string;
  expires_at: string;
  share_token: string;
}

export const useSOS = () => {
  const [activeAlert, setActiveAlert] = useState<SOSAlert | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const { toast } = useToast();
  const { contacts } = useContacts();

  // Verificar si hay una alerta activa al cargar
  useEffect(() => {
    const checkActiveAlert = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('sos_alerts')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setActiveAlert(data as SOSAlert);
      }
    };

    checkActiveAlert();

    // Suscribirse a cambios
    const channel = supabase
      .channel('sos_alerts_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sos_alerts' },
        () => checkActiveAlert()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Obtener ubicación actual
  const getCurrentLocation = (): Promise<{ latitude: number; longitude: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  // Generar link compartible
  const getShareLink = (token: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/sos/${token}`;
  };

  // Activar SOS
  const activateSOS = useCallback(async () => {
    setLoading(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Error",
          description: "Debes iniciar sesión para usar SOS",
          variant: "destructive",
        });
        return false;
      }

      // Obtener ubicación
      const location = await getCurrentLocation();

      // Crear alerta SOS
      const { data: alert, error } = await supabase
        .from('sos_alerts')
        .insert({
          user_id: user.id,
          latitude: location?.latitude || null,
          longitude: location?.longitude || null,
        })
        .select()
        .single();

      if (error) throw error;

      setActiveAlert(alert as SOSAlert);

      // Obtener perfil del usuario
      const { data: profile } = await supabase
        .from('profiles')
        .select('apodo, nombre, telefono')
        .eq('user_id', user.id)
        .single();

      const userName = profile?.apodo || profile?.nombre || 'Un contacto';
      const userPhone = profile?.telefono || '';
      const shareLink = getShareLink(alert.share_token);

      // Enviar mensajes de pánico a contactos
      setSending(true);
      
      for (const contact of contacts) {
        // Enviar mensaje de pánico en la app
        await supabase.from('messages').insert({
          sender_id: user.id,
          receiver_id: contact.contact_user_id,
          message: `🆘 ¡EMERGENCIA! ${userName} necesita ayuda. Ver ubicación: ${shareLink}`,
          is_panic: true,
        });
      }

      toast({
        title: "🆘 SOS Activado",
        description: `Alerta enviada a ${contacts.length} contactos`,
        variant: "destructive",
      });

      // Si hay teléfono, ofrecer compartir por WhatsApp
      if (contacts.length === 0) {
        toast({
          title: "Sin contactos",
          description: "Agrega contactos de confianza para que reciban tus alertas SOS",
        });
      }

      return true;
    } catch (error) {
      console.error('Error activating SOS:', error);
      toast({
        title: "Error",
        description: "No se pudo activar el SOS",
        variant: "destructive",
      });
      return false;
    } finally {
      setLoading(false);
      setSending(false);
    }
  }, [contacts, toast]);

  // Cancelar SOS
  const cancelSOS = useCallback(async () => {
    if (!activeAlert) return;

    try {
      const { error } = await supabase
        .from('sos_alerts')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', activeAlert.id);

      if (error) throw error;

      // Notificar a contactos que la alerta fue cancelada
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        for (const contact of contacts) {
          await supabase.from('messages').insert({
            sender_id: user.id,
            receiver_id: contact.contact_user_id,
            message: '✅ Alerta SOS cancelada - Todo está bien',
            is_panic: false,
          });
        }
      }

      setActiveAlert(null);
      toast({
        title: "SOS Cancelado",
        description: "Tus contactos han sido notificados",
      });
    } catch (error) {
      console.error('Error cancelling SOS:', error);
      toast({
        title: "Error",
        description: "No se pudo cancelar el SOS",
        variant: "destructive",
      });
    }
  }, [activeAlert, contacts, toast]);

  // Actualizar ubicación de alerta activa
  const updateLocation = useCallback(async () => {
    if (!activeAlert) return;

    const location = await getCurrentLocation();
    if (!location) return;

    await supabase
      .from('sos_alerts')
      .update({
        latitude: location.latitude,
        longitude: location.longitude,
      })
      .eq('id', activeAlert.id);
  }, [activeAlert]);

  // Actualizar ubicación periódicamente si hay alerta activa
  useEffect(() => {
    if (!activeAlert) return;

    const interval = setInterval(updateLocation, 30000); // Cada 30 segundos
    return () => clearInterval(interval);
  }, [activeAlert, updateLocation]);

  return {
    activeAlert,
    loading,
    sending,
    activateSOS,
    cancelSOS,
    getShareLink: activeAlert ? () => getShareLink(activeAlert.share_token) : null,
    contactCount: contacts.length,
  };
};
