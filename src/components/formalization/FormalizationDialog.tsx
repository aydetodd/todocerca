import { useEffect, useRef, useState } from 'react';
import { ClipboardCheck, ExternalLink, FileText, Loader2, RefreshCw, Save, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { Tables } from '@/integrations/supabase/types';
import { canConfirmFiscalProfile, emptyFiscalDraft, fiscalDraftSchema, FISCAL_BUCKET, formalizationSteps, formalizationSummary, GUIDE_VERSION, validateFiscalEvidence, type FiscalDraft } from '@/lib/formalization';

type ProgressRow = Tables<'formalization_progress'>;
type TaxRow = Tables<'merchant_tax_profiles'>;
const statusLabels: Record<string, string> = { pending: 'Pendiente', completed: 'Terminado por mí', not_applicable: 'No aplica' };

export default function FormalizationDialog() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [tax, setTax] = useState<TaxRow | null>(null);
  const [draft, setDraft] = useState<FiscalDraft>(emptyFiscalDraft);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const fiscalDirty = useRef(false);
  const noteDirty = useRef(new Set<string>());
  const loadSequence = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadStep, setUploadStep] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    const sequence = ++loadSequence.current;
    try {
      const [profileResult, progressResult] = await Promise.all([
        supabase.from('merchant_tax_profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('formalization_progress').select('*').eq('user_id', user.id).eq('guide_version', GUIDE_VERSION),
      ]);
      if (sequence !== loadSequence.current) return;
      if (profileResult.error) throw profileResult.error;
      if (progressResult.error) throw progressResult.error;
      const profile = profileResult.data;
      setTax(profile);
      setRows(progressResult.data ?? []);
      if (!fiscalDirty.current) {
        setDraft(profile ? { rfc: profile.rfc, legal_name: profile.legal_name, tax_regime: profile.tax_regime, postal_code: profile.postal_code, activity: profile.activity } : emptyFiscalDraft);
        setConfirmed(false);
      }
      setNotes(previous => {
        const next = { ...previous };
        for (const row of progressResult.data ?? []) if (!noteDirty.current.has(row.step_key)) next[row.step_key] = row.note;
        return next;
      });
      setError('');
    } catch {
      if (sequence === loadSequence.current) setError('No se pudo cargar tu expediente. Intenta nuevamente.');
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (!open || !user) return;
    fiscalDirty.current = false;
    noteDirty.current.clear();
    setNotes({});
    setConfirmed(false);
    setLoading(true);
    void load();
    const channel = supabase.channel(`formalization-${user.id}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_tax_profiles', filter: `user_id=eq.${user.id}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'formalization_progress', filter: `user_id=eq.${user.id}` }, () => void load())
      .subscribe();
    return () => { loadSequence.current++; void supabase.removeChannel(channel); };
  }, [open, user?.id]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await action(); await load(); }
    catch { toast({ title: 'No se guardó el cambio', description: 'Revisa tu conexión e intenta nuevamente.', variant: 'destructive' }); }
    finally { setBusy(false); }
  }

  async function saveStep(key: string, status: string, evidence?: string) {
    if (!user) return;
    const row = rows.find(item => item.step_key === key);
    const { error: saveError } = await supabase.from('formalization_progress').upsert({ user_id: user.id, guide_version: GUIDE_VERSION, step_key: key, status, note: notes[key] ?? row?.note ?? '', evidence_path: evidence ?? row?.evidence_path ?? null }, { onConflict: 'user_id,step_key,guide_version' });
    if (saveError) throw saveError;
    noteDirty.current.delete(key);
  }

  async function saveFiscal(confirm = false, evidence?: string) {
    if (!user) return;
    const parsed = fiscalDraftSchema.safeParse(draft);
    if (!parsed.success || (confirm && !canConfirmFiscalProfile(draft))) {
      toast({ title: 'Revisa tus datos', description: parsed.success ? 'Completa todos los datos fiscales antes de confirmar.' : parsed.error.issues[0]?.message, variant: 'destructive' });
      return false;
    }
    const { error: saveError } = await supabase.from('merchant_tax_profiles').upsert({ ...parsed.data, user_id: user.id, evidence_path: evidence ?? tax?.evidence_path ?? null, confirmation_status: confirm ? 'self_confirmed' : 'draft' }, { onConflict: 'user_id' });
    if (saveError) throw saveError;
    fiscalDirty.current = false;
    setConfirmed(false);
    toast({ title: confirm ? 'Datos confirmados por ti' : 'Expediente guardado' });
    return true;
  }

  async function upload(file: File) {
    if (!user) return;
    const validation = validateFiscalEvidence(file);
    if (validation) { toast({ title: 'Archivo no permitido', description: validation, variant: 'destructive' }); return; }
    if (!uploadStep && !fiscalDraftSchema.safeParse(draft).success) { toast({ title: 'Revisa los datos antes de adjuntar', variant: 'destructive' }); return; }
    const path = `${user.id}/${crypto.randomUUID()}.${file.name.split('.').pop()?.toLowerCase()}`;
    await run(async () => {
      const { error: uploadError } = await supabase.storage.from(FISCAL_BUCKET).upload(path, file);
      if (uploadError) throw uploadError;
      try {
        if (uploadStep) await saveStep(uploadStep, rows.find(row => row.step_key === uploadStep)?.status ?? 'pending', path);
        else if (!await saveFiscal(false, path)) throw new Error('Invalid data');
      } catch (cause) { await supabase.storage.from(FISCAL_BUCKET).remove([path]); throw cause; }
    });
  }

  async function openEvidence(path: string) {
    await run(async () => {
      const { data, error: linkError } = await supabase.storage.from(FISCAL_BUCKET).createSignedUrl(path, 60);
      if (linkError || !data) throw linkError ?? new Error('No file');
      const response = await fetch(data.signedUrl);
      if (!response.ok) throw new Error('Download failed');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `documento-fiscal.${path.split('.').pop()}`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  const summary = formalizationSummary(rows);
  function field(key: keyof FiscalDraft, value: string) { fiscalDirty.current = true; setConfirmed(false); setDraft(old => ({ ...old, [key]: value })); }

  return <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
    <DialogTrigger asChild><Button variant="outline" className="min-h-14 h-auto w-full justify-start gap-3 whitespace-normal text-left"><ClipboardCheck className="h-5 w-5 shrink-0 text-primary" /><span>Formalización y expediente fiscal</span></Button></DialogTrigger>
    <DialogContent className="max-w-3xl max-h-[85dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>Formalización del comercio</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Esta guía no da de alta tu negocio en el SAT ni cambia tu nivel QaRd. No se cobran consultas de Verificamex.</p>
      {loading ? <p role="status" className="flex items-center gap-2 py-8"><Loader2 className="h-5 w-5 animate-spin" />Cargando expediente…</p> : error ? <div role="alert" className="space-y-3 py-4"><p>{error}</p><Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Reintentar</Button></div> : <Tabs defaultValue="guide">
        <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="guide">Guía RESICO</TabsTrigger><TabsTrigger value="profile">Expediente</TabsTrigger></TabsList>
        <TabsContent value="guide" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b py-3"><h3 className="font-semibold">Tus pendientes</h3><span className="text-sm text-muted-foreground">{summary.completed} de {summary.total} terminados · {summary.notApplicable} no aplican</span></div>
          <Accordion type="single" collapsible defaultValue="eligibility">
            {formalizationSteps.map((step, index) => {
              const row = rows.find(item => item.step_key === step.key);
              return <AccordionItem key={step.key} value={step.key}>
                <AccordionTrigger className="gap-3 text-left"><span className="flex min-w-0 flex-wrap items-center gap-2"><span>{index + 1}. {step.title}</span><Badge variant="secondary">{statusLabels[row?.status ?? 'pending']}</Badge></span></AccordionTrigger>
                <AccordionContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">{step.detail}</p>
                  <div className="flex flex-wrap gap-2"><Button variant="link" asChild className="h-auto p-0 whitespace-normal text-left"><a href={step.link} target="_blank" rel="noopener noreferrer">{step.linkLabel}<ExternalLink className="ml-2 h-4 w-4 shrink-0" /></a></Button>{'extraLink' in step && <Button variant="link" asChild className="h-auto p-0"><a href={step.extraLink} target="_blank" rel="noopener noreferrer">{step.extraLabel}<ExternalLink className="ml-2 h-4 w-4" /></a></Button>}</div>
                  <Label htmlFor={`note-${step.key}`}>Notas y próximos pendientes</Label><Textarea id={`note-${step.key}`} value={notes[step.key] ?? ''} maxLength={2000} disabled={busy} onChange={e => { noteDirty.current.add(step.key); setNotes(old => ({ ...old, [step.key]: e.target.value })); }} />
                  <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => void run(() => saveStep(step.key, row?.status ?? 'pending'))}><Save className="mr-2 h-4 w-4" />Guardar nota</Button><Button variant="outline" disabled={busy} onClick={() => { setUploadStep(step.key); fileRef.current?.click(); }}><Upload className="mr-2 h-4 w-4" />Adjuntar evidencia</Button>{row?.evidence_path && <Button variant="outline" disabled={busy} onClick={() => void openEvidence(row.evidence_path ?? '')}><FileText className="mr-2 h-4 w-4" />Descargar evidencia</Button>}</div>
                  <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void run(() => saveStep(step.key, 'completed'))}>Marcar terminado</Button><Button variant="outline" disabled={busy} onClick={() => void run(() => saveStep(step.key, 'not_applicable'))}>No aplica</Button>{row && row.status !== 'pending' && <Button variant="ghost" disabled={busy} onClick={() => void run(() => saveStep(step.key, 'pending'))}>Volver a pendiente</Button>}</div>
                </AccordionContent>
              </AccordionItem>;
            })}
          </Accordion>
          <p className="text-xs text-muted-foreground">“Terminado” es tu declaración, no una aprobación del SAT. Revisa requisitos y fechas con el SAT o tu contador.</p>
        </TabsContent>
        <TabsContent value="profile" className="space-y-4 pt-2">
          <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">Datos de tu constancia fiscal</h3><Badge variant="secondary">{tax?.confirmation_status === 'self_confirmed' && !fiscalDirty.current ? 'Confirmado por ti · no validado por SAT' : 'Borrador'}</Badge></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="fiscal-rfc">RFC</Label><Input id="fiscal-rfc" maxLength={13} value={draft.rfc} disabled={busy} onChange={e => field('rfc', e.target.value.toUpperCase())} /></div>
            <div className="space-y-2"><Label htmlFor="fiscal-regime">Código de régimen fiscal</Label><Input id="fiscal-regime" inputMode="numeric" maxLength={3} placeholder="Ej. 626 si corresponde" value={draft.tax_regime} disabled={busy} onChange={e => field('tax_regime', e.target.value)} /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="fiscal-name">Nombre o razón social, como aparece en el SAT</Label><Input id="fiscal-name" maxLength={250} value={draft.legal_name} disabled={busy} onChange={e => field('legal_name', e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="fiscal-postal">Código postal fiscal</Label><Input id="fiscal-postal" inputMode="numeric" maxLength={5} value={draft.postal_code} disabled={busy} onChange={e => field('postal_code', e.target.value)} /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="fiscal-activity">Actividad económica</Label><Textarea id="fiscal-activity" maxLength={1000} value={draft.activity} disabled={busy} onChange={e => field('activity', e.target.value)} /></div>
          </div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => { setUploadStep(null); fileRef.current?.click(); }}><Upload className="mr-2 h-4 w-4" />Adjuntar constancia</Button>{tax?.evidence_path && <Button variant="outline" disabled={busy} onClick={() => void openEvidence(tax.evidence_path ?? '')}><FileText className="mr-2 h-4 w-4" />Descargar constancia</Button>}</div>
          <p className="text-xs text-muted-foreground">Documentos privados: PDF, JPG o PNG, máximo 5 MB. Nunca adjuntes archivos .key, contraseñas o credenciales del SAT.</p>
          <div className="flex items-start gap-3 border-t pt-4"><Checkbox id="fiscal-confirm" checked={confirmed} disabled={busy || !canConfirmFiscalProfile(draft)} onCheckedChange={value => setConfirmed(value === true)} /><Label htmlFor="fiscal-confirm" className="leading-relaxed">Revisé estos datos y coinciden con mi constancia de situación fiscal.</Label></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => void run(async () => { await saveFiscal(); })}><Save className="mr-2 h-4 w-4" />Guardar borrador</Button><Button disabled={busy || !confirmed || !canConfirmFiscalProfile(draft)} onClick={() => void run(async () => { if (await saveFiscal()) await saveFiscal(true); })}><ClipboardCheck className="mr-2 h-4 w-4" />Confirmar mis datos</Button></div>
        </TabsContent>
      </Tabs>}
      <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" aria-label="Adjuntar documento fiscal" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void upload(file); }} />
      {busy && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Guardando…</p>}
    </DialogContent>
  </Dialog>;
}