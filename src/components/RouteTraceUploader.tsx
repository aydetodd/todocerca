import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, CheckCircle2, Trash2, Eye, FileCheck2, Pencil, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { parseRouteTraceFile } from '@/lib/routeTraceParser';
import RouteTraceEditor from './RouteTraceEditor';
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
  const [statusText, setStatusText] = useState<string | null>(null);
  const [localFilename, setLocalFilename] = useState<string | null>(filename || null);
  const [inputKey, setInputKey] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorGeoJSON, setEditorGeoJSON] = useState<any>(null);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const traceSaved = hasTrace || !!localFilename;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    setLocalFilename(hasTrace ? filename || null : null);
  }, [filename, hasTrace]);

  const saveTrace = async (fileName: string, geojson: any) => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.access_token) {
      throw new Error('No hay sesión activa. Cierra y vuelve a iniciar sesión como concesionario.');
    }

    const { data: updated, error } = await (supabase as any).rpc('save_private_route_trace', {
      _producto_id: productoId,
      _filename: fileName,
      _geojson: geojson,
    });

    if (error) throw error;
    if (!updated || updated.length === 0) {
      throw new Error('No se guardó: esta ruta no aparece como privada o no pertenece a tu cuenta.');
    }
  };

  const openFilePicker = () => {
    if (uploading) return;
    setLastError(null);
    setStatusText('Abriendo selector de archivo...');
    inputRef.current?.click();
  };

  const handleFile = async (file: File) => {
    setLocalFilename(null);
    setUploading(true);
    setLastError(null);
    setStatusText(`Archivo seleccionado: ${file.name}`);
    try {
      console.log('[RouteTraceUploader] file:', file.name, file.size, file.type);
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('El archivo no debe pesar más de 10 MB');
      }
      setStatusText('Leyendo trazado...');
      const parsed = await parseRouteTraceFile(file);
      console.log('[RouteTraceUploader] parsed lines:', parsed.lineCount, 'features:', parsed.geojson?.features?.length);
      setStatusText('Guardando trazado...');
      await saveTrace(file.name, parsed.geojson);
      setLocalFilename(file.name);
      setStatusText(`Trazado guardado: ${file.name}`);
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
      setStatusText(null);
      toast({ title: 'Error al subir trazado', description: msg, variant: 'destructive' });
    } finally {
      setUploading(false);
      setInputKey((key) => key + 1);
    }
  };

  const handleRemove = async () => {
    setConfirmDelete(false);
    setUploading(true);
    try {
      const { error } = await (supabase as any).rpc('delete_private_route_trace', {
        _producto_id: productoId,
      });
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
      <div className="flex flex-wrap items-center gap-1">
        <input
          key={inputKey}
          ref={inputRef}
          type="file"
          accept=".kml,.kmz,.gpx,.geojson,.json,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/gpx+xml,application/geo+json,application/json,*/*"
          className="sr-only"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <Button
          type="button"
          variant={traceSaved ? 'secondary' : 'outline'}
          size="sm"
          disabled={uploading}
          onClick={openFilePicker}
          title="Subir trazado KML / KMZ / GPX / GeoJSON"
        >
            {uploading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : traceSaved ? (
              <CheckCircle2 className="h-3 w-3 mr-1 text-primary" />
            ) : (
              <Upload className="h-3 w-3 mr-1" />
            )}
            {uploading ? 'Procesando...' : traceSaved ? 'Reemplazar trazado' : 'Subir trazado'}
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
              variant="outline"
              size="sm"
              disabled={loadingEditor}
              onClick={async () => {
                setLoadingEditor(true);
                try {
                  const { data, error } = await supabase
                    .from('productos')
                    .select('route_geojson')
                    .eq('id', productoId)
                    .maybeSingle();
                  if (error) throw error;
                  if (!data?.route_geojson) throw new Error('No hay trazado para editar.');
                  setEditorGeoJSON(data.route_geojson);
                  setEditorOpen(true);
                } catch (e: any) {
                  toast({ title: 'Error', description: e.message, variant: 'destructive' });
                } finally {
                  setLoadingEditor(false);
                }
              }}
              title="Editar vértices del trazado"
            >
              {loadingEditor ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3 mr-1" />}
              Editar
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
          <span className="truncate">Trazado cargado: {localFilename || filename}</span>
        </div>
      )}
      {statusText && !traceSaved && (
        <p className="text-[10px] text-muted-foreground mt-1 break-words">{statusText}</p>
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
      {editorGeoJSON && (
        <RouteTraceEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          productoId={productoId}
          filename={localFilename || filename}
          geojson={editorGeoJSON}
          onSaved={() => {
            setEditorGeoJSON(null);
            onChanged?.();
          }}
        />
      )}
    </>
  );
}
