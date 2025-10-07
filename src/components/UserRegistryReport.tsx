import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface UserRecord {
  consecutive_number: number;
  codigo: string;
  role: string;
  nombre: string;
  apodo: string;
  telefono: string;
  email: string;
  codigo_postal: string;
  created_at: string;
}

interface UserRegistryReportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function UserRegistryReport({ open, onOpenChange }: UserRegistryReportProps) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, clientes: 0, proveedores: 0 });

  useEffect(() => {
    if (open) {
      loadUsers();
    }
  }, [open]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('consecutive_number, role, nombre, apodo, telefono, email, codigo_postal, created_at')
        .order('consecutive_number', { ascending: true });

      if (error) throw error;

      const formattedUsers = data?.map(user => ({
        ...user,
        codigo: user.role === 'cliente' ? `C${user.consecutive_number}` : `P${user.consecutive_number}`
      })) || [];

      setUsers(formattedUsers);
      
      const clientes = formattedUsers.filter(u => u.role === 'cliente').length;
      const proveedores = formattedUsers.filter(u => u.role === 'proveedor').length;
      setStats({ total: formattedUsers.length, clientes, proveedores });
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Reporte de Usuarios Registrados</DialogTitle>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-amber-50 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-amber-600">{stats.total}</div>
                <div className="text-sm text-gray-600">Total</div>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.clientes}</div>
                <div className="text-sm text-gray-600">Clientes</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-600">{stats.proveedores}</div>
                <div className="text-sm text-gray-600">Proveedores</div>
              </div>
            </div>

            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {users.map((user) => (
                  <div key={user.consecutive_number} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={user.role === 'cliente' ? 'default' : 'secondary'}>
                          {user.codigo}
                        </Badge>
                        <span className="font-semibold">{user.nombre}</span>
                        {user.apodo && user.apodo !== user.nombre && (
                          <span className="text-sm text-gray-500">({user.apodo})</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(user.created_at).toLocaleDateString('es-MX')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                      {user.telefono && (
                        <div>
                          <span className="font-medium">Tel:</span> {user.telefono}
                        </div>
                      )}
                      {user.email && (
                        <div>
                          <span className="font-medium">Email:</span> {user.email}
                        </div>
                      )}
                      {user.codigo_postal && (
                        <div>
                          <span className="font-medium">CP:</span> {user.codigo_postal}
                        </div>
                      )}
                      <div>
                        <span className="font-medium">Rol:</span>{' '}
                        {user.role === 'cliente' ? 'Cliente' : 'Proveedor'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
