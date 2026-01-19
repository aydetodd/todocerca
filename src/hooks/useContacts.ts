import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Contact {
  id: string;
  contact_user_id: string;
  nickname: string | null;
  apodo: string | null;
  nombre: string | null;
  telefono: string | null;
  is_sos_trusted: boolean;
}

export const useContacts = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchContacts = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // Obtener contactos con información del perfil
    const { data, error } = await supabase
      .from('user_contacts')
      .select('id, contact_user_id, nickname, is_sos_trusted')
      .eq('user_id', user.id);

    if (error) {
      console.error('Error fetching contacts:', error);
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setContacts([]);
      setLoading(false);
      return;
    }

    // Obtener perfiles de los contactos
    const contactUserIds = data.map(c => c.contact_user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, apodo, nombre, telefono')
      .in('user_id', contactUserIds);

    const contactsWithProfiles = data.map(contact => {
      const profile = profiles?.find(p => p.user_id === contact.contact_user_id);
      return {
        ...contact,
        is_sos_trusted: contact.is_sos_trusted ?? false,
        apodo: profile?.apodo || null,
        nombre: profile?.nombre || null,
        telefono: profile?.telefono || null
      };
    });

    setContacts(contactsWithProfiles);
    setLoading(false);
  };

  // Actualizar si un contacto recibe SOS
  const toggleSOSTrusted = async (contactId: string, isTrusted: boolean) => {
    const { error } = await supabase
      .from('user_contacts')
      .update({ is_sos_trusted: isTrusted })
      .eq('id', contactId);

    if (!error) {
      setContacts(prev => 
        prev.map(c => c.id === contactId ? { ...c, is_sos_trusted: isTrusted } : c)
      );
    }
    return { error };
  };

  useEffect(() => {
    fetchContacts();

    // Suscribirse a cambios en contactos
    const channel = supabase
      .channel('contacts_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_contacts'
        },
        () => {
          fetchContacts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Contactos que recibirán SOS
  const sosContacts = contacts.filter(c => c.is_sos_trusted);

  return { 
    contacts, 
    sosContacts,
    loading, 
    refresh: fetchContacts,
    toggleSOSTrusted 
  };
};
