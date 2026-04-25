// AppWrapper v2025-01-27 - Global notifications for all pages
import { useState, useEffect } from "react";
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
import Home from "./pages/Home";
import MainHome from "./pages/MainHome";
import Panel from "./pages/Panel";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
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
import GpsLocationPage from "./pages/GpsLocationPage";
import SOSView from "./pages/SOSView";
import AcceptDriverInvite from "./pages/AcceptDriverInvite";
import QrBoletos from "./pages/QrBoletos";
import ComprarBoletos from "./pages/ComprarBoletos";
// GenerarQr removed - QR codes are now generated automatically on purchase
import HistorialBoletos from "./pages/HistorialBoletos";
import ValidarQr from "./pages/ValidarQr";
import PanelConcesionario from "./pages/PanelConcesionario";
import PanelMaquiladora from "./pages/PanelMaquiladora";
import AcceptEmployeeInvite from "./pages/AcceptEmployeeInvite";
import SolicitudDescuento from "./pages/SolicitudDescuento";
import { NavigationBar } from "@/components/NavigationBar";
import { DeviceVerificationGate } from "@/components/DeviceVerificationGate";
import { useDeviceVerification } from "@/hooks/useDeviceVerification";

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
        <NavigationBar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/home" element={<MainHome />} />
          <Route path="/panel" element={<Panel />} />
          <Route path="/landing" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          
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
          {/* GenerarQr route removed - QR codes generated automatically on purchase */}
          <Route path="/wallet/qr-boletos/historial" element={<HistorialBoletos />} />
          <Route path="/wallet/qr-boletos/validar" element={<ValidarQr />} />
          <Route path="/wallet/qr-boletos/descuento" element={<SolicitudDescuento />} />
          <Route path="/panel-concesionario" element={<PanelConcesionario />} />
          <Route path="/panel-maquiladora" element={<PanelMaquiladora />} />
          <Route path="/privacidad" element={<Privacidad />} />
          <Route path="/eliminar-cuenta" element={<EliminarCuenta />} />
          <Route path="/:consecutiveNumber" element={<ProviderProfile />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Toaster />
        <Sonner />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
