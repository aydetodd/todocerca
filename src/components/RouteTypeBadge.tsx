import { Bus, CarFront, Lock, Route, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getRoutePresentation } from '@/lib/transportRouteTypes';

export function RouteTypeIcon({ routeType, className = 'h-4 w-4' }: { routeType?: string | null; className?: string }) {
  const type = getRoutePresentation(routeType).type;
  const Icon = type === 'urbana' ? Bus : type === 'foranea' ? Truck : type === 'taxi_colectivo' ? CarFront : type === 'privada' ? Lock : Route;
  return <Icon className={className} aria-hidden="true" />;
}

export function RouteTypeBadge({ routeType }: { routeType?: string | null }) {
  return (
    <Badge variant="secondary" className="gap-1 text-xs shrink-0 whitespace-nowrap">
      <RouteTypeIcon routeType={routeType} className="h-3.5 w-3.5" />
      {getRoutePresentation(routeType).label}
    </Badge>
  );
}