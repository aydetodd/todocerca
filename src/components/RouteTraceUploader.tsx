import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, CheckCircle2, Trash2, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { parseRouteTraceFile } from '@/lib/routeTraceParser';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Props {
  productoId: string;
  hasTrace: boolean;
  filename?: string | null;
  onChanged?: () => void;
}

export default function RouteTraceUploader({ productoId, hasTrace, filename, onChanged }: Props) {
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('El archivo no debe pesar más de 10 MB');
      }
      const parsed = await parseRouteTraceFile(file);
      const { error } = await supabase
        .from('productos')
        .update({
          route_geojson: parsed.geojson,
          route_trace_filename: file.name,
          route_trace_updated_at: new Date().toISOString(),
        } as any)
        .eq('id', productoId);
      if (error) throw error;
      toast({
        title: 'Trazado cargado',
        description: `${parsed.lineCount} línea(s) detectadas. Ya se ve en azul en el mapa.`,
      });
      onChanged?.();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    setConfirmDelete(false);
    setUploading(true);
    try {
      const { error } = await supabase
        .from('productos')
        .update({
          route_geojson: null,
          route_trace_filename: null,
          route_trace_updated_at: null,
        } as any)
        .eq('id', productoId);
      if (error) throw error;
      toast({ title: 'Trazado eliminado' });
      onChanged?.();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".kml,.kmz,.gpx,.geojson,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <div className="flex items-center gap-1">
        <Button
          variant={hasTrace ? 'secondary' : 'outline'}
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          title="Subir trazado KML / KMZ / GPX / GeoJSON"
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : hasTrace ? (
            <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600" />
          ) : (
            <Upload className="h-3 w-3 mr-1" />
          )}
          {hasTrace ? 'Reemplazar trazado' : 'Subir trazado'}
        </Button>
        {hasTrace && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            disabled={uploading}
            onClick={() => setConfirmDelete(true)}
            title="Quitar trazado"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
      {hasTrace && filename && (
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate ml-6">
          📎 {filename}
        </p>
      )}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar el trazado?</AlertDialogTitle>
            <AlertDialogDescription>
              La línea azul dejará de mostrarse para esta ruta. Puedes volver a subir otro archivo cuando quieras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove}>Quitar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
