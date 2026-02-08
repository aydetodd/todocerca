import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";

interface PasswordRecoveryProps {
  onBack: () => void;
  initialPhone?: string;
}

const PasswordRecovery = ({ onBack, initialPhone = "" }: PasswordRecoveryProps) => {
  const [phone, setPhone] = useState(initialPhone);
  const [loading, setLoading] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const { toast } = useToast();

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!phone) {
      toast({
        title: "Error",
        description: "Ingresa tu número de teléfono",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Buscar usuario por teléfono
      const { data: profileData, error: searchError } = await supabase
        .rpc('find_user_by_phone', { phone_param: phone });

      if (searchError || !profileData || profileData.length === 0) {
        throw new Error("No se encontró una cuenta con ese número de teléfono");
      }

      const userId = profileData[0].user_id;

      // Resetear contraseña a 123456 usando edge function
      const { error } = await supabase.functions.invoke('admin-reset-password', {
        body: {
          user_id: userId,
          newPassword: '123456'
        }
      });

      if (error) throw error;

      setResetDone(true);
      toast({
        title: "¡Contraseña restablecida!",
        description: "Tu nueva contraseña es: 123456",
      });
    } catch (error: any) {
      console.error('Error resetting password:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo restablecer la contraseña",
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
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <CardTitle>Recuperar Contraseña</CardTitle>
            </div>
            <CardDescription>
              {resetDone 
                ? "Tu contraseña ha sido restablecida" 
                : "Ingresa tu número de teléfono para restablecer tu contraseña"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {resetDone ? (
              <div className="space-y-4 text-center">
                <div className="flex justify-center">
                  <ShieldCheck className="h-16 w-16 text-primary" />
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Tu nueva contraseña es:
                  </p>
                  <p className="text-2xl font-bold font-mono text-foreground mt-2">
                    123456
                  </p>
                  <p className="text-xs text-muted-foreground mt-3">
                    Te recomendamos cambiarla después de iniciar sesión desde tu perfil.
                  </p>
                </div>
                <Button
                  className="w-full"
                  onClick={onBack}
                >
                  Iniciar Sesión
                </Button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <PhoneInput
                  id="phone"
                  value={phone}
                  onChange={setPhone}
                  label="Número de teléfono"
                  required
                  placeholder="5512345678"
                />

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={loading}
                >
                  {loading ? "Restableciendo..." : "Restablecer Contraseña"}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  Tu contraseña será restablecida a <strong>123456</strong>. 
                  Podrás cambiarla después desde tu perfil.
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PasswordRecovery;
