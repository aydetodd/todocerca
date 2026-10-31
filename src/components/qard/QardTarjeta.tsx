import { QRCodeSVG } from "qrcode.react";
import { Eye, EyeOff, History, Printer, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { protegerNombreQard, rayasNivelQard } from "@/lib/qardCardPresentation";

type Props = {
  numero: string;
  nombre: string;
  indice: number;
  estado: string;
  vence?: string | null;
  cvv?: string | null;
  cvvVisible: boolean;
  onVerCvv: () => void;
  onRotarCvv: () => void;
  onQr: () => void;
  onImprimir?: () => void;
  onEstadoCuenta?: () => void;
  estadoCuentaLabel?: string;
  nivel?: number;
  activada?: boolean;
  encendida?: boolean;
  cambiandoEstado?: boolean;
  powerDisabled?: boolean;
  onPowerChange?: () => void;
  empresarial?: boolean;
  pendiente?: boolean;
};

export default function QardTarjeta(props: Props) {
  const apagada = props.estado !== "activa" || !props.activada;
  const rayas = rayasNivelQard(props.nivel ?? 0);
  const numero = props.numero.replace(/\D/g, "");
  const grupos = numero.length === 16 ? numero.match(/.{4}/g) ?? [] : ["••••", "••••", "••••", "••••"];
  const nombre = protegerNombreQard(props.nombre) || "••••";
  return (
    <div className="qard-card-group">
    <div className={`qard-plastic ${apagada ? "qard-plastic-off" : ""} ${props.empresarial && !apagada ? "qard-plastic-empresarial" : ""}`} aria-label={`Tarjeta ${props.nombre} ${apagada ? "apagada" : "encendida"}`}>
      <div className="qard-card-header flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <img src="/icon-512.png" alt="TodoCerca" className="qard-logo h-8 w-8 shrink-0 rounded-full object-cover" />
          <div className="min-w-0">
            <div className="qard-marca text-lg font-bold">QaRd</div>
            {props.empresarial
              ? <div className="qard-etiqueta-emp text-[10px]">EMPRESARIAL</div>
              : <div className="text-[10px] opacity-80">{props.indice === 0 ? "Tarjeta principal" : "Tarjeta familiar"} · {String(props.indice).padStart(2, "0")}</div>}
          </div>
        </div>
        <Button variant="ghost" className="qard-qr h-auto shrink-0 p-1" onClick={props.onQr} disabled={props.pendiente} title="Agrandar QR" aria-label={`Agrandar QR de ${props.nombre}`}>
          {props.pendiente ? <span className="flex h-12 w-12 items-center justify-center text-[10px]">—</span> : <QRCodeSVG value={props.numero} size={48} className="!h-12 !w-12" level="H" />}
        </Button>
      </div>
      <div className="qard-card-chip flex items-center">
        <div className="flex items-center gap-2">
          <div className="qard-chip h-6 w-9 rounded-md"><div className="h-full border-x rounded-md opacity-50" /></div>
          {rayas > 0 && <svg width="28" height="32" viewBox="0 0 28 32" role="img" aria-label={`Nivel de verificación ${rayas}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {["M5 12 Q9 16 5 20", "M10 8 Q18 16 10 24", "M15 4 Q27 16 15 28"].slice(0, rayas).map(d => <path key={d} d={d} />)}
          </svg>}
        </div>
      </div>
      <div className="qard-card-number flex justify-between gap-1 font-mono text-lg font-semibold">{grupos.map((grupo, i) => <span key={i}>{grupo}</span>)}</div>
      <div className="qard-card-details grid grid-cols-[minmax(0,1fr)_42px_80px] items-end gap-2">
        <div className="min-w-0"><div className="text-[8px] opacity-70">TITULAR</div><svg className="h-3.5 w-full" viewBox="0 0 190 14" preserveAspectRatio="xMinYMid meet" role="img" aria-label={nombre}><text x="0" y="11" fill="currentColor" fontSize="11" fontWeight="600" textLength={Math.min(190, nombre.length * 6.6)} lengthAdjust="spacingAndGlyphs">{nombre}</text></svg></div>
        <div><div className="text-[8px] opacity-70">VENCE</div><div className="font-mono text-[10px] leading-[14px]">{props.pendiente ? "—" : props.vence ?? "12/99"}</div></div>
        <div className="text-center"><div className="text-[8px] opacity-70">CVV</div><div className="font-mono text-[10px] font-bold leading-[14px]">{props.cvvVisible ? props.cvv ?? "•••" : "•••"}</div></div>
      </div>
    </div>
    {!props.pendiente && <div className="flex items-center gap-1 pt-2" aria-label="Controles de tarjeta">
      {props.onPowerChange && <Switch className="mr-auto" aria-label={props.indice === 0 ? "Encender o apagar QaRd principal" : `Encender o apagar tarjeta familiar ${props.indice}`} checked={props.encendida} disabled={props.powerDisabled || props.cambiandoEstado} onCheckedChange={props.onPowerChange} />}
      {props.cambiandoEstado && <span className="text-xs text-muted-foreground">Guardando…</span>}
      <div className="ml-auto flex items-center">
        {props.onEstadoCuenta && <Button variant="ghost" size="icon" onClick={props.onEstadoCuenta} title={props.estadoCuentaLabel ?? "Estado de cuenta"} aria-label={props.estadoCuentaLabel ?? "Estado de cuenta"}><History className="h-4 w-4" /></Button>}
        {props.onImprimir && <Button variant="ghost" size="icon" onClick={props.onImprimir} title="Imprimir tarjetas" aria-label="Imprimir tarjetas"><Printer className="h-4 w-4" /></Button>}
        <Button variant="ghost" size="icon" onClick={props.onVerCvv} title={props.cvvVisible ? "Ocultar CVV" : "Ver CVV"} aria-label={props.cvvVisible ? "Ocultar CVV" : "Ver CVV"}>{props.cvvVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
        {props.estado !== "cancelada" && <Button variant="ghost" size="icon" onClick={props.onRotarCvv} title="Cambiar CVV" aria-label="Cambiar CVV"><RotateCw className="h-4 w-4" /></Button>}
      </div>
    </div>}
    </div>
  );
}