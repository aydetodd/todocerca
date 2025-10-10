import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { MapPin, User, Store } from "lucide-react";
import ProviderRegistration from "@/components/ProviderRegistration";
import PasswordRecovery from "@/components/PasswordRecovery";
import { PhoneInput } from "@/components/ui/phone-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const Auth = () => {
  const [telefono, setTelefono] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [apodo, setApodo] = useState("");
  const [email, setEmail] = useState("");
  const [codigoPostal, setCodigoPostal] = useState("");
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
  
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && user && !showProviderRegistration && !skipAutoRedirect) {
      navigate("/profile");
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
      codigoPostal: codigoPostal ? 'filled' : 'empty'
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
    
    if (!isLogin && !nombre) {
      console.log('❌ Missing nombre for registration');
      toast({
        title: "Error", 
        description: "El nombre es obligatorio para el registro",
        variant: "destructive",
      });
      return;
    }
    
    // Validar que se aceptaron los términos al registrarse
    if (!isLogin && (!acceptedTerms || !acceptedProhibitedContent)) {
      console.log('❌ Terms not accepted');
      toast({
        title: "Error",
        description: "Debes aceptar los Términos de Uso y la Política de Contenido Prohibido para registrarte",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    setShowIdConsecutivo(false);
    console.log('⏳ Starting authentication process...');

    try {
      if (isLogin) {
        console.log('🔑 Attempting login with phone...');
        
        // Buscar el perfil por teléfono para obtener el user_id, consecutive_number y email
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('user_id, consecutive_number, email')
          .eq('telefono', telefono)
          .maybeSingle();

        if (profileError || !profileData) {
          throw new Error('Número de teléfono no encontrado');
        }

        console.log('📱 Profile found:', profileData.consecutive_number);

        // Si el usuario proporcionó un email en el login, usarlo. Si no, usar el del perfil o generar uno
        const emailToUse = email || profileData.email || `${telefono.replace(/\+/g, '')}@todocerca.app`;
        console.log('📧 Using email:', emailToUse);
        
        // Intentar login con el email correcto
        const { data, error } = await supabase.auth.signInWithPassword({
          email: emailToUse,
          password,
        });

        console.log('🔑 Login result:', { data: data?.user ? 'user found' : 'no user', error });

        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            throw new Error('Teléfono o contraseña incorrectos');
          }
          if (error.message.includes('Email not confirmed')) {
            throw new Error('Debes verificar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada.');
          }
          throw error;
        }

        // Verificar que el email esté confirmado
        if (data.user && !data.user.email_confirmed_at) {
          await supabase.auth.signOut();
          throw new Error('Debes verificar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada.');
        }

        // Mostrar el ID consecutivo
        setUserIdConsecutivo(profileData.consecutive_number);
        setShowIdConsecutivo(true);

        toast({
          title: "¡Bienvenido!",
          description: `Tu número de usuario es: ${profileData.consecutive_number}`,
        });

        // Post-login flow for providers: check if they need to complete provider registration
        try {
          setSkipAutoRedirect(true);
          const role = data.user?.user_metadata?.role;
          const userId = data.user?.id;
          if (role === 'proveedor' && userId) {
            const { data: existingProvider, error: providerLookupError } = await supabase
              .from('proveedores')
              .select('id')
              .eq('user_id', userId)
              .maybeSingle();
            if (providerLookupError) {
              console.log('⚠️ Provider lookup error (non-fatal):', providerLookupError);
            }
            if (!existingProvider) {
              setShowProviderRegistration(true);
              toast({
                title: "Completa tu perfil de proveedor",
                description: "Registra tus productos para comenzar.",
              });
            } else {
              setSkipAutoRedirect(false);
            }
          } else {
            setSkipAutoRedirect(false);
          }
        } catch (e) {
          console.log('⚠️ Post-login provider flow error:', e);
          setSkipAutoRedirect(false);
        }
      } else {
        console.log('📝 Attempting registration...');
        console.log('📝 Registration data:', { telefono, userType, nombre, email });
        
        // Usar email proporcionado o generar automático basado en el teléfono
        const finalEmail = email || `${telefono.replace(/\+/g, '')}@todocerca.app`;
        
        // Registro
        const { data, error } = await supabase.auth.signUp({
          email: finalEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              nombre,
              apodo: apodo || nombre,
              role: userType,
              telefono,
              email: email || null, // Guardar email real si existe
            },
          },
        });

        console.log('📝 Registration result:', { 
          user: data?.user ? 'user created' : 'no user', 
          error: error ? error.message : 'none' 
        });

        if (error) {
          if (error.message.includes('already registered')) {
            throw new Error('Este número de teléfono ya está registrado');
          }
          throw error;
        }

        if (data.user) {
          console.log('✅ User registered successfully:', data.user.id);

          // Actualizar el perfil con el teléfono y email
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ 
              telefono,
              email: email || null  // Guardar el email real si fue proporcionado
            })
            .eq('user_id', data.user.id);

          if (updateError) {
            console.error('⚠️ Error updating profile with phone and email:', updateError);
          }

          // Enviar mensaje de bienvenida por WhatsApp
          try {
            await supabase.functions.invoke('send-whatsapp-welcome', {
              body: {
                phoneNumber: telefono,
                userName: nombre,
                userType: userType,
              },
            });
            console.log('📱 WhatsApp welcome message sent');
          } catch (whatsappError) {
            console.error('⚠️ Error sending WhatsApp message:', whatsappError);
            // No mostramos error al usuario, solo lo registramos
          }

          // Mostrar mensaje de verificación de correo
          const emailUsed = email || finalEmail;
          toast({
            title: "¡Cuenta creada!",
            description: `Revisa tu correo ${emailUsed} para verificar tu cuenta antes de iniciar sesión.`,
            duration: 8000,
          });
          
          console.log('📧 Email verification required');
          
          // Cambiar a modo login para que el usuario inicie sesión después de verificar
          setIsLogin(true);
          
          // Cerrar la sesión automática si existe (para forzar verificación)
          await supabase.auth.signOut();
          
        } else {
          console.log('❌ No user data returned from registration');
          throw new Error('No se pudo crear la cuenta');
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

  if (showProviderRegistration) {
    return (
      <ProviderRegistration
        onComplete={handleProviderRegistrationComplete}
        userData={{ email: `${telefono.replace(/\+/g, '')}@todocerca.app`, nombre, telefono, codigoPostal }}
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
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary hover:underline font-medium text-lg"
            >
              {isLogin 
                ? "¿No tienes cuenta? Regístrate" 
                : "¿Ya tienes cuenta? Inicia sesión"
              }
            </button>
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
                      <TabsTrigger value="cliente" className="flex items-center space-x-2">
                        <User className="h-4 w-4" />
                        <span>Cliente</span>
                      </TabsTrigger>
                      <TabsTrigger value="proveedor" className="flex items-center space-x-2">
                        <Store className="h-4 w-4" />
                        <span>Proveedor</span>
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  <div>
                    <Label htmlFor="nombre">Nombre completo *</Label>
                    <Input
                      id="nombre"
                      type="text"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="apodo">Apodo (opcional)</Label>
                    <Input
                      id="apodo"
                      type="text"
                      value={apodo}
                      onChange={(e) => setApodo(e.target.value)}
                      placeholder="Dejá vacío para usar tu nombre"
                    />
                  </div>

                  <div>
                    <Label htmlFor="email">Email (opcional - para recuperar contraseña)</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu@email.com"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Si proporcionas tu email, podrás recuperar tu contraseña fácilmente
                    </p>
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

              {isLogin && (
                <div>
                  <Label htmlFor="email">Email (opcional)</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Si te registraste con un email, ingrésalo aquí
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor="password">Contraseña *</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {!isLogin && (
                <div>
                  <Label htmlFor="codigoPostal">Código postal (opcional)</Label>
                  <Input
                    id="codigoPostal"
                    type="text"
                    value={codigoPostal}
                    onChange={(e) => setCodigoPostal(e.target.value)}
                  />
                </div>
              )}

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