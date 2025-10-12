import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Printer, QrCode } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface QRCodeGeneratorProps {
  proveedorId: string;
  businessName: string;
}

const QRCodeGenerator = ({ proveedorId, businessName }: QRCodeGeneratorProps) => {
  const profileUrl = `${window.location.origin}/proveedor/${proveedorId}`;

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

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <QrCode className="h-4 w-4 mr-2" />
          Generar Código QR
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Código QR de tu Negocio</DialogTitle>
          <DialogDescription>
            Descarga o imprime este código QR para que tus clientes escaneen y vean tu perfil
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center space-y-4">
          <Card className="w-full">
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
          <div className="grid grid-cols-2 gap-2 w-full">
            <Button variant="outline" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Descargar
            </Button>
            <Button variant="default" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Imprimir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QRCodeGenerator;
