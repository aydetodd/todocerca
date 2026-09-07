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

  const cerrarCamara = () => {
    stream.current?.getTracks().forEach(t => t.stop());
    stream.current = null;
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
      setTimeout(() => {
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().catch(() => {});
        }
      }, 50);
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
          <button onClick={() => onCambio(null)} className="text-muted-foreground" aria-label="Quitar foto">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {valor ? (
        <img src={valor} alt={titulo} className="w-full rounded-md object-cover max-h-44" />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={abrirCamara}>
            <Camera className="h-4 w-4 mr-1" /> Tomar foto
          </Button>
          <Button variant="outline" size="sm" onClick={() => galeria.current?.click()}>
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
          <div className="relative bg-black">
            <video ref={video} playsInline muted className="w-full h-[60vh] object-cover" />
            {/* Recuadro guía con la forma de la credencial */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[88%] aspect-[1.586/1] rounded-xl border-4 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />
            </div>
            <p className="absolute top-3 left-0 right-0 text-center text-white text-sm px-4">
              Acomoda tu {titulo.toLowerCase()} dentro del recuadro
            </p>
          </div>
          <div className="p-3 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={cerrarCamara}>Cancelar</Button>
            <Button className="flex-1" onClick={tomarFoto}>Tomar foto</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
