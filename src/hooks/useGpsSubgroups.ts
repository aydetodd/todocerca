import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface GpsSubgroup {
  id: string;
  group_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface SubgroupDevice {
  id: string;
  subgroup_id: string;
  tracker_id: string;
}

export interface SubgroupMember {
  id: string;
  subgroup_id: string;
  member_id: string;
}

export const useGpsSubgroups = (groupId: string | null) => {
  const [subgroups, setSubgroups] = useState<GpsSubgroup[]>([]);
  const [subgroupDevices, setSubgroupDevices] = useState<SubgroupDevice[]>([]);
  const [subgroupMembers, setSubgroupMembers] = useState<SubgroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSubgroups = useCallback(async () => {
    if (!groupId) {
      setSubgroups([]);
      setSubgroupDevices([]);
      setSubgroupMembers([]);
      setLoading(false);
      return;
    }

    try {
      // Fetch subgroups
      const { data: subgroupsData, error: subgroupsError } = await supabase
        .from('gps_tracker_subgroups')
        .select('*')
        .eq('group_id', groupId)
        .order('name');

      if (subgroupsError) throw subgroupsError;

      const subgroupIds = (subgroupsData || []).map((s: any) => s.id);

      if (subgroupIds.length > 0) {
        // Fetch devices and members in parallel
        const [devicesResult, membersResult] = await Promise.all([
          supabase
            .from('gps_tracker_subgroup_devices')
            .select('*')
            .in('subgroup_id', subgroupIds),
          supabase
            .from('gps_tracker_subgroup_members')
            .select('*')
            .in('subgroup_id', subgroupIds),
        ]);

        if (devicesResult.error) throw devicesResult.error;
        if (membersResult.error) throw membersResult.error;

        setSubgroupDevices(devicesResult.data || []);
        setSubgroupMembers(membersResult.data || []);
      } else {
        setSubgroupDevices([]);
        setSubgroupMembers([]);
      }

      setSubgroups(subgroupsData || []);
    } catch (error: any) {
      console.error('[GPS SUBGROUPS] Error fetching:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los sub-grupos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [groupId, toast]);

  useEffect(() => {
    fetchSubgroups();
  }, [fetchSubgroups]);

  const createSubgroup = async (name: string, description?: string) => {
    if (!groupId) return null;

    try {
      const { data, error } = await supabase
        .from('gps_tracker_subgroups')
        .insert({ group_id: groupId, name, description })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast({
            title: 'Error',
            description: 'Ya existe un sub-grupo con ese nombre',
            variant: 'destructive',
          });
        } else {
          throw error;
        }
        return null;
      }

      toast({ title: 'Sub-grupo creado', description: name });
      await fetchSubgroups();
      return data;
    } catch (error: any) {
      console.error('[GPS SUBGROUPS] Error creating:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear el sub-grupo',
        variant: 'destructive',
      });
      return null;
    }
  };

  const deleteSubgroup = async (subgroupId: string) => {
    try {
      const { error } = await supabase
        .from('gps_tracker_subgroups')
        .delete()
        .eq('id', subgroupId);

      if (error) throw error;

      toast({ title: 'Sub-grupo eliminado' });
      await fetchSubgroups();
      return true;
    } catch (error: any) {
      console.error('[GPS SUBGROUPS] Error deleting:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el sub-grupo',
        variant: 'destructive',
      });
      return false;
    }
  };

  const updateSubgroup = async (subgroupId: string, name: string, description?: string) => {
    try {
      const { error } = await supabase
        .from('gps_tracker_subgroups')
        .update({ name, description })
        .eq('id', subgroupId);

      if (error) throw error;

      toast({ title: 'Sub-grupo actualizado' });
      await fetchSubgroups();
      return true;
    } catch (error: any) {
      console.error('[GPS SUBGROUPS] Error updating:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el sub-grupo',
        variant: 'destructive',
      });
      return false;
    }
  };

  const addDeviceToSubgroup = async (subgroupId: string, trackerId: string) => {
    try {
      const { error } = await supabase
        .from('gps_tracker_subgroup_devices')
        .insert({ subgroup_id: subgroupId, tracker_id: trackerId });

      if (error) {
        if (error.code === '23505') {
          toast({
            title: 'Info',
            description: 'El dispositivo ya está en este sub-grupo',
          });
        } else {
          throw error;
        }
        return false;
      }

      await fetchSubgroups();
      return true;
    } catch (error: any) {
      console.error('[GPS SUBGROUPS] Error adding device:', error);
      toast({
        title: 'Error',
        description: 'No se pudo agregar el dispositivo',
        variant: 'destructive',
      });
      return false;
    }
  };

  const removeDeviceFromSubgroup = async (subgroupId: string, trackerId: string) => {
    try {
      const { error } = await supabase
        .from('gps_tracker_subgroup_devices')
        .delete()
        .eq('subgroup_id', subgroupId)
        .eq('tracker_id', trackerId);

      if (error) throw error;

      await fetchSubgroups();
      return true;
    } catch (error: any) {
      console.error('[GPS SUBGROUPS] Error removing device:', error);
      return false;
    }
  };

  const addMemberToSubgroup = async (subgroupId: string, memberId: string) => {
    try {
      const { error } = await supabase
        .from('gps_tracker_subgroup_members')
        .insert({ subgroup_id: subgroupId, member_id: memberId });

      if (error) {
        if (error.code === '23505') {
          toast({
            title: 'Info',
            description: 'El miembro ya está en este sub-grupo',
          });
        } else {
          throw error;
        }
        return false;
      }

      await fetchSubgroups();
      return true;
    } catch (error: any) {
      console.error('[GPS SUBGROUPS] Error adding member:', error);
      toast({
        title: 'Error',
        description: 'No se pudo agregar el miembro',
        variant: 'destructive',
      });
      return false;
    }
  };

  const removeMemberFromSubgroup = async (subgroupId: string, memberId: string) => {
    try {
      const { error } = await supabase
        .from('gps_tracker_subgroup_members')
        .delete()
        .eq('subgroup_id', subgroupId)
        .eq('member_id', memberId);

      if (error) throw error;

      await fetchSubgroups();
      return true;
    } catch (error: any) {
      console.error('[GPS SUBGROUPS] Error removing member:', error);
      return false;
    }
  };

  // Helpers para obtener dispositivos/miembros de un sub-grupo específico
  const getDevicesForSubgroup = (subgroupId: string) => {
    return subgroupDevices.filter((d) => d.subgroup_id === subgroupId);
  };

  const getMembersForSubgroup = (subgroupId: string) => {
    return subgroupMembers.filter((m) => m.subgroup_id === subgroupId);
  };

  return {
    subgroups,
    subgroupDevices,
    subgroupMembers,
    loading,
    createSubgroup,
    deleteSubgroup,
    updateSubgroup,
    addDeviceToSubgroup,
    removeDeviceFromSubgroup,
    addMemberToSubgroup,
    removeMemberFromSubgroup,
    getDevicesForSubgroup,
    getMembersForSubgroup,
    refetch: fetchSubgroups,
  };
};
