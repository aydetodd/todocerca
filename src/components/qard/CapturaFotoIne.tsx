import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Camera, Upload, X } from "lucide-react";

const MIN_BYTES = 1 * 1024 * 1024;
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
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);

  const procesar = async (file?: File | null) => {
    if (!file) return;
    if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type)) {
      toast({ title: "Formato no válido", description: "La foto debe ser JPG o PNG.", variant: "destructive" });
      return;
    }
    if (file.size < MIN_BYTES) {
      toast({ title: "Foto muy pequeña", description: "Debe pesar al menos 1 MB. Tómala con mejor calidad.", variant: "destructive" });
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
          <Button variant="outline" size="sm" onClick={() => camara.current?.click()}>
            <Camera className="h-4 w-4 mr-1" /> Tomar foto
          </Button>
          <Button variant="outline" size="sm" onClick={() => galeria.current?.click()}>
            <Upload className="h-4 w-4 mr-1" /> Galería
          </Button>
        </div>
      )}
      <input ref={camara} type="file" accept="image/jpeg,image/png" capture="environment" className="hidden"
        onChange={e => procesar(e.target.files?.[0])} />
      <input ref={galeria} type="file" accept="image/jpeg,image/png" className="hidden"
        onChange={e => procesar(e.target.files?.[0])} />
    </div>
  );
}
