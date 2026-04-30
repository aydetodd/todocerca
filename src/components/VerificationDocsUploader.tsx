import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Upload, CheckCircle2, FileText, MessageCircle, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";

const ADMIN_WHATSAPP_FALLBACK = "526624124381";

const DOC_TYPES: { key: string; label: string; multi?: boolean }[] = [
  { key: "ine", label: "INE / Identificación Oficial" },
  { key: "concesion", label: "Concesión IMTES" },
  { key: "rfc", label: "RFC (Constancia de Situación Fiscal)" },
  { key: "domicilio", label: "Comprobante de Domicilio" },
  { key: "tarjeta_circulacion", label: "Tarjeta de Circulación (por unidad)", multi: true },
  { key: "fotos_unidades", label: "Fotografías de unidades", multi: true },
];

interface Props {
  proveedorId: string;
  proveedorNombre: string;
  verificacion: any | null;
  onVerificacionCreated: () => void;
}

export default function VerificationDocsUploader({
  proveedorId,
  proveedorNombre,
  verificacion,
  onVerificacionCreated,
}: Props) {
  const [docs, setDocs] = useState<Record<string, string[]>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (verificacion?.documentos) {
      setDocs(verificacion.documentos as Record<string, string[]>);
    }
  }, [verificacion]);

  const ensureVerification = async (): Promise<string | null> => {
    if (verificacion?.id) return verificacion.id;
    setCreating(true);
    try {
      const { data, error } = await (supabase
        .from("verificaciones_concesionario") as any)
        .insert({
          concesionario_id: proveedorId,
          estado: "pending",
          metodo_envio: "app",
          fecha_solicitud: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      onVerificacionCreated();
      return data.id;
    } catch (err: any) {
      toast.error("No se pudo iniciar verificación: " + err.message);
      return null;
    } finally {
      setCreating(false);
    }
  };

  const handleUpload = async (docKey: string, file: File, multi: boolean) => {
    setUploading(docKey);
    try {
      const verifId = await ensureVerification();
      if (!verifId) return;

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = multi
        ? `${docKey}_${Date.now()}.${ext}`
        : `${docKey}.${ext}`;
      const path = `${proveedorId}/${fileName}`;

      const { error: upErr } = await supabase.storage
        .from("verificacion-docs")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const next = { ...docs };
      if (multi) {
        next[docKey] = [...(next[docKey] || []), path];
      } else {
        next[docKey] = [path];
      }
      setDocs(next);

      await (supabase.from("verificaciones_concesionario") as any)
        .update({ documentos: next, metodo_envio: "app" })
        .eq("id", verifId);

      toast.success("Documento subido");
    } catch (err: any) {
      toast.error("Error al subir: " + err.message);
    } finally {
      setUploading(null);
    }
  };

  const handleRemove = async (docKey: string, path: string) => {
    try {
      await supabase.storage.from("verificacion-docs").remove([path]);
      const next = { ...docs };
      next[docKey] = (next[docKey] || []).filter((p) => p !== path);
      if (next[docKey].length === 0) delete next[docKey];
      setDocs(next);
      if (verificacion?.id) {
        await (supabase.from("verificaciones_concesionario") as any)
          .update({ documentos: next })
          .eq("id", verificacion.id);
      }
      toast.success("Documento eliminado");
    } catch (err: any) {
      toast.error("Error al eliminar: " + err.message);
    }
  };

  const handleView = async (path: string) => {
    const { data } = await supabase.storage
      .from("verificacion-docs")
      .createSignedUrl(path, 60 * 5);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const handleWhatsApp = () => {
    const message = encodeURIComponent(
      `Hola, soy ${proveedorNombre} (concesionario en TodoCerca). Te envío mis documentos de verificación: INE, Concesión IMTES, RFC, Comprobante de Domicilio, Tarjeta de Circulación y fotos de unidades.`,
    );
    window.open(`https://wa.me/${ADMIN_WHATSAPP}?text=${message}`, "_blank");
  };

  const isReadOnly = verificacion?.estado === "approved";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" /> Documentos de Verificación
        </CardTitle>
        <CardDescription className="text-xs">
          Sube tus documentos desde la app o envíalos por WhatsApp al administrador.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-3">
          {DOC_TYPES.map((dt) => {
            const items = docs[dt.key] || [];
            const hasFile = items.length > 0;
            return (
              <div key={dt.key} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {hasFile ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-sm truncate">{dt.label}</span>
                  </div>
                  {!isReadOnly && (
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        disabled={uploading === dt.key || creating}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUpload(dt.key, f, !!dt.multi);
                          e.target.value = "";
                        }}
                      />
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary text-primary-foreground text-xs hover:opacity-90">
                        {uploading === dt.key || (creating && !verificacion) ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Upload className="h-3 w-3" />
                        )}
                        {dt.multi && hasFile ? "Agregar" : "Subir"}
                      </span>
                    </label>
                  )}
                </div>
                {items.length > 0 && (
                  <div className="space-y-1 pl-6">
                    {items.map((path, i) => (
                      <div key={path} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-muted-foreground">
                          {path.split("/").pop()}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleView(path)}
                            className="text-primary hover:underline"
                            title="Ver"
                          >
                            <Eye className="h-3 w-3" />
                          </button>
                          {!isReadOnly && (
                            <button
                              onClick={() => handleRemove(dt.key, path)}
                              className="text-destructive hover:underline"
                              title="Eliminar"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!isReadOnly && (
          <Button
            onClick={handleWhatsApp}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            size="sm"
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            O enviar por WhatsApp al admin
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
