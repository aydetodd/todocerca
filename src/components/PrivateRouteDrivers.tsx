import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Trash2, Send, Loader2, User } from 'lucide-react';
import { PhoneInput } from '@/components/ui/phone-input';

interface Driver {
  id: string;
  telefono: string;
  nombre: string | null;
  user_id: string | null;
  is_active: boolean;
  invite_token: string;
}

interface PrivateRouteDriversProps {
  proveedorId: string;
  productoId: string;
  vehicleName: string;
  businessName: string;
}

export default function PrivateRouteDrivers({
  proveedorId,
  productoId,
  vehicleName,
  businessName,
}: PrivateRouteDriversProps) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleteDriverId, setDeleteDriverId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchDrivers();
  }, [proveedorId]);

  const fetchDrivers = async () => {
    try {
      const { data, error } = await supabase
        .from('choferes_empresa')
        .select('*')
        .eq('proveedor_id', proveedorId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setDrivers((data || []) as Driver[]);
    } catch (error) {
      console.error('Error fetching drivers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDriver = async () => {
    if (!newPhone || newPhone.length < 10) {
      toast({
        title: "Error",
        description: "Ingresa un número de teléfono válido",
        variant: "destructive",
      });
      return;
    }

    try {
      setAdding(true);
      
      const { data, error } = await supabase
        .from('choferes_empresa')
        .insert({
          proveedor_id: proveedorId,
          telefono: newPhone,
          nombre: newName || null,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast({
            title: "Chofer ya registrado",
            description: "Este número ya está registrado en tu empresa",
            variant: "destructive",
          });
          return;
        }
        throw error;
      }

      // Send WhatsApp invitation
      const cleanPhone = newPhone.replace(/[^0-9]/g, '');
      const driverName = newName || 'Chofer';
      const mensaje = encodeURIComponent(
        `¡Hola ${driverName}! 👋 Has sido registrado como chofer de "${businessName}" en TodoCerca.\n\n` +
        `Descarga la app para reportar tu ubicación en tiempo real:\n` +
        `https://todocerca.lovable.app\n\n` +
        `Cuando abras la app, selecciona la ruta que vas a cubrir ese día.`
      );
      window.open(`https://wa.me/${cleanPhone}?text=${mensaje}`, '_blank');

      toast({
        title: "Chofer agregado",
        description: `${driverName} ha sido registrado e invitado por WhatsApp`,
      });

      setNewPhone('');
      setNewName('');
      fetchDrivers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteDriver = async () => {
    if (!deleteDriverId) return;
    try {
      const { error } = await supabase
        .from('choferes_empresa')
        .delete()
        .eq('id', deleteDriverId);

      if (error) throw error;
      toast({ title: "Chofer eliminado" });
      setDeleteDriverId(null);
      fetchDrivers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const sendGroupWhatsApp = () => {
    if (drivers.length === 0) return;
    
    const mensaje = encodeURIComponent(
      `¡Equipo de ${businessName}! 👋\n\n` +
      `Recuerden abrir la app TodoCerca al iniciar su ruta para compartir ubicación en tiempo real.\n\n` +
      `📱 App: https://todocerca.lovable.app\n\n` +
      `¡Gracias por su trabajo! 🚌`
    );
    
    // Open WhatsApp with the message (user will need to select the group)
    window.open(`https://wa.me/?text=${mensaje}`, '_blank');
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5" />
            Choferes - {vehicleName}
          </CardTitle>
          <CardDescription>
            Agrega choferes y envía invitaciones por WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add driver form */}
          <div className="bg-muted/30 p-4 rounded-lg space-y-3">
            <Label>Agregar Chofer</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre del chofer"
              />
              <PhoneInput
                value={newPhone}
                onChange={(value) => setNewPhone(value || '')}
                placeholder="WhatsApp del chofer"
                label=""
              />
            </div>
            <Button 
              onClick={handleAddDriver} 
              disabled={adding || !newPhone}
              size="sm"
              className="w-full"
            >
              {adding ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Agregando...</>
              ) : (
                <><Plus className="h-4 w-4 mr-1" /> Agregar e invitar por WhatsApp</>
              )}
            </Button>
          </div>

          {/* Drivers list */}
          {drivers.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Choferes registrados ({drivers.length})</Label>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={sendGroupWhatsApp}
                >
                  <Send className="h-3 w-3 mr-1" />
                  Mensaje grupal
                </Button>
              </div>
              {drivers.map((driver) => (
                <div 
                  key={driver.id} 
                  className="flex items-center justify-between bg-background p-3 rounded-lg border"
                >
                  <div>
                    <p className="font-medium text-sm">
                      {driver.nombre || 'Sin nombre'}
                    </p>
                    <p className="text-xs text-muted-foreground">{driver.telefono}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={driver.user_id ? 'default' : 'secondary'} className="text-xs">
                      {driver.user_id ? 'Vinculado' : 'Pendiente'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setDeleteDriverId(driver.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay choferes registrados. Agrega el primer chofer arriba.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteDriverId} onOpenChange={() => setDeleteDriverId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar chofer?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará este chofer de tu empresa. Podrás agregarlo de nuevo después.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDriver}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
