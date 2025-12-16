import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Contact {
  id: string;
  contact_user_id: string;
  nickname: string | null;
  apodo: string | null;
  nombre: string | null;
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
      .select('id, contact_user_id, nickname')
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
      .select('user_id, apodo, nombre')
      .in('user_id', contactUserIds);

    const contactsWithProfiles = data.map(contact => {
      const profile = profiles?.find(p => p.user_id === contact.contact_user_id);
      return {
        ...contact,
        apodo: profile?.apodo || null,
        nombre: profile?.nombre || null
      };
    });

    setContacts(contactsWithProfiles);
    setLoading(false);
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

  return { contacts, loading, refresh: fetchContacts };
};
