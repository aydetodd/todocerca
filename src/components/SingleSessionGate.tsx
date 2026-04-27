import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Smartphone, AlertTriangle, LogOut } from "lucide-react";
import { useSingleSession } from "@/hooks/useSingleSession";

export function SingleSessionGate() {
  const { status, blockedInfo, signOut } = useSingleSession();

  if (status !== "blocked") return null;

  const lastSeen = blockedInfo?.last_seen_at
    ? new Date(blockedInfo.last_seen_at).toLocaleString("es-MX", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

  return (
    <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-6 space-y-4 border-destructive/50">
        <div className="flex items-center gap-3 text-destructive">
          <AlertTriangle className="h-6 w-6" />
          <h2 className="text-xl font-bold">Sesión activa en otro dispositivo</h2>
        </div>

        <p className="text-sm text-muted-foreground">
          Tu cuenta solo puede estar abierta en un dispositivo a la vez. Para usar este dispositivo,
          primero cierra la sesión en el otro.
        </p>

        <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Dispositivo activo:</span>
          </div>
          <div className="pl-6 space-y-1 text-muted-foreground">
            <div>{blockedInfo?.device_name || "Desconocido"} ({blockedInfo?.device_type || "—"})</div>
            <div className="text-xs">Última actividad: {lastSeen}</div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          💡 Si no tienes acceso al otro dispositivo, cierra sesión aquí y vuelve a iniciar sesión.
          Esto liberará el bloqueo y podrás usar este dispositivo.
        </div>

        <Button onClick={signOut} variant="destructive" className="w-full">
          <LogOut className="h-4 w-4 mr-2" />
          Cerrar sesión
        </Button>
      </Card>
    </div>
  );
}
