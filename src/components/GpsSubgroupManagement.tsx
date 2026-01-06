import { useState } from 'react';
import { Plus, Trash2, Users, Cpu, ChevronDown, ChevronUp, Edit2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useGpsSubgroups, GpsSubgroup } from '@/hooks/useGpsSubgroups';
import { GpsTracker } from '@/hooks/useGpsTrackers';
import { GroupMember } from '@/hooks/useTrackingGroup';

interface GpsSubgroupManagementProps {
  groupId: string;
  trackers: GpsTracker[];
  members: GroupMember[];
  isOwner: boolean;
}

export const GpsSubgroupManagement = ({
  groupId,
  trackers,
  members,
  isOwner,
}: GpsSubgroupManagementProps) => {
  const {
    subgroups,
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
  } = useGpsSubgroups(groupId);

  const [newSubgroupName, setNewSubgroupName] = useState('');
  const [newSubgroupDescription, setNewSubgroupDescription] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedSubgroups, setExpandedSubgroups] = useState<Set<string>>(new Set());

  // Filtrar miembros que no son dueños (el dueño ve todo, no necesita sub-grupos)
  const nonOwnerMembers = members.filter((m) => !m.is_owner);

  const handleCreateSubgroup = async () => {
    if (!newSubgroupName.trim()) return;

    const result = await createSubgroup(newSubgroupName.trim(), newSubgroupDescription.trim() || undefined);
    if (result) {
      setNewSubgroupName('');
      setNewSubgroupDescription('');
      setDialogOpen(false);
    }
  };

  const toggleExpanded = (subgroupId: string) => {
    setExpandedSubgroups((prev) => {
      const next = new Set(prev);
      if (next.has(subgroupId)) {
        next.delete(subgroupId);
      } else {
        next.add(subgroupId);
      }
      return next;
    });
  };

  const handleToggleDevice = async (subgroupId: string, trackerId: string, isAssigned: boolean) => {
    if (isAssigned) {
      await removeDeviceFromSubgroup(subgroupId, trackerId);
    } else {
      await addDeviceToSubgroup(subgroupId, trackerId);
    }
  };

  const handleToggleMember = async (subgroupId: string, memberId: string, isAssigned: boolean) => {
    if (isAssigned) {
      await removeMemberFromSubgroup(subgroupId, memberId);
    } else {
      await addMemberToSubgroup(subgroupId, memberId);
    }
  };

  if (!isOwner) {
    return null; // Solo el dueño puede gestionar sub-grupos
  }

  if (loading) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        Cargando sub-grupos...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Sub-grupos de visibilidad</h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" />
              Nuevo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear sub-grupo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nombre</label>
                <Input
                  placeholder="Ej: Familia, Trabajo, Vehículos"
                  value={newSubgroupName}
                  onChange={(e) => setNewSubgroupName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Descripción (opcional)</label>
                <Input
                  placeholder="Descripción del sub-grupo"
                  value={newSubgroupDescription}
                  onChange={(e) => setNewSubgroupDescription(e.target.value)}
                />
              </div>
              <Button onClick={handleCreateSubgroup} className="w-full">
                Crear sub-grupo
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {subgroups.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-6 text-center text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay sub-grupos creados</p>
            <p className="text-xs mt-1">
              Crea sub-grupos para controlar qué dispositivos ve cada miembro
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {subgroups.map((subgroup) => (
            <SubgroupCard
              key={subgroup.id}
              subgroup={subgroup}
              trackers={trackers}
              members={nonOwnerMembers}
              assignedDevices={getDevicesForSubgroup(subgroup.id)}
              assignedMembers={getMembersForSubgroup(subgroup.id)}
              isExpanded={expandedSubgroups.has(subgroup.id)}
              onToggleExpand={() => toggleExpanded(subgroup.id)}
              onDelete={() => deleteSubgroup(subgroup.id)}
              onUpdate={(name, desc) => updateSubgroup(subgroup.id, name, desc)}
              onToggleDevice={(trackerId, isAssigned) =>
                handleToggleDevice(subgroup.id, trackerId, isAssigned)
              }
              onToggleMember={(memberId, isAssigned) =>
                handleToggleMember(subgroup.id, memberId, isAssigned)
              }
            />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        💡 El dueño del grupo siempre ve todos los dispositivos. Los miembros solo ven
        dispositivos de sub-grupos donde estén asignados.
      </p>
    </div>
  );
};

interface SubgroupCardProps {
  subgroup: GpsSubgroup;
  trackers: GpsTracker[];
  members: GroupMember[];
  assignedDevices: { tracker_id: string }[];
  assignedMembers: { member_id: string }[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  onUpdate: (name: string, description?: string) => void;
  onToggleDevice: (trackerId: string, isAssigned: boolean) => void;
  onToggleMember: (memberId: string, isAssigned: boolean) => void;
}

const SubgroupCard = ({
  subgroup,
  trackers,
  members,
  assignedDevices,
  assignedMembers,
  isExpanded,
  onToggleExpand,
  onDelete,
  onUpdate,
  onToggleDevice,
  onToggleMember,
}: SubgroupCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(subgroup.name);
  const [editDescription, setEditDescription] = useState(subgroup.description || '');

  const assignedTrackerIds = new Set(assignedDevices.map((d) => d.tracker_id));
  const assignedMemberIds = new Set(assignedMembers.map((m) => m.member_id));

  const handleSaveEdit = () => {
    if (editName.trim()) {
      onUpdate(editName.trim(), editDescription.trim() || undefined);
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditName(subgroup.name);
    setEditDescription(subgroup.description || '');
    setIsEditing(false);
  };

  return (
    <Card>
      <Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1">
              {isEditing ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-8"
                  />
                  <Button size="icon" variant="ghost" onClick={handleSaveEdit}>
                    <Check className="h-4 w-4 text-green-600" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={handleCancelEdit}>
                    <X className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              ) : (
                <>
                  <CardTitle className="text-base">{subgroup.name}</CardTitle>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => setIsEditing(true)}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                <Cpu className="h-3 w-3 mr-1" />
                {assignedDevices.length}
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Users className="h-3 w-3 mr-1" />
                {assignedMembers.length}
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <CollapsibleTrigger asChild>
                <Button size="icon" variant="ghost" className="h-6 w-6">
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
          {subgroup.description && !isEditing && (
            <p className="text-xs text-muted-foreground mt-1">{subgroup.description}</p>
          )}
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Dispositivos */}
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                <Cpu className="h-4 w-4" />
                Dispositivos ({assignedDevices.length}/{trackers.length})
              </h4>
              {trackers.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hay dispositivos registrados</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {trackers.map((tracker) => {
                    const isAssigned = assignedTrackerIds.has(tracker.id);
                    return (
                      <label
                        key={tracker.id}
                        className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={isAssigned}
                          onCheckedChange={() => onToggleDevice(tracker.id, isAssigned)}
                        />
                        <span className="text-sm truncate">{tracker.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Miembros */}
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                <Users className="h-4 w-4" />
                Miembros ({assignedMembers.length}/{members.length})
              </h4>
              {members.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No hay miembros (solo tú como dueño)
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {members.map((member) => {
                    const isAssigned = assignedMemberIds.has(member.id);
                    return (
                      <label
                        key={member.id}
                        className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={isAssigned}
                          onCheckedChange={() => onToggleMember(member.id, isAssigned)}
                        />
                        <span className="text-sm truncate">{member.nickname}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default GpsSubgroupManagement;
