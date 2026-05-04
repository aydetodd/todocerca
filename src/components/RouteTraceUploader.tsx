import { useId, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, CheckCircle2, Trash2, Eye, FileCheck2 } from 'lucide-react';
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
  const [lastError, setLastError] = useState<string | null>(null);
  const [localFilename, setLocalFilename] = useState<string | null>(filename || null);
  const traceSaved = hasTrace || !!localFilename;
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const saveTrace = async (fileName: string, geojson: any) => {
    const payload = {
      route_geojson: geojson,
      route_trace_filename: fileName,
      route_trace_updated_at: new Date().toISOString(),
    } as any;

    const direct = await supabase
      .from('productos')
      .update(payload)
      .eq('id', productoId)
      .select('id')
      .maybeSingle();

    if (!direct.error && direct.data?.id) return;

    console.warn('[RouteTraceUploader] direct save failed, trying edge function:', direct.error?.message || 'sin filas actualizadas');

    const { data, error } = await supabase.functions.invoke('save-route-trace', {
      body: { productoId, filename: fileName, geojson },
    });

    if (error) {
      const context = (error as { context?: Response }).context;
      const details = context ? await context.json().catch(() => null) : null;
      throw new Error(details?.error || error.message || direct.error?.message || 'No se pudo guardar el trazado.');
    }
    if (!data?.success) {
      throw new Error(data?.error || direct.error?.message || 'No se pudo guardar el trazado.');
    }
  };

  const handleFile = async (file: File) => {
    setLocalFilename(null);
    setUploading(true);
    setLastError(null);
    try {
      console.log('[RouteTraceUploader] file:', file.name, file.size, file.type);
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('El archivo no debe pesar más de 10 MB');
      }
      const parsed = await parseRouteTraceFile(file);
      console.log('[RouteTraceUploader] parsed lines:', parsed.lineCount, 'features:', parsed.geojson?.features?.length);
      await saveTrace(file.name, parsed.geojson);
      setLocalFilename(file.name);
      console.log('[RouteTraceUploader] update OK');
      toast({
        title: '✅ Trazado guardado',
        description: `${file.name} · ${parsed.lineCount} línea(s).`,
      });
      onChanged?.();
    } catch (e: any) {
      const msg = e?.message || String(e);
      console.error('[RouteTraceUploader] ERROR:', e);
      setLastError(msg);
      toast({ title: 'Error al subir trazado', description: msg, variant: 'destructive' });
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
      setLocalFilename(null);
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
        id={inputId}
        ref={inputRef}
        type="file"
        accept="*/*"
        className="sr-only"
        disabled={uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <div className="flex flex-wrap items-center gap-1">
        <Button
          asChild
          variant={hasTrace ? 'secondary' : 'outline'}
          size="sm"
        >
          <label
            htmlFor={uploading ? undefined : inputId}
            className={uploading ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
            title="Subir trazado KML / KMZ / GPX / GeoJSON"
          >
            {uploading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : traceSaved ? (
              <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600" />
            ) : (
              <Upload className="h-3 w-3 mr-1" />
            )}
            {uploading ? 'Procesando...' : traceSaved ? 'Reemplazar trazado' : 'Subir trazado'}
          </label>
        </Button>
        {traceSaved && (
          <>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => navigate(`/mapa?producto=${productoId}`)}
              title="Ver el trazado en el mapa"
            >
              <Eye className="h-3 w-3 mr-1" />
              Ver en mapa
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              disabled={uploading}
              onClick={() => setConfirmDelete(true)}
              title="Quitar trazado"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>
      {traceSaved && (
        <div className="mt-1 flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
          <FileCheck2 className="h-3 w-3 shrink-0" />
          <span className="truncate">Trazado cargado: {filename || localFilename}</span>
        </div>
      )}
      {lastError && (
        <p className="text-[10px] text-destructive mt-1 break-words">
          ⚠️ {lastError}
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
