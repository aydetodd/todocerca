import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Share2, Copy, QrCode, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface ShareContactButtonProps {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const ShareContactButton = ({ variant = 'outline', size = 'default' }: ShareContactButtonProps) => {
  const [open, setOpen] = useState(false);
  const [contactToken, setContactToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchToken = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('contact_token')
        .eq('user_id', user.id)
        .single();

      if (data?.contact_token) {
        setContactToken(data.contact_token);
      }
    };

    if (open) {
      fetchToken();
    }
  }, [open]);

  const contactLink = contactToken 
    ? `${window.location.origin}/agregar-contacto?token=${contactToken}`
    : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(contactLink);
      setCopied(true);
      toast({ title: 'Enlace copiado', description: 'Compártelo con tus amigos' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Error', description: 'No se pudo copiar', variant: 'destructive' });
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Agrégame como contacto',
          text: '¡Agrégame como contacto en TodoCerca!',
          url: contactLink
        });
      } catch (e) {
        // Usuario canceló
      }
    } else {
      handleCopy();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          <Share2 className="h-4 w-4 mr-2" />
          Compartir mi contacto
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Mi código de contacto
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {contactToken && (
            <div className="flex justify-center p-4 bg-white rounded-lg">
              <QRCodeSVG 
                value={contactLink} 
                size={200}
                level="M"
                includeMargin
              />
            </div>
          )}
          
          <p className="text-sm text-muted-foreground text-center">
            Escanea este código o comparte el enlace para agregar contactos
          </p>
          
          <div className="flex gap-2">
            <Input 
              value={contactLink} 
              readOnly 
              className="text-xs"
            />
            <Button 
              variant="outline" 
              size="icon"
              onClick={handleCopy}
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          
          <Button className="w-full" onClick={handleShare}>
            <Share2 className="h-4 w-4 mr-2" />
            Compartir enlace
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareContactButton;
