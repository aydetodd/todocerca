// Unknown types must never expose another transport family's routes.
const ROUTE_TYPES: Record<string, string[]> = {
  publico: ['urbana', 'publica'],
  foraneo: ['foranea'],
  privado: ['privada'],
  taxi: ['taxi'],
  taxi_colectivo: ['taxi_colectivo'],
};

export function getRouteTypesForTransport(transportType: string | null | undefined): string[] {
  return transportType ? [...(ROUTE_TYPES[transportType] ?? [])] : [];
}

export function getTransportLabel(transportType: string | null | undefined): string {
  const labels: Record<string, string> = {
    publico: 'Urbano', foraneo: 'Foráneo', privado: 'Privado',
    taxi: 'Taxi', taxi_colectivo: 'Taxi Colectivo',
  };
  return transportType ? labels[transportType] ?? 'Sin tipo' : 'Sin tipo';
}