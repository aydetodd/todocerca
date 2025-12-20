import { useState } from "react";
import { ArrowLeft, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const EliminarCuenta = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (confirmText !== "ELIMINAR") {
      toast.error("Debes escribir ELIMINAR para confirmar");
      return;
    }

    if (!user) {
      toast.error("Debes iniciar sesión para eliminar tu cuenta");
      navigate("/auth");
      return;
    }

    setIsDeleting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Sesión expirada. Por favor, inicia sesión nuevamente.");
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase.functions.invoke('delete-account', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) {
        console.error("Error deleting account:", error);
        toast.error("Error al eliminar la cuenta. Intenta nuevamente.");
        return;
      }

      if (data?.success) {
        toast.success("Tu cuenta ha sido eliminada exitosamente");
        await signOut();
        navigate("/");
      } else {
        toast.error(data?.error || "Error al eliminar la cuenta");
      }
    } catch (error) {
      console.error("Unexpected error:", error);
      toast.error("Error inesperado. Intenta nuevamente.");
    } finally {
      setIsDeleting(false);
      setShowConfirmDialog(false);
    }
  };

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
              Eliminar Mi Cuenta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Si deseas eliminar tu cuenta y todos los datos asociados de TodoCerca, 
              puedes hacerlo directamente desde esta página.
            </p>

            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                <div>
                  <h3 className="font-semibold text-destructive mb-2">Advertencia Importante</h3>
                  <p className="text-sm text-muted-foreground">
                    La eliminación de tu cuenta es <strong>permanente e irreversible</strong>. 
                    Una vez eliminada, no podrás recuperar tu cuenta ni ninguno de los datos asociados.
                  </p>
                </div>
              </div>
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
              <li className="flex items-start gap-2">
                <span className="text-destructive mt-1">•</span>
                Grupos de rastreo que hayas creado
              </li>
            </ul>
          </CardContent>
        </Card>

        {user ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-destructive">Confirmar Eliminación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Para confirmar la eliminación de tu cuenta, escribe <strong>ELIMINAR</strong> en el campo de abajo:
              </p>
              
              <div className="space-y-2">
                <Label htmlFor="confirm">Escribe ELIMINAR para confirmar</Label>
                <Input
                  id="confirm"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                  placeholder="ELIMINAR"
                  className="font-mono"
                />
              </div>

              <Button 
                variant="destructive" 
                className="w-full"
                onClick={() => setShowConfirmDialog(true)}
                disabled={confirmText !== "ELIMINAR" || isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Eliminando cuenta...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar Mi Cuenta Permanentemente
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-6">
              <p className="text-center text-muted-foreground mb-4">
                Debes iniciar sesión para eliminar tu cuenta.
              </p>
              <Button 
                className="w-full"
                onClick={() => navigate("/auth")}
              >
                Iniciar Sesión
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">¿Necesitas ayuda?</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Si tienes problemas o preguntas, puedes contactarnos en{" "}
              <a href="mailto:soporte@todocerca.mx" className="text-primary underline">
                soporte@todocerca.mx
              </a>
            </p>
          </CardContent>
        </Card>
      </main>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              ¿Estás completamente seguro?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es <strong>permanente e irreversible</strong>. Todos tus datos serán 
              eliminados inmediatamente y no podrás recuperar tu cuenta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                "Sí, eliminar mi cuenta"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default EliminarCuenta;
