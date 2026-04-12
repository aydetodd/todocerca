type LogWithTransportFields = {
  created_at: string;
  chofer_id: string | null;
  unidad_id?: string | null;
  producto_id?: string | null;
  qr_tickets?: {
    unidad_uso_id?: string | null;
    ruta_uso_id?: string | null;
    chofer_id?: string | null;
  } | null;
};

type ChoferRecord = {
  id: string;
  user_id: string | null;
};

type AssignmentRecord = {
  chofer_id: string;
  unidad_id: string | null;
  producto_id: string | null;
  fecha: string;
  created_at?: string | null;
};

export function getHermosilloDateFromTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const hermosillo = new Date(date.getTime() - 7 * 60 * 60 * 1000);
  return hermosillo.toISOString().split("T")[0];
}

function sortAssignments(assignments: AssignmentRecord[]) {
  return [...assignments].sort((a, b) => {
    const dateCompare = b.fecha.localeCompare(a.fecha);
    if (dateCompare !== 0) return dateCompare;

    const aCreated = a.created_at ? Date.parse(a.created_at) : 0;
    const bCreated = b.created_at ? Date.parse(b.created_at) : 0;
    return bCreated - aCreated;
  });
}

export function applyTransportAssignmentFallback<T extends LogWithTransportFields>(
  logs: T[],
  choferRecords: ChoferRecord[],
  assignments: AssignmentRecord[]
) {
  const choferIdsByUser = new Map<string, string[]>();

  choferRecords.forEach((record) => {
    if (!record.user_id) return;
    const existing = choferIdsByUser.get(record.user_id) || [];
    existing.push(record.id);
    choferIdsByUser.set(record.user_id, existing);
  });

  const sortedAssignments = sortAssignments(assignments);

  return logs.map((log) => {
    const effectiveChoferId = log.chofer_id || log.qr_tickets?.chofer_id || null;
    const existingUnidadId = log.unidad_id || log.qr_tickets?.unidad_uso_id || null;
    const existingProductoId = log.producto_id || log.qr_tickets?.ruta_uso_id || null;

    if (!effectiveChoferId) {
      return {
        ...log,
        effectiveChoferId,
        effectiveUnidadId: existingUnidadId,
        effectiveProductoId: existingProductoId,
      };
    }

    const choferRecordIds = choferIdsByUser.get(effectiveChoferId) || [];
    const logDate = getHermosilloDateFromTimestamp(log.created_at);

    const assignmentsForChofer = sortedAssignments.filter((assignment) =>
      choferRecordIds.includes(assignment.chofer_id)
    );

    const sameDayAssignments = assignmentsForChofer.filter((assignment) => assignment.fecha === logDate);

    const bestMatch =
      sameDayAssignments.find((assignment) => {
        const sameRoute = !existingProductoId || assignment.producto_id === existingProductoId;
        const sameUnit = !existingUnidadId || assignment.unidad_id === existingUnidadId;
        return sameRoute && sameUnit && (assignment.unidad_id || assignment.producto_id);
      }) ||
      sameDayAssignments.find((assignment) => assignment.unidad_id || assignment.producto_id) ||
      assignmentsForChofer.find((assignment) => {
        if (!existingProductoId) return !!(assignment.unidad_id || assignment.producto_id);
        return assignment.producto_id === existingProductoId && (assignment.unidad_id || assignment.producto_id);
      }) ||
      assignmentsForChofer.find((assignment) => assignment.unidad_id || assignment.producto_id) ||
      null;

    return {
      ...log,
      effectiveChoferId,
      effectiveUnidadId: existingUnidadId || bestMatch?.unidad_id || null,
      effectiveProductoId: existingProductoId || bestMatch?.producto_id || null,
    };
  });
}