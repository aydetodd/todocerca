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
          throw error;
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

          if (userType === 'proveedor') {
            console.log('🏢 Handling provider post-signup...');
            if (data.session) {
              console.log('🟢 Session present after signup, opening ProviderRegistration');
              setShowProviderRegistration(true);
              toast({
                title: "¡Cuenta creada!",
                description: "Completa tu perfil de proveedor.",
              });
            } else {
              console.log('🟠 No session after signup, requiring confirmation/login before provider setup');
              toast({
                title: "Cuenta creada",
                description: "Inicia sesión para completar tu perfil de proveedor.",
              });
              setIsLogin(true);
              navigate("/");
            }
          } else {
            console.log('👤 Client registration completed');
            toast({
              title: "¡Registro exitoso!",
              description: "Tu cuenta ha sido creada correctamente.",
            });
            
            // La navegación se manejará automáticamente por el hook useAuth
          }
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

              <div>
                <Label htmlFor="telefono">Número de teléfono *</Label>
                <Input
                  id="telefono"
                  type="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="5512345678"
                  required
                />
              </div>

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