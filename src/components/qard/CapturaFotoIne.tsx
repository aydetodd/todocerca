import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Camera, Upload, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const MIN_BYTES = 150 * 1024;
const MAX_BYTES = 5 * 1024 * 1024;

function leerArchivo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(new Error("No pudimos leer la foto."));
    lector.readAsDataURL(file);
  });
}

export default function CapturaFotoIne({
  titulo, valor, onCambio,
}: { titulo: string; valor: string | null; onCambio: (v: string | null) => void }) {
  const galeria = useRef<HTMLInputElement>(null);
  const respaldo = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [camaraLista, setCamaraLista] = useState(false);

  const cerrarCamara = () => {
    stream.current?.getTracks().forEach(t => t.stop());
    stream.current = null;
    setCamaraLista(false);
    setCamaraAbierta(false);
  };

  useEffect(() => () => { stream.current?.getTracks().forEach(t => t.stop()); }, []);

  const abrirCamara = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      stream.current = s;
      setCamaraAbierta(true);
    } catch {
      // Si el navegador no da permiso, usamos la cámara del sistema
      respaldo.current?.click();
    }
  };

  const tomarFoto = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    // Recortamos justo el recuadro guía (tamaño de tarjeta, 85.6 x 54 mm)
    const anchoRec = v.videoWidth * 0.88;
    const altoRec = anchoRec / 1.586;
    const x = (v.videoWidth - anchoRec) / 2;
    const y = (v.videoHeight - altoRec) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = anchoRec;
    canvas.height = altoRec;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, x, y, anchoRec, altoRec, 0, 0, anchoRec, altoRec);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    cerrarCamara();
    onCambio(dataUrl);
  };

  const procesar = async (file?: File | null) => {
    if (!file) return;
    if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type)) {
      toast({ title: "Formato no válido", description: "La foto debe ser JPG o PNG.", variant: "destructive" });
      return;
    }
    if (file.size < MIN_BYTES) {
      toast({ title: "Foto muy pequeña", description: "Tómala de nuevo, más cerca y con buena luz.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "Foto muy grande", description: "Debe pesar máximo 5 MB.", variant: "destructive" });
      return;
    }
    onCambio(await leerArchivo(file));
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{titulo}</span>
        {valor && (
          <Button type="button" variant="ghost" size="icon" onClick={() => onCambio(null)} className="h-8 w-8 text-muted-foreground" aria-label="Quitar foto">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {valor ? (
        <img src={valor} alt={titulo} className="w-full rounded-md object-cover max-h-44" />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={abrirCamara}>
            <Camera className="h-4 w-4 mr-1" /> Tomar foto
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => galeria.current?.click()}>
            <Upload className="h-4 w-4 mr-1" /> Galería
          </Button>
        </div>
      )}
      <input ref={galeria} type="file" accept="image/jpeg,image/png" className="hidden"
        onChange={e => procesar(e.target.files?.[0])} />
      <input ref={respaldo} type="file" accept="image/jpeg,image/png" capture="environment" className="hidden"
        onChange={e => procesar(e.target.files?.[0])} />

      <Dialog open={camaraAbierta} onOpenChange={(o) => { if (!o) cerrarCamara(); }}>
        <DialogContent className="p-0 max-w-md overflow-hidden">
          <div className="relative overflow-hidden bg-foreground">
            <video
              ref={(node) => {
                video.current = node;
                if (node && stream.current) {
                  node.srcObject = stream.current;
                  void node.play().catch(() => undefined);
                }
              }}
              onLoadedMetadata={() => setCamaraLista(true)}
              playsInline
              muted
              className="h-[60vh] w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative z-10 w-[88%] aspect-[1.586/1] rounded-lg border-4 border-primary ring-2 ring-background shadow-[0_0_0_9999px_hsl(var(--foreground)/0.6)]" />
            </div>
            <p className="absolute left-0 right-0 top-3 z-20 px-4 text-center text-sm font-semibold text-background">
              Acomoda tu {titulo.toLowerCase()} dentro del recuadro
            </p>
          </div>
          <div className="p-3 flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={cerrarCamara}>Cancelar</Button>
            <Button type="button" className="flex-1" disabled={!camaraLista} onClick={tomarFoto}>
              {camaraLista ? "Tomar foto" : "Abriendo cámara..."}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
