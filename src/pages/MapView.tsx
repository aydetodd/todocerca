import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MessageCircle, Home } from 'lucide-react';
import { StatusControl } from '@/components/StatusControl';
import { RealtimeMap } from '@/components/RealtimeMap';
import { MessagingPanel } from '@/components/MessagingPanel';

export default function MapView() {
  const [isMessagingOpen, setIsMessagingOpen] = useState(false);
  const [selectedReceiverId, setSelectedReceiverId] = useState<string | undefined>();
  const [selectedReceiverName, setSelectedReceiverName] = useState<string | undefined>();
  const navigate = useNavigate();

  const handleOpenChat = (userId: string, apodo: string) => {
    setSelectedReceiverId(userId);
    setSelectedReceiverName(apodo);
    setIsMessagingOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-amber-500 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Mapa en Tiempo Real</h1>
          <Button 
            variant="outline" 
            onClick={() => navigate('/dashboard')}
            className="text-amber-500 bg-white hover:bg-amber-50"
          >
            <Home className="h-4 w-4 mr-2" />
            Volver al Dashboard
          </Button>
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
