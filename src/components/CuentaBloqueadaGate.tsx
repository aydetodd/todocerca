import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { rescateDesbloquear, rescateSolicitarCodigo } from "@/lib/rescate";

/**
 * Candado global: si la cuenta está bloqueada (modo rescate), la app solo
 * muestra esta pantalla de desbloqueo. Nada más funciona.
 */
export const CuentaBloqueadaGate = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [bloqueada, setBloqueada] = useState(false);
  const [emailMask, setEmailMask] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setBloqueada(false);
      return;
    }
    let cancelado = false;
    const cargar = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("cuenta_bloqueada")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelado) setBloqueada(!!data?.cuenta_bloqueada);
    };
    cargar();

    const canal = supabase
      .channel(`bloqueo-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const v = (payload.new as { cuenta_bloqueada?: boolean })?.cuenta_bloqueada;
          setBloqueada(!!v);
        }
      )
      .subscribe();
    return () => {
      cancelado = true;
      supabase.removeChannel(canal);
    };
  }, [user]);

  if (!bloqueada || !user) return null;

  const getToken = async () => (await supabase.auth.getSession()).data.session?.access_token || "";

  return (
    <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-destructive">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>Cuenta bloqueada</CardTitle>
          <CardDescription>
            Tu cuenta fue bloqueada desde el modo rescate (teléfono perdido). Tus tarjetas, tu saldo y tus QR están congelados.
            Si ya recuperaste tu teléfono, desbloquéala aquí.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!emailMask ? (
            <Button
              className="w-full"
              size="lg"
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                try {
                  const r = await rescateSolicitarCodigo(await getToken());
                  setEmailMask(r.email_mask || "tu correo");
                  toast({ title: "Código enviado a tu correo" });
                } catch (err) {
                  toast({
                    title: "No se pudo enviar",
                    description: err instanceof Error ? err.message : "Error",
                    variant: "destructive",
                  });
                } finally {
                  setLoading(false);
                }
              }}
            >
              Enviar código de desbloqueo a mi correo
            </Button>
          ) : (
            <>
              <p className="text-sm text-muted-foreground text-center">Código enviado a {emailMask}</p>
              <Input
                inputMode="numeric"
                maxLength={6}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-2xl tracking-[0.5em]"
                autoFocus
              />
              <Button
                className="w-full"
                size="lg"
                disabled={loading || codigo.length !== 6}
                onClick={async () => {
                  setLoading(true);
                  try {
                    await rescateDesbloquear(await getToken(), codigo);
                    setBloqueada(false);
                    toast({ title: "Cuenta desbloqueada. Bienvenido de vuelta." });
                  } catch (err) {
                    toast({
                      title: "No se pudo desbloquear",
                      description: err instanceof Error ? err.message : "Error",
                      variant: "destructive",
                    });
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                Desbloquear mi cuenta
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
