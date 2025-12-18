import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Generate a beep sound using Web Audio API
const playBeep = (frequency: number, duration: number, times: number = 1) => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  const playOnce = (startTime: number) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.5, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration / 1000);
    
    oscillator.start(startTime);
    oscillator.stop(startTime + duration / 1000);
  };
  
  for (let i = 0; i < times; i++) {
    playOnce(audioContext.currentTime + (i * (duration + 100) / 1000));
  }
};

// Client registration: 1 short high beep
const playClientSound = () => {
  playBeep(800, 200, 1); // Single high beep
};

// Provider registration: 2 longer low beeps
const playProviderSound = () => {
  playBeep(500, 300, 2); // Two lower beeps
};

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
          const newProfile = payload.new as { role?: string; nombre?: string };
          
          if (newProfile.role === 'proveedor') {
            console.log('🚕 New PROVEEDOR registered:', newProfile.nombre);
            playProviderSound();
          } else {
            console.log('👤 New CLIENTE registered:', newProfile.nombre);
            playClientSound();
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
