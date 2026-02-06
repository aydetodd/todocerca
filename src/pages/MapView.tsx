import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GlobalHeader } from '@/components/GlobalHeader';
import { RealtimeMap } from '@/components/RealtimeMap';
import { MessagingPanel } from '@/components/MessagingPanel';
import { StatusControl } from '@/components/StatusControl';
import { FavoritoButton } from '@/components/FavoritoButton';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export default function MapView() {
  const [searchParams] = useSearchParams();
  const filterType = searchParams.get('type') as 'taxi' | 'ruta' | null;
  const privateRouteToken = searchParams.get('token');
  const [isMessagingOpen, setIsMessagingOpen] = useState(false);
  const [selectedReceiverId, setSelectedReceiverId] = useState<string | undefined>();
  const [selectedReceiverName, setSelectedReceiverName] = useState<string | undefined>();
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [isProvider, setIsProvider] = useState(false);
  const [privateRouteProviderId, setPrivateRouteProviderId] = useState<string | null>(null);
  const [privateRouteName, setPrivateRouteName] = useState<string | null>(null);
  const [privateRouteProductoId, setPrivateRouteProductoId] = useState<string | null>(null);
  const { toast } = useToast();

  // GPS tracking ahora es global via GlobalProviderTracking

  useEffect(() => {
    // If we have a token, fetch the private route info
    if (privateRouteToken) {
      const fetchPrivateRoute = async () => {
        // Try reading the product directly (owner/chofer can read via RLS)
        let { data: producto, error } = await supabase
          .from('productos')
          .select('id, nombre, proveedor_id, is_private, proveedores(user_id)')
          .eq('invite_token', privateRouteToken)
          .eq('is_private', true)
          .maybeSingle();
        
        // If RLS blocks (passenger not yet invited), try via edge function
        if (!producto) {
          // Fallback: query without is_private filter to find any matching token
          const { data: publicProduct } = await supabase
            .from('productos')
            .select('id, nombre, proveedor_id, proveedores(user_id)')
            .eq('invite_token', privateRouteToken)
            .maybeSingle();
          
          if (publicProduct) {
            producto = { ...publicProduct, is_private: true } as any;
          }
        }
        
        if (!producto) {
          console.error('[MapView] Error fetching private route:', error);
          toast({
            title: "Enlace inválido",
            description: "La ruta privada no existe o el enlace ha expirado",
            variant: "destructive",
          });
          return;
        }
        
        setPrivateRouteProviderId((producto.proveedores as any)?.user_id || null);
        setPrivateRouteName(producto.nombre);
        setPrivateRouteProductoId(producto.id);
        
        toast({
          title: `Ruta: ${producto.nombre}`,
          description: "Mostrando ubicación de la ruta privada",
        });
      };
      
      fetchPrivateRoute();
    }

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
        
        // Call check-subscription to sync from Stripe silently
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
            } else {
              console.log('[MapView] Subscription sync result:', syncResult);
              if (syncResult?.subscribed) {
                setHasActiveSubscription(true);
              }
            }
          } catch (err) {
            console.error('[MapView] Exception syncing subscription:', err);
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
  }, [privateRouteToken, toast]);

  const handleOpenChat = (userId: string, apodo: string) => {
    setSelectedReceiverId(userId);
    setSelectedReceiverName(apodo);
    setIsMessagingOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <GlobalHeader title={filterType === 'taxi' ? 'Taxis Disponibles' : filterType === 'ruta' ? 'Rutas de Transporte' : 'Mapa en Tiempo Real'} />

      {/* Map with overlays */}
      <div className="flex-1 relative">
        <RealtimeMap 
          onOpenChat={handleOpenChat} 
          filterType={filterType}
          privateRouteUserId={privateRouteProviderId}
        />
        
        {/* Private route indicator with favorite button */}
        {privateRouteName && (
          <div className="absolute top-4 left-4 z-30 bg-background/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-md flex items-center gap-2">
            <span className="text-sm font-medium">
              🔒 {privateRouteName}
            </span>
            {privateRouteProductoId && (
              <FavoritoButton 
                tipo="producto" 
                itemId={privateRouteProductoId}
                size="sm"
                className="h-8 w-8"
              />
            )}
          </div>
        )}
        
        {/* Status Control overlay for providers on map */}
        {isProvider && (
          <div className="absolute top-4 right-4 z-30" style={{ top: privateRouteName ? '60px' : '16px' }}>
            <StatusControl />
          </div>
        )}
      </div>

      {/* Messaging Panel (se abre desde el popup del mapa) */}
      <MessagingPanel 
        isOpen={isMessagingOpen}
        onClose={() => setIsMessagingOpen(false)}
        receiverId={selectedReceiverId}
        receiverName={selectedReceiverName}
      />

    </div>
  );
}
