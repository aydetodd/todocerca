import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Printer, QrCode, X } from 'lucide-react';

interface QRCodeGeneratorProps {
  proveedorId: string;
  businessName: string;
}

const QRCodeGenerator = ({ proveedorId, businessName }: QRCodeGeneratorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Create a URL-friendly slug from the business name
  const createSlug = (name: string) => {
    return name
      .toLowerCase()
      .normalize('NFD') // Normalize to decompose accented characters
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .trim()
      .replace(/\s+/g, '-'); // Replace spaces with hyphens
  };
  
  // Use current domain with business name slug
  // This works in both development and production
  const profileUrl = `${window.location.origin}/${createSlug(businessName)}`;

  const handleDownload = () => {
    const svg = document.getElementById('qr-code-svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    canvas.width = 512;
    canvas.height = 512;

    img.onload = () => {
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `qr-${businessName}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const svg = document.getElementById('qr-code-svg');
    if (!svg) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Código QR - ${businessName}</title>
          <style>
            body {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              padding: 40px;
              font-family: Arial, sans-serif;
            }
            .qr-container {
              text-align: center;
              border: 4px solid #000;
              padding: 40px;
              border-radius: 20px;
            }
            h1 {
              font-size: 36px;
              margin-bottom: 20px;
              color: #000;
            }
            p {
              font-size: 24px;
              margin: 20px 0;
              color: #666;
            }
            svg {
              width: 400px;
              height: 400px;
            }
          </style>
        </head>
        <body>
          <div class="qr-container">
            <h1>${businessName}</h1>
            ${svg.outerHTML}
            <p>Escanea para ver mi perfil</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  if (!isOpen) {
    return (
      <Button variant="outline" className="w-full" onClick={() => setIsOpen(true)}>
        <QrCode className="h-4 w-4 mr-2" />
        Generar Código QR
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80" onClick={() => setIsOpen(false)}>
      <div className="relative w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Código QR de tu Negocio</CardTitle>
                <CardDescription className="mt-2">
                  Descarga o imprime este código QR para que tus clientes escaneen y vean tu perfil
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="absolute right-4 top-4"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="text-center text-lg">{businessName}</CardTitle>
              </CardHeader>
              <CardContent className="flex justify-center">
                <QRCodeSVG
                  id="qr-code-svg"
                  value={profileUrl}
                  size={256}
                  level="H"
                  includeMargin={true}
                />
              </CardContent>
            </Card>
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
};

export default QRCodeGenerator;
