import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Lock,
  Mic,
  Plus,
  Send,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CATEGORIES,
  DEFAULT_DEVICES,
  type DomoticaCategory,
  type DomoticaCategoryId,
  type DomoticaDevice,
} from "@/lib/domoticaCatalog";
import { cn } from "@/lib/utils";

export default function Domotica() {
  const [devices, setDevices] = useState<DomoticaDevice[]>(DEFAULT_DEVICES);
  const [activeCategory, setActiveCategory] = useState<DomoticaCategoryId>("iluminacion");
  const [selected, setSelected] = useState<DomoticaDevice | null>(null);
  const [jarvisOpen, setJarvisOpen] = useState(false);
  const [jarvisText, setJarvisText] = useState("");

  const byCategory = useMemo(() => {
    const map = new Map<DomoticaCategoryId, DomoticaDevice[]>();
    for (const c of CATEGORIES) map.set(c.id, []);
    for (const d of devices) map.get(d.category)?.push(d);
    return map;
  }, [devices]);

  const updateDevice = (id: string, patch: Partial<DomoticaDevice>) => {
    setDevices(prev => prev.map(d => (d.id === id ? { ...d, ...patch } : d)));
    setSelected(prev => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  };

  const onToggle = (d: DomoticaDevice, value: boolean) => {
    if (!d.is_installed) return;
    updateDevice(d.id, { is_on: value });
  };

  const onNotInstalled = (d: DomoticaDevice) => {
    toast({
      title: `${d.name} no está instalado`,
      description: "Solicita la instalación física a tu técnico TodoCerca para activarlo.",
    });
  };

  const sendJarvis = () => {
    if (!jarvisText.trim()) return;
    toast({
      title: "Jarvis recibió tu comando",
      description: `"${jarvisText.trim()}" — pronto se enviará a tu casa.`,
    });
    setJarvisText("");
    setJarvisOpen(false);
  };

  const activeCat = CATEGORIES.find(c => c.id === activeCategory)!;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-40">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur bg-zinc-950/80 border-b border-zinc-800">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="p-2 -ml-2 rounded-lg hover:bg-zinc-800 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Domótica
            </h1>
            <p className="text-xs text-zinc-400">Tu casa, en tu mano</p>
          </div>
        </div>

        {/* Tabs categorías */}
        <div className="max-w-3xl mx-auto px-4 pb-3 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              const isActive = cat.id === activeCategory;
              const installedCount = byCategory.get(cat.id)?.filter(d => d.is_installed).length ?? 0;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-xl border transition-all",
                    isActive
                      ? "bg-zinc-100 text-zinc-900 border-zinc-100 shadow-lg"
                      : "bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700",
                  )}
                >
                  <Icon className={cn("w-4 h-4", isActive ? "" : cat.colorClass)} />
                  <span className="text-sm font-medium">{cat.label}</span>
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full",
                      isActive ? "bg-zinc-900/10 text-zinc-700" : "bg-zinc-800 text-zinc-400",
                    )}
                  >
                    {installedCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Resumen categoría */}
      <section className="max-w-3xl mx-auto px-4 pt-5">
        <CategoryHero category={activeCat} devices={byCategory.get(activeCategory) ?? []} />
      </section>

      {/* Grid dispositivos */}
      <section className="max-w-3xl mx-auto px-4 pt-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {(byCategory.get(activeCategory) ?? []).map(device => (
            <DeviceCard
              key={device.id}
              device={device}
              category={activeCat}
              onToggle={value => onToggle(device, value)}
              onOpen={() => (device.is_installed ? setSelected(device) : onNotInstalled(device))}
            />
          ))}
        </div>
      </section>

      {/* Jarvis FAB */}
      <button
        onClick={() => setJarvisOpen(true)}
        className="fixed bottom-24 right-5 z-40 flex items-center gap-2 pl-4 pr-5 py-3 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 text-zinc-950 font-semibold shadow-2xl shadow-rose-500/30 hover:scale-105 active:scale-95 transition-transform"
      >
        <Mic className="w-5 h-5" />
        Hablar con Jarvis
      </button>

      {/* Drawer control individual */}
      <Drawer open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DrawerContent className="bg-zinc-950 border-zinc-800 text-zinc-100">
          {selected && (
            <DeviceControl
              device={selected}
              category={CATEGORIES.find(c => c.id === selected.category)!}
              onChange={patch => updateDevice(selected.id, patch)}
              onClose={() => setSelected(null)}
            />
          )}
        </DrawerContent>
      </Drawer>

      {/* Jarvis modal */}
      <Dialog open={jarvisOpen} onOpenChange={setJarvisOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic className="w-5 h-5 text-amber-400" />
              Jarvis
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Escribe lo que quieras (pronto también por voz). Ejemplo: "Apaga todas las luces".
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              autoFocus
              value={jarvisText}
              onChange={e => setJarvisText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendJarvis()}
              placeholder="Apaga la luz de la sala…"
              className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
            />
            <Button onClick={sendJarvis} className="bg-amber-400 text-zinc-950 hover:bg-amber-300">
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">
            En esta versión el comando solo se registra. La ejecución real se conectará a tu Raspberry Pi.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- subcomponentes ---------- */

function CategoryHero({
  category,
  devices,
}: {
  category: DomoticaCategory;
  devices: DomoticaDevice[];
}) {
  const Icon = category.icon;
  const installed = devices.filter(d => d.is_installed);
  const on = installed.filter(d => d.is_on).length;
  return (
    <div className={cn("rounded-2xl border border-zinc-800 p-4 flex items-center gap-4", category.bgClass)}>
      <div className={cn("w-12 h-12 rounded-2xl bg-zinc-950/40 flex items-center justify-center", category.colorClass)}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1">
        <p className="text-sm text-zinc-300">{category.label}</p>
        <p className="text-lg font-semibold">
          {on} encendidos
          <span className="text-zinc-400 font-normal text-sm"> · {installed.length} instalados · {devices.length - installed.length} disponibles</span>
        </p>
      </div>
    </div>
  );
}

function DeviceCard({
  device,
  category,
  onToggle,
  onOpen,
}: {
  device: DomoticaDevice;
  category: DomoticaCategory;
  onToggle: (v: boolean) => void;
  onOpen: () => void;
}) {
  const Icon = device.icon;
  const installed = device.is_installed;
  const on = !!device.is_on;
  return (
    <div
      className={cn(
        "relative rounded-2xl border p-3 flex flex-col gap-3 transition-all min-h-[140px]",
        installed
          ? on
            ? "bg-zinc-900 border-zinc-700 shadow-lg"
            : "bg-zinc-900/60 border-zinc-800"
          : "bg-zinc-900/30 border-zinc-800/60",
      )}
    >
      <button
        onClick={onOpen}
        className="flex-1 flex flex-col items-start gap-2 text-left"
      >
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
            installed
              ? on
                ? cn(category.bgClass, category.colorClass)
                : "bg-zinc-800 text-zinc-500"
              : "bg-zinc-800/40 text-zinc-600 opacity-50",
          )}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-h-[36px]">
          <p
            className={cn(
              "text-sm font-medium leading-tight",
              installed ? "text-zinc-100" : "text-zinc-500",
            )}
          >
            {device.name}
          </p>
          {!installed && (
            <p className="text-[10px] text-zinc-500 flex items-center gap-1 mt-1">
              <Lock className="w-3 h-3" /> No instalado
            </p>
          )}
        </div>
      </button>

      {installed ? (
        <div className="flex items-center justify-between">
          <span className={cn("text-[11px]", on ? "text-emerald-400" : "text-zinc-500")}>
            {on ? "Encendido" : "Apagado"}
          </span>
          <Switch checked={on} onCheckedChange={onToggle} />
        </div>
      ) : (
        <button
          onClick={onOpen}
          className="flex items-center justify-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 border border-dashed border-zinc-700 rounded-lg py-1.5"
        >
          <Plus className="w-3 h-3" /> Solicitar instalación
        </button>
      )}
    </div>
  );
}

function DeviceControl({
  device,
  category,
  onChange,
  onClose,
}: {
  device: DomoticaDevice;
  category: DomoticaCategory;
  onChange: (patch: Partial<DomoticaDevice>) => void;
  onClose: () => void;
}) {
  const Icon = device.icon;
  return (
    <>
      <DrawerHeader>
        <div className="flex items-center gap-3">
          <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", category.bgClass, category.colorClass)}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="flex-1 text-left">
            <DrawerTitle className="text-zinc-100">{device.name}</DrawerTitle>
            <DrawerDescription className="text-zinc-400">{category.label}</DrawerDescription>
          </div>
          <Switch
            checked={!!device.is_on}
            onCheckedChange={v => onChange({ is_on: v })}
          />
        </div>
      </DrawerHeader>

      <div className="px-4 pb-2 space-y-6">
        {device.control === "dimmer" && (
          <ControlRow label="Brillo" value={`${device.value ?? 0}%`}>
            <Slider
              value={[device.value ?? 0]}
              onValueChange={([v]) => onChange({ value: v, is_on: v > 0 })}
              min={0}
              max={100}
              step={5}
            />
          </ControlRow>
        )}

        {device.control === "blinds" && (
          <ControlRow label="Apertura" value={`${device.value ?? 0}%`}>
            <Slider
              value={[device.value ?? 0]}
              onValueChange={([v]) => onChange({ value: v, is_on: v > 0 })}
              min={0}
              max={100}
              step={10}
            />
          </ControlRow>
        )}

        {device.control === "thermostat" && (
          <ControlRow label="Temperatura" value={`${device.temp ?? 24}°C`}>
            <Slider
              value={[device.temp ?? 24]}
              onValueChange={([v]) => onChange({ temp: v })}
              min={16}
              max={30}
              step={1}
            />
          </ControlRow>
        )}

        {device.control === "camera" && (
          <div className="aspect-video rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 text-sm">
            Vista en vivo (próximamente)
          </div>
        )}

        {device.control === "toggle" && (
          <p className="text-sm text-zinc-400">
            Usa el interruptor de arriba para encender o apagar este dispositivo.
          </p>
        )}
      </div>

      <DrawerFooter>
        <Button variant="outline" onClick={onClose} className="bg-zinc-900 border-zinc-800 text-zinc-100 hover:bg-zinc-800">
          Cerrar
        </Button>
      </DrawerFooter>
    </>
  );
}

function ControlRow({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-zinc-300">{label}</span>
        <span className="text-sm font-semibold text-zinc-100">{value}</span>
      </div>
      {children}
    </div>
  );
}
