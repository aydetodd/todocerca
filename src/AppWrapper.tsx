// AppWrapper v2025-12-17-fix - stable React instance
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { GlobalProviderTracking } from "@/components/GlobalProviderTracking";
import { GlobalGroupTracking } from "@/components/GlobalGroupTracking";
import { useRegistrationNotifications } from "@/hooks/useRegistrationNotifications";
import Home from "./pages/Home";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import DashboardMain from "./pages/DashboardMain";
import MapView from "./pages/MapView";
import ProductSearch from "./pages/ProductSearch";
import Profile from "./pages/Profile";
import ProviderProfile from "./pages/ProviderProfile";
import MiPerfil from "./pages/MiPerfil";
import MisProductos from "./pages/MisProductos";
import GestionPedidos from "./pages/GestionPedidos";
import TrackingGPS from "./pages/TrackingGPS";
import JoinGroup from "./pages/JoinGroup";
import GpsReports from "./pages/GpsReports";
import MessagesInbox from "./pages/MessagesInbox";
import AddContact from "./pages/AddContact";
import Favoritos from "./pages/Favoritos";
import NotFound from "./pages/NotFound";

// Component to activate registration notifications
const RegistrationNotifier = () => {
  useRegistrationNotifications();
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
        {/* Notificaciones de nuevos registros */}
        <RegistrationNotifier />
        {/* Tracking global de ubicación para proveedores */}
        <GlobalProviderTracking />
        {/* Tracking global para grupos (tracking_member_locations) */}
        <GlobalGroupTracking />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/landing" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/dashboard" element={<DashboardMain />} />
          <Route path="/mi-perfil" element={<MiPerfil />} />
          <Route path="/mis-productos" element={<MisProductos />} />
          <Route path="/gestion-pedidos" element={<GestionPedidos />} />
          <Route path="/mapa" element={<MapView />} />
          <Route path="/tracking-gps" element={<TrackingGPS />} />
          <Route path="/join-group" element={<JoinGroup />} />
          <Route path="/gps-reports" element={<GpsReports />} />
          <Route path="/search" element={<ProductSearch />} />
          <Route path="/mensajes" element={<MessagesInbox />} />
          <Route path="/agregar-contacto" element={<AddContact />} />
          <Route path="/favoritos" element={<Favoritos />} />
          <Route path="/proveedor/:proveedorId" element={<ProviderProfile />} />
          <Route path="/:consecutiveNumber" element={<ProviderProfile />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Toaster />
        <Sonner />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
