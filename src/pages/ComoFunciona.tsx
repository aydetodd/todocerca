import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Bus, MapPin, QrCode, CreditCard, Users, Shield, Wallet,
  TrendingUp, Route as RouteIcon, ArrowRight, CheckCircle2,
  Building2, User, Sparkles, Phone, Send, Store,
} from "lucide-react";

export default function ComoFunciona() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-40">
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary to-secondary text-primary-foreground">
        <div className="container mx-auto px-4 py-16 max-w-5xl text-center">
          <Badge variant="secondary" className="mb-4 bg-white/20 text-white border-white/30">
            TodoCerca — Transporte + QaRd
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Un solo sistema para mover a tu ciudad
          </h1>
          <p className="text-lg md:text-xl opacity-95 max-w-2xl mx-auto mb-8">
            Rastreo GPS en vivo, cobro por QR sin efectivo y una tarjeta digital
            gratis para pagar el camión, la tienda y transferirle a tu familia.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" variant="secondary" onClick={() => navigate("/auth")}>
              Crear mi cuenta gratis
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="bg-white/10 border-white/30 text-white hover:bg-white/20"
              onClick={() => document.getElementById("concesionario")?.scrollIntoView({ behavior: "smooth" })}
            >
              Soy concesionario <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      <main className="container mx-auto px-4 py-10 max-w-5xl space-y-16">
        {/* PARA EL USUARIO */}
        <section id="usuario">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <User className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-bold">Para el pasajero</h2>
              <p className="text-sm text-muted-foreground">
                Deja las monedas en casa. Sube, escanea, viaja.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <FeatureCard
              icon={<MapPin className="h-5 w-5" />}
              title="Ves el camión en vivo"
              text="Antes de salir de tu casa sabes dónde viene tu unidad y cuánto tarda."
            />
            <FeatureCard
              icon={<QrCode className="h-5 w-5" />}
              title="Pagas escaneando"
              text="Un QR y listo. Sin cambio, sin fila. En urbanas se cobra la tarifa fija."
            />
            <FeatureCard
              icon={<RouteIcon className="h-5 w-5" />}
              title="En foráneas pagas solo lo que recorres"
              text="Escaneas al subir (queda en stand), escaneas al bajar. El sistema cobra el tramo exacto."
            />
            <FeatureCard
              icon={<Users className="h-5 w-5" />}
              title="Sub-QRs para tu familia"
              text="Hasta 99 tarjetas hijas para esposa, hijos o papás. Con límite por transacción y horario."
            />
            <FeatureCard
              icon={<Wallet className="h-5 w-5" />}
              title="Recargas desde $200"
              text="Con tu tarjeta bancaria, sin comisión al recargar. Saldo hasta −$50 para que no te quedes tirado."
            />
            <FeatureCard
              icon={<Phone className="h-5 w-5" />}
              title="Chat por número de teléfono"
              text="Como WhatsApp: si te doy mi número, me escribes. Con opción de bloquear si es equivocado."
            />
          </div>
        </section>

        {/* PARA EL CONCESIONARIO */}
        <section id="concesionario">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-bold">Para el concesionario</h2>
              <p className="text-sm text-muted-foreground">
                Deja de administrar monedas. Empieza a administrar datos.
              </p>
            </div>
          </div>

          {/* Problema → Solución */}
          <Card className="mb-6 border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">El problema de hoy</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <p>• No sabes cuánta gente sube realmente a tus unidades.</p>
              <p>• El chofer maneja efectivo → fugas, robos, cuadres a mano.</p>
              <p>• Sin reportes duros, imposible renegociar tarifa o concesión.</p>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <FeatureCard
              icon={<MapPin className="h-5 w-5" />}
              title="Rastreo GPS en vivo"
              text="Tú, tu chofer y tus pasajeros ven cada unidad en el mapa en tiempo real."
            />
            <FeatureCard
              icon={<RouteIcon className="h-5 w-5" />}
              title="Conteo automático por geocercas"
              text="Defines punto A y punto B. Cada vuelta se cuenta sola, sin que el chofer toque nada."
            />
            <FeatureCard
              icon={<QrCode className="h-5 w-5" />}
              title="Cobro QR sin efectivo"
              text="Urbano tarifa fija. Foráneo con lógica sube-baja: cobra el tramo exacto por geocerca."
            />
            <FeatureCard
              icon={<TrendingUp className="h-5 w-5" />}
              title="Reportes diarios reales"
              text="Pasajeros subidos/bajados, hora, geocerca, monto cobrado. Exportable a CSV."
            />
            <FeatureCard
              icon={<Users className="h-5 w-5" />}
              title="Panel de choferes"
              text="Asigna unidad y ruta con un clic. Historial por chofer. Alertas SOS."
            />
            <FeatureCard
              icon={<Send className="h-5 w-5" />}
              title="Liquidación automática a tu CLABE"
              text="Diario, semanal o mensual — tú eliges. Comisión plana 6%, sin letras chiquitas."
            />
          </div>

          <Card className="mt-6 bg-muted/30">
            <CardContent className="pt-6">
              <p className="text-sm">
                <span className="font-semibold">Sin inversión en hardware.</span>{" "}
                El chofer usa su celular. Cero validadores de $15,000.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* QaRd */}
        <section id="qard">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-bold">QaRd — La tarjeta que lo cambia todo</h2>
              <p className="text-sm text-muted-foreground">
                Quiero Administrar mis Recursos de dinero.
              </p>
            </div>
          </div>

          <p className="text-sm md:text-base text-muted-foreground mb-6">
            Un número universal de <strong>16 dígitos</strong> (como una tarjeta bancaria) que sirve para pagar,
            cobrar, transferir y administrar dinero de tu familia. Sin banco, sin anualidad, sin comisión al usuario.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <QardRow icon={<Bus />} title="Pagar transporte" text="Escaneas el QR, se descuenta el saldo." />
            <QardRow icon={<Store />} title="Pagar en comercios" text="El comercio paga 6% de comisión. Tú NO pagas nada." />
            <QardRow icon={<Users />} title="Sub-QRs familiares" text="Hasta 99 tarjetas hijas con límite y horario." />
            <QardRow icon={<Send />} title="Transferencias GRATIS entre QaRds" text="Con tus 16 dígitos + CVV dinámico de 4 dígitos. Cero fraude." />
            <QardRow icon={<Wallet />} title="Retiros" text="En OXXO, por SPEI a tu banco, o a otra QaRd." />
            <QardRow icon={<Shield />} title="Doble CVV de seguridad" text="3 dígitos para compras. 4 dígitos para recibir transferencias (rota automático)." />
          </div>

          <Card className="mt-6 border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Por qué QaRd le gana al efectivo
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" /> No necesitas banco para tenerla.</p>
              <p className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Sin anualidad, sin mensualidad.</p>
              <p className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Saldo hasta −$50 de sobregiro.</p>
              <p className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Un solo número para transporte, tienda, familia y transferencias.</p>
            </CardContent>
          </Card>
        </section>

        {/* CTA final */}
        <section className="bg-gradient-to-r from-secondary to-primary text-white rounded-xl p-8 md:p-12 text-center">
          <h3 className="text-2xl md:text-3xl font-bold mb-3">¿Listo para empezar?</h3>
          <p className="opacity-95 mb-6 max-w-2xl mx-auto">
            Crea tu cuenta gratis en 2 minutos. Si eres concesionario, desde el panel podrás
            registrar tus unidades, choferes y rutas.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" variant="secondary" onClick={() => navigate("/auth")}>
              Crear cuenta
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="bg-white/10 border-white/30 text-white hover:bg-white/20"
              onClick={() => navigate("/mapa")}
            >
              Ver el mapa en vivo
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}

function FeatureCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            {icon}
          </div>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-sm">{text}</CardDescription>
      </CardContent>
    </Card>
  );
}

function QardRow({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-lg border bg-card">
      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{text}</p>
      </div>
    </div>
  );
}
