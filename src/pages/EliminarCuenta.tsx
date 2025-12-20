import { ArrowLeft, Trash2, Mail, Clock, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const EliminarCuenta = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground p-4 flex items-center gap-3">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate(-1)}
          className="text-primary-foreground hover:bg-primary/80"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">Eliminar Cuenta</h1>
      </header>

      <main className="container max-w-2xl mx-auto p-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Solicitar Eliminación de Cuenta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Si deseas eliminar tu cuenta y todos los datos asociados de TodoCerca, 
              puedes solicitar la eliminación siguiendo el proceso que se describe a continuación.
            </p>

            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <h3 className="font-semibold text-destructive mb-2">Advertencia</h3>
              <p className="text-sm text-muted-foreground">
                La eliminación de tu cuenta es <strong>permanente e irreversible</strong>. 
                Una vez procesada, no podrás recuperar tu cuenta ni ninguno de los datos asociados.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">¿Qué datos se eliminarán?</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-destructive mt-1">•</span>
                Tu perfil de usuario y toda la información personal
              </li>
              <li className="flex items-start gap-2">
                <span className="text-destructive mt-1">•</span>
                Productos y publicaciones creadas
              </li>
              <li className="flex items-start gap-2">
                <span className="text-destructive mt-1">•</span>
                Historial de pedidos y transacciones
              </li>
              <li className="flex items-start gap-2">
                <span className="text-destructive mt-1">•</span>
                Mensajes y conversaciones
              </li>
              <li className="flex items-start gap-2">
                <span className="text-destructive mt-1">•</span>
                Datos de ubicación y rastreo
              </li>
              <li className="flex items-start gap-2">
                <span className="text-destructive mt-1">•</span>
                Favoritos y contactos guardados
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Proceso de Eliminación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="bg-primary/10 rounded-full p-2">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h4 className="font-medium">1. Envía tu solicitud</h4>
                <p className="text-sm text-muted-foreground">
                  Envía un correo electrónico a{" "}
                  <a 
                    href="mailto:soporte@todocerca.mx?subject=Solicitud de eliminación de cuenta" 
                    className="text-primary underline"
                  >
                    soporte@todocerca.mx
                  </a>{" "}
                  con el asunto "Solicitud de eliminación de cuenta" e incluye:
                </p>
                <ul className="text-sm text-muted-foreground mt-2 ml-4 list-disc">
                  <li>El correo electrónico asociado a tu cuenta</li>
                  <li>Tu número de teléfono registrado</li>
                  <li>Confirmación de que deseas eliminar tu cuenta</li>
                </ul>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="bg-primary/10 rounded-full p-2">
                <Shield className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h4 className="font-medium">2. Verificación de identidad</h4>
                <p className="text-sm text-muted-foreground">
                  Verificaremos tu identidad para asegurarnos de que eres el propietario 
                  de la cuenta antes de proceder con la eliminación.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="bg-primary/10 rounded-full p-2">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h4 className="font-medium">3. Procesamiento</h4>
                <p className="text-sm text-muted-foreground">
                  Tu solicitud será procesada en un plazo máximo de 30 días hábiles. 
                  Recibirás una confirmación por correo electrónico cuando se complete.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contacto</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Si tienes preguntas sobre el proceso de eliminación de cuenta, 
              puedes contactarnos:
            </p>
            <div className="space-y-2">
              <p className="text-sm">
                <strong>Correo electrónico:</strong>{" "}
                <a href="mailto:soporte@todocerca.mx" className="text-primary underline">
                  soporte@todocerca.mx
                </a>
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="text-center pb-4">
          <Button 
            variant="destructive" 
            className="w-full max-w-sm"
            onClick={() => window.location.href = "mailto:soporte@todocerca.mx?subject=Solicitud de eliminación de cuenta"}
          >
            <Mail className="h-4 w-4 mr-2" />
            Solicitar Eliminación de Cuenta
          </Button>
        </div>
      </main>
    </div>
  );
};

export default EliminarCuenta;
