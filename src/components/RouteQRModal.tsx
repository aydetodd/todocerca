import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Download, Printer, QrCode, X, Share2, Copy, Check } from 'lucide-react';

interface RouteQRModalProps {
  routeName: string;
  inviteToken: string;
  triggerLabel?: string;
  triggerClassName?: string;
}

export default function RouteQRModal({ routeName, inviteToken, triggerLabel = 'QR', triggerClassName }: RouteQRModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const url = `${window.location.origin}/mapa?type=ruta&token=${inviteToken}`;

  const handleDownload = () => {
    const svg = document.getElementById('route-qr-svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    canvas.width = 512;
    canvas.height = 512;
    img.onload = () => {
      ctx?.drawImage(img, 0, 0);
      const png = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.download = `qr-ruta-${routeName}.png`;
      a.href = png;
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const svg = document.getElementById('route-qr-svg');
    if (!svg) return;
    w.document.write(`
      <!DOCTYPE html><html><head><title>QR Ruta - ${routeName}</title>
      <style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:40px;font-family:Arial}
      .c{text-align:center;border:4px solid #000;padding:40px;border-radius:20px}
      h1{font-size:32px;margin:0 0 16px}p{font-size:20px;color:#444;margin:16px 0 0}svg{width:380px;height:380px}</style>
      </head><body><div class="c"><h1>${routeName}</h1>${svg.outerHTML}<p>Escanea para ver mi ruta en tiempo real</p></div></body></html>
    `);
    w.document.close();
    setTimeout(() => { w.print(); w.close(); }, 250);
  };

  if (!isOpen) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => setIsOpen(true)}
        className={triggerClassName || 'shrink-0 h-8 px-2.5 text-xs'}
      >
        <QrCode className="h-3 w-3 mr-1" />
        {triggerLabel}
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4" onClick={() => setIsOpen(false)}>
      <div className="relative w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle>QR de tu Ruta</CardTitle>
                <CardDescription className="mt-2">
                  Los pasajeros escanean este código para ver tu camión en tiempo real. Pueden guardarlo en favoritos para verlo todos los días.
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="text-center text-lg">{routeName}</CardTitle>
              </CardHeader>
              <CardContent className="flex justify-center bg-white py-4 rounded-b-lg">
                <QRCodeSVG id="route-qr-svg" value={url} size={256} level="H" includeMargin />
              </CardContent>
            </Card>
            <div className="flex gap-2">
              <Input value={url} readOnly className="text-xs" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  navigator.clipboard.writeText(url);
                  setCopied(true);
                  toast({ title: 'Enlace copiado' });
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              onClick={() => {
                const text = encodeURIComponent(`🚌 Sigue mi ruta "${routeName}" en tiempo real: ${url}`);
                window.open(`https://wa.me/?text=${text}`, '_blank');
              }}
            >
              <Share2 className="h-4 w-4 mr-2" />
              Compartir por WhatsApp
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Descargar
              </Button>
              <Button variant="default" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Imprimir
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
