import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react";

interface PasswordRecoveryProps {
  onBack: () => void;
  initialPhone?: string;
}

const PasswordRecovery = ({ onBack }: PasswordRecoveryProps) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      toast({
        title: "Email inválido",
        description: "Ingresa un correo electrónico válido.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // 1) Buscar el user_id real a partir del recovery_email registrado
      const { data: profileMatch, error: searchError } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("recovery_email", cleanEmail)
        .maybeSingle();

      if (searchError) {
        console.error("[Recovery] Error buscando perfil:", searchError);
      }

      if (!profileMatch?.user_id) {
        // Por seguridad, no revelamos si existe o no — pero damos pista útil
        toast({
          title: "Correo no registrado",
          description:
            "No encontramos una cuenta con ese correo. Verifica que sea el mismo que registraste.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // 2) Enviar el correo de recuperación al email real (Supabase Auth)
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      setSent(true);
      toast({
        title: "Correo enviado",
        description: "Revisa tu bandeja de entrada para restablecer tu contraseña.",
      });
    } catch (error: any) {
      console.error("Error enviando correo de recuperación:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo enviar el correo de recuperación",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2 mb-2">
              <Button variant="ghost" size="icon" onClick={onBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <CardTitle>Recuperar Contraseña</CardTitle>
            </div>
            <CardDescription>
              {sent
                ? "Te enviamos un enlace para restablecer tu contraseña."
                : "Ingresa el correo electrónico que registraste en tu cuenta."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-4 text-center">
                <div className="flex justify-center">
                  <CheckCircle2 className="h-16 w-16 text-primary" />
                </div>
                <div className="p-4 bg-muted rounded-lg text-left">
                  <p className="text-sm">
                    Enviamos un correo a <strong>{email}</strong> con un enlace para crear una nueva contraseña.
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Revisa también la carpeta de <strong>Spam</strong> o <strong>Promociones</strong> si no lo ves en unos minutos.
                  </p>
                </div>
                <Button className="w-full" onClick={onBack}>
                  Volver al inicio de sesión
                </Button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <Label htmlFor="recovery-email">Correo electrónico</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="recovery-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="tucorreo@ejemplo.com"
                      className="pl-9"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Te enviaremos un enlace seguro para crear una nueva contraseña.
                  </p>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Enviando..." : "Enviar enlace de recuperación"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PasswordRecovery;
