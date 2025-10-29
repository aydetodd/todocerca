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

export const useTrackingGroup = () => {
  const [group, setGroup] = useState<TrackingGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchGroup();
  }, []);

  const fetchGroup = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Buscar grupo donde el usuario es dueño
      const { data: ownerGroup, error: ownerError } = await supabase
        .from('tracking_groups')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle();

      if (ownerError) throw ownerError;

      if (ownerGroup) {
        setGroup(ownerGroup as TrackingGroup);
        await fetchMembers(ownerGroup.id);
      } else {
        // Buscar grupo donde el usuario es miembro
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

  const createGroup = async (name: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      // Obtener nickname del perfil
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
          subscription_status: 'expired' // Inicia como expirado hasta que pague
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Agregar al dueño como primer miembro
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

  const addMember = async (nickname: string, phoneNumber?: string) => {
    try {
      if (!group) throw new Error('No hay grupo activo');
      
      if (members.length >= 5) {
        throw new Error('El grupo ya tiene el máximo de 5 miembros');
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      // Por ahora, crear un user_id temporal (en producción se enviaría invitación)
      const tempUserId = crypto.randomUUID();

      const { error } = await supabase
        .from('tracking_group_members')
        .insert({
          group_id: group.id,
          user_id: tempUserId,
          nickname,
          phone_number: phoneNumber
        });

      if (error) throw error;

      toast({
        title: 'Miembro agregado',
        description: `${nickname} ha sido agregado al grupo`
      });

      await fetchMembers(group.id);
    } catch (error: any) {
      console.error('Error adding member:', error);
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
    loading,
    createGroup,
    addMember,
    removeMember,
    updateGroupName,
    refetch: fetchGroup
  };
};
