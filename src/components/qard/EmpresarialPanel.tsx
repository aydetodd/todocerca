import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { BookOpen, Briefcase, QrCode, Zap } from 'lucide-react';
import EfirmaRegistration from './EfirmaRegistration';
import TerminalesDialog from './TerminalesDialog';
import SucursalesPanel from './SucursalesPanel';
import FormalizationDialog from '@/components/formalization/FormalizationDialog';
import { merchantValid, type Agent } from '@/lib/terminales';

type AgentRow = Agent & { razon_social?: string | null; efirma_rfc?: string | null };

/** Centro de operaciones del negocio dentro de la QaRd Empresarial. La activación solo ocurre por e.firma validada localmente. */
export default function EmpresarialPanel({ numero, onChanged, onLibro, onQr }: {
  numero?: string; onChanged: () => void; onLibro?: () => void; onQr?: () => void;
}) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [agent, setAgent] = useState<AgentRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('terminal_agent_requests').select('*').eq('user_id', user.id).maybeSingle();
    setAgent(data as AgentRow | null); setLoaded(true);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void load();
    const ch = supabase.channel(`emp-panel-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'terminal_agent_requests', filter: `user_id=eq.${user.id}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user, load]);

  if (!loaded) return null;
  const valida = merchantValid(agent) && !!numero;


  return <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Activar QaRd Empresarial</DialogTitle></DialogHeader>
        <EfirmaRegistration onVerified={() => { void load(); onChanged(); }} onSuccess={() => { setOpen(false); void load(); onChanged(); }} />
      </DialogContent>
    </Dialog>
    {!valida ? <div className="space-y-2"><Button className="w-full min-h-16 h-auto text-lg font-bold gap-2 py-4" onClick={() => setOpen(true)}><Zap className="h-6 w-6" />Activar mi QaRd Empresarial</Button><p className="text-xs text-muted-foreground">Tu llave y contraseña nunca salen de tu teléfono.</p></div> : <Accordion type="single" collapsible><AccordionItem value="gestion"><AccordionTrigger>Gestionar mi empresa</AccordionTrigger><AccordionContent><Card className="p-4 space-y-3">
      <div>
        <div className="text-xs text-muted-foreground">Mi negocio</div>
        <div className="font-bold text-lg leading-tight">{agent?.razon_social || agent?.business_name}</div>
        {agent?.efirma_rfc && <div className="text-sm font-mono text-muted-foreground">RFC {agent.efirma_rfc}</div>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TerminalesDialog label="Invitar terminal" />
        <Button variant="outline" className="min-h-14 h-auto gap-2 p-4" onClick={onLibro}><BookOpen className="h-6 w-6 text-primary" /><span className="font-semibold">Libro de cobros</span></Button>
        <Button variant="outline" className="min-h-14 h-auto gap-2 p-4" onClick={() => nav('/dashboard')}><Briefcase className="h-6 w-6 text-primary" /><span className="font-semibold">Mis negocios</span></Button>
        <Button variant="outline" className="min-h-14 h-auto gap-2 p-4" onClick={onQr}><QrCode className="h-6 w-6 text-primary" /><span className="font-semibold">Mi QR de cobro</span></Button>
      </div>
      <SucursalesPanel />
      <FormalizationDialog />
    </Card></AccordionContent></AccordionItem></Accordion>}
  </>;
}
