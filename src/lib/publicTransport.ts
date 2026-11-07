export const PUBLIC_TRANSPORT_TYPES = ['urbana', 'foranea', 'taxi_colectivo'] as const;
export type PublicTransportType = typeof PUBLIC_TRANSPORT_TYPES[number];
export function isPublicTransportType(value: string | null): value is PublicTransportType {
  return PUBLIC_TRANSPORT_TYPES.some(type => type === value);
}
// Only for rows already returned by the selected route's owner-checked/public RPC.
export function matchesScopedRouteUnit(unit: { route_producto_id?: string | null; route_type?: string | null; is_private_route?: boolean }, selectedId: string, selectedType: string | null): boolean {
  if (isPublicTransportType(selectedType)) return unit.route_type === selectedType && unit.is_private_route !== true;
  return unit.route_producto_id === selectedId;
}