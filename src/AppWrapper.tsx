// AppWrapper v2025-01-27 - Global notifications for all pages
import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { GlobalProviderTracking } from "@/components/GlobalProviderTracking";
import { GlobalGroupTracking } from "@/components/GlobalGroupTracking";
import { GlobalSOSListener } from "@/components/GlobalSOSListener";
import { useRegistrationNotifications } from "@/hooks/useRegistrationNotifications";
import { useGlobalNotifications } from "@/hooks/useGlobalNotifications";
import { SplashScreen } from "@/components/SplashScreen";
import { useAuth } from "@/hooks/useAuth";
import Home from "./pages/Home";
import MainHome from "./pages/MainHome";
import Proximamente from "./pages/Proximamente";
import Panel from "./pages/Panel";
import AdminQuickAccess from "./pages/AdminQuickAccess";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import DashboardMain from "./pages/DashboardMain";
import MapView from "./pages/MapView";
import ProductSearch from "./pages/ProductSearch";

import ProviderProfile from "./pages/ProviderProfile";
import MiPerfil from "./pages/MiPerfil";
import MisProductos from "./pages/MisProductos";
import MisRutas from "./pages/MisRutas";
import GestionPedidos from "./pages/GestionPedidos";
import TrackingGPS from "./pages/TrackingGPS";
import JoinGroup from "./pages/JoinGroup";
import GpsReports from "./pages/GpsReports";
import MessagesInbox from "./pages/MessagesInbox";
import AddContact from "./pages/AddContact";
import Favoritos from "./pages/Favoritos";
import Donar from "./pages/Donar";
import Extraviados from "./pages/Extraviados";
import Votaciones from "./pages/Votaciones";
import CrearVotacion from "./pages/CrearVotacion";
import VotacionDetalle from "./pages/VotacionDetalle";
import Privacidad from "./pages/Privacidad";
import EliminarCuenta from "./pages/EliminarCuenta";
import NotFound from "./pages/NotFound";
import Domotica from "./pages/Domotica";
import GpsLocationPage from "./pages/GpsLocationPage";
import SOSView from "./pages/SOSView";
import AcceptDriverInvite from "./pages/AcceptDriverInvite";
import QrBoletos from "./pages/QrBoletos";
import WalletFamiliar from "./pages/WalletFamiliar";
import Qard from "./pages/Qard";
import QardCobrar from "./pages/QardCobrar";
import QardServicios from "./pages/QardServicios";
import ComprarBoletos from "./pages/ComprarBoletos";
// GenerarQr removed - QR codes are now generated automatically on purchase
import HistorialBoletos from "./pages/HistorialBoletos";
import ValidarQr from "./pages/ValidarQr";
import PanelMaquiladora from "./pages/PanelMaquiladora";
import PanelConcesionarioHub from "./pages/PanelConcesionarioHub";
import PanelConcesionario from "./pages/PanelConcesionario";
import PanelConcesionarioPrivado from "./pages/PanelConcesionarioPrivado";
import PanelConcesionarioForaneo from "./pages/PanelConcesionarioForaneo";
import FlotaMonitoreo from "./pages/FlotaMonitoreo";
import AcceptEmployeeInvite from "./pages/AcceptEmployeeInvite";
import SolicitudDescuento from "./pages/SolicitudDescuento";
import TodoCercaTv from "./pages/TodoCercaTv";
import ReportesCiudadanos from "./pages/ReportesCiudadanos";
import ComoFunciona from "./pages/ComoFunciona";
import Eventos from "./pages/Eventos";
import PaseEvento from "./pages/PaseEvento";
import { NavigationBar } from "@/components/NavigationBar";
import { AdminFloatingButton } from "@/components/AdminFloatingButton";
import { TestigoFloatingButton } from "@/components/TestigoFloatingButton";
import { ClaveUniversalGate } from "@/components/ClaveUniversalGate";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MiTrazabilidad from "./pages/MiTrazabilidad";
import { AccessGate } from "@/components/AccessGate";
import { useDeviceVerification } from "@/hooks/useDeviceVerification";
import { useSingleSession } from "@/hooks/useSingleSession";

// Component to activate global notifications
const GlobalNotificationsProvider = () => {
  useRegistrationNotifications();
  useGlobalNotifications();
  return null;
};

// Rutas públicas exentas de verificación de dispositivo
const PUBLIC_PATHS = ["/auth", "/sos/", "/chofer-invitacion", "/empleado-invitacion", "/join-group", "/proveedor/", "/privacidad", "/eliminar-cuenta", "/landing", "/como-funciona"];

const AccessGateProvider = () => {
  const location = useLocation();
  const { status: deviceStatus, recheck: recheckDevice } = useDeviceVerification();
  const { status: sessionStatus, blockedInfo, recheck: recheckSession } = useSingleSession();

  const isPublic = PUBLIC_PATHS.some((p) => location.pathname.startsWith(p));
  if (isPublic) return null;

  const needsDevice = deviceStatus === "needs_verification";
  const blocked = sessionStatus === "blocked";
  if (!needsDevice && !blocked) return null;

  return (
    <AccessGate
      motivo={needsDevice ? "dispositivo" : "sesion"}
      sesionEn={blockedInfo}
      onVerified={() => {
        recheckDevice();
        recheckSession();
      }}
    />
  );
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
        staleTime: 60 * 1000,
        retry: 1,
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
        {/* Validación única de acceso (dispositivo + sesión única) por correo */}
        <AccessGateProvider />
        <NavigationBar />
        <AdminFloatingButton />
        <TestigoFloatingButton />
        <ClaveUniversalGate />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/home" element={<MainHome />} />
          <Route path="/panel" element={<Panel />} />
          <Route path="/admin" element={<AdminQuickAccess />} />
          <Route path="/beto" element={<AdminQuickAccess />} />
          <Route path="/landing" element={<Index />} />
          <Route path="/como-funciona" element={<ComoFunciona />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/mi-perfil" element={<MiPerfil />} />
          <Route
            path="/mi-trazabilidad"
            element={
              <ErrorBoundary
                name="MiTrazabilidad"
                fallback={
                  <div className="min-h-screen flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
                    No se pudo abrir tu mapa de trazabilidad. Recarga la página e inténtalo de nuevo.
                  </div>
                }
              >
                <MiTrazabilidad />
              </ErrorBoundary>
            }
          />
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
          {/* Protocolo 1 + 2 + 3: módulos pausados redirigen a Próximamente */}
          <Route path="/votaciones" element={<Navigate to="/proximamente" replace />} />
          <Route path="/votaciones/crear" element={<Navigate to="/proximamente" replace />} />
          <Route path="/votaciones/:id" element={<Navigate to="/proximamente" replace />} />
          <Route path="/sos/:token" element={<Navigate to="/proximamente" replace />} />
          <Route path="/tv" element={<Navigate to="/proximamente" replace />} />
          <Route path="/reportes-ciudadanos" element={<Navigate to="/proximamente" replace />} />
          <Route path="/domotica" element={<Navigate to="/proximamente" replace />} />
          <Route path="/chofer-invitacion" element={<AcceptDriverInvite />} />
          <Route path="/empleado-invitacion" element={<AcceptEmployeeInvite />} />
          <Route path="/proveedor/:proveedorId" element={<ProviderProfile />} />
          {/* Wallet QR Boletos */}
          <Route path="/wallet/qr-boletos" element={<QrBoletos />} />
          <Route path="/wallet/qr-boletos/comprar" element={<ComprarBoletos />} />
          <Route path="/wallet/familiar" element={<WalletFamiliar />} />
          {/* GenerarQr route removed - QR codes generated automatically on purchase */}
          <Route path="/wallet/qr-boletos/historial" element={<HistorialBoletos />} />
          {/* QaRd — Billetera universal */}
          <Route path="/qard" element={<Qard />} />
          <Route path="/qard/cobrar" element={<QardCobrar />} />
          <Route path="/qard/servicios" element={<QardServicios />} />
          <Route path="/wallet/qr-boletos/validar" element={<ValidarQr />} />
          <Route path="/wallet/qr-boletos/descuento" element={<SolicitudDescuento />} />
          <Route path="/panel-concesionario" element={<PanelConcesionarioHub />} />
          <Route path="/panel-concesionario/publico" element={<PanelConcesionario />} />
          <Route path="/panel-concesionario/privado" element={<PanelConcesionarioPrivado />} />
          <Route path="/panel-concesionario/foraneo" element={<PanelConcesionarioForaneo />} />
          <Route path="/flota-monitoreo" element={<FlotaMonitoreo />} />
          <Route path="/panel-maquiladora" element={<PanelMaquiladora />} />
          <Route path="/proximamente" element={<Proximamente />} />
          <Route path="/:consecutiveNumber" element={<ProviderProfile />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Toaster />
        <Sonner />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
