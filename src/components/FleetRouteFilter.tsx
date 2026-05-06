import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';

export interface FleetRouteItem {
  id: string;
  nombre: string;
  route_group: string | null;
  color: string;
}

interface Props {
  routes: FleetRouteItem[];
  visibleIds: Set<string>;
  onChange: (next: Set<string>) => void;
}

const DEFAULT_COLOR = '#0066CC';

export function FleetRouteFilter({ routes, visibleIds, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, FleetRouteItem[]>();
    routes.forEach((r) => {
      const key = r.route_group?.trim() || 'Sin grupo';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [routes]);

  const colors = useMemo(() => {
    const map = new Map<string, FleetRouteItem[]>();
    routes.forEach((r) => {
      const key = (r.color || DEFAULT_COLOR).toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries());
  }, [routes]);

  const allVisible = visibleIds.size === routes.length;
  const noneVisible = visibleIds.size === 0;

  const toggleSet = (ids: string[], on: boolean) => {
    const next = new Set(visibleIds);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    onChange(next);
  };

  const isGroupOn = (items: FleetRouteItem[]) =>
    items.every((i) => visibleIds.has(i.id));

  if (routes.length === 0) return null;

  return (
    <Card className="absolute bottom-24 right-2 left-2 sm:left-auto sm:right-4 z-[1100] bg-background/95 backdrop-blur-sm shadow-xl sm:max-w-md">
      <div className="p-2 flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant={allVisible ? 'default' : 'outline'}
          className="h-7 text-xs"
          onClick={() => onChange(new Set(routes.map((r) => r.id)))}
        >
          Todas ({routes.length})
        </Button>
        <Button
          size="sm"
          variant={noneVisible ? 'default' : 'outline'}
          className="h-7 text-xs"
          onClick={() => onChange(new Set())}
        >
          Ninguna
        </Button>

        {/* Color chips */}
        {colors.map(([color, items]) => {
          const on = items.every((i) => visibleIds.has(i.id));
          return (
            <button
              key={color}
              onClick={() => toggleSet(items.map((i) => i.id), !on)}
              title={`${items.length} ruta(s) de este color`}
              className="h-7 w-7 rounded-full border-2 transition-all"
              style={{
                background: color,
                borderColor: on ? 'hsl(var(--foreground))' : 'transparent',
                opacity: on ? 1 : 0.4,
              }}
            />
          );
        })}

        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs ml-auto"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          {expanded ? 'Ocultar' : 'Detalle'}
        </Button>
      </div>

      {expanded && (
        <div className="border-t px-2 py-2 max-h-[40vh] overflow-y-auto space-y-3">
          {groups.map(([groupName, items]) => {
            const groupOn = isGroupOn(items);
            return (
              <div key={groupName}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-foreground">
                    {groupName}{' '}
                    <span className="text-muted-foreground font-normal">
                      ({items.length})
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => toggleSet(items.map((i) => i.id), !groupOn)}
                  >
                    {groupOn ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                    {groupOn ? 'Ocultar' : 'Mostrar'}
                  </Button>
                </div>
                <div className="space-y-1 pl-1">
                  {items.map((r) => {
                    const on = visibleIds.has(r.id);
                    return (
                      <label
                        key={r.id}
                        className="flex items-center gap-2 text-xs cursor-pointer hover:bg-accent/50 rounded px-1 py-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleSet([r.id], !on)}
                        />
                        <span
                          className="inline-block h-3 w-3 rounded-full border border-border flex-shrink-0"
                          style={{ background: r.color }}
                        />
                        <span className="truncate">{r.nombre}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
