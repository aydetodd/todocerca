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

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [codigoPostal, setCodigoPostal] = useState("");
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [userType, setUserType] = useState<'cliente' | 'proveedor'>('cliente');
  const [showProviderRegistration, setShowProviderRegistration] = useState(false);
  
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  // Redirect if already authenticated
  useEffect(() => {
    if (user && !showProviderRegistration) {
      navigate("/dashboard");
    }
  }, [user, navigate, showProviderRegistration]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🚀 handleAuth called!');
    console.log('📋 Form state:', { 
      isLogin, 
      userType, 
      email: email ? 'filled' : 'empty', 
      password: password ? 'filled' : 'empty',
      nombre: nombre ? 'filled' : 'empty',
      telefono: telefono ? 'filled' : 'empty',
      codigoPostal: codigoPostal ? 'filled' : 'empty'
    });
    
    // Basic validation
    if (!email || !password) {
      console.log('❌ Missing email or password');
      toast({
        title: "Error",
        description: "Email y contraseña son obligatorios",
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
    console.log('⏳ Starting authentication process...');

    try {
      if (isLogin) {
        console.log('🔑 Attempting login...');
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        console.log('🔑 Login result:', { data: data?.user ? 'user found' : 'no user', error });

        if (error) throw error;

        toast({
          title: "¡Bienvenido!",
          description: "Has iniciado sesión correctamente.",
        });
      } else {
        console.log('📝 Attempting registration...');
        console.log('📝 Registration data:', { email, userType, nombre });
        
        // Registro
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              nombre,
              role: userType,
            },
          },
        });

        console.log('📝 Registration result:', { 
          user: data?.user ? 'user created' : 'no user', 
          error: error ? error.message : 'none' 
        });

        if (error) throw error;

        if (data.user) {
          console.log('✅ User registered successfully:', data.user.id);

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
              console.log('🟠 No session after signup, requiring email confirmation/login before provider setup');
              toast({
                title: "Verifica tu correo",
                description: "Confirma tu email e inicia sesión para completar tu perfil de proveedor.",
              });
              setIsLogin(true);
              navigate("/");
            }
          } else {
            console.log('👤 Client registration completed');
            toast({
              title: "¡Registro exitoso!",
              description: data.user.email_confirmed_at 
                ? "Tu cuenta ha sido creada correctamente." 
                : "Revisa tu correo para confirmar tu cuenta.",
            });
            
            // La navegación se manejará automáticamente por el hook useAuth
            if (!data.user.email_confirmed_at) {
              // Si necesita confirmación por email, ir a la página principal
              navigate("/");
            }
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
    navigate('/dashboard');
  };

  if (showProviderRegistration) {
    return (
      <ProviderRegistration
        onComplete={handleProviderRegistrationComplete}
        userData={{ email, nombre, telefono, codigoPostal }}
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
                    <Label htmlFor="nombre">Nombre completo</Label>
                    <Input
                      id="nombre"
                      type="text"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}

              <div>
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {!isLogin && (
                <>
                  <div>
                    <Label htmlFor="telefono">Teléfono (opcional)</Label>
                    <Input
                      id="telefono"
                      type="tel"
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="codigoPostal">Código postal (opcional)</Label>
                    <Input
                      id="codigoPostal"
                      type="text"
                      value={codigoPostal}
                      onChange={(e) => setCodigoPostal(e.target.value)}
                    />
                  </div>
                </>
              )}

              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading}
                onClick={() => console.log('🔲 Submit button clicked!')}
              >
                {loading ? "Procesando..." : (isLogin ? "Iniciar Sesión" : "Registrarse")}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="text-primary hover:underline"
              >
                {isLogin 
                  ? "¿No tienes cuenta? Regístrate" 
                  : "¿Ya tienes cuenta? Inicia sesión"
                }
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;