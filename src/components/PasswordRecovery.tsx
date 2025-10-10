import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";

interface PasswordRecoveryProps {
  onBack: () => void;
  initialPhone?: string;
}

const PasswordRecovery = ({ onBack, initialPhone = "" }: PasswordRecoveryProps) => {
  const [recoveryMethod, setRecoveryMethod] = useState<'email' | 'phone' | null>(null);
  const [step, setStep] = useState<'method' | 'phone' | 'code' | 'email-form' | 'email-sent'>('method');
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSendEmailRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast({
        title: "Error",
        description: "Ingresa tu email",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });

      if (error) throw error;

      toast({
        title: "Email enviado",
        description: "Revisa tu correo para restablecer tu contraseña",
      });

      setStep('email-sent');
    } catch (error: any) {
      console.error('Error sending email recovery:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo enviar el email de recuperación",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
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
      const { error } = await supabase.functions.invoke('send-recovery-code', {
        body: { phone }
      });

      if (error) throw error;

      toast({
        title: "Código enviado",
        description: "Revisa tu SMS para obtener el código de recuperación",
      });

      setStep('code');
    } catch (error: any) {
      console.error('Error sending recovery code:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo enviar el código de recuperación",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code || !newPassword || !confirmPassword) {
      toast({
        title: "Error",
        description: "Completa todos los campos",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Las contraseñas no coinciden",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Error",
        description: "La contraseña debe tener al menos 6 caracteres",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.functions.invoke('verify-recovery-code', {
        body: {
          phone,
          code,
          newPassword
        }
      });

      if (error) throw error;

      toast({
        title: "¡Contraseña actualizada!",
        description: "Ahora puedes iniciar sesión con tu nueva contraseña",
      });

      // Volver al login
      onBack();
    } catch (error: any) {
      console.error('Error verifying code:', error);
      toast({
        title: "Error",
        description: error.message || "Código inválido o expirado",
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
              {step === 'method' && "Elige cómo deseas recuperar tu contraseña"}
              {step === 'email-form' && "Ingresa tu correo electrónico registrado"}
              {step === 'email-sent' && "Revisa tu email para continuar"}
              {step === 'phone' && "Ingresa tu número de teléfono para recibir un código"}
              {step === 'code' && "Ingresa el código que recibiste por SMS"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 'method' && (
              <div className="space-y-4">
                <Button
                  onClick={() => {
                    setRecoveryMethod('email');
                    setStep('email-form');
                  }}
                  className="w-full"
                  variant="outline"
                  type="button"
                >
                  Recuperar por Email
                </Button>
                <Button
                  onClick={() => {
                    setRecoveryMethod('phone');
                    setStep('phone');
                  }}
                  className="w-full"
                  variant="outline"
                  type="button"
                >
                  Recuperar por SMS
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Si registraste un email, usa esa opción. Si solo usaste teléfono, usa SMS.
                </p>
              </div>
            )}

            {step === 'email-form' && (
              <form onSubmit={handleSendEmailRecovery} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    required
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={loading}
                >
                  {loading ? "Enviando..." : "Enviar link de recuperación"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setStep('method')}
                  disabled={loading}
                >
                  Volver
                </Button>
              </form>
            )}

            {step === 'email-sent' && (
              <div className="space-y-4 text-center">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    📧 Hemos enviado un link de recuperación a <strong>{email}</strong>
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Revisa tu bandeja de entrada y haz clic en el enlace para restablecer tu contraseña.
                  </p>
                  <p className="text-xs text-muted-foreground mt-3">
                    Si no lo ves, revisa tu carpeta de spam.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setStep('email-form')}
                >
                  Enviar nuevamente
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={onBack}
                >
                  Volver al inicio
                </Button>
              </div>
            )}

            {step === 'phone' && (
              <form onSubmit={handleSendCode} className="space-y-4">
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
                  {loading ? "Enviando..." : "Enviar código"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setStep('method')}
                  disabled={loading}
                >
                  Volver
                </Button>
              </form>
            )}

            {step === 'code' && (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div>
                  <Label htmlFor="code">Código de recuperación</Label>
                  <Input
                    id="code"
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                    maxLength={6}
                    required
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Código válido por 10 minutos
                  </p>
                </div>

                <div>
                  <Label htmlFor="newPassword">Nueva contraseña</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={loading}
                  >
                    {loading ? "Verificando..." : "Cambiar contraseña"}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setStep('phone')}
                    disabled={loading}
                  >
                    Reenviar código
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => setStep('method')}
                    disabled={loading}
                  >
                    Cambiar método
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PasswordRecovery;
