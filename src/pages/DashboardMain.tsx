import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MessageCircle, LogOut } from 'lucide-react';
import { StatusControl } from '@/components/StatusControl';
import { RealtimeMap } from '@/components/RealtimeMap';
import { MessagingPanel } from '@/components/MessagingPanel';
import ProviderRegistration from '@/components/ProviderRegistration';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export default function DashboardMain() {
  const [isMessagingOpen, setIsMessagingOpen] = useState(false);
  const [selectedReceiverId, setSelectedReceiverId] = useState<string | undefined>();
  const [selectedReceiverName, setSelectedReceiverName] = useState<string | undefined>();
  const [showProviderRegistration, setShowProviderRegistration] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkUserStatus();
  }, [navigate]);

  const checkUserStatus = async () => {
    // Check auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate('/auth');
      return;
    }

    // Check if user has a profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*, telefono, codigo_postal')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile) {
      toast({
        title: "Error",
        description: "No se encontró tu perfil",
        variant: "destructive",
      });
      navigate('/auth');
      return;
    }

    setUserProfile(profile);

    // If user is a provider, check if they have completed their provider profile
    if (profile.role === 'proveedor') {
      const { data: proveedor } = await supabase
        .from('proveedores')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!proveedor) {
        // Provider hasn't completed registration
        setShowProviderRegistration(true);
        toast({
          title: "Completa tu perfil",
          description: "Necesitas completar tu registro de proveedor",
        });
      }
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      toast({
        title: "Sesión cerrada",
        description: "Has cerrado sesión correctamente",
      });
      navigate('/auth');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      toast({
        title: "Error",
        description: "No se pudo cerrar la sesión",
        variant: "destructive",
      });
    }
  };

  const handleOpenChat = (userId: string, apodo: string) => {
    setSelectedReceiverId(userId);
    setSelectedReceiverName(apodo);
    setIsMessagingOpen(true);
  };

  const handleProviderRegistrationComplete = () => {
    setShowProviderRegistration(false);
    checkUserStatus(); // Refresh status
    toast({
      title: "¡Registro completado!",
      description: "Tu perfil de proveedor está listo",
    });
  };

  // Show ProviderRegistration if provider hasn't completed profile
  if (showProviderRegistration && userProfile) {
    return (
      <ProviderRegistration
        onComplete={handleProviderRegistrationComplete}
        userData={{
          email: userProfile.user_id ? `${userProfile.telefono?.replace(/\+/g, '')}@todocerca.app` : '',
          nombre: userProfile.nombre || '',
          telefono: userProfile.telefono || '',
          codigoPostal: userProfile.codigo_postal || '',
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-amber-500 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Todo Cerca</h1>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => navigate('/search')}
              className="text-amber-500 bg-white hover:bg-amber-50"
            >
              Buscar Productos
            </Button>
            <Button 
              variant="outline" 
              onClick={handleLogout}
              className="text-amber-500 bg-white hover:bg-amber-50"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </header>

      {/* Map with overlays */}
      <div className="flex-1 relative">
        <RealtimeMap onOpenChat={handleOpenChat} />
        
        {/* Status Control Overlay - Top Right with better visibility */}
        <div className="absolute top-20 right-4 z-[1000] shadow-2xl">
          <StatusControl />
        </div>
      </div>

      {/* Floating Message Button */}
      <Button
        className="fixed bottom-4 right-4 h-14 w-14 rounded-full shadow-2xl bg-amber-500 hover:bg-amber-600 z-40"
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