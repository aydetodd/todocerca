import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScanLine } from 'lucide-react';

export default function BusinessPayment({ accounts, onPaid }: { accounts: { number: string; name: string }[]; onPaid: () => void }) {
  const [destination, setDestination] = useState('');
  const [source, setSource] = useState(accounts[0]?.number ?? '');
  const [amount, setAmount] = useState('');
  const [cvv, setCvv] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState('');
  const request = useRef<{ signature: string; key: string } | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const stop = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    try { if (scanner?.isScanning) await scanner.stop(); scanner?.clear(); } catch { /* camera already closed */ }
    setScanning(false);
  };
  useEffect(() => () => { void stop(); }, []);
  const scan = async () => {
    setScanning(true); setMessage('');
    await new Promise(resolve => requestAnimationFrame(resolve));
    const scanner = new Html5Qrcode('business-payment-reader');
    scannerRef.current = scanner;
    try {
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 230 }, async text => {
        await stop();
        const number = text.replace(/\D/g, '');
        if (number.length !== 16) { setMessage('QR empresarial inválido'); return; }
        setDestination(number);
      }, () => {});
    } catch { setScanning(false); setMessage('No se pudo abrir la cámara.'); }
  };
  const pay = async () => {
    if (busy || !/^\d{3}$/.test(cvv) || !destination || Number(amount) <= 0) return;
    if (!confirm(`¿Pagar $${Number(amount).toFixed(2)} al negocio •••• ${destination.slice(-4)}?`)) return;
    setBusy(true);
    const signature = `${source}:${destination}:${amount}`;
    if (request.current?.signature !== signature) request.current = { signature, key: crypto.randomUUID() };
    try {
      const { data, error } = await supabase.rpc('qard_pay_business', { _from: source, _merchant: destination, _amount: Number(amount), _cvv: cvv, _key: request.current.key });
      if (error) throw error;
      if (!(data as { ok?: boolean })?.ok) throw new Error('No se confirmó el pago');
      setMessage('Pago confirmado'); request.current = null; setDestination(''); setAmount(''); onPaid();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo confirmar el pago'); }
    finally { setBusy(false); setCvv(''); }
  };
  return <section className="space-y-3 border-t border-border pt-3">
    <h3 className="font-semibold">Pagar a un negocio</h3>
    {!scanning && <Button variant="outline" onClick={scan}><ScanLine className="h-4 w-4 mr-2"/>Escanear QR de cobro</Button>}
    {scanning && <><div id="business-payment-reader" className="min-h-64"/><Button variant="outline" onClick={stop}>Cancelar escaneo</Button></>}
    {destination && <>
      <p className="font-mono text-sm">Negocio •••• {destination.slice(-4)}</p>
      <Label>QaRd para pagar</Label><select className="w-full h-10 rounded-md border border-input bg-background px-3" value={source} onChange={e=>setSource(e.target.value)}>{accounts.map(a=><option key={a.number} value={a.number}>{a.name}</option>)}</select>
      <Label>Monto</Label><Input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} disabled={busy}/>
      <Label>Mi CVV de 3 dígitos</Label><Input type="password" inputMode="numeric" maxLength={3} value={cvv} onChange={e=>setCvv(e.target.value.replace(/\D/g,''))} disabled={busy}/>
      <Button className="w-full" disabled={busy || cvv.length!==3 || Number(amount)<=0} onClick={pay}>{busy?'Confirmando…':'Confirmar pago'}</Button>
    </>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}