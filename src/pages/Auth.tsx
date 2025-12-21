import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { MapPin, User, Store, RefreshCw } from "lucide-react";
import ProviderRegistration from "@/components/ProviderRegistration";
import PasswordRecovery from "@/components/PasswordRecovery";
import { PhoneInput } from "@/components/ui/phone-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const Auth = () => {
  const [telefono, setTelefono] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [apodo, setApodo] = useState("");
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [userType, setUserType] = useState<'cliente' | 'proveedor'>('cliente');
  const [showProviderRegistration, setShowProviderRegistration] = useState(false);
  const [skipAutoRedirect, setSkipAutoRedirect] = useState(false);
  const [userIdConsecutivo, setUserIdConsecutivo] = useState<number | null>(null);
  const [showIdConsecutivo, setShowIdConsecutivo] = useState(false);
  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedProhibitedContent, setAcceptedProhibitedContent] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [showVerification, setShowVerification] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && user && !showProviderRegistration && !skipAutoRedirect) {
      // Verificar si hay una URL guardada para redirigir
      const redirectUrl = localStorage.getItem('redirectAfterLogin');
      if (redirectUrl) {
        localStorage.removeItem('redirectAfterLogin');
        navigate(redirectUrl);
      } else {
        navigate("/profile");
      }
    }
  }, [user, authLoading, navigate, showProviderRegistration, skipAutoRedirect]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🚀 handleAuth called!');
    console.log('📋 Form state:', { 
      isLogin, 
      userType, 
      telefono: telefono ? 'filled' : 'empty', 
      password: password ? 'filled' : 'empty',
      nombre: nombre ? 'filled' : 'empty',
      apodo: apodo ? 'filled' : 'empty'
    });
    
    // Basic validation
    if (!telefono || !password) {
      console.log('❌ Missing telefono or password');
      toast({
        title: "Error",
        description: "Teléfono y contraseña son obligatorios",
        variant: "destructive",
      });
      return;
    }
    
    if (!isLogin && !apodo) {
      console.log('❌ Missing apodo for registration');
      toast({
        title: "Error", 
        description: "El alias es obligatorio para el registro",
        variant: "destructive",
      });
      return;
    }
    
    // Validar términos en registro
    if (!isLogin && (!acceptedTerms || !acceptedProhibitedContent)) {
      console.log('❌ Terms not accepted');
      toast({
        title: "Error",
        description: "Debes aceptar los Términos de Uso y la Política de Contenido Prohibido",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    setShowIdConsecutivo(false);
    console.log('⏳ Starting authentication process...');

    try {
      if (isLogin) {
        console.log('🔑 Attempting login with phone:', telefono);
        
        // Buscar perfil usando función flexible que normaliza teléfonos
        const { data: profileData, error: searchError } = await supabase
          .rpc('find_user_by_phone', { phone_param: telefono });
        
        console.log('🔍 Search result:', { profileData, searchError });

        if (!profileData || profileData.length === 0) {
          console.error('❌ Phone not found in database');
          throw new Error('Número de teléfono no encontrado. Verifica que esté registrado.');
        }

        const userProfile = profileData[0];
        console.log('📱 Profile found:', userProfile);

        // Obtener el email del usuario usando una función segura
        const { data: userData } = await supabase.rpc('get_user_email_by_id', {
          p_user_id: userProfile.user_id
        });
        
        // Usar el email real del usuario o generar uno
        const emailToUse = userData || `${telefono.replace(/\+/g, '')}@todocerca.app`;
        
        console.log('📧 Using email for login:', emailToUse);
        
        const { data, error } = await supabase.auth.signInWithPassword({
          email: emailToUse,
          password,
        });

        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            throw new Error('Teléfono o contraseña incorrectos');
          }
          throw error;
        }

        // Obtener el consecutive_number del perfil completo
        const { data: fullProfile } = await supabase
          .from('profiles')
          .select('consecutive_number')
          .eq('user_id', userProfile.user_id)
          .single();

        if (fullProfile?.consecutive_number) {
          setUserIdConsecutivo(fullProfile.consecutive_number);
          setShowIdConsecutivo(true);

          toast({
            title: "¡Bienvenido!",
            description: `Tu número de usuario: ${fullProfile.consecutive_number}`,
          });
        }

        // Check provider registration
        try {
          setSkipAutoRedirect(true);
          const role = data.user?.user_metadata?.role;
          const userId = data.user?.id;
          if (role === 'proveedor' && userId) {
            const { data: existingProvider } = await supabase
              .from('proveedores')
              .select('id')
              .eq('user_id', userId)
              .maybeSingle();
            if (!existingProvider) {
              setShowProviderRegistration(true);
              toast({
                title: "Completa tu perfil de proveedor",
                description: "Registra tus productos para comenzar.",
              });
            } else {
              setSkipAutoRedirect(false);
              const redirectUrl = localStorage.getItem('redirectAfterLogin');
              if (redirectUrl) {
                localStorage.removeItem('redirectAfterLogin');
                navigate(redirectUrl);
              }
            }
          } else {
            setSkipAutoRedirect(false);
            const redirectUrl = localStorage.getItem('redirectAfterLogin');
            if (redirectUrl) {
              localStorage.removeItem('redirectAfterLogin');
              navigate(redirectUrl);
            }
          }
        } catch (e) {
          console.log('⚠️ Post-login error:', e);
          setSkipAutoRedirect(false);
        }
      } else {
        // REGISTRO CON VERIFICACIÓN SMS
        console.log('📝 Starting SMS registration...');
        
        const finalEmail = `${telefono.replace(/\+/g, '')}@todocerca.app`;
        
        // Crear usuario
        const { data, error } = await supabase.auth.signUp({
          email: finalEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              nombre: nombre || apodo,
              apodo,
              role: userType,
              telefono,
            },
          },
        });

        if (error) {
          if (error.message.includes('already registered')) {
            throw new Error('Este teléfono ya está registrado');
          }
          throw error;
        }

        if (data.user) {
          console.log('✅ User created:', data.user.id);
          setPendingUserId(data.user.id);

          // Actualizar perfil
          await supabase
            .from('profiles')
            .update({ telefono })
            .eq('user_id', data.user.id);

          // Enviar código de verificación SMS
          const { error: smsError } = await supabase.functions.invoke('send-verification-sms', {
            body: { phone: telefono }
          });

          if (smsError) {
            console.error('Error enviando SMS:', smsError);
            throw new Error('Error al enviar código de verificación');
          }

          // Cerrar sesión temporal
          await supabase.auth.signOut();

          toast({
            title: "¡Código enviado!",
            description: "Revisa tu SMS e ingresa el código de verificación",
            duration: 5000,
          });

          setShowVerification(true);
        }
      }
    } catch (error: any) {
      console.error('💥 Authentication error:', error);
      toast({
        title: "Error",
        description: error.message || 'Ocurrió un error durante el proceso',
        variant: "destructive",
      });
    } finally {
      console.log('🏁 Authentication process finished');
      setLoading(false);
    }
  };

  const handleProviderRegistrationComplete = () => {
    setShowProviderRegistration(false);
    setSkipAutoRedirect(false);
    navigate('/profile');
  };

  const handleForgotPassword = () => {
    setShowPasswordRecovery(true);
  };

  const handleProceedWithLogin = () => {
    if (!showIdConsecutivo) {
      toast({
        title: "Error",
        description: "Primero valida tus credenciales",
        variant: "destructive",
      });
      return;
    }
    
    // El usuario ya está autenticado, solo redirigir
    setSkipAutoRedirect(false);
  };

  if (showPasswordRecovery) {
    return (
      <PasswordRecovery
        onBack={() => setShowPasswordRecovery(false)}
        initialPhone={telefono}
      />
    );
  }

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      toast({
        title: "Error",
        description: "Ingresa el código de 6 dígitos",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('verify-phone-code', {
        body: {
          phone: telefono,
          code: verificationCode,
          userId: pendingUserId,
        }
      });

      if (error) throw error;

      toast({
        title: "¡Teléfono verificado!",
        description: "Ya puedes iniciar sesión",
      });

      setShowVerification(false);
      setIsLogin(true);
      setVerificationCode("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Código inválido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Web OTP API para auto-llenar el código
  useEffect(() => {
    if (!showVerification) return;

    // Verificar si el navegador soporta Web OTP API
    if ('OTPCredential' in window) {
      const abortController = new AbortController();
      
      navigator.credentials.get({
        // @ts-ignore - OTP credential type
        otp: { transport: ['sms'] },
        signal: abortController.signal
      }).then((otp: any) => {
        if (otp?.code) {
          console.log('📱 OTP auto-detected:', otp.code);
          setVerificationCode(otp.code);
          // Auto-verificar si tenemos 6 dígitos
          if (otp.code.length === 6) {
            toast({
              title: "Código detectado",
              description: "Verificando automáticamente...",
            });
          }
        }
      }).catch((err) => {
        // Error silencioso - el usuario puede ingresar manualmente
        console.log('OTP auto-detect not available:', err.name);
      });

      return () => abortController.abort();
    }
  }, [showVerification]);

  // Auto-verificar cuando el código tiene 6 dígitos
  useEffect(() => {
    if (verificationCode.length === 6 && showVerification && !loading) {
      handleVerifyCode();
    }
  }, [verificationCode]);

  const handleResendCode = async () => {
    setLoading(true);
    try {
      const { error: smsError } = await supabase.functions.invoke('send-verification-sms', {
        body: { phone: telefono }
      });

      if (smsError) throw smsError;

      toast({
        title: "Código reenviado",
        description: "Revisa tu SMS",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo reenviar el código",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (showVerification) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Verificar Teléfono</CardTitle>
            <CardDescription>
              Ingresa el código de 6 dígitos enviado a
              <br />
              <span className="font-semibold text-foreground">{telefono}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col items-center space-y-4">
              <Label className="text-center text-sm text-muted-foreground">
                Código de verificación
              </Label>
              <InputOTP
                maxLength={6}
                value={verificationCode}
                onChange={(value) => setVerificationCode(value)}
                autoFocus
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="w-12 h-14 text-xl" />
                  <InputOTPSlot index={1} className="w-12 h-14 text-xl" />
                  <InputOTPSlot index={2} className="w-12 h-14 text-xl" />
                  <InputOTPSlot index={3} className="w-12 h-14 text-xl" />
                  <InputOTPSlot index={4} className="w-12 h-14 text-xl" />
                  <InputOTPSlot index={5} className="w-12 h-14 text-xl" />
                </InputOTPGroup>
              </InputOTP>
              <p className="text-xs text-muted-foreground text-center">
                El código se verificará automáticamente
              </p>
            </div>
            
            <Button 
              onClick={handleVerifyCode} 
              disabled={loading || verificationCode.length !== 6}
              className="w-full"
            >
              {loading ? "Verificando..." : "Verificar"}
            </Button>
            
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={handleResendCode}
                disabled={loading}
                className="w-full"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reenviar código
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowVerification(false)}
                className="w-full"
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showProviderRegistration) {
    return (
      <ProviderRegistration
        onComplete={handleProviderRegistrationComplete}
        userData={{ email: `${telefono.replace(/\+/g, '')}@todocerca.app`, nombre: nombre || apodo, telefono }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <MapPin className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">TodoCerca</h1>
          </div>
          <p className="text-muted-foreground">
            {isLogin ? "Inicia sesión en tu cuenta" : "Crea tu cuenta"}
          </p>
          
          {/* Toggle Login/Register Button - Moved to top */}
          <div className="mt-6">
            {isLogin ? (
              <button
                onClick={() => setIsLogin(false)}
                className="w-full p-4 rounded-xl border-2 border-primary bg-primary/10 hover:bg-primary/20 transition-all duration-300 group"
              >
                <p className="text-lg font-medium text-muted-foreground mb-1">¿Eres nuevo en TodoCerca?</p>
                <p className="text-2xl font-bold text-primary group-hover:scale-105 transition-transform">
                  ¡Regístrate ahora!
                </p>
              </button>
            ) : (
              <button
                onClick={() => setIsLogin(true)}
                className="text-primary hover:underline font-medium"
              >
                ¿Ya tienes cuenta? <span className="font-bold">Inicia sesión</span>
              </button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {isLogin ? "Iniciar Sesión" : "Registrarse"}
            </CardTitle>
            <CardDescription>
              {isLogin 
                ? "Ingresa tus credenciales para continuar" 
                : "Completa los datos para crear tu cuenta"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-4">
              {!isLogin && (
                <>
                  <Tabs value={userType} onValueChange={(value) => setUserType(value as 'cliente' | 'proveedor')} className="mb-4">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger 
                        value="cliente" 
                        className="flex items-center space-x-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                      >
                        {userType === 'cliente' && <span className="mr-1">✓</span>}
                        <User className="h-4 w-4" />
                        <span>Usuario</span>
                      </TabsTrigger>
                      <TabsTrigger 
                        value="proveedor" 
                        className="flex items-center space-x-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                      >
                        {userType === 'proveedor' && <span className="mr-1">✓</span>}
                        <Store className="h-4 w-4" />
                        <span>Proveedor</span>
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  <div>
                    <Label htmlFor="apodo">Apodo *</Label>
                    <Input
                      id="apodo"
                      type="text"
                      value={apodo}
                      onChange={(e) => setApodo(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="nombre">Nombre: Persona / Negocio / Empresa (opcional)</Label>
                    <Input
                      id="nombre"
                      type="text"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                    />
                  </div>
                </>
              )}

              <PhoneInput
                id="telefono"
                value={telefono}
                onChange={setTelefono}
                label="Número de teléfono"
                required
                placeholder="5512345678"
              />

              <div>
                <Label htmlFor="password">Contraseña *</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                {isLogin && (
                  <div className="mt-2 text-right">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-sm text-primary hover:underline"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                )}
              </div>

              {/* Términos Legales - Solo en registro */}
              {!isLogin && (
                <div className="space-y-4 border border-border rounded-lg p-4 bg-muted/30">
                  <div>
                    <h3 className="font-semibold text-lg mb-2">1. Declaración Legal</h3>
                    <div className="text-sm text-muted-foreground space-y-1 mb-4">
                      <p>Al registrarte en TodoCerca:</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Confirmas que tienes 18+ años.</li>
                        <li>Tú eres responsable de lo que publicas sea legal en México.</li>
                        <li>No vendas armas, drogas, productos robados, medicinas sin receta, ni nada prohibido por la ley.</li>
                        <li>TodoCerca solo conecta vecinos — no participa en tus transacciones.</li>
                      </ul>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-base mb-2">2. Términos de uso</h3>
                    <div className="flex items-start space-x-3 mb-3">
                      <Checkbox 
                        id="terms"
                        checked={acceptedTerms}
                        onCheckedChange={(checked) => setAcceptedTerms(checked as boolean)}
                        className="mt-1"
                      />
                      <Label htmlFor="terms" className="text-sm leading-relaxed cursor-pointer">
                        ☑ Acepto los <span className="font-semibold">Términos de Uso</span>: Sé que TodoCerca solo es un directorio y no es responsable por transacciones, daños o problemas entre usuarios.
                      </Label>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-base mb-2">3. Política de Contenido Prohibido</h3>
                    <div className="flex items-start space-x-3">
                      <Checkbox 
                        id="prohibited"
                        checked={acceptedProhibitedContent}
                        onCheckedChange={(checked) => setAcceptedProhibitedContent(checked as boolean)}
                        className="mt-1"
                      />
                      <Label htmlFor="prohibited" className="text-sm leading-relaxed cursor-pointer">
                        ☑ Acepto la <span className="font-semibold">Política de Contenido Prohibido</span>: No publicaré armas, drogas, artículos falsificados, servicios sin licencia, ni nada ilegal según las leyes mexicanas.
                      </Label>
                    </div>
                  </div>

                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="terms-full">
                      <AccordionTrigger className="text-sm font-medium">
                        Ver Términos de Uso completos
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="text-sm text-muted-foreground space-y-2 p-2">
                          <h4 className="font-semibold text-foreground">Términos de Uso – TodoCerca</h4>
                          <ol className="list-decimal list-inside space-y-1 ml-2">
                            <li>TodoCerca es un directorio comunitario gratuito para conectar vecinos.</li>
                            <li>No somos parte en ninguna transacción entre usuarios.</li>
                            <li>No garantizamos la calidad, legalidad ni seguridad de lo que se publica.</li>
                            <li>Podemos suspender cualquier cuenta que viole las leyes mexicanas o nuestras reglas.</li>
                            <li>Al usar la aplicación, aceptas que asumes los riesgos de tus interacciones.</li>
                          </ol>
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="prohibited-full">
                      <AccordionTrigger className="text-sm font-medium">
                        Ver Política de Contenido Prohibido completa
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="text-sm text-muted-foreground space-y-2 p-2">
                          <h4 className="font-semibold text-foreground">Política de Contenido Prohibido – TodoCerca</h4>
                          <ol className="list-decimal list-inside space-y-2 ml-2">
                            <li>
                              <span className="font-medium">Está prohibido publicar:</span>
                              <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                                <li>Armas, drogas, medicamentos sin receta, productos robados o falsificados.</li>
                                <li>Servicios que requieren licencia (médicos, legales, construcción) sin acreditarla.</li>
                              </ul>
                            </li>
                            <li>No se permite contenido fraudulento, engañoso o que viole derechos de terceros.</li>
                            <li>Reportamos actividades ilegales a las autoridades competentes en México.</li>
                          </ol>
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="privacy">
                      <AccordionTrigger className="text-sm font-medium">
                        Ver Política de Privacidad
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="text-sm text-muted-foreground space-y-2 p-2">
                          <h4 className="font-semibold text-foreground">Política de Privacidad – TodoCerca</h4>
                          <ol className="list-decimal list-inside space-y-2 ml-2">
                            <li>Recopilamos solo lo necesario: nombre, correo, ubicación y lo que publiques (para conectar vecinos).</li>
                            <li>Tus datos no se venden ni se comparten con terceros, excepto si la ley lo exige (ej: autoridades mexicanas).</li>
                            <li>Usamos Supabase (con servidores seguros) para almacenar su información, cumpliendo con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).</li>
                            <li>Puedes acceder, corregir o eliminar tus datos en cualquier momento desde tu perfil.</li>
                            <li>Al registrarte, aceptas esta política y el uso de tu información para fines comunitarios locales.</li>
                          </ol>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              )}

              {/* Mostrar ID consecutivo cuando las credenciales sean válidas */}
              {isLogin && showIdConsecutivo && userIdConsecutivo && (
                <div className="bg-primary/10 border border-primary rounded-lg p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Tu ID es:</p>
                  <p className="text-3xl font-bold text-primary">{userIdConsecutivo}</p>
                </div>
              )}

              <div className="pt-4 pb-8">
                {isLogin && showIdConsecutivo ? (
                  <Button 
                    type="button"
                    className="w-full" 
                    onClick={handleProceedWithLogin}
                  >
                    Continuar al Dashboard
                  </Button>
                ) : (
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={loading}
                  >
                    {loading ? "Procesando..." : (isLogin ? "Validar Credenciales" : "Registrarse")}
                  </Button>
                )}

                {/* Botón de ayuda */}
                {isLogin && !showIdConsecutivo && (
                  <div className="mt-4">
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      disabled={loading}
                      onClick={handleForgotPassword}
                    >
                      ¿Olvidaste tu contraseña?
                    </Button>
                  </div>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;