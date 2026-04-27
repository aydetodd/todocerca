import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ShieldCheck, FileText, DollarSign, AlertTriangle, Bus, TrendingUp,
  Clock, CheckCircle2, XCircle, Eye, ChevronDown, ChevronUp, BarChart3,
  Users, Plus, MessageCircle, Loader2, Trash2, Download, ClipboardList,
  Building2, Search, Handshake,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ConcesionarioReportes from "@/components/ConcesionarioReportes";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { BackButton } from "@/components/BackButton";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { downloadCSV } from "@/lib/csvExport";
import ContratoNotas from "@/components/ContratoNotas";
import RecursosContrato from "@/components/RecursosContrato";
import { applyTransportAssignmentFallback } from "@/lib/transportAssignments";

type Verificacion = {
  id: string;
  estado: string;
  fecha_solicitud: string;
  fecha_revision: string | null;
  admin_notas: string | null;
  total_unidades: number;
};

type Liquidacion = {
  id: string;
  fecha_liquidacion: string;
  total_boletos: number;
  monto_valor_facial: number;
  monto_comision_todocerca: number;
  monto_fee_stripe_connect: number;
  monto_neto: number;
  estado: string;
  stripe_transfer_id: string | null;
  boletos_normales?: number;
  boletos_estudiante?: number;
  boletos_tercera_edad?: number;
  monto_normales?: number;
  monto_estudiante?: number;
  monto_tercera_edad?: number;
};

type FraudeResumen = {
  id: string;
  fecha_intento: string;
  severidad: string;
  tipo_fraude: string;
  distancia_km: number | null;
  tiempo_transcurrido_minutos: number | null;
  total_intentos_usuario: number;
  resuelto: boolean;
};

type UnidadDetalle = {
  id: string;
  numero_economico: string;
  placas: string;
  modelo: string | null;
  linea: string | null;
  descripcion: string | null;
  estado_verificacion: string | null;
};

type IngresoUnidad = {
  unidad_id: string;
  numero_economico: string;
  placas: string | null;
  descripcion: string | null;
  chofer_nombre: string | null;
  boletos_hoy: number;
  ingresos_hoy: number;
};

export default function PanelConcesionario() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const activeFetchIdRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [proveedor, setProveedor] = useState<any>(null);
  const [verificacion, setVerificacion] = useState<Verificacion | null>(null);
  const [unidades, setUnidades] = useState<UnidadDetalle[]>([]);
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([]);
  const [fraudes, setFraudes] = useState<FraudeResumen[]>([]);
  const [cuentaConectada, setCuentaConectada] = useState<any>(null);
  const [stats, setStats] = useState({
    hoy: 0, hoyAnterior: 0, labelHoyAnterior: '',
    semana: 0, semanaAnterior: 0, labelSemanaAnterior: '',
    totalMes: 0, mesAnterior: 0, labelMesAnterior: '',
    mes: 0, totalUnidades: 0,
  });
  const [expandedLiq, setExpandedLiq] = useState<string | null>(null);
  const [detalleLiq, setDetalleLiq] = useState<string | null>(null);
  const [detalleTickets, setDetalleTickets] = useState<any[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [ingresosUnidad, setIngresosUnidad] = useState<IngresoUnidad[]>([]);
  const [expandedUnidad, setExpandedUnidad] = useState<string | null>(null);
  const [unidadTickets, setUnidadTickets] = useState<{ short_code: string; time: string }[]>([]);
  const [loadingUnidadTickets, setLoadingUnidadTickets] = useState(false);
  
  // Unit registration form
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [newUnit, setNewUnit] = useState({ numero_economico: "", placas: "", modelo: "", linea: "" });
  const [savingUnit, setSavingUnit] = useState(false);
  const [slotsQuantity, setSlotsQuantity] = useState<number>(0);
  const [buyingSlot, setBuyingSlot] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [frecuenciaLiq, setFrecuenciaLiq] = useState<string>("daily");
  const [savingFreq, setSavingFreq] = useState(false);
  const [cobrandoLiq, setCobrandoLiq] = useState(false);

  // Contratos con empresas
  const [empresaSearch, setEmpresaSearch] = useState("");
  const [empresasFound, setEmpresasFound] = useState<any[]>([]);
  const [searchingEmpresas, setSearchingEmpresas] = useState(false);
  const [contratosEmpresa, setContratosEmpresa] = useState<any[]>([]);
  const [showProponerContrato, setShowProponerContrato] = useState(false);
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState<any>(null);
  const [contratoTarifa, setContratoTarifa] = useState("15");
  const [contratoFrecuencia, setContratoFrecuencia] = useState("quincenal");
  const [contratoModeloCobro, setContratoModeloCobro] = useState<"por_persona" | "por_viaje">("por_persona");
  const [contratoDescripcion, setContratoDescripcion] = useState("");
  const [contratoTurnos, setContratoTurnos] = useState<{ turno: string; unidades: number; selected: boolean }[]>([
    { turno: "Matutino", unidades: 1, selected: false },
    { turno: "Vespertino", unidades: 1, selected: false },
    { turno: "Nocturno", unidades: 1, selected: false },
    { turno: "Mixto", unidades: 1, selected: false },
  ]);
  const [savingContrato, setSavingContrato] = useState(false);

  const withTimeout = <T,>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Tiempo de espera agotado al cargar ${label}`));
      }, ms);

      Promise.resolve(promise)
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  };

  const loadOperationalStats = async (provId: string, fetchId?: number) => {
    const isCurrentFetch = () => fetchId === undefined || fetchId === activeFetchIdRef.current;

    const { data: misUnidades } = await withTimeout(
      supabase
        .from("unidades_empresa")
        .select("id, nombre, numero_economico, placas, descripcion")
        .eq("proveedor_id", provId)
        .neq("transport_type", "taxi"),
      12000,
      "unidades"
    );

    if (!misUnidades || misUnidades.length === 0) {
      if (!isCurrentFetch()) return;
      setIngresosUnidad([]);
      setStats((prev) => ({
        ...prev,
        hoy: 0,
        hoyAnterior: 0,
        semana: 0,
        semanaAnterior: 0,
        totalMes: 0,
        mes: 0,
        mesAnterior: 0,
        totalUnidades: 0,
      }));
      return;
    }

    const unidadIds = misUnidades.map((u: any) => u.id);

    const { data: choferRecords } = await withTimeout(
      supabase
        .from("choferes_empresa")
        .select("id, user_id, nombre")
        .eq("proveedor_id", provId)
        .eq("is_active", true),
      12000,
      "choferes"
    );

    const choferUserIds = (choferRecords || [])
      .map((chofer: any) => chofer.user_id)
      .filter(Boolean);

    // Use Hermosillo time (UTC-7, no DST)
    const now = new Date();
    const hermosillo = new Date(now.getTime() - 7 * 60 * 60 * 1000);
    const todayStr = hermosillo.toISOString().split("T")[0];
    const todayStart = `${todayStr}T00:00:00-07:00`;
    const todayEnd = `${todayStr}T23:59:59-07:00`;

    // Yesterday
    const yesterday = new Date(hermosillo.getTime() - 86400000);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    const yesterdayStart = `${yesterdayStr}T00:00:00-07:00`;
    const yesterdayEnd = `${yesterdayStr}T23:59:59-07:00`;

    // Current week (Mon-Sun)
    const dayOfWeek = hermosillo.getUTCDay(); // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const mondayDate = new Date(hermosillo.getTime() - mondayOffset * 86400000);
    const weekStartStr = mondayDate.toISOString().split("T")[0];
    const currentWeekStart = `${weekStartStr}T00:00:00-07:00`;

    // Previous week (Mon-Sun)
    const prevMondayDate = new Date(mondayDate.getTime() - 7 * 86400000);
    const prevSundayDate = new Date(mondayDate.getTime() - 86400000);
    const prevWeekStart = `${prevMondayDate.toISOString().split("T")[0]}T00:00:00-07:00`;
    const prevWeekEnd = `${prevSundayDate.toISOString().split("T")[0]}T23:59:59-07:00`;

    // Current month
    const monthStart = `${todayStr.slice(0, 7)}-01T00:00:00-07:00`;

    // Previous month
    const curYear = parseInt(todayStr.slice(0, 4));
    const curMonth = parseInt(todayStr.slice(5, 7));
    const prevMonthYear = curMonth === 1 ? curYear - 1 : curYear;
    const prevMonthNum = curMonth === 1 ? 12 : curMonth - 1;
    const prevMonthStr = `${prevMonthYear}-${String(prevMonthNum).padStart(2, "0")}`;
    const prevMonthStart = `${prevMonthStr}-01T00:00:00-07:00`;
    // Last day of previous month
    const lastDayPrev = new Date(curYear, curMonth - 1, 0).getDate();
    const prevMonthEnd = `${prevMonthStr}-${lastDayPrev}T23:59:59-07:00`;

    // Format labels for previous periods
    const diasSemana = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
    const meses = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const labelHoyAnterior = `${diasSemana[yesterday.getUTCDay()]} ${yesterday.getUTCDate()}`;
    const prevWeekLabel = `${prevMondayDate.getUTCDate()}/${prevMondayDate.getUTCMonth() + 1} - ${prevSundayDate.getUTCDate()}/${prevSundayDate.getUTCMonth() + 1}`;
    const labelMesAnterior = meses[prevMonthNum];

    const [logsPeriodoRes, asignacionesRes] = await withTimeout(
      Promise.all([
        supabase
          .from("logs_validacion_qr")
          .select("unidad_id, chofer_id, created_at, qr_ticket_id, producto_id, qr_tickets(unidad_uso_id, ruta_uso_id, chofer_id, amount, ticket_type)")
          .in("chofer_id", choferUserIds.length > 0 ? choferUserIds : [user?.id || provId])
          .eq("resultado", "valid")
          .gte("created_at", prevMonthStart)
          .lte("created_at", todayEnd),
        supabase
          .from("asignaciones_chofer")
          .select("unidad_id, producto_id, fecha, created_at, chofer_id, choferes_empresa(nombre)")
          .in("chofer_id", (choferRecords || []).map((chofer: any) => chofer.id))
          .gte("fecha", prevMonthStart.slice(0, 10))
          .lte("fecha", todayStr),
      ]),
      15000,
      "estadísticas"
    );

    const logs = applyTransportAssignmentFallback(
      (logsPeriodoRes.data || []) as any[],
      (choferRecords || []) as any[],
      (asignacionesRes.data || []) as any[]
    ).filter((log: any) => {
      // Include if unit matches OR if it's from one of our drivers (even without unit)
      if (log.effectiveUnidadId && unidadIds.includes(log.effectiveUnidadId)) return true;
      // Include logs from our drivers even without unit assignment
      if (choferUserIds.includes(log.chofer_id)) return true;
      return false;
    });

    const todayStartMs = Date.parse(todayStart);
    const todayEndMs = Date.parse(todayEnd);
    const yesterdayStartMs = Date.parse(yesterdayStart);
    const yesterdayEndMs = Date.parse(yesterdayEnd);
    const currentWeekStartMs = Date.parse(currentWeekStart);
    const prevWeekStartMs = Date.parse(prevWeekStart);
    const prevWeekEndMs = Date.parse(prevWeekEnd);
    const monthStartMs = Date.parse(monthStart);
    const prevMonthStartMs = Date.parse(prevMonthStart);
    const prevMonthEndMs = Date.parse(prevMonthEnd);

    // Build chofer map from the MOST RECENT assignment per unit (persistent — not date-scoped)
    // Per memory: persistencia-asignaciones-chofer — assignments persist day-to-day until changed
    const choferMap: Record<string, string> = {};
    const sortedAsignaciones = [...(asignacionesRes.data || [])].sort((a: any, b: any) => {
      const dateCmp = (b.fecha || '').localeCompare(a.fecha || '');
      if (dateCmp !== 0) return dateCmp;
      return Date.parse(b.created_at || '0') - Date.parse(a.created_at || '0');
    });
    sortedAsignaciones.forEach((a: any) => {
      if (a.unidad_id && a.choferes_empresa?.nombre && !choferMap[a.unidad_id]) {
        choferMap[a.unidad_id] = a.choferes_empresa.nombre;
      }
    });

    const countMap: Record<string, number> = {};
    const amountMap: Record<string, number> = {};
    let logsAyerCount = 0;
    let logsAyerAmount = 0;
    let logsSemanaCount = 0;
    let logsSemanaAmount = 0;
    let logsSemanaAntCount = 0;
    let logsSemanaAntAmount = 0;
    let logsMesCount = 0;
    let logsMesAmount = 0;
    let logsMesAntCount = 0;
    let logsMesAntAmount = 0;

    let noUnitTodayCount = 0;
    let noUnitTodayAmount = 0;
    logs.forEach((log: any) => {
      const createdAtMs = Date.parse(log.created_at);
      const ticketAmount = log.qr_tickets?.amount ?? 9;

      if (createdAtMs >= todayStartMs && createdAtMs <= todayEndMs) {
        if (log.effectiveUnidadId) {
          countMap[log.effectiveUnidadId] = (countMap[log.effectiveUnidadId] || 0) + 1;
          amountMap[log.effectiveUnidadId] = (amountMap[log.effectiveUnidadId] || 0) + ticketAmount;
        } else {
          noUnitTodayCount += 1;
          noUnitTodayAmount += ticketAmount;
        }
      }
      if (createdAtMs >= yesterdayStartMs && createdAtMs <= yesterdayEndMs) { logsAyerCount += 1; logsAyerAmount += ticketAmount; }
      if (createdAtMs >= currentWeekStartMs && createdAtMs <= todayEndMs) { logsSemanaCount += 1; logsSemanaAmount += ticketAmount; }
      if (createdAtMs >= prevWeekStartMs && createdAtMs <= prevWeekEndMs) { logsSemanaAntCount += 1; logsSemanaAntAmount += ticketAmount; }
      if (createdAtMs >= monthStartMs && createdAtMs <= todayEndMs) { logsMesCount += 1; logsMesAmount += ticketAmount; }
      if (createdAtMs >= prevMonthStartMs && createdAtMs <= prevMonthEndMs) { logsMesAntCount += 1; logsMesAntAmount += ticketAmount; }
    });

    const ingresos: IngresoUnidad[] = misUnidades
      .map((u: any) => ({
        unidad_id: u.id,
        numero_economico: u.numero_economico || u.nombre,
        placas: u.placas,
        descripcion: u.descripcion,
        chofer_nombre: choferMap[u.id] || null,
        boletos_hoy: countMap[u.id] || 0,
        ingresos_hoy: amountMap[u.id] || 0,
      }))
      .sort((a: IngresoUnidad, b: IngresoUnidad) => b.boletos_hoy - a.boletos_hoy);

    // Add "Sin unidad asignada" row if there are logs without unit
    if (noUnitTodayCount > 0) {
      ingresos.push({
        unidad_id: "sin-unidad",
        numero_economico: "Sin unidad asignada",
        placas: null,
        descripcion: null,
        chofer_nombre: null,
        boletos_hoy: noUnitTodayCount,
        ingresos_hoy: noUnitTodayAmount,
      });
    }

    if (!isCurrentFetch()) return;
    setIngresosUnidad(ingresos);

    const totalBoletosHoy = ingresos.reduce((s: number, u: IngresoUnidad) => s + u.boletos_hoy, 0);
    setStats({
      hoy: totalBoletosHoy,
      hoyAnterior: logsAyerCount,
      labelHoyAnterior,
      semana: logsSemanaCount,
      semanaAnterior: logsSemanaAntCount,
      labelSemanaAnterior: prevWeekLabel,
      totalMes: logsMesAmount,
      mes: logsMesCount,
      mesAnterior: logsMesAntAmount,
      labelMesAnterior,
      totalUnidades: misUnidades.length,
    });
  };

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
      return;
    }
    if (user) {
      fetchAll();
      refreshSlotCount();

      // Handle Stripe Connect return
      const stripeParam = searchParams.get("stripe");
      if (stripeParam === "success") {
        toast.success("¡Registro en Stripe completado! Verificando estado...");
        setSearchParams({}, { replace: true });
        // Sync Stripe status then reload
        syncStripeStatus().then(() => fetchAll());
      } else if (stripeParam === "refresh") {
        toast.info("Completa tu registro en Stripe para recibir pagos.");
        setSearchParams({}, { replace: true });
      }

      // Handle private route (slot purchase) return
      const slotParam = searchParams.get("private_route");
      if (slotParam === "success") {
        toast.success("✅ Slot activado. Ahora registra los datos de tu unidad.");
        setSearchParams({}, { replace: true });
        // Wait briefly for Stripe webhook then refresh slots and open form
        setTimeout(() => {
          refreshSlotCount().then(() => setShowAddUnit(true));
        }, 1500);
      } else if (slotParam === "cancelled") {
        toast.info("Compra de slot cancelada.");
        setSearchParams({}, { replace: true });
      }
    }
  }, [user, authLoading]);

  // Realtime: refrescar contratos cuando la empresa acepta/rechaza
  useEffect(() => {
    if (!proveedor?.id) return;
    const ch = supabase
      .channel("contratos-concesionario-" + proveedor.id)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "contratos_transporte",
        filter: `concesionario_id=eq.${proveedor.id}`,
      }, () => {
        loadContratosEmpresa(proveedor.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [proveedor?.id]);

  async function fetchAll() {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    const fetchId = activeFetchIdRef.current + 1;
    activeFetchIdRef.current = fetchId;
    const isCurrentFetch = () => fetchId === activeFetchIdRef.current;

    let prov: any = null;
    let verifData: any = null;
    let cuentaData: any = null;

    try {
      if (isCurrentFetch()) setLoading(true);
      // Get provider
      const provRes = await withTimeout(
        supabase
          .from("proveedores")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
        12000,
        "perfil de concesionario"
      );
      prov = provRes.data;
      const provError = provRes.error;

      if (!isCurrentFetch()) return;

      if (provError || !prov) {
        toast.error("No tienes un perfil de proveedor/concesionario");
        setLoading(false);
        navigate("/home");
        return;
      }
      setProveedor(prov);
    } catch (err: any) {
      if (!isCurrentFetch()) return;
      console.error("[PanelConcesionario] Error cargando proveedor:", err?.message, err?.stack);
      toast.error(`No se pudo cargar el perfil: ${err?.message || 'Error desconocido'}`);
      setLoading(false);
      return;
    }

    // Fetch core data in parallel — independent error handling, never throws
    try {
      const [verifResult, cuentaResult] = await Promise.allSettled([
        withTimeout(supabase.from("verificaciones_concesionario").select("*").eq("concesionario_id", prov.id).order("fecha_solicitud", { ascending: false }).limit(1).maybeSingle(), 8000, "verificación"),
        withTimeout(supabase.from("cuentas_conectadas").select("*").eq("concesionario_id", prov.id).maybeSingle(), 8000, "cuenta conectada"),
      ]);

      verifData = verifResult.status === "fulfilled" ? (verifResult.value as any)?.data : null;
      cuentaData = cuentaResult.status === "fulfilled" ? (cuentaResult.value as any)?.data : null;

      if (verifResult.status === "rejected") console.error("[PanelConcesionario] verificación falló:", verifResult.reason);
      if (cuentaResult.status === "rejected") console.error("[PanelConcesionario] cuenta conectada falló:", cuentaResult.reason);
    } catch (e: any) {
      console.error("[PanelConcesionario] Error cargando verificación/cuenta:", e?.message);
    }

    try {
      if (!isCurrentFetch()) return;

      if (verifData) setVerificacion(verifData as any);
      if (cuentaData) {
        setCuentaConectada(cuentaData);
        setFrecuenciaLiq((cuentaData as any).frecuencia_liquidacion || "daily");
      }


      // Load unidades from unidades_empresa (the actual registered units)
      try {
        const { data: empresaUnidades } = await withTimeout<any>(
          supabase.from("unidades_empresa")
            .select("id, nombre, numero_economico, placas, descripcion")
            .eq("proveedor_id", prov.id)
            .neq("transport_type", "taxi"),
          8000, "unidades empresa");

        // Also load verification status if available
        let verifMap: Record<string, string> = {};
        if (verifData?.id) {
          const { data: verifUnidades } = await withTimeout<any>(
            supabase.from("detalles_verificacion_unidad")
              .select("numero_economico, placas, estado_verificacion")
              .eq("verificacion_id", verifData.id), 8000, "unidades verificación");
          if (verifUnidades) {
            for (const vu of verifUnidades) {
              verifMap[`${vu.numero_economico}-${vu.placas}`] = vu.estado_verificacion || 'pending';
            }
          }
        }

        if (empresaUnidades) {
          if (!isCurrentFetch()) return;
          setUnidades(empresaUnidades.map((u: any) => ({
            id: u.id,
            numero_economico: u.numero_economico || u.nombre,
            placas: u.placas || '',
            modelo: null,
            linea: null,
            descripcion: u.descripcion || null,
            estado_verificacion: verifMap[`${u.numero_economico || u.nombre}-${u.placas}`] || null,
          })));
        }
      } catch (e) { console.error("Error loading unidades:", e); }

      // Load liquidaciones if cuenta exists
      if (cuentaData?.id) {
        try {
           const { data: liqData } = await withTimeout<any>(
            supabase.from("liquidaciones_diarias").select("*")
              .eq("cuenta_conectada_id", cuentaData.id)
              .order("fecha_liquidacion", { ascending: false }).limit(30), 8000, "liquidaciones");
          if (liqData) setLiquidaciones(liqData as any);
        } catch (e) { console.error("Error loading liquidaciones:", e); }
      }

      try {
        await loadOperationalStats(prov.id, fetchId);
      } catch (statsError) {
        if (!isCurrentFetch()) return;
        console.error("Error loading stats:", statsError);
        toast.error("El panel cargó parcialmente; las estadísticas tardaron demasiado.");
      }

      // Load contratos con empresas (non-blocking — own error handling)
      loadContratosEmpresa(prov.id).catch((e) => {
        console.error("[PanelConcesionario] loadContratosEmpresa failed:", e?.message, e);
      });

      // Non-critical data should not block the initial render
      void (async () => {
        try {
          const { data, error } = await withTimeout(
            supabase
              .from("intentos_fraude")
              .select("id, fecha_intento, severidad, tipo_fraude, distancia_km, tiempo_transcurrido_minutos, total_intentos_usuario, resuelto")
              .order("fecha_intento", { ascending: false })
              .limit(50),
            10000,
            "intentos de fraude"
          );

          if (error) {
            console.error("Error loading fraud data:", error);
            return;
          }

          if (data && isCurrentFetch()) setFraudes(data as any);
        } catch (error) {
          console.error("Error loading fraud data:", error);
        }
      })();
    } catch (err: any) {
      if (!isCurrentFetch()) return;
      console.error("[PanelConcesionario] Error loading panel:", err?.message, err?.stack, err);
      toast.error(`No se pudo cargar el panel: ${err?.message || 'Error desconocido'}`);
    } finally {
      if (isCurrentFetch()) setLoading(false);
    }
  }

  const toggleUnidadTickets = async (unidadId: string) => {
    if (expandedUnidad === unidadId) {
      setExpandedUnidad(null);
      return;
    }
    setExpandedUnidad(unidadId);
    setLoadingUnidadTickets(true);
    try {
      const now = new Date();
      const hermosillo = new Date(now.getTime() - 7 * 60 * 60 * 1000);
      const todayStr = hermosillo.toISOString().split("T")[0];
      const todayStart = `${todayStr}T00:00:00-07:00`;
      const todayEnd = `${todayStr}T23:59:59-07:00`;

      const { data } = await (supabase
        .from("logs_validacion_qr") as any)
        .select("qr_ticket_id, created_at, qr_tickets(token, unidad_uso_id)")
        .eq("unidad_id", unidadId)
        .eq("resultado", "valid")
        .gte("created_at", todayStart)
        .lte("created_at", todayEnd)
        .order("created_at", { ascending: false });

      const normalized = (data || []).filter((d: any) => d.unidad_id === unidadId || d.qr_tickets?.unidad_uso_id === unidadId);

      if (normalized.length > 0) {
        setUnidadTickets(normalized.map((d: any) => ({
          short_code: (d.qr_tickets?.token || d.qr_ticket_id || "").slice(-6).toUpperCase(),
          time: new Date(d.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
        })));
      } else {
        setUnidadTickets([]);
      }
    } catch (err) {
      console.error("Error loading unit tickets:", err);
    } finally {
      setLoadingUnidadTickets(false);
    }
  };

  const handleStripeConnect = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("create-connect-account", {
        body: { proveedor_id: proveedor.id },
      });

      if (error) {
        let message = "Error al crear cuenta Stripe";
        try {
          const payload = await error.context.json();
          if (payload?.error) message = payload.error;
        } catch {
          if (error.message) message = error.message;
        }
        throw new Error(message);
      }

      if (data?.url) window.open(data.url, "_blank");
    } catch (err: any) {
      console.error("Stripe connect error:", err);
      toast.error(err.message || "Error al crear cuenta Stripe");
    }
  };

  async function syncStripeStatus() {
    if (!proveedor?.id) return;
    try {
      setSyncing(true);
      const { data, error } = await supabase.functions.invoke("create-connect-account", {
        body: { proveedor_id: proveedor.id, sync_only: true },
      });
      if (error) {
        console.error("Sync error:", error);
        return;
      }
      if (data?.synced) {
        setCuentaConectada((prev: any) => prev ? {
          ...prev,
          estado_stripe: data.estado,
          pagos_habilitados: data.pagos_habilitados,
          transferencias_habilitadas: data.transferencias_habilitadas,
          requisitos_pendientes: data.requisitos_pendientes,
        } : prev);
        if (data.pagos_habilitados && data.transferencias_habilitadas) {
          toast.success("¡Tu cuenta Stripe está activa y lista para recibir pagos!");
        } else {
          toast.info("Estado sincronizado. Stripe aún requiere información adicional.");
        }
      }
    } catch (err) {
      console.error("Sync error:", err);
    } finally {
      setSyncing(false);
    }
  }

  // Check if settlement is available based on frequency
  const isSettlementAvailable = () => {
    if (!cuentaConectada?.pagos_habilitados || !cuentaConectada?.transferencias_habilitadas) return false;
    const freq = (cuentaConectada as any).frecuencia_liquidacion || "daily";
    const now = new Date();
    const hermosillo = new Date(now.getTime() - 7 * 60 * 60 * 1000);
    
    // Find the last successful settlement date
    const lastCompleted = liquidaciones.find((l) => l.estado === "completed");
    
    if (!lastCompleted) return true; // No settlements yet, allow

    const lastDate = new Date(lastCompleted.fecha_liquidacion + "T12:00:00");
    const todayStr = hermosillo.toISOString().split("T")[0];
    const today = new Date(todayStr + "T12:00:00");
    const diffDays = Math.floor((today.getTime() - lastDate.getTime()) / 86400000);

    if (freq === "daily") return diffDays >= 1;
    if (freq === "weekly") return diffDays >= 7;
    if (freq === "monthly") return diffDays >= 28;
    return false;
  };

  const getNextSettlementLabel = () => {
    const freq = (cuentaConectada as any)?.frecuencia_liquidacion || "daily";
    const lastCompleted = liquidaciones.find((l) => l.estado === "completed");
    if (!lastCompleted) return "Disponible ahora";

    const lastDate = new Date(lastCompleted.fecha_liquidacion + "T12:00:00");
    let nextDate: Date;
    if (freq === "daily") {
      nextDate = new Date(lastDate.getTime() + 86400000);
    } else if (freq === "weekly") {
      nextDate = new Date(lastDate.getTime() + 7 * 86400000);
    } else {
      nextDate = new Date(lastDate);
      nextDate.setMonth(nextDate.getMonth() + 1);
    }
    return `Disponible: ${nextDate.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}`;
  };

  const handleCobrar = async () => {
    if (!cuentaConectada) return;
    setCobrandoLiq(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-daily-settlements", {
        body: { cuenta_id: cuentaConectada.id, frecuencia_liquidacion: frecuenciaLiq },
      });
      if (error) throw error;
      if (data?.processed > 0) {
        const resultado = data.results?.[0];
        if (resultado?.estado === "completed") {
          toast.success(`Liquidación procesada: ${resultado?.neto ? "$" + resultado.neto + " MXN" : "exitosamente"}`);
        } else if (resultado?.estado === "failed") {
          toast.error("La liquidación se calculó, pero la transferencia al concesionario falló");
        } else {
          toast.success("Liquidación procesada");
        }
      } else {
        toast.info("No hay boletos pendientes para liquidar en este periodo");
      }
      fetchAll();
    } catch (err: any) {
      console.error("Settlement error:", err);
      toast.error("Error al procesar la liquidación");
    } finally {
      setCobrandoLiq(false);
    }
  };


  // Buy a new unit slot via Stripe (no data collected upfront — slot first, register later)
  const handleBuySlot = async () => {
    setBuyingSlot(true);
    try {
      const { data, error } = await supabase.functions.invoke('add-private-vehicle', {
        body: { action: 'add', transportType: 'urbana', uiTransportType: 'publico', returnTo: '/panel-concesionario' }
      });
      if (error) throw error;
      if (data?.action === 'checkout' && data?.url) {
        window.open(data.url, '_blank');
        toast.info("Redirigiendo a Stripe. Al completar el pago vuelve aquí para registrar tu unidad.");
      }
    } catch (err: any) {
      toast.error(err.message || "No se pudo iniciar el pago");
    } finally {
      setBuyingSlot(false);
    }
  };

  // Refresh slot count from Stripe
  const refreshSlotCount = async () => {
    try {
      const { data } = await supabase.functions.invoke('add-private-vehicle', {
        body: { action: 'status', transportType: 'urbana', uiTransportType: 'publico' }
      });
      if (data?.action === 'status') {
        setSlotsQuantity(data.quantity || 0);
      }
    } catch (err) {
      console.error('Error fetching slot count:', err);
    }
  };

  const handleAddUnit = async () => {
    if (!newUnit.numero_economico.trim() || !newUnit.placas.trim()) {
      toast.error("Número económico y placas son obligatorios");
      return;
    }

    // Verify there's a paid slot available
    const availableSlots = slotsQuantity - unidades.length;
    if (availableSlots <= 0) {
      toast.error("No tienes slots disponibles. Compra un slot primero.");
      return;
    }

    setSavingUnit(true);
    try {
      let verifId = verificacion?.id;

      // Create verification request if none exists
      if (!verifId) {
        const { data: newVerif, error: verifError } = await (supabase
          .from("verificaciones_concesionario") as any)
          .insert({
            concesionario_id: proveedor.id,
            estado: "pending",
            total_unidades: 0,
          })
          .select("id")
          .single();

        if (verifError) throw verifError;
        verifId = newVerif.id;
      }

      // Insert unit detail
      const { error: unitError } = await supabase
        .from("detalles_verificacion_unidad")
        .insert({
          verificacion_id: verifId,
          numero_economico: newUnit.numero_economico.trim().toUpperCase(),
          placas: newUnit.placas.trim().toUpperCase(),
          modelo: newUnit.modelo.trim() || null,
          linea: newUnit.linea.trim() || null,
          estado_verificacion: "pending",
        });

      if (unitError) throw unitError;

      // Update total_unidades count
      const { count } = await supabase
        .from("detalles_verificacion_unidad")
        .select("id", { count: "exact", head: true })
        .eq("verificacion_id", verifId);

      await (supabase
        .from("verificaciones_concesionario") as any)
        .update({ total_unidades: count || 0 })
        .eq("id", verifId);

      toast.success("Unidad registrada correctamente");
      setNewUnit({ numero_economico: "", placas: "", modelo: "", linea: "" });
      setShowAddUnit(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Error al registrar unidad");
    } finally {
      setSavingUnit(false);
    }
  };

  const handleDeleteUnit = async (unitId: string) => {
    if (!confirm("¿Eliminar esta unidad?")) return;
    try {
      const { error } = await supabase
        .from("detalles_verificacion_unidad")
        .delete()
        .eq("id", unitId);
      if (error) throw error;

      // Update count
      if (verificacion?.id) {
        const { count } = await supabase
          .from("detalles_verificacion_unidad")
          .select("id", { count: "exact", head: true })
          .eq("verificacion_id", verificacion.id);

        await (supabase
          .from("verificaciones_concesionario") as any)
          .update({ total_unidades: count || 0 })
          .eq("id", verificacion.id);
      }

      toast.success("Unidad eliminada");
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar unidad");
    }
  };

  const handleDownloadCSVConcesionario = async () => {
    if (!proveedor) return;
    try {
      const now = new Date();
      const hermosillo = new Date(now.getTime() - 7 * 60 * 60 * 1000);
      const todayStr = hermosillo.toISOString().split("T")[0];
      const todayStart = `${todayStr}T00:00:00-07:00`;
      const todayEnd = `${todayStr}T23:59:59-07:00`;

      // Get all units for this provider
      const { data: misUnidades } = await supabase
        .from("unidades_empresa")
        .select("id, nombre, numero_economico, placas")
        .eq("proveedor_id", proveedor.id)
        .neq("transport_type", "taxi"); // Protocolo 2: Taxi oculto

      if (!misUnidades || misUnidades.length === 0) {
        toast.info("No hay unidades registradas");
        return;
      }

      const unidadIds = misUnidades.map((u: any) => u.id);
      const unidadMap: Record<string, any> = {};
      misUnidades.forEach((u: any) => { unidadMap[u.id] = u; });

      const { data: logs } = await (supabase
        .from("logs_validacion_qr") as any)
        .select("qr_ticket_id, created_at, unidad_id, qr_tickets(token, unidad_uso_id)")
        .in("unidad_id", unidadIds)
        .eq("resultado", "valid")
        .gte("created_at", todayStart)
        .lte("created_at", todayEnd)
        .order("created_at", { ascending: true });

      if (!logs || logs.length === 0) {
        toast.info("No hay boletos para exportar hoy");
        return;
      }

      const normalizedLogs = (logs || []).map((d: any) => ({
        ...d,
        effectiveUnidadId: d.unidad_id || d.qr_tickets?.unidad_uso_id || null,
      })).filter((d: any) => d.effectiveUnidadId && unidadMap[d.effectiveUnidadId]);

      const rows = normalizedLogs.map((d: any, i: number) => {
        const u = unidadMap[d.effectiveUnidadId];
        return [
          String(i + 1),
          (d.qr_tickets?.token || d.qr_ticket_id || "").slice(-6).toUpperCase(),
          new Date(d.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          u ? (u.numero_economico || u.nombre) : "",
          u?.placas || "",
          "$9.00",
        ];
      });

      downloadCSV(
        `boletos-concesionario-${todayStr}.csv`,
        ["#", "Código", "Hora", "Unidad", "Placas", "Monto"],
        rows
      );
      toast.success("CSV descargado");
    } catch (err) {
      console.error("CSV export error:", err);
      toast.error("Error al exportar CSV");
    }
  };

  const handleWhatsAppDocuments = () => {
    const phone = "526621234567"; // TODO: Replace with admin's actual WhatsApp number
    const message = encodeURIComponent(
      `Hola, soy ${proveedor?.nombre_negocio || proveedor?.nombre || "concesionario"} y quiero enviar mis documentos para verificación:\n\n` +
      `- INE / Identificación Oficial\n` +
      `- Concesión IMTES\n` +
      `- RFC (Constancia de Situación Fiscal)\n` +
      `- Comprobante de Domicilio\n` +
      `- Tarjeta de Circulación\n` +
      `- Fotografías de unidades\n\n` +
      `ID Proveedor: ${proveedor?.id}`
    );
    window.open(`https://wa.me/${phone}?text=${message}`, "_blank");
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Cargando panel...</div>
      </div>
    );
  }

  const estadoVerifColor = (e?: string) => {
    switch (e) {
      case "approved": return "bg-green-600 text-white";
      case "rejected": return "bg-destructive text-destructive-foreground";
      case "in_review": return "bg-amber-500 text-white";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const estadoVerifLabel = (e?: string) => {
    switch (e) {
      case "approved": return "Aprobado";
      case "rejected": return "Rechazado";
      case "in_review": return "En Revisión";
      default: return "Pendiente";
    }
  };

  const severidadColor = (s: string) => {
    switch (s) {
      case "critical": return "bg-red-900 text-red-100";
      case "high": return "bg-red-700 text-red-100";
      case "medium": return "bg-orange-600 text-orange-100";
      default: return "bg-yellow-600 text-yellow-100";
    }
  };

  const estadoLiqColor = (e: string) => {
    switch (e) {
      case "completed": return "bg-green-600 text-white";
      case "failed": return "bg-destructive text-destructive-foreground";
      default: return "bg-amber-500 text-white";
    }
  };

  // === Empresas / Contratos functions ===
  const searchEmpresas = async () => {
    if (!empresaSearch.trim()) return;
    setSearchingEmpresas(true);
    const { data } = await supabase
      .from("empresas_transporte")
      .select("id, nombre, rfc, contacto_nombre, contacto_telefono")
      .eq("is_active", true)
      .ilike("nombre", `%${empresaSearch.trim()}%`)
      .limit(10);
    setEmpresasFound(data || []);
    setSearchingEmpresas(false);
  };

  async function loadContratosEmpresa(provId: string) {
    const { data, error } = await supabase
      .from("contratos_transporte")
      .select("*, empresas_transporte(nombre)")
      .eq("concesionario_id", provId)
      .order("created_at", { ascending: false });
    if (error) console.error("Error loading contratos:", error);
    console.log("Contratos loaded for provId", provId, ":", data);
    setContratosEmpresa(data || []);
  }

  const handleProponerContrato = async () => {
    if (!proveedor || !empresaSeleccionada) return;
    setSavingContrato(true);
    const turnosSeleccionados = contratoTurnos
      .filter(t => t.selected)
      .map(t => ({ turno: t.turno, unidades: t.unidades }));
    const descAuto = turnosSeleccionados.length > 0
      ? turnosSeleccionados.map(t => `${t.turno} (${t.unidades} unid.)`).join(", ")
      : `Transporte de personal - ${empresaSeleccionada.nombre}`;
    const { error } = await supabase.from("contratos_transporte").insert({
      concesionario_id: proveedor.id,
      empresa_id: empresaSeleccionada.id,
      tarifa_por_persona: contratoModeloCobro === "por_viaje" ? 0 : (parseFloat(contratoTarifa) || 15),
      frecuencia_corte: contratoFrecuencia,
      descripcion: contratoDescripcion || descAuto,
      estado: "pendiente",
      iniciado_por: "concesionario",
      is_active: false,
      turnos: turnosSeleccionados,
      modelo_cobro: contratoModeloCobro,
    } as any);
    setSavingContrato(false);
    if (error) {
      toast.error("Error al proponer contrato: " + error.message);
    } else {
      toast.success("Propuesta de contrato enviada");
      setShowProponerContrato(false);
      setEmpresaSeleccionada(null);
      setContratoTarifa("15");
      setContratoDescripcion("");
      setContratoTurnos(prev => prev.map(t => ({ ...t, selected: false, unidades: 1 })));
      loadContratosEmpresa(proveedor.id);
    }
  };

  const handleAceptarContrato = async (contratoId: string) => {
    const { error } = await supabase
      .from("contratos_transporte")
      .update({ estado: "aceptado", is_active: true })
      .eq("id", contratoId);
    if (error) {
      toast.error("Error: " + error.message);
    } else {
      toast.success("Contrato aceptado");
      if (proveedor) loadContratosEmpresa(proveedor.id);
    }
  };

  const handleRechazarContrato = async (contratoId: string) => {
    const { error } = await supabase
      .from("contratos_transporte")
      .update({ estado: "rechazado", is_active: false })
      .eq("id", contratoId);
    if (error) {
      toast.error("Error: " + error.message);
    } else {
      toast.success("Contrato rechazado");
      if (proveedor) loadContratosEmpresa(proveedor.id);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border p-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <div className="flex-1">
            <h1 className="text-lg font-bold text-foreground">Panel Concesionario</h1>
            <p className="text-xs text-muted-foreground">
              {proveedor?.nombre || "Gestión de transporte"}
            </p>
          </div>
          {verificacion && (
            <Badge className={estadoVerifColor(verificacion.estado)}>
              {estadoVerifLabel(verificacion.estado)}
            </Badge>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <BarChart3 className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold text-foreground">{stats.hoy}</p>
              <p className="text-xs text-muted-foreground">Pasajeros hoy</p>
              {stats.hoyAnterior > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1 border-t border-border pt-1">
                  {stats.labelHoyAnterior}: <span className="font-semibold text-foreground">{stats.hoyAnterior}</span>
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <DollarSign className="h-5 w-5 mx-auto text-green-500 mb-1" />
              <p className="text-2xl font-bold text-foreground">${stats.totalMes.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">Neto este mes</p>
              {stats.mesAnterior > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1 border-t border-border pt-1">
                  {stats.labelMesAnterior}: <span className="font-semibold text-foreground">${stats.mesAnterior.toFixed(0)}</span>
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <TrendingUp className="h-5 w-5 mx-auto text-blue-500 mb-1" />
              <p className="text-2xl font-bold text-foreground">{stats.semana}</p>
              <p className="text-xs text-muted-foreground">Semana (Lun-Dom)</p>
              {stats.semanaAnterior > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1 border-t border-border pt-1">
                  {stats.labelSemanaAnterior}: <span className="font-semibold text-foreground">{stats.semanaAnterior}</span>
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <Bus className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-2xl font-bold text-foreground">{stats.totalUnidades}</p>
              <p className="text-xs text-muted-foreground">Unidades</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="ingresos" className="w-full">
          <div className="overflow-x-auto">
            <TabsList className="inline-flex w-auto min-w-full">
              <TabsTrigger value="ingresos" className="text-xs">
                <BarChart3 className="h-3 w-3 mr-1" /> Ingresos
              </TabsTrigger>
              <TabsTrigger value="reportes" className="text-xs">
                <ClipboardList className="h-3 w-3 mr-1" /> Reportes
              </TabsTrigger>
              <TabsTrigger value="verificacion" className="text-xs">
                <ShieldCheck className="h-3 w-3 mr-1" /> Verif.
              </TabsTrigger>
              <TabsTrigger value="unidades" className="text-xs">
                <Bus className="h-3 w-3 mr-1" /> Unidades
              </TabsTrigger>
              <TabsTrigger value="liquidaciones" className="text-xs">
                <DollarSign className="h-3 w-3 mr-1" /> Pagos
              </TabsTrigger>
              <TabsTrigger value="fraude" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" /> Fraude
              </TabsTrigger>
              <TabsTrigger value="empresas" className="text-xs">
                <Building2 className="h-3 w-3 mr-1" /> Empresas
              </TabsTrigger>
            </TabsList>
          </div>

          {/* INGRESOS POR UNIDAD */}
          <TabsContent value="ingresos" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" /> Ingresos del día por unidad
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={handleDownloadCSVConcesionario} className="h-7 text-xs gap-1">
                    <Download className="h-3 w-3" /> CSV
                  </Button>
                </div>
                <CardDescription className="text-xs">
                  Boletos QR validados hoy · Precio según tipo
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {ingresosUnidad.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    <Bus className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No hay unidades registradas</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Unidad</TableHead>
                        <TableHead className="text-xs">Chofer</TableHead>
                        <TableHead className="text-xs text-right">Boletos</TableHead>
                        <TableHead className="text-xs text-right">Ingreso</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ingresosUnidad.map((u) => (
                        <React.Fragment key={u.unidad_id}>
                          <TableRow 
                            className="cursor-pointer hover:bg-muted/30"
                            onClick={() => u.boletos_hoy > 0 && toggleUnidadTickets(u.unidad_id)}
                          >
                            <TableCell className="py-2">
                              <p className="font-bold text-sm">#{u.numero_economico}</p>
                              {u.placas && (
                                <p className="text-xs text-muted-foreground">{u.placas}</p>
                              )}
                            </TableCell>
                            <TableCell className="py-2 text-sm">
                              {u.chofer_nombre || <span className="text-muted-foreground text-xs">Sin asignar</span>}
                            </TableCell>
                            <TableCell className="py-2 text-right font-semibold text-sm">
                              {u.boletos_hoy}
                              {u.boletos_hoy > 0 && (
                                <span className="text-[10px] text-primary ml-1">
                                  {expandedUnidad === u.unidad_id ? "▲" : "▼"}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-2 text-right font-bold text-sm text-green-600">
                              ${u.ingresos_hoy.toFixed(0)}
                            </TableCell>
                          </TableRow>
                          {expandedUnidad === u.unidad_id && (
                            <TableRow>
                              <TableCell colSpan={4} className="p-0">
                                <div className="bg-muted/30 p-3">
                                  <p className="text-xs font-semibold text-muted-foreground mb-2">Boletos validados</p>
                                  {loadingUnidadTickets ? (
                                    <p className="text-xs text-muted-foreground text-center py-2">Cargando...</p>
                                  ) : unidadTickets.length === 0 ? (
                                    <p className="text-xs text-muted-foreground text-center py-2">Sin boletos</p>
                                  ) : (
                                    <div className="space-y-1 max-h-48 overflow-y-auto">
                                      {unidadTickets.map((t, i) => (
                                        <div key={i} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                                          <span className="font-mono text-sm font-bold text-foreground">#{t.short_code}</span>
                                          <span className="text-xs text-muted-foreground">{t.time}</span>
                                          <span className="text-xs font-semibold text-primary">$9.00</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}
                      {/* Totals row */}
                      <TableRow className="border-t-2 border-border bg-muted/50">
                        <TableCell colSpan={2} className="py-2 font-bold text-sm">
                          Total ({ingresosUnidad.filter(u => u.boletos_hoy > 0).length} unidades activas)
                        </TableCell>
                        <TableCell className="py-2 text-right font-bold text-sm">
                          {ingresosUnidad.reduce((s, u) => s + u.boletos_hoy, 0)}
                        </TableCell>
                        <TableCell className="py-2 text-right font-bold text-sm text-green-600">
                          ${ingresosUnidad.reduce((s, u) => s + u.ingresos_hoy, 0).toFixed(0)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* VERIFICACIÓN */}
          <TabsContent value="verificacion" className="space-y-4 mt-4">
            {/* Stripe Connect */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Cuenta Stripe Connect
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {cuentaConectada ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Estado:</span>
                      <Badge className={
                        cuentaConectada.pagos_habilitados 
                          ? "bg-green-600 text-white" 
                          : cuentaConectada.estado_stripe === "onboarding"
                            ? "bg-blue-500 text-white"
                            : "bg-amber-500 text-white"
                      }>
                        {cuentaConectada.pagos_habilitados 
                          ? "✅ Activa — Lista para recibir pagos" 
                          : cuentaConectada.estado_stripe === "onboarding"
                            ? "🔄 En revisión por Stripe"
                            : "⏳ Pendiente de completar"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Pagos:</span>
                      <span className="text-sm">
                        {cuentaConectada.pagos_habilitados ? "✅ Habilitados" : "❌ No habilitados"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Transferencias:</span>
                      <span className="text-sm">
                        {cuentaConectada.transferencias_habilitadas ? "✅ Habilitadas" : "❌ No habilitadas"}
                      </span>
                    </div>
                    {cuentaConectada.stripe_account_id && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Cuenta:</span>
                        <span className="text-xs font-mono text-muted-foreground">
                          {cuentaConectada.stripe_account_id}
                        </span>
                      </div>
                    )}
                    {cuentaConectada.pagos_habilitados && cuentaConectada.transferencias_habilitadas && (
                      <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3 text-center">
                        <CheckCircle2 className="h-6 w-6 text-green-500 mx-auto mb-1" />
                        <p className="text-sm font-medium text-green-400">
                          ¡Tu cuenta está completamente configurada!
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Las liquidaciones se depositarán automáticamente en tu cuenta CLABE según la frecuencia que elijas.
                        </p>
                      </div>
                    )}
                    {cuentaConectada.requisitos_pendientes && Array.isArray(cuentaConectada.requisitos_pendientes) && cuentaConectada.requisitos_pendientes.length > 0 && (
                      <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-3">
                        <p className="text-xs font-medium text-amber-400 mb-1">Requisitos pendientes:</p>
                        <ul className="text-xs text-muted-foreground space-y-0.5">
                          {(cuentaConectada.requisitos_pendientes as string[]).map((req: string, i: number) => (
                            <li key={i}>• {req}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {!cuentaConectada.pagos_habilitados && (
                      <div className="space-y-2">
                        <Button onClick={handleStripeConnect} className="w-full" size="sm">
                          Completar configuración de Stripe
                        </Button>
                        <Button onClick={syncStripeStatus} variant="outline" className="w-full" size="sm" disabled={syncing}>
                          {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          {syncing ? "Sincronizando..." : "🔄 Sincronizar estado desde Stripe"}
                        </Button>
                      </div>
                    )}
                    {cuentaConectada.pagos_habilitados && cuentaConectada.transferencias_habilitadas && (
                      <Button onClick={syncStripeStatus} variant="ghost" className="w-full" size="sm" disabled={syncing}>
                        {syncing ? "Sincronizando..." : "🔄 Actualizar estado"}
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="text-center space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Necesitas vincular tu cuenta bancaria para recibir pagos.
                    </p>
                    <Button onClick={handleStripeConnect} className="w-full">
                      Configurar Stripe Connect
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Verificación Status */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Estado de Verificación
                </CardTitle>
              </CardHeader>
              <CardContent>
                {verificacion ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Estado:</span>
                      <Badge className={estadoVerifColor(verificacion.estado)}>
                        {estadoVerifLabel(verificacion.estado)}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Solicitud:</span>
                      <span className="text-sm">
                        {new Date(verificacion.fecha_solicitud).toLocaleDateString("es-MX")}
                      </span>
                    </div>
                    {verificacion.fecha_revision && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Revisión:</span>
                        <span className="text-sm">
                          {new Date(verificacion.fecha_revision).toLocaleDateString("es-MX")}
                        </span>
                      </div>
                    )}
                    {verificacion.admin_notas && (
                      <div className="bg-muted rounded-lg p-3 text-sm">
                        <p className="font-medium text-foreground mb-1">Notas del administrador:</p>
                        <p className="text-muted-foreground">{verificacion.admin_notas}</p>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Unidades registradas:</span>
                      <span className="text-sm font-bold">{verificacion.total_unidades}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <ShieldCheck className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No hay solicitud de verificación</p>
                    <p className="text-xs mt-1">
                      Registra tus unidades y envía tus documentos para iniciar la verificación
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Required Documents + WhatsApp */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Documentos Requeridos
                </CardTitle>
                <CardDescription className="text-xs">
                  Envía estos documentos por WhatsApp al administrador
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  {[
                    "INE / Identificación Oficial",
                    "Concesión IMTES",
                    "RFC (Constancia de Situación Fiscal)",
                    "Comprobante de Domicilio",
                    "Tarjeta de Circulación (por unidad)",
                    "Fotografías de unidades",
                  ].map((doc, i) => (
                    <div key={i} className="flex items-center gap-2 py-1">
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground/50" />
                      <span className="text-muted-foreground">{doc}</span>
                    </div>
                  ))}
                </div>
                <Button onClick={handleWhatsAppDocuments} className="w-full bg-green-600 hover:bg-green-700 text-white" size="sm">
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Enviar documentos por WhatsApp
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* UNIDADES (solo lectura — registro y suscripción se hacen en "Mis Rutas de Transporte") */}
          <TabsContent value="unidades" className="space-y-3 mt-4">
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  🚌 Las unidades se registran y suscriben desde <strong>Mis Rutas de Transporte</strong>
                </p>
                <p className="text-xs text-muted-foreground">
                  Elige el tipo (Pública, Foránea o Privada), abre el slot pagando la suscripción anual y registra los datos de la unidad. Aparecerán automáticamente aquí.
                </p>
                <Button
                  onClick={() => navigate("/mis-rutas")}
                  size="sm"
                  className="w-full mt-2"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Ir a Mis Rutas de Transporte
                </Button>
              </CardContent>
            </Card>

            {unidades.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  <Bus className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No hay unidades registradas</p>
                  <p className="text-xs mt-1">Regístralas desde "Mis Rutas de Transporte"</p>
                </CardContent>
              </Card>
            ) : (
              unidades.map((u) => (
                <Card key={u.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-foreground text-lg">#{u.numero_economico}</p>
                        <p className="text-sm text-muted-foreground">
                          Placas: {u.placas}
                          {u.descripcion && ` • ${u.descripcion}`}
                          {u.linea && ` • ${u.linea}`}
                          {u.modelo && ` ${u.modelo}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={estadoVerifColor(u.estado_verificacion || undefined)}>
                          {estadoVerifLabel(u.estado_verificacion || undefined)}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* LIQUIDACIONES */}
          <TabsContent value="liquidaciones" className="space-y-3 mt-4">
            {/* Frequency selector */}
            {cuentaConectada && cuentaConectada.pagos_habilitados && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Frecuencia de liquidación</p>
                      <p className="text-xs text-muted-foreground">Elige cada cuándo recibir tus depósitos</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: "daily", label: "Diaria", desc: "Cada día" },
                      { value: "weekly", label: "Semanal", desc: "Domingos" },
                      { value: "monthly", label: "Mensual", desc: "Día 1" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setFrecuenciaLiq(opt.value)}
                        className={`rounded-lg border p-2 text-center transition-colors ${
                          frecuenciaLiq === opt.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        <p className="text-sm font-medium">{opt.label}</p>
                        <p className="text-xs">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                  {frecuenciaLiq !== ((cuentaConectada as any).frecuencia_liquidacion || "daily") && (
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={savingFreq}
                      onClick={async () => {
                        setSavingFreq(true);
                        const { data, error } = await supabase
                          .from("cuentas_conectadas")
                          .update({ frecuencia_liquidacion: frecuenciaLiq } as any)
                          .eq("id", cuentaConectada.id)
                          .select("id, frecuencia_liquidacion")
                          .single();
                        setSavingFreq(false);
                        if (error) {
                          toast.error("Error al guardar frecuencia");
                        } else {
                          setCuentaConectada((prev: any) => ({ ...prev, frecuencia_liquidacion: data?.frecuencia_liquidacion || frecuenciaLiq }));
                          setFrecuenciaLiq(data?.frecuencia_liquidacion || frecuenciaLiq);
                          toast.success(`Frecuencia cambiada a ${frecuenciaLiq === "daily" ? "diaria" : frecuenciaLiq === "weekly" ? "semanal" : "mensual"}`);
                        }
                      }}
                    >
                      {savingFreq ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Guardar frecuencia
                    </Button>
                  )}
                  <div className="bg-muted rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">Desglose de comisiones por boleto ($9.00):</p>
                    <p>• Pasarela Stripe: 3.6% + $3.00 MXN por transacción</p>
                    <p>• TodoCerca: 2%</p>
                    <p className="font-medium text-foreground pt-1">La cuota fija de $3.00 se diluye entre más boletos compre el usuario por transacción.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Cobrar button */}
            {cuentaConectada?.pagos_habilitados && cuentaConectada?.transferencias_habilitadas && (
              <Card className={isSettlementAvailable() ? "border-primary/50" : ""}>
                <CardContent className="p-4">
                  <Button
                    className="w-full"
                    size="lg"
                    disabled={!isSettlementAvailable() || cobrandoLiq}
                    onClick={handleCobrar}
                  >
                    {cobrandoLiq ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Procesando...</>
                    ) : isSettlementAvailable() ? (
                      <><DollarSign className="h-4 w-4 mr-2" /> Cobrar liquidación</>
                    ) : (
                      <><Clock className="h-4 w-4 mr-2" /> {getNextSettlementLabel()}</>
                    )}
                  </Button>
                  {!isSettlementAvailable() && (
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      Tu frecuencia es {frecuenciaLiq === "daily" ? "diaria" : frecuenciaLiq === "weekly" ? "semanal" : "mensual"}. El botón se habilitará cuando se cumpla el periodo.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {liquidaciones.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  <DollarSign className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No hay liquidaciones registradas</p>
                </CardContent>
              </Card>
            ) : (
              liquidaciones.map((l) => (
                <Card key={l.id} className="cursor-pointer" onClick={() => setExpandedLiq(expandedLiq === l.id ? null : l.id)}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-foreground">
                          {new Date(l.fecha_liquidacion + "T12:00:00").toLocaleDateString("es-MX", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {l.total_boletos} boletos
                        </p>
                      </div>
                      <div className="text-right flex items-center gap-2">
                        <div>
                          <p className="font-bold text-foreground">${Number(l.monto_neto).toFixed(2)}</p>
                           <Badge className={`text-xs ${estadoLiqColor(l.estado)}`}>
                             {l.estado === "completed" ? "Pagado" : l.estado === "failed" ? "Transferencia fallida" : "Pendiente"}
                          </Badge>
                        </div>
                        {expandedLiq === l.id ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {expandedLiq === l.id && (() => {
                      // Fallback: if type breakdown is all zeros but total > 0, infer all normal
                      const hasTypeData = (l.boletos_normales || 0) + (l.boletos_estudiante || 0) + (l.boletos_tercera_edad || 0) > 0;
                      const bNorm = hasTypeData ? (l.boletos_normales || 0) : l.total_boletos;
                      const bEst = hasTypeData ? (l.boletos_estudiante || 0) : 0;
                      const bTer = hasTypeData ? (l.boletos_tercera_edad || 0) : 0;
                      const mNorm = hasTypeData ? Number(l.monto_normales || 0) : Number(l.monto_valor_facial);
                      const mEst = hasTypeData ? Number(l.monto_estudiante || 0) : 0;
                      const mTer = hasTypeData ? Number(l.monto_tercera_edad || 0) : 0;
                      const valorFacial = Number(l.monto_valor_facial);
                      const feeStripeTotal = Number(l.monto_fee_stripe_connect);
                      const feeVariable = valorFacial * 0.036;
                      const feeFija = Math.max(0, feeStripeTotal - feeVariable);
                      const comisionTC = Number(l.monto_comision_todocerca);
                      const totalDescuentos = comisionTC + feeStripeTotal;

                      const handleVerDetalle = async (e: React.MouseEvent) => {
                        e.stopPropagation();
                        if (detalleLiq === l.id) {
                          setDetalleLiq(null);
                          return;
                        }
                        setLoadingDetalle(true);
                        setDetalleLiq(l.id);
                        try {
                          // Get units for this concesionario
                          const unidadIds = unidades.map(u => u.id);
                          if (unidadIds.length === 0) { setDetalleTickets([]); return; }

                          const fecha = l.fecha_liquidacion;
                          const rangeStart = `${fecha}T00:00:00-07:00`;
                          const rangeEnd = `${fecha}T23:59:59-07:00`;

                          const { data: logs } = await supabase
                            .from("logs_validacion_qr")
                            .select("qr_ticket_id, created_at, unidad_id, producto_id")
                            .in("unidad_id", unidadIds)
                            .eq("resultado", "valid")
                            .gte("created_at", rangeStart)
                            .lte("created_at", rangeEnd);

                          if (!logs || logs.length === 0) { setDetalleTickets([]); return; }

                          const ticketIds = logs.map((lo: any) => lo.qr_ticket_id).filter(Boolean);
                          const { data: tickets } = await supabase
                            .from("qr_tickets")
                            .select("id, amount, ticket_type, stripe_fee_unitario, stripe_cuota_fija_unitario")
                            .in("id", ticketIds);

                          // Merge logs with ticket data
                          const merged = logs.map((lo: any) => {
                            const t = tickets?.find((tk: any) => tk.id === lo.qr_ticket_id);
                            const unidad = unidades.find(u => u.id === lo.unidad_id);
                            return {
                              hora: new Date(lo.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
                              unidad: unidad?.numero_economico || "—",
                              tipo: t?.ticket_type || "normal",
                              monto: Number(t?.amount || 9),
                              feeVariable: Number(t?.amount || 9) * 0.036,
                              feeFija: Number(t?.stripe_cuota_fija_unitario || 0),
                              feeTotal: Number(t?.stripe_fee_unitario || 0),
                            };
                          });
                          setDetalleTickets(merged);
                        } catch (err) {
                          console.error("Error fetching detail:", err);
                          setDetalleTickets([]);
                        } finally {
                          setLoadingDetalle(false);
                        }
                      };

                      return (
                        <div className="mt-3 pt-3 border-t border-border space-y-1.5 text-sm">
                          <p className="text-xs font-semibold text-muted-foreground mb-1">📊 Desglose por tipo de boleto:</p>
                          
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">🎫 Normal ({bNorm} × $9.00):</span>
                            <span className="text-foreground">${mNorm.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">🎓 Estudiante ({bEst} × $4.50):</span>
                            <span className="text-foreground">${mEst.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">👴 Tercera edad ({bTer} × $4.50):</span>
                            <span className="text-foreground">${mTer.toFixed(2)}</span>
                          </div>

                          <div className="flex justify-between pt-1.5 border-t border-border/50 font-medium">
                            <span className="text-muted-foreground">💰 Valor facial total ({l.total_boletos} boletos):</span>
                            <span className="text-foreground">${valorFacial.toFixed(2)}</span>
                          </div>

                          <p className="text-xs font-semibold text-muted-foreground mt-2 mb-1">📉 Deducciones:</p>

                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Comisión TodoCerca (2%):</span>
                            <span className="text-destructive">-${comisionTC.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Stripe variable (3.6%):</span>
                            <span className="text-destructive">-${feeVariable.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Stripe fija prorrateada ($3/compra):</span>
                            <span className="text-destructive">-${feeFija.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-xs pt-1 border-t border-border/30">
                            <span className="text-muted-foreground">Total descuentos:</span>
                            <span className="text-destructive">-${totalDescuentos.toFixed(2)}</span>
                          </div>

                          <div className="flex justify-between font-bold pt-2 border-t border-border text-base">
                            <span>✅ Neto depositado:</span>
                            <span className="text-green-500">${Number(l.monto_neto).toFixed(2)}</span>
                          </div>

                          {l.stripe_transfer_id && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Transfer: {l.stripe_transfer_id}
                            </p>
                          )}
                          {l.estado === "failed" && (
                            <p className="text-xs text-destructive mt-1">
                              No se pudo enviar el depósito a Stripe Connect. El cálculo sí se guardó y puedes reintentar la liquidación.
                            </p>
                          )}

                          {/* Detail button */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full mt-2"
                            onClick={handleVerDetalle}
                          >
                            {loadingDetalle && detalleLiq === l.id ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <ClipboardList className="h-4 w-4 mr-2" />
                            )}
                            {detalleLiq === l.id ? "Ocultar detalle" : "Ver detalle por boleto"}
                          </Button>

                          {detalleLiq === l.id && !loadingDetalle && (
                            <div className="mt-2 space-y-1 bg-muted/30 rounded-lg p-3">
                              <p className="text-xs font-semibold text-muted-foreground mb-2">🔍 Detalle por boleto validado:</p>
                              {detalleTickets.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center">No se encontraron datos detallados</p>
                              ) : (
                                <>
                                  <div className="grid grid-cols-5 gap-1 text-[10px] font-semibold text-muted-foreground border-b border-border pb-1 mb-1">
                                    <span>Hora</span>
                                    <span>Unidad</span>
                                    <span>Tipo</span>
                                    <span className="text-right">Valor</span>
                                    <span className="text-right">Fee fija</span>
                                  </div>
                                  {detalleTickets.map((dt: any, idx: number) => (
                                    <div key={idx} className="grid grid-cols-5 gap-1 text-[11px]">
                                      <span className="text-muted-foreground">{dt.hora}</span>
                                      <span className="text-foreground">{dt.unidad}</span>
                                      <span className="text-foreground capitalize">{dt.tipo === "tercera_edad" ? "3ª edad" : dt.tipo}</span>
                                      <span className="text-right text-foreground">${dt.monto.toFixed(2)}</span>
                                      <span className="text-right text-destructive">${dt.feeFija.toFixed(2)}</span>
                                    </div>
                                  ))}
                                  <div className="grid grid-cols-5 gap-1 text-[11px] font-semibold border-t border-border pt-1 mt-1">
                                    <span className="col-span-3 text-muted-foreground">Totales:</span>
                                    <span className="text-right text-foreground">
                                      ${detalleTickets.reduce((s: number, d: any) => s + d.monto, 0).toFixed(2)}
                                    </span>
                                    <span className="text-right text-destructive">
                                      ${detalleTickets.reduce((s: number, d: any) => s + d.feeFija, 0).toFixed(2)}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground mt-1">
                                    * La cuota fija de $3.00 MXN se prorratea entre los boletos de cada compra. Ej: 10 boletos en una compra = $0.30 c/u
                                  </p>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* FRAUDE */}
          <TabsContent value="fraude" className="space-y-3 mt-4">
            {fraudes.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No se han detectado intentos de fraude</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Resumen */}
                <Card className="border-destructive/30">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-2xl font-bold text-foreground">{fraudes.length}</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-destructive">
                          {fraudes.filter((f) => f.severidad === "critical" || f.severidad === "high").length}
                        </p>
                        <p className="text-xs text-muted-foreground">Alta/Crítica</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">
                          {fraudes.filter((f) => !f.resuelto).length}
                        </p>
                        <p className="text-xs text-muted-foreground">Sin resolver</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {fraudes.map((f) => (
                  <Card key={f.id} className={f.resuelto ? "opacity-60" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className={severidadColor(f.severidad)}>
                            {f.severidad === "critical" ? "CRÍTICA" : f.severidad === "high" ? "ALTA" : f.severidad === "medium" ? "MEDIA" : "BAJA"}
                          </Badge>
                          {f.resuelto && (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              Resuelto
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(f.fecha_intento).toLocaleDateString("es-MX", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm">
                        <p className="text-muted-foreground">
                          <span className="font-medium text-foreground">Tipo:</span>{" "}
                          {f.tipo_fraude === "misma_unidad" ? "Misma unidad" : "Otra unidad"}
                        </p>
                        {f.tiempo_transcurrido_minutos !== null && (
                          <p className="text-muted-foreground">
                            <span className="font-medium text-foreground">Tiempo:</span>{" "}
                            {f.tiempo_transcurrido_minutos} min después
                          </p>
                        )}
                        {f.distancia_km !== null && (
                          <p className="text-muted-foreground">
                            <span className="font-medium text-foreground">Distancia:</span>{" "}
                            {f.distancia_km.toFixed(1)} km
                          </p>
                        )}
                        <p className="text-muted-foreground">
                          <span className="font-medium text-foreground">Intentos usuario:</span>{" "}
                          {f.total_intentos_usuario}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </TabsContent>

          {/* REPORTES */}
          <TabsContent value="reportes" className="space-y-4 mt-4">
            {proveedor && <ConcesionarioReportes proveedorId={proveedor.id} />}
          </TabsContent>

          {/* EMPRESAS / CONTRATOS */}
          <TabsContent value="empresas" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Search className="h-4 w-4" /> Buscar empresa
                </CardTitle>
                <CardDescription className="text-xs">
                  Busca empresas (maquiladoras) para proponer un contrato de transporte
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Nombre de la empresa..."
                    value={empresaSearch}
                    onChange={e => setEmpresaSearch(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && searchEmpresas()}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={searchEmpresas} disabled={searchingEmpresas}>
                    {searchingEmpresas ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>

                {empresasFound.map(emp => (
                  <Card key={emp.id} className="bg-muted/50">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{emp.nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          {emp.rfc || "Sin RFC"} · {emp.contacto_nombre || ""}
                        </p>
                      </div>
                      <Button size="sm" variant="default" onClick={() => {
                        setEmpresaSeleccionada(emp);
                        setShowProponerContrato(true);
                      }}>
                        <Handshake className="h-3 w-3 mr-1" /> Proponer
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Mis contratos con empresas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {contratosEmpresa.length === 0 ? (
                  <div className="text-center text-muted-foreground py-6">
                    <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Sin contratos</p>
                    <p className="text-xs">Busca una empresa arriba para proponer un contrato</p>
                  </div>
                ) : (
                  contratosEmpresa.map((c: any) => (
                    <Card key={c.id} className="bg-muted/50">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-medium text-sm">
                            {(c.empresas_transporte as any)?.nombre || "Empresa"}
                          </p>
                          <Badge variant={c.estado === "aceptado" ? "default" : c.estado === "rechazado" ? "destructive" : "secondary"}>
                            {c.estado === "aceptado" ? "Activo" : c.estado === "rechazado" ? "Rechazado" : "Pendiente"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Tarifa: ${Number(c.tarifa_por_persona).toFixed(2)}/persona · {c.frecuencia_corte}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Desde {c.fecha_inicio} · Iniciado por: {c.iniciado_por}
                        </p>
                        {c.estado === "pendiente" && c.iniciado_por === "empresa" && (
                          <div className="flex gap-2 mt-2">
                            <Button size="sm" variant="default" onClick={() => handleAceptarContrato(c.id)}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Aceptar
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleRechazarContrato(c.id)}>
                              <XCircle className="h-3 w-3 mr-1" /> Rechazar
                            </Button>
                          </div>
                        )}
                        {c.estado === "aceptado" && user && proveedor && (
                          <>
                            <RecursosContrato contratoId={c.id} proveedorId={proveedor.id} rol="concesionario" userId={user.id} />
                            <ContratoNotas contratoId={c.id} autorTipo="concesionario" userId={user.id} />
                          </>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog: Proponer contrato */}
      <Dialog open={showProponerContrato} onOpenChange={setShowProponerContrato}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Handshake className="h-5 w-5" /> Proponer contrato
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Proponer contrato de transporte de personal a <strong>{empresaSeleccionada?.nombre}</strong>
            </p>
            <div>
              <label className="text-sm font-medium mb-1 block">Modelo de cobro</label>
              <select
                className="w-full border rounded-md p-2 text-sm bg-background"
                value={contratoModeloCobro}
                onChange={e => setContratoModeloCobro(e.target.value as "por_persona" | "por_viaje")}
              >
                <option value="por_persona">Por persona transportada (QR)</option>
                <option value="por_viaje">Por viaje completo (sin QR)</option>
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                {contratoModeloCobro === "por_viaje"
                  ? "El chofer no escanea QR; solo registra inicio y fin de cada viaje."
                  : "El chofer cobra QR a cada pasajero según la tarifa."}
              </p>
            </div>
            {contratoModeloCobro === "por_persona" && (
              <div>
                <label className="text-sm font-medium">Tarifa por persona (MXN)</label>
                <Input
                  type="number"
                  value={contratoTarifa}
                  onChange={e => setContratoTarifa(e.target.value)}
                  placeholder="15.00"
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Frecuencia de corte</label>
              <select
                className="w-full border rounded-md p-2 text-sm bg-background"
                value={contratoFrecuencia}
                onChange={e => setContratoFrecuencia(e.target.value)}
              >
                <option value="semanal">Semanal</option>
                <option value="quincenal">Quincenal</option>
                <option value="mensual">Mensual</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Turnos y unidades disponibles</label>
              <div className="space-y-2">
                {contratoTurnos.map((t, idx) => (
                  <div key={t.turno} className="flex items-center gap-3">
                    <label className="flex items-center gap-2 min-w-[120px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={t.selected}
                        onChange={e => {
                          const updated = [...contratoTurnos];
                          updated[idx] = { ...updated[idx], selected: e.target.checked };
                          setContratoTurnos(updated);
                        }}
                        className="rounded border-input"
                      />
                      <span className="text-sm">{t.turno}</span>
                    </label>
                    {t.selected && (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={1}
                          value={t.unidades}
                          onChange={e => {
                            const updated = [...contratoTurnos];
                            updated[idx] = { ...updated[idx], unidades: Math.max(1, parseInt(e.target.value) || 1) };
                            setContratoTurnos(updated);
                          }}
                          className="w-16 h-8 text-center"
                        />
                        <span className="text-xs text-muted-foreground">unidades</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Notas adicionales (opcional)</label>
              <Input
                value={contratoDescripcion}
                onChange={e => setContratoDescripcion(e.target.value)}
                placeholder="Detalles adicionales..."
              />
            </div>
            <Button
              onClick={handleProponerContrato}
              disabled={savingContrato || !contratoTurnos.some(t => t.selected)}
              className="w-full"
            >
              {savingContrato ? "Enviando..." : "Enviar propuesta"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
