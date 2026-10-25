import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Store, Check, RefreshCw, LockKeyhole, ArrowLeft, Send, Ban, UserPlus, Copy } from 'lucide-react';
import { documentFields, terminalEnabled, terminalInviteLink, merchantValid, type Agent, type Terminal, type Permission, type Invite } from '@/lib/terminales';

export default function TerminalesDialog() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [open,setOpen]=useState(false);
  const [agent,setAgent]=useState<Agent|null>(null);
  const [terminals,setTerminals]=useState<Terminal[]>([]);
  const [permissions,setPermissions]=useState<Permission[]>([]);
  const [invites,setInvites]=useState<Invite[]>([]);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(false);
  const [loadError,setLoadError]=useState(false);
  const [name,setName]=useState('');
  const [files,setFiles]=useState<Record<string,File>>({});
  const [reloadOpen,setReloadOpen]=useState(false);
  const [number,setNumber]=useState('');
  const [amount,setAmount]=useState('');
  const [balance,setBalance]=useState<number|null>(null);
  const [result,setResult]=useState<{neto:number;apertura:number;saldo:number}|null>(null);
  const [quote,setQuote]=useState<{opening:number;net:number}|null>(null);
  const [invitePhone,setInvitePhone]=useState('');
  const [inviteCode,setInviteCode]=useState<string|null>(null);
  const [lastInvite,setLastInvite]=useState<{code:string;phone:string;token:string}|null>(null);
  const key=useRef<string|null>(null);
  const loadingRef=useRef(false);
  const again=useRef(false);
  const load=useCallback(async()=>{
    if(!user) return;
    if(loadingRef.current){again.current=true;return;}
    loadingRef.current=true; setLoading(true);
    try {
      do {
        again.current=false;
        const [a,t,p,i,w]=await Promise.all([
          supabase.from('terminal_agent_requests').select('*').eq('user_id',user.id).maybeSingle(),
          supabase.from('terminal_catalog').select('code,name,operational').order('created_at'),
          supabase.from('terminal_permissions').select('id,user_id,terminal_code,status,invited_by').eq('user_id',user.id),
          supabase.from('terminal_invites').select('id,phone,terminal_code,status,invited_user_id,token').eq('merchant_user_id',user.id),
          supabase.from('qard_wallets').select('saldo_mxn').eq('titular_user_id',user.id).maybeSingle(),
        ]);
        if(a.error||t.error||p.error||i.error||w.error) throw new Error('No se pudieron consultar las terminales');
        setAgent(a.data as Agent|null);setTerminals(t.data??[]);setPermissions(p.data??[]);setInvites(i.data??[]);setBalance(w.data?Number(w.data.saldo_mxn):null);setLoadError(false);
      } while(again.current);
    } catch { setLoadError(true); } finally {loadingRef.current=false;setLoading(false);}
  },[user]);
  useEffect(()=>{
    if(!open||!user) return;
    void load();
    const channel=supabase.channel(`terminales-${user.id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'terminal_agent_requests',filter:`user_id=eq.${user.id}`},()=>void load())
      .on('postgres_changes',{event:'*',schema:'public',table:'terminal_permissions',filter:`user_id=eq.${user.id}`},()=>void load())
      .on('postgres_changes',{event:'*',schema:'public',table:'terminal_invites',filter:`merchant_user_id=eq.${user.id}`},()=>void load())
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'qard_wallets',filter:`titular_user_id=eq.${user.id}`},()=>void load())
      .subscribe();
    return ()=>{void supabase.removeChannel(channel);};
  },[open,user,load]);
  const run=async(fn:()=>Promise<void>)=>{ if(busy)return;setBusy(true);try{await fn();}catch(e){toast({title:'No se pudo completar',description:e instanceof Error?e.message:'Intenta de nuevo',variant:'destructive'});}finally{setBusy(false);}};
  const submit=()=>run(async()=>{
    if(!user)throw new Error('Inicia sesión');
    const docs:Record<string,string>={};
    for(const d of documentFields){
      const file=files[d.key];
      if(!file||file.size>5*1024*1024||!['image/jpeg','image/png','application/pdf'].includes(file.type))throw new Error(`${d.label}: elige JPG, PNG o PDF de máximo 5 MB`);
    }
    for(const d of documentFields){const file=files[d.key];if(!file)throw new Error('Documento faltante');const extension=file.type==='application/pdf'?'pdf':file.type==='image/png'?'png':'jpg';const path=`${user.id}/${crypto.randomUUID()}/${d.key}.${extension}`;const {error}=await supabase.storage.from('terminales-documentos').upload(path,file);if(error)throw error;docs[d.key]=path;}
    const {error}=await supabase.rpc('terminal_submit_request',{_business_name:name,_documents:docs});if(error)throw error;
    setFiles({}); await load();toast({title:'Solicitud recibida',description:'Pendiente de CURP, RFC y comprobación biométrica.'});
  });
  const accept=(id:string)=>run(async()=>{const {error}=await supabase.rpc('terminal_accept',{_id:id});if(error)throw error;await load();});
  const invite=(code:string)=>run(async()=>{
    if(!invitePhone.trim())throw new Error('Escribe el teléfono que invitarás');
    const {data,error}=await supabase.rpc('terminal_invite_phone',{_phone:invitePhone,_code:code});
    if(error)throw error;
    setLastInvite({code,phone:invitePhone,token:String(data)});
    setInvitePhone('');setInviteCode(null);
    await load();
  });
  const revoke=(id:string)=>run(async()=>{const {error}=await supabase.rpc('terminal_revoke_invite',{_id:id});if(error)throw error;await load();});
  const sendWhatsapp=(inv:{phone:string;token:string})=>{
    const clean=inv.phone.replace(/[^0-9]/g,'');
    const msg=encodeURIComponent(`Te invitaron a operar una terminal de TodoCerca. Acepta tu invitación aquí: ${terminalInviteLink(inv.token)}\n\n⚠️ Este enlace es personal e intransferible.`);
    window.open(`https://wa.me/${clean}?text=${msg}`,'_blank');
  };
  const copyLink=async(inv:{token:string})=>{
    try{ await navigator.clipboard.writeText(terminalInviteLink(inv.token)); toast({title:'Enlace copiado'});}
    catch{ toast({title:'No se pudo copiar',description:terminalInviteLink(inv.token)}); }
  };
  const reload=()=>run(async()=>{
    const t=terminals.find(t=>t.code==='reload');const p=permissions.find(p=>p.terminal_code==='reload');
    if(!t||!terminalEnabled(agent,p,t))throw new Error('Terminal pendiente de autorización');
    const isOwner=!!user&&p?.invited_by===user.id;
    const value=Number(amount);if(!/^\d{16}$/.test(number)||!Number.isFinite(value)||value<=15)throw new Error('Revisa la QaRd principal y el monto');
    if(isOwner&&balance!==null&&balance<value)throw new Error('Saldo insuficiente del comercio');
    if(!quote){
      const {data,error}=await supabase.rpc('terminal_reload_quote',{_number:number,_amount:value});
      if(error)throw error;
      setQuote(data as unknown as {opening:number;net:number});
      return;
    }
    key.current??=crypto.randomUUID();
    const {data,error}=await supabase.rpc('terminal_reload',{_number:number,_amount:value,_key:key.current});
    if(error)throw error;
    const response=data as unknown as {ok:boolean;neto:number;apertura:number;saldo:number};
    if(!response?.ok)throw new Error('No se confirmó la recarga');
    setResult(response);await load();
  });
  return <>
    <Button variant="outline" className="w-full min-h-14 h-auto gap-2 p-4" onClick={()=>setOpen(true)}>
      <Store className="h-6 w-6 text-primary"/><span className="font-semibold">Abrir terminales digitales</span>
    </Button>
    <Dialog open={open} onOpenChange={v=>{if(!busy){setOpen(v);if(!v)setReloadOpen(false);}}}>
      <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center justify-between gap-2">Terminales digitales<Button size="icon" variant="ghost" aria-label="Actualizar terminales" onClick={()=>void load()} disabled={loading}><RefreshCw className="h-4 w-4"/></Button></DialogTitle></DialogHeader>
        {loading&&<p className="text-sm text-muted-foreground">Consultando…</p>}
        {loadError?<p className="text-sm text-destructive">No se pudieron consultar las terminales. Intenta de nuevo.</p>:reloadOpen?<div className="space-y-4">
          <Button variant="ghost" onClick={()=>setReloadOpen(false)}><ArrowLeft className="h-4 w-4 mr-2"/>Terminales</Button>
          <h2 className="font-semibold">Recargar QaRd principal</h2>
          {user&&permissions.find(p=>p.terminal_code==='reload')?.invited_by===user.id&&balance!==null&&<p>Saldo del comercio: ${balance.toFixed(2)}</p>}
          {!(user&&permissions.find(p=>p.terminal_code==='reload')?.invited_by===user.id)&&<p className="text-sm text-muted-foreground">La recarga usa el saldo del negocio, no el tuyo.</p>}
          {result?<div className="space-y-3"><p className="font-semibold text-primary">Recarga confirmada</p><p>Acreditado al cliente: ${Number(result.neto).toFixed(2)}</p><p>Activación: ${Number(result.apertura).toFixed(2)}</p><p>Comisión: $15 · Comercio $5 · TodoCerca $10</p><p>Saldo del cliente: ${Number(result.saldo).toFixed(2)}</p><Button onClick={()=>{setResult(null);setQuote(null);setAmount('');setNumber('');key.current=null;}}>Nueva recarga</Button></div>:<>
            <div><Label htmlFor="terminal-number">QaRd principal del cliente</Label><Input id="terminal-number" inputMode="numeric" maxLength={16} value={number} disabled={busy} onChange={e=>{setNumber(e.target.value.replace(/\D/g,''));setQuote(null);key.current=null;}}/></div>
            <div><Label htmlFor="terminal-amount">Efectivo recibido (MXN)</Label><Input id="terminal-amount" type="number" min="15.01" step="0.01" value={amount} disabled={busy} onChange={e=>{setAmount(e.target.value);setQuote(null);key.current=null;}}/></div>
            <p className="text-sm text-muted-foreground">$15 de comisión: $5 para el negocio y $10 para TodoCerca. Si falta activar la cuenta del cliente, también se descuentan $150.</p>
            {quote&&<div className="space-y-1 text-sm border-t border-border pt-3"><p>Cliente recibe: <b>${Number(quote.net).toFixed(2)}</b></p><p>Activación: ${Number(quote.opening).toFixed(2)}</p><p>Comisión: $15 · Negocio $5 · TodoCerca $10</p></div>}
            <Button className="w-full" onClick={reload} disabled={busy||number.length!==16||Number(amount)<=15||((user&&permissions.find(p=>p.terminal_code==='reload')?.invited_by===user.id&&balance!==null&&Number(amount)>balance))}>{busy?'Consultando…':quote?`Confirmar recarga de $${Number(amount||0).toFixed(2)}`:'Revisar importe'}</Button>
          </>}
        </div>:<div className="space-y-4">
          {!agent&&!loading&&permissions.length===0?<div className="space-y-3">
            <h2 className="font-semibold">Comercio Afiliado · Nivel Tres</h2>
            <div><Label htmlFor="agent-name">Nombre del comercio</Label><Input id="agent-name" maxLength={120} value={name} onChange={e=>setName(e.target.value)} disabled={busy}/></div>
            {documentFields.map(d=><div key={d.key}><Label htmlFor={`agent-${d.key}`}>{d.label}</Label><Input id={`agent-${d.key}`} type="file" accept="image/jpeg,image/png,application/pdf" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)setFiles(prev=>({...prev,[d.key]:f}));}}/></div>)}
            <p className="text-sm text-muted-foreground">Documentos privados. La solicitud permanecerá pendiente hasta comprobar CURP, RFC e identidad biométrica; subir la INE no activa nivel tres.</p>
            <Button className="w-full" disabled={busy||name.trim().length<2||documentFields.some(d=>!files[d.key])} onClick={submit}>{busy?'Enviando…':'Solicitar registro'}</Button>
          </div>:agent&&<section className="space-y-2 border-b border-border pb-3"><h2 className="font-semibold">{agent.business_name}</h2><p className="text-sm">{agent.status==='approved'?'Agente aprobado':'Solicitud pendiente'}</p><p className="text-sm text-muted-foreground">CURP: {agent.curp_status==='valid'?'validada':'pendiente'} · RFC: {agent.rfc_status==='valid'?'validado':'pendiente'}</p><p className="text-sm text-muted-foreground">Biometría: {agent.biometric_status==='valid'?'validada':'pendiente de proveedor'}</p>{agent.review_note&&<p className="text-sm">{agent.review_note}</p>}</section>}
          {(agent||permissions.length>0)&&terminals.map(t=>{const p=permissions.find(p=>p.terminal_code===t.code);const enabled=terminalEnabled(agent,p,t);return <section key={t.code} className="border-b border-border py-3 space-y-2"><h3 className="font-semibold flex items-center gap-2">{enabled?<Check className="h-4 w-4 text-primary"/>:<LockKeyhole className="h-4 w-4 text-muted-foreground"/>}{t.name}</h3><p className="text-sm text-muted-foreground">{!t.operational?'Pendiente de proveedor':p?.status==='accepted'?(enabled?'Activa':'Invitación aceptada · comercio pendiente'):p?.status==='revoked'?'Revocada':p?.status==='pending'?'Invitación pendiente':'Sin invitación'}</p>{p?.status==='pending'&&<Button variant="outline" disabled={busy} onClick={()=>accept(p.id)}>Aceptar invitación</Button>}{enabled&&<Button onClick={()=>{if(t.code==='reload'){setReloadOpen(true);setResult(null);}else{setOpen(false);nav(t.code==='collection'?'/qard/cobrar?terminal=1':'/qard');}}}>Abrir terminal</Button>}
            {merchantValid(agent)&&t.operational&&<>
              {invites.filter(i=>i.terminal_code===t.code).map(i=><div key={i.id} className="flex items-center justify-between gap-2 text-sm"><span className="font-mono">{i.phone}</span><span className="text-muted-foreground">{i.status==='pending'?'Pendiente de aceptar':i.status==='accepted'?'Aceptada':'Revocada'}</span>{i.status!=='revoked'&&<Button size="icon" variant="ghost" aria-label={`Revocar invitación de ${i.phone}`} disabled={busy} onClick={()=>revoke(i.id)}><Ban className="h-4 w-4"/></Button>}</div>)}
              {lastInvite?.code===t.code&&<div className="rounded-md border border-border p-2 text-xs space-y-2"><p className="break-all">{terminalInviteLink(lastInvite.token)}</p><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>sendWhatsapp(lastInvite)}><Send className="h-3 w-3 mr-1"/>WhatsApp</Button><Button size="sm" variant="outline" onClick={()=>void copyLink(lastInvite)}><Copy className="h-3 w-3 mr-1"/>Copiar enlace</Button></div></div>}
              {inviteCode===t.code?<div className="space-y-2"><PhoneInput value={invitePhone} onChange={setInvitePhone}/><div className="flex gap-2"><Button size="sm" disabled={busy||!invitePhone.trim()} onClick={()=>invite(t.code)}>Invitar</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>{setInviteCode(null);setInvitePhone('');}}>Cancelar</Button></div><p className="text-xs text-muted-foreground">Puedes invitarte a ti mismo con tu propio teléfono: quedará aceptada al instante.</p></div>:<Button size="sm" variant="outline" onClick={()=>{setInviteCode(t.code);setLastInvite(null);setInvitePhone('');}}><UserPlus className="h-4 w-4 mr-1"/>Invitar por teléfono</Button>}
            </>}
          </section>;})}
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}
