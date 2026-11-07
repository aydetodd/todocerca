// Cache bust: 2025-12-17T10:00:00
import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Comparativa from './pages/Comparativa';
import Index from './pages/Index';
import PublicTransport from './pages/PublicTransport';
import { applyTheme, getStoredTheme } from "./hooks/useTheme";
import "./index.css";
import { startDataUsageMeter } from "./lib/dataUsage";

// Aplica el tema guardado (claro por defecto) antes del primer render
applyTheme(getStoredTheme());
startDataUsageMeter();

const AppWrapper = lazy(() => import('./AppWrapper'));
const publicDocument = ['/comparativa', '/landing', '/buscar-transporte'].includes(window.location.pathname.replace(/\/$/, ''));

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
  <StrictMode>
    {publicDocument ? <BrowserRouter><Routes><Route path="/comparativa" element={<Comparativa/>}/><Route path="/landing" element={<Index/>}/><Route path="/buscar-transporte" element={<PublicTransport/>}/></Routes></BrowserRouter> : <Suspense fallback={null}><AppWrapper /></Suspense>}
  </StrictMode>
);