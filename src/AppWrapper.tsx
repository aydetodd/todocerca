// Cache bust: 2025-12-14T22:10:00 - Remove next-themes
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
    },
  },
});

export default function AppWrapper() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
