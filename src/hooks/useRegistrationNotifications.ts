import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { playClientRegistrationSound, playProviderRegistrationSound } from '@/lib/sounds';

export const useRegistrationNotifications = () => {
  const isInitialized = useRef(false);

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    console.log('🔔 Registration notifications listener started');

    const channel = supabase
      .channel('new-registrations')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'profiles'
        },
        (payload) => {
          console.log('🆕 New registration detected:', payload);
          const newProfile = payload.new as { role?: string; nombre?: string; apodo?: string; telefono?: string };
          
          if (newProfile.role === 'proveedor') {
            console.log('🚕 New PROVEEDOR registered:', newProfile.nombre);
            playProviderRegistrationSound();
          } else {
            console.log('👤 New CLIENTE registered:', newProfile.nombre);
            playClientRegistrationSound();
          }

          // Send WhatsApp welcome message to new user
          if (newProfile.telefono) {
            supabase.functions.invoke('send-whatsapp-welcome', {
              body: {
                phoneNumber: newProfile.telefono,
                userName: newProfile.nombre || 'Usuario',
                userType: newProfile.role || 'cliente',
                apodo: newProfile.apodo || newProfile.nombre || 'Usuario',
              }
            }).then(({ error }) => {
              if (error) console.error('❌ WhatsApp welcome error:', error);
              else console.log('✅ WhatsApp welcome sent to', newProfile.telefono);
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Registration channel status:', status);
      });

    return () => {
      console.log('🔔 Registration notifications listener stopped');
      supabase.removeChannel(channel);
    };
  }, []);
};
