import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface TrackingGroup {
  id: string;
  owner_id: string;
  name: string;
  subscription_status: 'active' | 'expired' | 'cancelled';
  subscription_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  nickname: string;
  phone_number: string | null;
  is_owner: boolean;
  joined_at: string;
}

export interface TrackingInvitation {
  id: string;
  group_id: string;
  phone_number: string;
  nickname: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export const useTrackingGroup = () => {
  const [allGroups, setAllGroups] = useState<TrackingGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [group, setGroup] = useState<TrackingGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [invitations, setInvitations] = useState<TrackingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchAllGroups();
    checkPendingInvitations();
  }, []);

  // Cuando cambia el grupo seleccionado, actualizar el grupo actual
  useEffect(() => {
    if (selectedGroupId) {
      const selectedGroup = allGroups.find(g => g.id === selectedGroupId);
      if (selectedGroup) {
        setGroup(selectedGroup);
        fetchMembers(selectedGroup.id);
        fetchInvitations(selectedGroup.id);
      }
    }
  }, [selectedGroupId, allGroups]);

  // Suscripciones en tiempo real en un useEffect separado que depende del group.id
  useEffect(() => {
    if (!group?.id) return;

    console.log('Setting up realtime subscriptions for group:', group.id);

    // Suscribirse a cambios en miembros del grupo en tiempo real
    const membersChannel = supabase
      .channel(`tracking_members_${group.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tracking_group_members',
          filter: `group_id=eq.${group.id}`
        },
        (payload) => {
          console.log('Members changed:', payload);
          fetchMembers(group.id);
        }
      )
      .subscribe();

    // Suscribirse a cambios en invitaciones en tiempo real
    const invitationsChannel = supabase
      .channel(`tracking_invitations_${group.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tracking_invitations',
          filter: `group_id=eq.${group.id}`
        },
        (payload) => {
          console.log('Invitations changed:', payload);
          fetchInvitations(group.id);
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up realtime subscriptions');
      supabase.removeChannel(membersChannel);
      supabase.removeChannel(invitationsChannel);
    };
  }, [group?.id]);

  const checkPendingInvitations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[Invitations] No user found');
        return [];
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('telefono')
        .eq('user_id', user.id)
        .single();

      if (!profile?.telefono) {
        console.log('[Invitations] User has no phone number in profile');
        return [];
      }

      console.log('[Invitations] Checking for phone:', profile.telefono);

      // Buscar invitaciones que coincidan con el teléfono normalizado
      const { data: pendingInvites, error } = await supabase
        .from('tracking_invitations')
        .select('*, tracking_groups(name)')
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString());

      if (error) throw error;

      // Filtrar manualmente las que coincidan con el teléfono normalizado
      const normalizePhone = (phone: string) => phone.replace(/[^0-9]/g, '');
      const userPhone = normalizePhone(profile.telefono);
      
      const matchingInvites = (pendingInvites || []).filter(invite => 
        normalizePhone(invite.phone_number) === userPhone
      );

      console.log('[Invitations] Found matching invitations:', matchingInvites.length);

      return matchingInvites;
    } catch (error) {
      console.error('[Invitations] Error checking invitations:', error);
      return [];
    }
  };

  const acceptInvitation = async (inviteId: string, groupId: string, nickname: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Usuario no autenticado');

      console.log('Accepting invitation via edge function:', { inviteId, groupId, nickname });

      // Llamar al edge function con service role para bypassar RLS
      const { data, error } = await supabase.functions.invoke('accept-tracking-invitation', {
        body: { inviteId, groupId, nickname },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) {
        console.error('Error from edge function:', error);
        throw new Error(error.message || 'No se pudo unir al grupo');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'No se pudo unir al grupo');
      }

      console.log('Invitation accepted successfully:', data);
      
      // Si ya era miembro, solo mostramos mensaje y refrescamos
      if (data.alreadyMember) {
        toast({
          title: 'Ya eres miembro',
          description: 'Ya perteneces a este grupo'
        });
      } else {
        toast({
          title: '¡Unido al grupo!',
          description: 'Ya puedes ver las ubicaciones del grupo'
        });
      }

      // Refrescar datos del grupo
      await fetchAllGroups();
    } catch (error: any) {
      console.error('Error accepting invitation:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo unir al grupo',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const fetchAllGroups = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('No user found');
        return;
      }

      console.log('Fetching groups for user:', user.id);

      // Obtener grupos donde soy miembro (esto incluye tanto dueño como invitado)
      const { data: memberData, error: memberError } = await supabase
        .from('tracking_group_members')
        .select('group_id, is_owner')
        .eq('user_id', user.id);

      if (memberError) {
        console.error('Error fetching member data:', memberError);
        throw memberError;
      }

      console.log('Member data:', memberData);

      let allGroupsData: TrackingGroup[] = [];
      if (memberData && memberData.length > 0) {
        const groupIds = memberData.map(m => m.group_id);
        console.log('Fetching groups with IDs:', groupIds);
        
        const { data: groups, error: groupsError } = await supabase
          .from('tracking_groups')
          .select('*')
          .in('id', groupIds);

        if (groupsError) {
          console.error('Error fetching groups:', groupsError);
          throw groupsError;
        }
        
        allGroupsData = (groups || []) as TrackingGroup[];
        console.log('Fetched groups:', allGroupsData);
      }

      setAllGroups(allGroupsData);

      // Si no hay grupo seleccionado, seleccionar el primero
      if (allGroupsData.length > 0 && !selectedGroupId) {
        console.log('Setting default selected group:', allGroupsData[0].id);
        setSelectedGroupId(allGroupsData[0].id);
      } else if (allGroupsData.length === 0) {
        console.log('No groups found for user');
        setSelectedGroupId(null);
        setGroup(null);
      }
    } catch (error) {
      console.error('Error fetching groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGroup = fetchAllGroups; // Mantener compatibilidad

  const fetchMembers = async (groupId: string) => {
    const { data, error } = await supabase
      .from('tracking_group_members')
      .select('*')
      .eq('group_id', groupId)
      .order('is_owner', { ascending: false })
      .order('joined_at', { ascending: true });

    if (error) {
      console.error('Error fetching members:', error);
      return;
    }

    setMembers(data || []);
  };

  const fetchInvitations = async (groupId: string) => {
    try {
      const { data, error } = await supabase
        .from('tracking_invitations')
        .select('*')
        .eq('group_id', groupId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString());

      if (error) throw error;
      setInvitations(data || []);
    } catch (error) {
      console.error('Error fetching invitations:', error);
    }
  };

  const createGroup = async (name: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('apodo, telefono')
        .eq('user_id', user.id)
        .single();

      const { data: newGroup, error: groupError } = await supabase
        .from('tracking_groups')
        .insert({
          owner_id: user.id,
          name,
          subscription_status: 'expired'
        })
        .select()
        .single();

      if (groupError) throw groupError;

      const { error: memberError } = await supabase
        .from('tracking_group_members')
        .insert({
          group_id: newGroup.id,
          user_id: user.id,
          nickname: profile?.apodo || 'Yo',
          phone_number: profile?.telefono,
          is_owner: true
        });

      if (memberError) throw memberError;

      toast({
        title: '¡Grupo creado!',
        description: 'Ahora necesitas activar la suscripción para empezar a usar el tracking.'
      });

      await fetchAllGroups();
      setSelectedGroupId(newGroup.id);
      return newGroup;
    } catch (error: any) {
      console.error('Error creating group:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      throw error;
    }
  };

  const sendInvitation = async (nickname: string, phoneNumber: string) => {
    try {
      if (!group) throw new Error('No hay grupo activo');

      const { data, error } = await supabase.functions.invoke('send-tracking-invite', {
        body: {
          phoneNumber,
          nickname,
          groupId: group.id,
          groupName: group.name
        }
      });

      if (error) throw error;

      toast({
        title: 'Invitación enviada',
        description: 'Se ha enviado la invitación por SMS'
      });

      await fetchInvitations(group.id);
    } catch (error: any) {
      console.error('Error sending invitation:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      throw error;
    }
  };

  const cancelInvitation = async (invitationId: string) => {
    try {
      const { error } = await supabase
        .from('tracking_invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;

      toast({
        title: 'Invitación cancelada',
        description: 'La invitación ha sido cancelada'
      });

      if (group) await fetchInvitations(group.id);
    } catch (error: any) {
      console.error('Error canceling invitation:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      throw error;
    }
  };

  const removeMember = async (memberId: string) => {
    try {
      const { error } = await supabase
        .from('tracking_group_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      toast({
        title: 'Miembro eliminado',
        description: 'El miembro ha sido removido del grupo'
      });

      if (group) await fetchMembers(group.id);
    } catch (error: any) {
      console.error('Error removing member:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      throw error;
    }
  };

  const updateGroupName = async (name: string) => {
    try {
      if (!group) throw new Error('No hay grupo activo');

      const { error } = await supabase
        .from('tracking_groups')
        .update({ name })
        .eq('id', group.id);

      if (error) throw error;

      toast({
        title: 'Nombre actualizado',
        description: 'El nombre del grupo ha sido actualizado'
      });

      await fetchGroup();
    } catch (error: any) {
      console.error('Error updating group name:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      throw error;
    }
  };

  return {
    allGroups,
    selectedGroupId,
    setSelectedGroupId,
    group,
    members,
    invitations,
    loading,
    createGroup,
    sendInvitation,
    cancelInvitation,
    removeMember,
    updateGroupName,
    acceptInvitation,
    checkPendingInvitations,
    refetch: fetchAllGroups
  };
};