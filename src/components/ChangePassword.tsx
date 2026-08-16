import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { KeyRound } from "lucide-react";
import { CLAVE_LENGTH, claveToPassword, esClaveUniversal } from "@/lib/claveUniversal";

const ChangePassword = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const soloDigitos = (v: string) => v.replace(/\D/g, "").slice(0, CLAVE_LENGTH);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!esClaveUniversal(newPassword)) {
      toast({
        title: "Clave inválida",
        description: "Tu clave son 5 números, por ejemplo 12345.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Las claves no coinciden",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: claveToPassword(newPassword),
      });

      if (error) throw error;

      const { data } = await supabase.auth.getUser();
      if (data.user) {
        await supabase
          .from("profiles")
          .update({ clave_universal_migrada: true })
          .eq("user_id", data.user.id);
      }

      toast({
        title: "¡Clave actualizada!",
        description: "Desde ahora entras con tus 5 números.",
      });

      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      console.error("Error changing password:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo cambiar la clave",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <KeyRound className="h-5 w-5" />
          <span>Cambiar mi clave</span>
        </CardTitle>
        <CardDescription>Tu clave son 5 números</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <Label>Nueva clave</Label>
            <div className="flex justify-center py-2">
              <InputOTP
                maxLength={CLAVE_LENGTH}
                value={newPassword}
                onChange={(v) => setNewPassword(soloDigitos(v))}
                inputMode="numeric"
              >
                <InputOTPGroup>
                  {Array.from({ length: CLAVE_LENGTH }).map((_, i) => (
                    <InputOTPSlot key={i} index={i} className="w-12 h-14 text-xl" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>

          <div>
            <Label>Repite tu clave</Label>
            <div className="flex justify-center py-2">
              <InputOTP
                maxLength={CLAVE_LENGTH}
                value={confirmPassword}
                onChange={(v) => setConfirmPassword(soloDigitos(v))}
                inputMode="numeric"
              >
                <InputOTPGroup>
                  {Array.from({ length: CLAVE_LENGTH }).map((_, i) => (
                    <InputOTPSlot key={i} index={i} className="w-12 h-14 text-xl" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Actualizando..." : "Guardar mi clave"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ChangePassword;
