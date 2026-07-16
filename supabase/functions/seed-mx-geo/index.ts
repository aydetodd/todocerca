// One-shot seeder for Mexican estados/municipios into subdivisiones_nivel1/2
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function slug(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const jsonUrl = "https://todocerca.mx/data/estados-municipios-mx.json";
    const res = await fetch(jsonUrl);
    if (!res.ok) throw new Error(`fetch json ${res.status}`);
    const data = (await res.json()) as Record<string, string[]>;

    const { data: pais, error: eP } = await admin
      .from("paises")
      .select("id")
      .eq("codigo_iso", "MX")
      .maybeSingle();
    if (eP) throw eP;
    if (!pais) throw new Error("Pais MX no existe");

    let estadosCreados = 0;
    let municipiosCreados = 0;

    for (const [estado, munis] of Object.entries(data)) {
      const estSlug = `mx-${slug(estado)}`;
      // upsert estado
      const { data: existing } = await admin
        .from("subdivisiones_nivel1")
        .select("id")
        .eq("pais_id", pais.id)
        .eq("slug", estSlug)
        .maybeSingle();
      let estId = existing?.id as string | undefined;
      if (!estId) {
        const { data: ins, error: eI } = await admin
          .from("subdivisiones_nivel1")
          .insert({
            pais_id: pais.id,
            nombre: estado,
            slug: estSlug,
            tipo: "estado",
            is_active: true,
          })
          .select("id")
          .single();
        if (eI) throw eI;
        estId = ins.id;
        estadosCreados++;
      }

      // insert municipios in bulk (skip existing)
      const rows = munis.map((m) => ({
        nivel1_id: estId!,
        nombre: m,
        slug: `${estSlug}-${slug(m)}`,
        tipo: "municipio",
        is_active: true,
      }));
      const { error: eM, count } = await admin
        .from("subdivisiones_nivel2")
        .upsert(rows, { onConflict: "slug", ignoreDuplicates: true, count: "exact" });
      if (eM) throw eM;
      municipiosCreados += count ?? 0;
    }

    return new Response(
      JSON.stringify({ ok: true, estadosCreados, municipiosCreados }),
      { headers: { ...CORS, "content-type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }),
      { status: 500, headers: { ...CORS, "content-type": "application/json" } },
    );
  }
});
