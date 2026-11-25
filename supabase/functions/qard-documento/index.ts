import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { jsPDF } from 'npm:jspdf@4.2.1';
import QRCode from 'npm:qrcode@1.5.4';
import { z } from 'npm:zod@3.25.76';
import { renderConcentratedPdf } from '../_shared/qardConcentradoPdf.ts';
import type { DocumentSource } from '../_shared/qardConcentrado.ts';

const input = z.object({ qard: z.string().regex(/^\d{16}$/), days: z.union([z.literal(7), z.literal(15), z.literal(30), z.literal(62)]), savings_token: z.string().max(256).optional() });
const hash = async (value: Uint8Array, algorithm = 'SHA-256') => Array.from(new Uint8Array(await crypto.subtle.digest(algorithm, value))).map(b => b.toString(16).padStart(2, '0')).join('');
const response = (message: string, status: number) => new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response('Método no permitido', 405);
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return response('Inicia sesión', 401);
  const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) return response('El emisor de documentos no está disponible', 503);
  const client = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: user, error: authError } = await client.auth.getUser(auth.slice(7));
  if (authError || !user.user || user.user.is_anonymous) return response('Inicia sesión', 401);
  try {
    const parsed = input.safeParse(await req.json());
    if (!parsed.success) return response('Tarjeta o periodo inválido', 400);
    const { data, error } = await client.rpc('qard_documento_fuente', { _qard: parsed.data.qard, _days: parsed.data.days, _savings_token: parsed.data.savings_token ?? null });
    if (error) return response(error.message, 400);
    const source = data as DocumentSource;
    if (!source || !Array.isArray(source.movements)) return response('No se pudo consultar el libro', 502);
    const id = await hash(crypto.getRandomValues(new Uint8Array(32)));
    const sourceHash = await hash(new TextEncoder().encode(JSON.stringify(source)), 'SHA-512');
    const sealText = `${sourceHash}${id}`;
    const qr = await QRCode.toDataURL(`https://todocerca.mx/verificar/${id}`, { width: 240, margin: 1, errorCorrectionLevel: 'M' });
    const doc = new jsPDF({ format: 'a4', unit: 'mm', orientation: 'portrait' });
    renderConcentratedPdf(doc, source, sealText, qr);
    doc.setProperties({ title: 'Estado de Cuenta QaRd', subject: 'Documento concentrado emitido por TodoCerca', author: 'TodoCerca', keywords: id });
    const bytes = new Uint8Array(doc.output('arraybuffer'));
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: recordError } = await admin.from('qard_documentos').insert({ id, owner_id: user.user.id, source_hash: sourceHash, pdf_hash: await hash(bytes), domicilio_id: source.address?.id ?? null, domicilio_version: source.address?.version ?? null, address_verified: source.address?.status === 'valid', period_start: source.start, period_end: source.end });
    if (recordError) return response('No se pudo sellar el documento; intenta de nuevo', 503);
    return new Response(bytes, { headers: { ...corsHeaders, 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="TodoCerca-QaRd-concentrado.pdf"', 'Cache-Control': 'no-store' } });
  } catch (e) { return response(e instanceof Error ? e.message : 'No se pudo generar el documento', 400); }
});