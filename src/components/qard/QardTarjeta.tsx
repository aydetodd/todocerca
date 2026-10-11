import { QRCodeSVG } from "qrcode.react";
import { Eye, EyeOff, Printer, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  nivel?: number;
  activada?: boolean;
};

export default function QardTarjeta(props: Props) {
  const apagada = props.estado !== "activa" || !props.activada;
  const rayas = rayasNivelQard(props.nivel ?? 0);
  const numero = props.numero.replace(/\D/g, "");
  const grupos = numero.length === 16 ? numero.match(/.{4}/g) ?? [] : ["••••", "••••", "••••", "••••"];
  return (
    <div className={`qard-plastic ${apagada ? "qard-plastic-off" : ""}`} aria-label={`Tarjeta ${props.nombre} ${apagada ? "apagada" : "encendida"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <img src="/icon-512.png" alt="TodoCerca" className="qard-logo h-11 w-11 shrink-0 rounded-full object-cover" />
          <div className="min-w-0">
            <div className="text-lg font-bold">QaRd</div>
            <div className="text-xs opacity-80">{props.indice === 0 ? "Tarjeta principal" : "Tarjeta familiar"} · {String(props.indice).padStart(2, "0")}</div>
          </div>
        </div>
        <Button variant="ghost" className="qard-qr h-auto shrink-0 p-1.5" onClick={props.onQr} title="Agrandar QR" aria-label={`Agrandar QR de ${props.nombre}`}>
          <QRCodeSVG value={props.numero} size={64} className="!h-16 !w-16" level="H" />
        </Button>
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <div className="qard-chip h-8 w-11 rounded-md"><div className="h-full border-x rounded-md opacity-50" /></div>
          {rayas > 0 && <svg width="28" height="32" viewBox="0 0 28 32" role="img" aria-label={`Nivel de verificación ${rayas}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {["M5 12 Q9 16 5 20", "M10 8 Q18 16 10 24", "M15 4 Q27 16 15 28"].slice(0, rayas).map(d => <path key={d} d={d} />)}
          </svg>}
        </div>
        {props.onImprimir && <Button variant="ghost" size="icon" onClick={props.onImprimir} title="Imprimir tarjetas" aria-label="Imprimir tarjetas"><Printer className="h-4 w-4" /></Button>}
      </div>
      <div className="flex justify-between gap-1 mt-2 font-mono text-lg sm:text-2xl font-semibold">{grupos.map((grupo, i) => <span key={i}>{grupo}</span>)}</div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3 gap-y-2 mt-3">
        <div className="col-span-2 min-w-0"><div className="text-[10px] opacity-70">TITULAR</div><div className="text-xs font-semibold break-words">{protegerNombreQard(props.nombre) || "••••"}</div></div>
        <div><div className="text-[10px] opacity-70">VENCE</div><div className="font-mono text-xs">{props.vence ?? "12/99"}</div></div>
        <div><div className="text-[10px] opacity-70">CVV</div><div className="flex items-center gap-1">
          <span className="font-mono text-xs font-bold">{props.cvvVisible ? props.cvv ?? "•••" : "•••"}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={props.onVerCvv} title={props.cvvVisible ? "Ocultar CVV" : "Ver CVV"} aria-label={props.cvvVisible ? "Ocultar CVV" : "Ver CVV"}>{props.cvvVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</Button>
          {props.estado !== "cancelada" && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={props.onRotarCvv} title="Cambiar CVV" aria-label="Cambiar CVV"><RotateCw className="h-3.5 w-3.5" /></Button>}
        </div></div>
      </div>
    </div>
  );
}