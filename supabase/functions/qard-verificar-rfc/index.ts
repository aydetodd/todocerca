import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { visibleVerificationData, confirmationAllowed } from '../_shared/verificationData.ts';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return json({ error: 'Servicio no disponible' }, 503);
    const admin = createClient(url, key);
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return json({ error: 'Inicia sesión' }, 401);
    const { data: { user } } = await admin.auth.getUser(auth.slice(7));
    if (!user) return json({ error: 'Inicia sesión' }, 401);
    const body = await req.json();
    const action = body.accion ?? 'leer';
    if (!['leer', 'confirmar', 'reportar'].includes(action)) return json({ error: 'Acción inválida' }, 400);
    if (action !== 'leer') {
      if (typeof body.validacion_id !== 'string') return json({ error: 'Falta la validación' }, 400);
      const { data: row } = await admin.from('qard_verification_results').select('*').eq('id',body.validacion_id).eq('user_id',user.id).eq('kind','rfc').maybeSingle();
      if (!row) return json({ error: 'Validación no encontrada' },404);
      if (action === 'confirmar' && !confirmationAllowed(row.status, action)) return json({ error: 'Validación rechazada' },400);
      const { error } = await admin.from('qard_verification_results').update({ status: action === 'confirmar' ? 'confirmed' : 'rejected' }).eq('id',row.id).eq('user_id',user.id);
      if (error) throw error;
      return json({ ok:true, confirmed:action === 'confirmar', nivel_tres_activado:false });
    }
    const rfc = typeof body.rfc === 'string' ? body.rfc.toUpperCase().replace(/[\s-]/g,'') : '';
    if (!/^([A-ZÑ&]{3,4})\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[A-Z\d]{2}[A\d]$/.test(rfc)) return json({ error:'RFC inválido' },400);
    const { data: ident } = await admin.from('qard_identidad').select('verification_level').eq('user_id',user.id).maybeSingle();
    if (!ident || ident.verification_level < 2) return json({ error:'Primero confirma tu INE y alcanza el nivel 2' },400);
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(rfc)));
    const hash = Array.from(bytes).map(x=>x.toString(16).padStart(2,'0')).join('');
    const { data: cached } = await admin.from('qard_verification_results').select('*').eq('user_id',user.id).eq('kind','rfc').eq('input_hash',hash).maybeSingle();
    if (cached) {
      const { data, error } = await admin.rpc('qard_dec',{ _v:cached.response_enc });
      if (error) throw error;
      return json({ ok:true, validacion_id:cached.id, datos:visibleVerificationData(JSON.parse(String(data))), confirmed:cached.status==='confirmed', rechazado:cached.status==='rejected', guardado:true });
    }
    const token = Deno.env.get('VERIFICAMEX_BEARER_TOKEN');
    if (!token) return json({ error:'Verificamex no está configurado' },503);
    const base = (Deno.env.get('VERIFICAMEX_BASE_URL') ?? 'https://api.verificamex.com').replace(/\/$/,'').replace(/\/identity$/,'');
    const response = await fetch(`${base}/identity/v1/miscellaneous/sat/rfc`,{ method:'POST',headers:{ Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json' },body:JSON.stringify({ rfc }) });
    const text = await response.text();
    if (!response.ok) return json({ error:'Verificamex no pudo consultar el RFC', status:response.status },response.status);
    let raw: unknown;
    try { raw=JSON.parse(text); } catch { return json({ error:'Verificamex no devolvió datos fiscales' },502); }
    const payload = raw as { data?: { status?: unknown } };
    if (payload.data?.status !== true && payload.data?.status !== 'true') return json({ error:'El SAT no confirmó este RFC', datos:visibleVerificationData(raw) },400);
    const datos = { RFC:rfc, respuesta:visibleVerificationData(raw) };
    const { data: enc, error: encError } = await admin.rpc('qard_enc',{ _v:JSON.stringify(datos) });
    if (encError || !enc) throw new Error('No se pudieron guardar los datos fiscales');
    const { data: row, error } = await admin.from('qard_verification_results').insert({ user_id:user.id,kind:'rfc',input_hash:hash,response_enc:enc }).select('id').single();
    if (error) throw error;
    return json({ ok:true,validacion_id:row.id,datos,confirmed:false,nivel_tres_activado:false });
  } catch { return json({ error:'No se pudo completar la consulta; no se cambió tu nivel' },500); }
});