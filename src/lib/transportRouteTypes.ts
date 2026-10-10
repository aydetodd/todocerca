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

// Presentation only: product route types are not driver transport types.
export const ROUTE_PRESENTATIONS = [
  { type: 'urbana', label: 'Urbana', group: 'Rutas urbanas' },
  { type: 'foranea', label: 'Foránea', group: 'Rutas foráneas' },
  { type: 'taxi_colectivo', label: 'Taxi Colectivo', group: 'Taxi Colectivo' },
  { type: 'privada', label: 'Privada', group: 'Rutas privadas' },
  { type: 'otra', label: 'Sin tipo', group: 'Otras rutas' },
] as const;

export function getRoutePresentation(routeType: string | null | undefined) {
  const type = routeType === 'publica' ? 'urbana' : routeType;
  return ROUTE_PRESENTATIONS.find(p => p.type === type) ?? ROUTE_PRESENTATIONS[4];
}

export function groupRoutesByType<T>(routes: T[], getType: (route: T) => string | null | undefined) {
  return ROUTE_PRESENTATIONS.map(presentation => ({
    ...presentation,
    routes: routes.filter(route => getRoutePresentation(getType(route)).type === presentation.type),
  })).filter(group => group.routes.length > 0);
}