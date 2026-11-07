import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Store, Plus, RefreshCw, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { getHermosilloToday } from '@/lib/utils';
import { formatCents, reconcileCollections, type CollectionReport, type CollectionDetail } from '@/lib/collectionReport';

type NamedTerminal = { id: string; phone: string; terminal_name: string | null };
function TerminalReceipts({ branch, terminal, start, end, count, revision }: { branch: string; terminal: string; start: string; end: string; count: number; revision: number }) {
  const [rows,setRows]=useState<CollectionDetail[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const load=useCallback(async(offset:number)=>{
    setBusy(true);setError('');
    const {data,error}=await supabase.rpc('qard_collection_details',{_start:start||undefined,_end:end||undefined,_branch:branch,_terminal:terminal,_offset:offset});
    if(error)setError('No se pudieron consultar los cobros.');
    else setRows(previous=>offset===0?data as unknown as CollectionDetail[]:[...previous,...data as unknown as CollectionDetail[]]);
    setBusy(false);
  },[branch,terminal,start,end]);
  useEffect(()=>{void load(0);},[load,revision]);
  return <div className="space-y-2">
    {error&&<p role="alert" className="text-destructive text-sm">{error}</p>}
    {rows.map(row=><div key={row.id} className="flex justify-between gap-2 border-b py-2 text-sm"><span className="text-muted-foreground">{new Date(row.date).toLocaleString('es-MX',{timeZone:'America/Hermosillo'})}</span><span className="font-semibold tabular-nums whitespace-nowrap">{formatCents(row.cents)}</span></div>)}
    {busy?<p className="text-sm text-muted-foreground">Consultando cobros…</p>:rows.length<count&&<Button variant="outline" size="sm" onClick={()=>void load(rows.length)}>Ver más cobros</Button>}
  </div>;
}
export default function SucursalesPanel() {
  const {user}=useAuth();
  const [report,setReport]=useState<CollectionReport|null>(null);
  const [branches,setBranches]=useState<{id:string;nombre:string}[]>([]);
  const [terminals,setTerminals]=useState<NamedTerminal[]>([]);
  const [names,setNames]=useState<Record<string,string>>({});
  const [nombre,setNombre]=useState('');
  const [period,setPeriod]=useState('month');
  const today=getHermosilloToday();
  const [from,setFrom]=useState(`${today.slice(0,7)}-01`);
  const [to,setTo]=useState(today);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  const request=useRef(0);
  const start=period==='all'?'':period==='today'?today:period==='month'?`${today.slice(0,7)}-01`:from;
  const end=period==='all'?'':period==='custom'?to:today;
  const load=useCallback(async()=>{
    if(!user)return;
    const version=++request.current;
    if(start&&end&&start>end){setError('La fecha inicial debe ser anterior a la final.');setReport(null);setLoading(false);return;}
    setLoading(true);
    const [r,b,t]=await Promise.all([
      supabase.rpc('qard_collection_report',{_start:start||undefined,_end:end||undefined}),
      supabase.from('qard_negocios').select('id,nombre').eq('owner_id',user.id).order('nombre'),
      supabase.from('terminal_invites').select('id,phone,terminal_name').eq('merchant_user_id',user.id).eq('terminal_code','collection').neq('status','revoked'),
    ]);
    if(version!==request.current)return;
    setLoading(false);
    if(r.error||b.error||t.error){setError('No se pudo consultar el desglose. Intenta de nuevo.');setReport(null);return;}
    setError('');setReport(r.data as unknown as CollectionReport);setBranches(b.data||[]);setTerminals(t.data||[]);setRevision(n=>n+1);
  },[user,start,end]);
  useEffect(()=>{
    if(!user)return;
    void load();
    const ch=supabase.channel(`collections-${user.id}-${crypto.randomUUID()}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'qard_negocios',filter:`owner_id=eq.${user.id}`},()=>void load())
      .on('postgres_changes',{event:'*',schema:'public',table:'terminal_invites',filter:`merchant_user_id=eq.${user.id}`},()=>void load())
      .on('postgres_changes',{event:'*',schema:'public',table:'qard_movimientos',filter:`titular_user_id=eq.${user.id}`},()=>void load())
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'terminal_operations',filter:`merchant_user_id=eq.${user.id}`},()=>void load()).subscribe();
    const onFocus=()=>void load();window.addEventListener('focus',onFocus);
    return ()=>{request.current++;window.removeEventListener('focus',onFocus);void supabase.removeChannel(ch);};
  },[user,load]);
  const crear=async()=>{
    if(!user||nombre.trim().length<2)return;setBusy(true);
    const {error}=await supabase.from('qard_negocios').insert({owner_id:user.id,nombre:nombre.trim()});
    setBusy(false);if(error)return toast.error('No se pudo crear la sucursal');setNombre('');void load();
  };
  const rename=async(t:NamedTerminal)=>{
    setBusy(true);const {error}=await supabase.rpc('terminal_set_name',{_id:t.id,_name:names[t.id]?.trim()||''});setBusy(false);
    if(error)return toast.error('No se pudo guardar el nombre');setNames(previous=>{const next={...previous};delete next[t.id];return next;});void load();
  };
  const reconciled=report&&reconcileCollections(report);
  return <section className="space-y-4">
    <div className="flex items-center justify-between"><h3 className="font-semibold flex items-center gap-2"><Store className="h-5 w-5 text-primary"/>Cobros por sucursal y terminal</h3><Button size="icon" variant="ghost" aria-label="Actualizar desglose" disabled={loading} onClick={()=>void load()}><RefreshCw className="h-4 w-4"/></Button></div>
    <div className="flex flex-wrap gap-2">{[['today','Hoy'],['month','Este mes'],['all','Todo'],['custom','Fechas']].map(([value,label])=><Button key={value} variant={period===value?'default':'outline'} size="sm" onClick={()=>setPeriod(value)}>{label}</Button>)}</div>
    {period==='custom'&&<div className="grid grid-cols-2 gap-2"><label className="text-sm">Desde<Input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="text-sm">Hasta<Input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>}
    {error&&<p role="alert" className="text-destructive text-sm">{error}</p>}
    {loading&&<p role="status" className="text-sm text-muted-foreground">Consultando cobros…</p>}
    {report&&!loading&&<>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-y py-4"><div><div className="text-sm text-muted-foreground">Cobrado en el periodo · {report.count} cobros</div><div className="text-2xl font-bold tabular-nums break-words">{formatCents(report.total_cents)}</div></div><div><div className="text-sm text-muted-foreground">Saldo Empresarial disponible ahora</div><div className="text-xl font-semibold tabular-nums break-words">{formatCents(report.balance_cents)}</div></div></div>
      <p role={reconciled?'status':'alert'} className={`text-sm flex items-start gap-2 ${reconciled?'text-foreground':'text-destructive'}`}>{reconciled&&<CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5"/>}{reconciled?'Conciliado al centavo · sucursales, terminales y recibos coinciden.':`No conciliado: recibos ${formatCents(report.operations_cents)} (${report.operations_count}); libro ${formatCents(report.total_cents)} (${report.count}).`}</p>
      <Accordion type="multiple">{report.branches.map(branch=><AccordionItem key={branch.id} value={branch.id}><AccordionTrigger className="text-left gap-3"><span className="min-w-0 break-words">{branch.name}<span className="block text-xs font-normal text-muted-foreground">{branch.count} cobros</span></span><span className="ml-auto tabular-nums whitespace-nowrap">{formatCents(branch.cents)}</span></AccordionTrigger><AccordionContent><Accordion type="multiple">{branch.terminals.map(terminal=><AccordionItem key={terminal.id} value={terminal.id}><AccordionTrigger className="text-left gap-2"><span className="min-w-0 break-words">{terminal.name}<span className="block text-xs text-muted-foreground">{terminal.count} cobros</span></span><span className="ml-auto tabular-nums whitespace-nowrap">{formatCents(terminal.cents)}</span></AccordionTrigger><AccordionContent><TerminalReceipts branch={branch.id} terminal={terminal.id} count={terminal.count} start={start} end={end} revision={revision}/></AccordionContent></AccordionItem>)}</Accordion></AccordionContent></AccordionItem>)}</Accordion>
      {!report.count&&<p className="text-sm text-muted-foreground">Sin cobros en este periodo.</p>}
    </>}
    <Accordion type="single" collapsible><AccordionItem value="names"><AccordionTrigger>Sucursales y nombres de terminales</AccordionTrigger><AccordionContent><div className="space-y-3">
      {branches.map(branch=><div key={branch.id} className="text-sm font-semibold">{branch.nombre}</div>)}
      <div className="flex gap-2"><Input aria-label="Nombre de nueva sucursal" placeholder="Ej: Gasolinera Centro" value={nombre} maxLength={80} onChange={e=>setNombre(e.target.value)}/><Button disabled={busy||nombre.trim().length<2} onClick={crear}><Plus className="h-4 w-4 mr-1"/>Crear</Button></div>
      {terminals.map(t=><div key={t.id} className="space-y-1"><label htmlFor={`name-${t.id}`} className="text-xs text-muted-foreground">Terminal · teléfono terminado en {t.phone.slice(-4)}</label><div className="flex gap-2"><Input id={`name-${t.id}`} placeholder="Ej: Caja A" maxLength={80} value={names[t.id]??t.terminal_name??''} onChange={e=>setNames(previous=>({...previous,[t.id]:e.target.value}))}/><Button variant="outline" disabled={busy||!names[t.id]?.trim()} onClick={()=>void rename(t)}>Guardar</Button></div></div>)}
    </div></AccordionContent></AccordionItem></Accordion>
  </section>;
}
