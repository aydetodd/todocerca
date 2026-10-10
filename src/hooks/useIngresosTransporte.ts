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
  sinSaldoN: number;
  sinSaldoMonto: number;
};

export const DIAS_POZO = 60;

/** Fuente única del pozo por cobrar (panel y "Mi dinero"): cobros de pasaje de los
 *  últimos 60 días, lo que falta = monto - pagado. */
export async function cargarPozoViajes(productoIds: string[]) {
  const pendientePorViaje: Record<string, number> = {};
  const viajeRuta: Record<string, string> = {};
  const qvpRows: any[] = [];
  if (!productoIds.length) return { pendientePorViaje, viajeRuta, qvpRows };
  const desde = new Date(Date.now() - DIAS_POZO * 864e5).toISOString().slice(0, 10);
  const { data: viajes } = await (supabase as any).from("viajes_realizados")
    .select("id, producto_id").in("producto_id", productoIds).gte("fecha", desde);
  (viajes || []).forEach((v: any) => { viajeRuta[v.id] = v.producto_id; });
  const vIds = Object.keys(viajeRuta);
  if (!vIds.length) return { pendientePorViaje, viajeRuta, qvpRows };
  const [{ data: qvp }, { data: cqt }] = await Promise.all([
    (supabase as any).from("qard_viajes_pasajero")
      .select("viaje_id, monto_cobrado_mxn, pagado_mxn, estado, retirado_at, subida_geocerca_id").in("viaje_id", vIds),
    (supabase as any).from("cobros_qr_tramo").select("viaje_id, precio_real, pagado_mxn, retirado_at").in("viaje_id", vIds),
  ]);
  const add = (vid: string, m: number) => { if (m > 0) pendientePorViaje[vid] = +((pendientePorViaje[vid] || 0) + m).toFixed(2); };
  (qvp || []).forEach((r: any) => {
    qvpRows.push(r);
    if (r.estado === "abierto" || r.retirado_at) return;
    add(r.viaje_id, (Number(r.monto_cobrado_mxn) || 0) - (Number(r.pagado_mxn) || 0));
  });
  (cqt || []).forEach((r: any) => {
    if (r.retirado_at) return;
    add(r.viaje_id, (Number(r.precio_real) || 0) - (Number(r.pagado_mxn) || 0));
  });
  return { pendientePorViaje, viajeRuta, qvpRows };
}

const PANEL: Record<string, string> = { urbana: "urbano", privada: "privado", foranea: "foraneo", taxi_colectivo: "taxi-colectivo" };
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
      .in("route_type", ["urbana", "privada", "foranea", "taxi_colectivo"]).order("nombre");
    const lista = (prods || []) as { id: string; nombre: string; route_type: string }[];
    if (lista.length === 0) { setRutas(null); return; }
    const ids = lista.map(p => p.id);
    const [{ pendientePorViaje, viajeRuta, qvpRows }, { data: tar }, { data: geo }] = await Promise.all([
      cargarPozoViajes(ids),
      (supabase as any).from("ruta_tarifas_tramo").select("producto_id, desde_geocerca_id, precio_mxn").in("producto_id", ids),
      (supabase as any).from("unidad_geocercas_cobro").select("id, precio_mxn").in("producto_id", ids),
    ]);
    const pozo: Record<string, number> = {}, standN: Record<string, number> = {}, standM: Record<string, number> = {};
    const ssN: Record<string, number> = {}, ssM: Record<string, number> = {};
    Object.entries(pendientePorViaje).forEach(([vid, m]) => { const rid = viajeRuta[vid]; if (rid) pozo[rid] = (pozo[rid] || 0) + m; });
    const tarifa = (rid: string, g: string) => {
      const t = ((tar || []) as any[]).filter(x => x.producto_id === rid && x.desde_geocerca_id === g).map(x => Number(x.precio_mxn) || 0);
      if (t.length) return Math.max(...t);
      return Number(((geo || []) as any[]).find(x => x.id === g)?.precio_mxn) || 0;
    };
    qvpRows.forEach((r: any) => {
      const rid = viajeRuta[r.viaje_id]; if (!rid) return;
      if (r.estado === "abierto") { standN[rid] = (standN[rid] || 0) + 1; standM[rid] = (standM[rid] || 0) + tarifa(rid, r.subida_geocerca_id); }
      if (r.estado === "auto_cerrado_sin_saldo") { ssN[rid] = (ssN[rid] || 0) + 1; ssM[rid] = (ssM[rid] || 0) + tarifa(rid, r.subida_geocerca_id); }
    });
    setRutas(lista.map(p => ({
      id: p.id, nombre: p.nombre, routeType: p.route_type,
      pozo: +(pozo[p.id] || 0).toFixed(2), standN: standN[p.id] || 0, standMonto: +(standM[p.id] || 0).toFixed(2),
      sinSaldoN: ssN[p.id] || 0, sinSaldoMonto: +(ssM[p.id] || 0).toFixed(2),
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
