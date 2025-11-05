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
  const [group, setGroup] = useState<TrackingGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [invitations, setInvitations] = useState<TrackingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchGroup();
    checkPendingInvitations();

    // Suscribirse a cambios en miembros del grupo en tiempo real
    const membersChannel = supabase
      .channel('tracking_members_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tracking_group_members'
        },
        () => {
          console.log('Members changed, refetching group...');
          fetchGroup();
        }
      )
      .subscribe();

    // Suscribirse a cambios en invitaciones en tiempo real
    const invitationsChannel = supabase
      .channel('tracking_invitations_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tracking_invitations'
        },
        () => {
          console.log('Invitations changed, refetching...');
          fetchGroup();
          checkPendingInvitations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(membersChannel);
      supabase.removeChannel(invitationsChannel);
    };
  }, []);

  const checkPendingInvitations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('telefono')
        .eq('user_id', user.id)
        .single();

      if (!profile?.telefono) return;

      const { data: pendingInvites, error } = await supabase
        .from('tracking_invitations')
        .select('*, tracking_groups(name)')
        .eq('phone_number', profile.telefono)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString());

      if (error) throw error;

      // Ya no aceptamos automáticamente, solo retornamos las invitaciones
      return pendingInvites || [];
    } catch (error) {
      console.error('Error checking invitations:', error);
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
      await fetchGroup();
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

  const fetchGroup = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: ownerGroup, error: ownerError } = await supabase
        .from('tracking_groups')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle();

      if (ownerError) throw ownerError;

      if (ownerGroup) {
        setGroup(ownerGroup as TrackingGroup);
        await fetchMembers(ownerGroup.id);
        await fetchInvitations(ownerGroup.id);
      } else {
        const { data: memberData, error: memberError } = await supabase
          .from('tracking_group_members')
          .select('group_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (memberError) throw memberError;

        if (memberData) {
          const { data: memberGroup, error: groupError } = await supabase
            .from('tracking_groups')
            .select('*')
            .eq('id', memberData.group_id)
            .single();

          if (groupError) throw groupError;
          
          setGroup(memberGroup as TrackingGroup);
          await fetchMembers(memberGroup.id);
        }
      }
    } catch (error) {
      console.error('Error fetching group:', error);
    } finally {
      setLoading(false);
    }
  };

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

      await fetchGroup();
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
    refetch: fetchGroup
  };
};