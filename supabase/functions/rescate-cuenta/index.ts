// Modo Rescate: "¿Perdiste tu teléfono?"
// Acciones: entrar | bloquear | cerrar_todo | cambiar_clave | solicitar_codigo_desbloqueo | desbloquear
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = "TodoCerca <m.villa@todocerca.mx>";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizePhone = (p: string) => p.replace(/\D/g, "");

const claveToPassword = (clave: string) => `QaRd-${clave}-TC`;

async function enviarCorreo(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_KEY || !to || to.endsWith("@todocerca.app")) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
  } catch (e) {
    console.error("resend err", e);
  }
}

async function registrarIntento(
  admin: ReturnType<typeof createClient>,
  userId: string | null,
  telefono: string,
  accion: string,
  resultado: string,
  ip: string
) {
  await admin.from("rescate_intentos").insert({
    user_id: userId,
    telefono,
    accion,
    resultado,
    ip,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const accion: string = body.accion || "";
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";

    // ---------- ENTRAR (teléfono + clave de 5 dígitos, sin código de correo) ----------
    if (accion === "entrar") {
      const telefono = normalizePhone(String(body.telefono || ""));
      const clave = String(body.clave || "");
      if (!telefono || !/^\d{5}$/.test(clave)) {
        return json({ error: "Teléfono y clave de 5 dígitos son obligatorios" }, 400);
      }

      // Resolver usuario por teléfono
      const { data: found } = await admin.rpc("find_user_by_phone", { _phone: telefono }).maybeSingle()
        .then((r) => r, () => ({ data: null }));
      let userId: string | null = null;
      let emailCandidatos: string[] = [];
      if (found && (found as Record<string, unknown>).user_id) {
        userId = String((found as Record<string, unknown>).user_id);
      }
      if (!userId) {
        // El teléfono puede estar guardado en varios formatos: 6621234567, 5266..., +5266...
        const last10 = telefono.slice(-10);
        const variantes = Array.from(
          new Set([telefono, `+${telefono}`, last10, `+${last10}`, `52${last10}`, `+52${last10}`, `521${last10}`, `+521${last10}`])
        );
        const filtro = variantes
          .flatMap((v) => [`phone.eq.${v}`, `telefono.eq.${v}`])
          .join(",");
        const { data: prof } = await admin
          .from("profiles")
          .select("user_id")
          .or(filtro)
          .limit(1)
          .maybeSingle();
        userId = prof?.user_id ?? null;
      }

      if (!userId) {
        await registrarIntento(admin, null, telefono, "entrar", "telefono_no_existe", ip);
        return json({ error: "No encontramos una cuenta con ese teléfono" }, 404);
      }

      // Límites anti-abuso: 5 fallos de clave en 15 min, 3 rescates por hora
      const hace15 = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const hace1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: fallos } = await admin
        .from("rescate_intentos")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("resultado", "clave_incorrecta")
        .gte("creado_en", hace15);
      if ((fallos ?? 0) >= 5) {
        return json({ error: "Demasiados intentos. Espera 15 minutos." }, 429);
      }
      const { count: recientes } = await admin
        .from("rescate_intentos")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("resultado", "ok")
        .gte("creado_en", hace1h);
      if ((recientes ?? 0) >= 3) {
        return json({ error: "Ya se usó el modo rescate varias veces. Espera una hora." }, 429);
      }

      // Email sintético por teléfono (mismo patrón que el login)
      const digits = telefono;
      const last10digits = digits.slice(-10);
      emailCandidatos = Array.from(
        new Set([
          `${digits}@todocerca.app`,
          `${last10digits}@todocerca.app`,
          `52${last10digits}@todocerca.app`,
        ])
      );

      // También el correo real del perfil por si migró
      const { data: prof } = await admin
        .from("profiles")
        .select("email, nombre")
        .eq("user_id", userId)
        .maybeSingle();
      if (prof?.email && !emailCandidatos.includes(prof.email)) emailCandidatos.push(prof.email);

      // Validar clave probando candidatos (clave nueva y legacy)
      let session: { access_token: string; refresh_token: string } | null = null;
      for (const email of emailCandidatos) {
        for (const pwd of [claveToPassword(clave), clave]) {
          const anon = createClient(SUPABASE_URL, ANON_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data, error } = await anon.auth.signInWithPassword({ email, password: pwd });
          if (!error && data.session) {
            session = { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
            break;
          }
        }
        if (session) break;
      }
      if (!session) {
        await registrarIntento(admin, userId, telefono, "entrar", "clave_incorrecta", ip);
        return json({ error: "Clave incorrecta" }, 401);
      }

      // Marcar sesión de rescate: no toca trusted_devices ni la sesión única
      await registrarIntento(admin, userId, telefono, "entrar", "ok", ip);
      const nombre = prof?.nombre || "usuario";
      await enviarCorreo(
        emailCandidatos.find((e) => !e.endsWith("@todocerca.app")) || "",
        "Se usó el modo rescate en tu cuenta TodoCerca",
        `<p>Hola ${nombre},</p><p>Tu cuenta se abrió en modo rescate (teléfono prestado) a las ${new Date().toLocaleString("es-MX", { timeZone: "America/Hermosillo" })} (hora Hermosillo).</p><p><b>Si no fuiste tú, tu cuenta sigue protegida:</b> en modo rescate no se puede gastar ni mover dinero. Cambia tu clave de 5 dígitos cuanto antes.</p>`
      );

      const { data: profBloq } = await admin
        .from("profiles")
        .select("cuenta_bloqueada")
        .eq("user_id", userId)
        .maybeSingle();

      return json({
        ok: true,
        user_id: userId,
        session,
        cuenta_bloqueada: profBloq?.cuenta_bloqueada ?? false,
        nombre,
      });
    }

    // ---- Acciones autenticadas con el token de la sesión de rescate ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No autorizado" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Sesión inválida" }, 401);

    // ---------- BLOQUEAR ----------
    if (accion === "bloquear") {
      const motivo = String(body.motivo || "telefono_perdido").slice(0, 120);
      await admin
        .from("profiles")
        .update({ cuenta_bloqueada: true, bloqueada_en: new Date().toISOString(), bloqueada_motivo: motivo })
        .eq("user_id", user.id);
      await registrarIntento(admin, user.id, "", "bloquear", "ok", ip);
      return json({ ok: true });
    }

    // ---------- CERRAR SESIÓN EN TODOS LOS DISPOSITIVOS ----------
    if (accion === "cerrar_todo") {
      await admin.from("active_sessions").delete().eq("user_id", user.id);
      await admin.from("trusted_devices").update({ is_active: false }).eq("user_id", user.id);
      try {
        await admin.auth.admin.signOut(user.id, "global");
      } catch (e) {
        console.error("signOut global err", e);
      }
      await registrarIntento(admin, user.id, "", "cerrar_todo", "ok", ip);
      return json({ ok: true, nota: "Se cerraron todas las sesiones, incluida esta." });
    }

    // ---------- CAMBIAR CLAVE DE 5 DÍGITOS ----------
    if (accion === "cambiar_clave") {
      const nueva = String(body.nueva_clave || "");
      if (!/^\d{5}$/.test(nueva)) return json({ error: "La clave debe ser de 5 números" }, 400);
      const { error } = await admin.auth.admin.updateUserById(user.id, {
        password: claveToPassword(nueva),
      });
      if (error) return json({ error: "No se pudo cambiar la clave" }, 500);
      await registrarIntento(admin, user.id, "", "cambiar_clave", "ok", ip);
      return json({ ok: true });
    }

    // ---------- SOLICITAR CÓDIGO DE DESBLOQUEO (ya con teléfono recuperado) ----------
    if (accion === "solicitar_codigo_desbloqueo") {
      const { data: prof } = await admin
        .from("profiles")
        .select("email, nombre")
        .eq("user_id", user.id)
        .maybeSingle();
      const destino = prof?.email;
      if (!destino || destino.endsWith("@todocerca.app")) {
        return json({ error: "Tu cuenta no tiene un correo real verificado. Actualízalo primero." }, 400);
      }
      const codigo = String(Math.floor(100000 + Math.random() * 900000));
      await admin
        .from("device_verification_codes")
        .update({ used: true })
        .eq("user_id", user.id)
        .eq("device_fingerprint", "desbloqueo");
      await admin.from("device_verification_codes").insert({
        user_id: user.id,
        device_fingerprint: "desbloqueo",
        code: codigo,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        used: false,
        attempts: 0,
      });
      await enviarCorreo(
        destino,
        "Tu código para desbloquear tu cuenta TodoCerca",
        `<p>Hola ${prof?.nombre || "usuario"},</p><p>Tu código de desbloqueo es:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${codigo}</p><p>Vence en 10 minutos.</p>`
      );
      await registrarIntento(admin, user.id, "", "solicitar_codigo_desbloqueo", "ok", ip);
      return json({ ok: true, email_mask: destino.replace(/^(.{2}).+(@.+)$/, "$1***$2") });
    }

    // ---------- DESBLOQUEAR ----------
    if (accion === "desbloquear") {
      const codigo = String(body.codigo || "").trim();
      if (!/^\d{6}$/.test(codigo)) return json({ error: "Código inválido" }, 400);
      const { data: row } = await admin
        .from("device_verification_codes")
        .select("*")
        .eq("user_id", user.id)
        .eq("device_fingerprint", "desbloqueo")
        .eq("used", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!row) return json({ error: "Solicita un código nuevo" }, 400);
      if (row.attempts >= 5) return json({ error: "Demasiados intentos. Pide otro código." }, 429);
      if (row.code !== codigo) {
        await admin.from("device_verification_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
        return json({ error: "Código incorrecto" }, 400);
      }
      await admin.from("device_verification_codes").update({ used: true }).eq("id", row.id);
      await admin
        .from("profiles")
        .update({ cuenta_bloqueada: false, bloqueada_en: null, bloqueada_motivo: null })
        .eq("user_id", user.id);
      await registrarIntento(admin, user.id, "", "desbloquear", "ok", ip);
      return json({ ok: true });
    }

    return json({ error: "Acción no válida" }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("rescate-cuenta err", msg);
    return json({ error: msg }, 500);
  }
});
