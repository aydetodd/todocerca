import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No hay sesión activa. Inicia sesión como concesionario.");

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Sesión inválida. Vuelve a iniciar sesión.");

    const { productoId, filename, geojson } = await req.json();
    if (!productoId || !filename || !geojson?.features?.length) {
      throw new Error("Archivo leído, pero no contiene una ruta válida.");
    }

    const { data: producto, error: productError } = await supabase
      .from("productos")
      .select("id, nombre, proveedor_id, route_type, is_private, proveedores!inner(user_id)")
      .eq("id", productoId)
      .maybeSingle();

    if (productError) throw productError;
    if (!producto) throw new Error("No encontré esa ruta en la base de datos.");
    if ((producto.proveedores as { user_id?: string })?.user_id !== userData.user.id) {
      throw new Error("Esta ruta no pertenece a tu concesionario.");
    }
    if (producto.route_type !== "privada" && producto.is_private !== true) {
      throw new Error("El trazado editable solo aplica para rutas privadas.");
    }

    const { error: updateError } = await supabase
      .from("productos")
      .update({
        route_geojson: geojson,
        route_trace_filename: filename,
        route_trace_updated_at: new Date().toISOString(),
      })
      .eq("id", productoId);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[save-route-trace]", message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});