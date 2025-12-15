import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MessageCircle, Home } from 'lucide-react';
import { StatusControl } from '@/components/StatusControl';
import { RealtimeMap } from '@/components/RealtimeMap';
import { MessagingPanel } from '@/components/MessagingPanel';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useBackgroundTracking } from '@/hooks/useBackgroundTracking';

export default function MapView() {
  const [isMessagingOpen, setIsMessagingOpen] = useState(false);
  const [selectedReceiverId, setSelectedReceiverId] = useState<string | undefined>();
  const [selectedReceiverName, setSelectedReceiverName] = useState<string | undefined>();
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [isProvider, setIsProvider] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const watchIdRef = useRef<number | null>(null);

  // Enable background tracking for providers (always active to keep location updated)
  useBackgroundTracking(isProvider, null);

  // Web geolocation tracking for providers (works in browser/PWA)
  useEffect(() => {
    // Track location if provider (with or without subscription for testing)
    if (!isProvider) return;

    const updateProviderLocation = async (latitude: number, longitude: number) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      console.log('[MapView] 📍 Actualizando ubicación proveedor:', { 
        latitude: latitude.toFixed(6), 
        longitude: longitude.toFixed(6),
        time: new Date().toISOString()
      });

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
        console.error('[MapView] Error updating location:', error);
      }
    };

    // Start watching position with browser geolocation
    if ('geolocation' in navigator) {
      console.log('[MapView] 🛰️ Iniciando tracking de ubicación para proveedor...');
      
      // Get initial position immediately
      navigator.geolocation.getCurrentPosition(
        (position) => {
          updateProviderLocation(position.coords.latitude, position.coords.longitude);
        },
        (error) => console.error('[MapView] Initial position error:', error),
        { enableHighAccuracy: true }
      );
      
      // Then watch for changes
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          updateProviderLocation(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.error('[MapView] Geolocation error:', error);
          toast({
            title: "Error de GPS",
            description: "No se pudo obtener tu ubicación. Verifica los permisos.",
            variant: "destructive"
          });
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0 // Always get fresh position
        }
      );
      
      watchIdRef.current = watchId;
      
      toast({
        title: "📍 GPS Activo",
        description: "Tu ubicación se actualiza en tiempo real",
      });
    } else {
      toast({
        title: "GPS no disponible",
        description: "Tu navegador no soporta geolocalización",
        variant: "destructive"
      });
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        console.log('[MapView] 🛑 Tracking detenido');
      }
    };
  }, [isProvider, toast]);

  useEffect(() => {
    const checkSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if user is a provider
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('user_id', user.id)
        .single();

      if (profile?.role === 'proveedor') {
        setIsProvider(true);

        console.log('[MapView] Syncing subscription from Stripe...');
        toast({
          title: "Verificando suscripción...",
          description: "Sincronizando con Stripe",
        });
        
        // Call check-subscription to sync from Stripe
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          try {
            const { data: syncResult, error: syncError } = await supabase.functions.invoke(
              'check-subscription',
              {
                headers: {
                  Authorization: `Bearer ${session.access_token}`
                }
              }
            );

            if (syncError) {
              console.error('[MapView] Error syncing subscription:', syncError);
              toast({
                title: "Error al sincronizar",
                description: syncError.message,
                variant: "destructive"
              });
            } else {
              console.log('[MapView] Subscription sync result:', syncResult);
              if (syncResult?.subscribed) {
                toast({
                  title: "✅ Suscripción activa",
                  description: "Tu taxi aparecerá en el mapa",
                });
                setHasActiveSubscription(true);
              } else {
                toast({
                  title: "⚠️ Sin suscripción activa",
                  description: syncResult?.message || "No se encontró suscripción en Stripe",
                  variant: "destructive"
                });
              }
            }
          } catch (err) {
            console.error('[MapView] Exception syncing subscription:', err);
            toast({
              title: "Error",
              description: "No se pudo verificar la suscripción",
              variant: "destructive"
            });
          }
        }

        // Also check database in case sync just completed
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('status, end_date')
          .eq('profile_id', profile.id)
          .eq('status', 'activa')
          .maybeSingle();

        if (subscription) {
          if (!subscription.end_date || new Date(subscription.end_date) > new Date()) {
            setHasActiveSubscription(true);
          }
        }
      }
    };

    checkSubscription();
  }, []);

  const handleOpenChat = (userId: string, apodo: string) => {
    setSelectedReceiverId(userId);
    setSelectedReceiverName(apodo);
    setIsMessagingOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-primary text-white shadow-lg">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Mapa en Tiempo Real</h1>
          <Button 
            variant="outline" 
            onClick={() => navigate('/dashboard')}
            className="text-primary bg-white hover:bg-primary/20"
          >
            <Home className="h-4 w-4 mr-2" />
            Volver al Dashboard
          </Button>
        </div>
      </header>

      {/* Map with overlays */}
      <div className="flex-1 relative">
        <RealtimeMap onOpenChat={handleOpenChat} />
        
        {/* Status Control Overlay - Only show for providers with active subscription */}
        {isProvider && hasActiveSubscription && (
          <div className="absolute top-20 right-4 z-[1000] shadow-2xl">
            <StatusControl />
          </div>
        )}
      </div>

      {/* Floating Message Button */}
      <Button
        className="fixed bottom-4 right-4 h-14 w-14 rounded-full shadow-2xl bg-primary hover:bg-primary/90 z-40"
        size="icon"
        onClick={() => {
          setSelectedReceiverId(undefined);
          setSelectedReceiverName(undefined);
          setIsMessagingOpen(!isMessagingOpen);
        }}
      >
        <MessageCircle className="h-6 w-6" />
      </Button>

      {/* Messaging Panel */}
      <MessagingPanel 
        isOpen={isMessagingOpen}
        onClose={() => setIsMessagingOpen(false)}
        receiverId={selectedReceiverId}
        receiverName={selectedReceiverName}
      />
    </div>
  );
}
