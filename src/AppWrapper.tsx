// AppWrapper v2026-05-06 - Lazy loading + faster initial bundle
import { useState, useEffect, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { GlobalProviderTracking } from "@/components/GlobalProviderTracking";
import { GlobalGroupTracking } from "@/components/GlobalGroupTracking";
import { GlobalSOSListener } from "@/components/GlobalSOSListener";
import { useRegistrationNotifications } from "@/hooks/useRegistrationNotifications";
import { useGlobalNotifications } from "@/hooks/useGlobalNotifications";
import { SplashScreen } from "@/components/SplashScreen";
import { useAuth } from "@/hooks/useAuth";

// Páginas críticas (eager) — primer render instantáneo
import Home from "./pages/Home";
import MainHome from "./pages/MainHome";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Páginas secundarias (lazy) — se cargan bajo demanda
const Panel = lazy(() => import("./pages/Panel"));
const Index = lazy(() => import("./pages/Index"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const MapView = lazy(() => import("./pages/MapView"));
const ProductSearch = lazy(() => import("./pages/ProductSearch"));
const ProviderProfile = lazy(() => import("./pages/ProviderProfile"));
const MiPerfil = lazy(() => import("./pages/MiPerfil"));
const MisProductos = lazy(() => import("./pages/MisProductos"));
const MisRutas = lazy(() => import("./pages/MisRutas"));
const GestionPedidos = lazy(() => import("./pages/GestionPedidos"));
const TrackingGPS = lazy(() => import("./pages/TrackingGPS"));
const JoinGroup = lazy(() => import("./pages/JoinGroup"));
const GpsReports = lazy(() => import("./pages/GpsReports"));
const MessagesInbox = lazy(() => import("./pages/MessagesInbox"));
const AddContact = lazy(() => import("./pages/AddContact"));
const Favoritos = lazy(() => import("./pages/Favoritos"));
const Donar = lazy(() => import("./pages/Donar"));
const Extraviados = lazy(() => import("./pages/Extraviados"));
const Votaciones = lazy(() => import("./pages/Votaciones"));
const CrearVotacion = lazy(() => import("./pages/CrearVotacion"));
const VotacionDetalle = lazy(() => import("./pages/VotacionDetalle"));
const Privacidad = lazy(() => import("./pages/Privacidad"));
const EliminarCuenta = lazy(() => import("./pages/EliminarCuenta"));
const GpsLocationPage = lazy(() => import("./pages/GpsLocationPage"));
const SOSView = lazy(() => import("./pages/SOSView"));
const AcceptDriverInvite = lazy(() => import("./pages/AcceptDriverInvite"));
const QrBoletos = lazy(() => import("./pages/QrBoletos"));
const ComprarBoletos = lazy(() => import("./pages/ComprarBoletos"));
const HistorialBoletos = lazy(() => import("./pages/HistorialBoletos"));
const ValidarQr = lazy(() => import("./pages/ValidarQr"));
const PanelMaquiladora = lazy(() => import("./pages/PanelMaquiladora"));
const PanelConcesionarioHub = lazy(() => import("./pages/PanelConcesionarioHub"));
const PanelConcesionario = lazy(() => import("./pages/PanelConcesionario"));
const PanelConcesionarioPrivado = lazy(() => import("./pages/PanelConcesionarioPrivado"));
const AcceptEmployeeInvite = lazy(() => import("./pages/AcceptEmployeeInvite"));
const SolicitudDescuento = lazy(() => import("./pages/SolicitudDescuento"));
const TodoCercaTv = lazy(() => import("./pages/TodoCercaTv"));
import { NavigationBar } from "@/components/NavigationBar";
import { DeviceVerificationGate } from "@/components/DeviceVerificationGate";
import { useDeviceVerification } from "@/hooks/useDeviceVerification";
import { SingleSessionGate } from "@/components/SingleSessionGate";

// Component to activate global notifications
const GlobalNotificationsProvider = () => {
  useRegistrationNotifications();
  useGlobalNotifications();
  return null;
};

// Rutas públicas exentas de verificación de dispositivo
const PUBLIC_PATHS = ["/auth", "/sos/", "/chofer-invitacion", "/empleado-invitacion", "/join-group", "/proveedor/", "/privacidad", "/eliminar-cuenta", "/landing"];

const DeviceVerificationProvider = () => {
  const location = useLocation();
  const { status, recheck } = useDeviceVerification();

  const isPublic = PUBLIC_PATHS.some((p) => location.pathname.startsWith(p));
  if (isPublic) return null;
  if (status !== "needs_verification") return null;

  return <DeviceVerificationGate onVerified={recheck} />;
};

// Direct navigation handler - after auth, go straight to main home
const NavigationHandler = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && location.pathname === '/') {
      if (user) {
        // Ir directamente al home principal (búsqueda, taxi, transporte, etc.)
        navigate('/home', { replace: true });
      } else {
        navigate('/auth', { replace: true });
      }
    }
  }, [loading, user, navigate, location.pathname]);

  return null;
};

export default function AppWrapper() {
  // QueryClient creado dentro del componente para evitar problemas de HMR
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 min — evita refetches innecesarios
        gcTime: 10 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* Notificaciones globales (pedidos, citas, taxi, registros) */}
        <GlobalNotificationsProvider />
        {/* Tracking global de ubicación para proveedores */}
        <GlobalProviderTracking />
        {/* Tracking global para grupos (tracking_member_locations) */}
        <GlobalGroupTracking />
        {/* Escucha global de alertas SOS */}
        <GlobalSOSListener />
        {/* Navigation Handler - redirects root to auth/home */}
        <NavigationHandler />
        {/* Verificación de dispositivo móvil nuevo */}
        <DeviceVerificationProvider />
        {/* Sesión única por usuario (bloqueo duro) */}
        <SingleSessionGate />
        <NavigationBar />
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/home" element={<MainHome />} />
            <Route path="/panel" element={<Panel />} />
            <Route path="/landing" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/mi-perfil" element={<MiPerfil />} />
            <Route path="/mis-productos" element={<MisProductos />} />
            <Route path="/mis-rutas" element={<MisRutas />} />
            <Route path="/gestion-pedidos" element={<GestionPedidos />} />
            <Route path="/mapa" element={<MapView />} />
            <Route path="/tracking-gps" element={<TrackingGPS />} />
            <Route path="/join-group" element={<JoinGroup />} />
            <Route path="/gps-reports" element={<GpsReports />} />
            {/* Rutas geográficas amigables para LATAM */}
            <Route path="/gps/:paisCode" element={<GpsLocationPage />} />
            <Route path="/gps/:paisCode/:nivel1Slug" element={<GpsLocationPage />} />
            <Route path="/gps/:paisCode/:nivel1Slug/:nivel2Slug" element={<GpsLocationPage />} />
            <Route path="/transporte/:paisCode" element={<GpsLocationPage basePath="/transporte" title="Rutas de Transporte" />} />
            <Route path="/transporte/:paisCode/:nivel1Slug" element={<GpsLocationPage basePath="/transporte" title="Rutas de Transporte" />} />
            <Route path="/transporte/:paisCode/:nivel1Slug/:nivel2Slug" element={<GpsLocationPage basePath="/transporte" title="Rutas de Transporte" />} />
            <Route path="/search" element={<ProductSearch />} />
            <Route path="/mensajes" element={<MessagesInbox />} />
            <Route path="/agregar-contacto" element={<AddContact />} />
            <Route path="/favoritos" element={<Favoritos />} />
            <Route path="/donar" element={<Donar />} />
            <Route path="/extraviados" element={<Extraviados />} />
            <Route path="/votaciones" element={<Votaciones />} />
            <Route path="/votaciones/crear" element={<CrearVotacion />} />
            <Route path="/votaciones/:id" element={<VotacionDetalle />} />
            <Route path="/sos/:token" element={<SOSView />} />
            <Route path="/chofer-invitacion" element={<AcceptDriverInvite />} />
            <Route path="/empleado-invitacion" element={<AcceptEmployeeInvite />} />
            <Route path="/proveedor/:proveedorId" element={<ProviderProfile />} />
            {/* Wallet QR Boletos */}
            <Route path="/wallet/qr-boletos" element={<QrBoletos />} />
            <Route path="/wallet/qr-boletos/comprar" element={<ComprarBoletos />} />
            <Route path="/wallet/qr-boletos/historial" element={<HistorialBoletos />} />
            <Route path="/wallet/qr-boletos/validar" element={<ValidarQr />} />
            <Route path="/wallet/qr-boletos/descuento" element={<SolicitudDescuento />} />
            <Route path="/panel-concesionario" element={<PanelConcesionarioHub />} />
            <Route path="/panel-concesionario/publico" element={<PanelConcesionario />} />
            <Route path="/panel-concesionario/privado" element={<PanelConcesionarioPrivado />} />
            {/* foráneo: pendiente */}
            <Route path="/panel-maquiladora" element={<PanelMaquiladora />} />
            <Route path="/tv" element={<TodoCercaTv />} />
            <Route path="/privacidad" element={<Privacidad />} />
            <Route path="/eliminar-cuenta" element={<EliminarCuenta />} />
            <Route path="/:consecutiveNumber" element={<ProviderProfile />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <Toaster />
        <Sonner />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
