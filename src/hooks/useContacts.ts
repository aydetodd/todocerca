import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Contact {
  id: string;
  user_id: string;
  contact_user_id: string;
  nickname: string | null;
  created_at: string;
  is_sos_trusted: boolean;
  blocked?: boolean;
  profile?: {
    apodo: string | null;
    nombre: string;
    telefono: string | null;
  };
}

export const useContacts = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchContacts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: contactsData, error } = await supabase
        .from('user_contacts')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

      // Fetch profiles for each contact
      const contactsWithProfiles = await Promise.all(
        (contactsData || []).map(async (contact) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('apodo, nombre, telefono')
            .eq('user_id', contact.contact_user_id)
            .single();

          return {
            ...contact,
            is_sos_trusted: contact.is_sos_trusted || false,
            profile: profile || undefined,
          };
        })
      );

      setContacts(contactsWithProfiles);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  // Toggle SOS trusted status BIDIRECCIONALMENTE
  const toggleSOSTrusted = async (contactId: string, isTrusted: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Encontrar el contacto para obtener contact_user_id
      const contact = contacts.find(c => c.id === contactId);
      if (!contact) return;

      // 1. Actualizar en MI lista de contactos
      const { error: error1 } = await supabase
        .from('user_contacts')
        .update({ is_sos_trusted: isTrusted })
        .eq('id', contactId);

      if (error1) throw error1;

      // 2. BIDIRECCIONAL: También actualizar en la lista del otro usuario
      // para que ambos puedan enviar/recibir SOS entre sí
      const { error: error2 } = await supabase
        .from('user_contacts')
        .update({ is_sos_trusted: isTrusted })
        .eq('user_id', contact.contact_user_id)
        .eq('contact_user_id', user.id);

      if (error2) {
        console.log('No se pudo actualizar contacto bidireccional (puede que no exista aún):', error2);
      }

      // Actualizar estado local
      setContacts(prev => 
        prev.map(c => 
          c.id === contactId 
            ? { ...c, is_sos_trusted: isTrusted }
            : c
        )
      );

      toast({
        title: isTrusted ? "Contacto de auxilio activado" : "Contacto de auxilio desactivado",
        description: isTrusted 
          ? "Ahora ambos pueden enviarse alertas SOS mutuamente" 
          : "Ya no recibirán alertas SOS entre ustedes",
      });
    } catch (error) {
      console.error('Error toggling SOS trusted:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado del contacto",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchContacts();

    // Suscribirse a cambios en contactos
    const channel = supabase
      .channel('user_contacts_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_contacts' },
        () => fetchContacts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Filtrar contactos de confianza SOS
  const sosContacts = contacts.filter(c => c.is_sos_trusted);

  const toggleBlocked = async (contactId: string, blocked: boolean) => {
    try {
      const { error } = await supabase
        .from('user_contacts')
        .update({ blocked })
        .eq('id', contactId);
      if (error) throw error;
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, blocked } : c));
      toast({
        title: blocked ? 'Contacto bloqueado' : 'Contacto desbloqueado',
        description: blocked ? 'Ya no verás sus mensajes ni podrá escribirte.' : 'Ya pueden intercambiar mensajes.',
      });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'No se pudo actualizar', variant: 'destructive' });
    }
  };

  const addContactByPhone = async (phone: string): Promise<{ userId: string; name: string } | null> => {
    try {
      const { data, error } = await supabase.rpc('add_contact_by_phone', { phone_param: phone });
      if (error) {
        const msg = error.message || '';
        if (msg.includes('user_not_found')) {
          toast({ title: 'No encontrado', description: 'Ese número no está registrado en TodoCerca.', variant: 'destructive' });
        } else if (msg.includes('cannot_add_self')) {
          toast({ title: 'Ese eres tú', description: 'No puedes agregarte a ti mismo.', variant: 'destructive' });
        } else {
          toast({ title: 'Error', description: msg, variant: 'destructive' });
        }
        return null;
      }
      const row: any = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      await fetchContacts();
      toast({ title: 'Contacto agregado', description: `Ya puedes chatear con ${row.apodo || row.nombre || 'este usuario'}.` });
      return { userId: row.user_id, name: row.apodo || row.nombre || 'Usuario' };
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'No se pudo agregar', variant: 'destructive' });
      return null;
    }
  };

  return {
    contacts,
    sosContacts,
    loading,
    refreshContacts: fetchContacts,
    toggleSOSTrusted,
    toggleBlocked,
    addContactByPhone,
  };
};
