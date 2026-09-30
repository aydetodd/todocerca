import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Solo lectura: pozo de viajes por cobrar partido por ruta (misma fuente que
// "BRUTO POR COBRAR" del panel: cobros de pasaje aún no retirados).
export type RutaIngreso = {
  id: string;
  nombre: string;
  routeType: string;
  pozo: number;
  standN: number;
  standMonto: number;
};

const PANEL: Record<string, string> = { urbana: "publico", privada: "privado", foranea: "foraneo" };
export const panelDeRuta = (r: RutaIngreso) =>
  `/panel-concesionario/${PANEL[r.routeType] ?? "publico"}?ruta=${r.id}`;

export function useIngresosTransporte(userId: string | undefined) {
  const [rutas, setRutas] = useState<RutaIngreso[] | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data: prov } = await supabase.from("proveedores").select("id").eq("user_id", userId).maybeSingle();
    if (!prov) { setRutas(null); return; }
    const { data: prods } = await (supabase as any).from("productos")
      .select("id, nombre, route_type").eq("proveedor_id", prov.id)
      .in("route_type", ["urbana", "privada", "foranea"]).order("nombre");
    const lista = (prods || []) as { id: string; nombre: string; route_type: string }[];
    if (lista.length === 0) { setRutas(null); return; }
    const ids = lista.map(p => p.id);
    const desde = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
    const { data: viajes } = await (supabase as any).from("viajes_realizados")
      .select("id, producto_id").in("producto_id", ids).gte("fecha", desde);
    const viajeRuta: Record<string, string> = {};
    (viajes || []).forEach((v: any) => { viajeRuta[v.id] = v.producto_id; });
    const vIds = Object.keys(viajeRuta);
    const pozo: Record<string, number> = {}, standN: Record<string, number> = {}, standM: Record<string, number> = {};
    if (vIds.length) {
      const [{ data: qvp }, { data: cqt }, { data: tar }] = await Promise.all([
        (supabase as any).from("qard_viajes_pasajero")
          .select("viaje_id, monto_cobrado_mxn, estado, retirado_at, subida_geocerca_id").in("viaje_id", vIds),
        (supabase as any).from("cobros_qr_tramo").select("viaje_id, precio_real, retirado_at").in("viaje_id", vIds),
        (supabase as any).from("ruta_tarifas_tramo").select("producto_id, desde_geocerca_id, precio_mxn").in("producto_id", ids),
      ]);
      (qvp || []).forEach((r: any) => {
        const rid = viajeRuta[r.viaje_id]; if (!rid) return;
        if (r.estado === "abierto") {
          standN[rid] = (standN[rid] || 0) + 1;
          const precio = Math.max(0, ...((tar || []) as any[])
            .filter(t => t.producto_id === rid && t.desde_geocerca_id === r.subida_geocerca_id)
            .map(t => Number(t.precio_mxn) || 0));
          standM[rid] = (standM[rid] || 0) + precio;
        } else if (!r.retirado_at) pozo[rid] = (pozo[rid] || 0) + (Number(r.monto_cobrado_mxn) || 0);
      });
      (cqt || []).forEach((r: any) => {
        const rid = viajeRuta[r.viaje_id]; if (!rid || r.retirado_at) return;
        pozo[rid] = (pozo[rid] || 0) + (Number(r.precio_real) || 0);
      });
    }
    setRutas(lista.map(p => ({
      id: p.id, nombre: p.nombre, routeType: p.route_type,
      pozo: +(pozo[p.id] || 0).toFixed(2), standN: standN[p.id] || 0, standMonto: +(standM[p.id] || 0).toFixed(2),
    })));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    load();
    const ch = supabase.channel(`ingresos_transporte_${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "viajes_realizados" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "qard_viajes_pasajero" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "cobros_qr_tramo" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, load]);

  return rutas;
}
