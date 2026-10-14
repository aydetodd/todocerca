// Cache bust: 2025-12-17T10:00:00
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AppWrapper from "./AppWrapper";
import { applyTheme, getStoredTheme } from "./hooks/useTheme";
import "./index.css";
import { startDataUsageMeter } from "./lib/dataUsage";

// Aplica el tema guardado (claro por defecto) antes del primer render
applyTheme(getStoredTheme());
startDataUsageMeter();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
  <StrictMode>
    <AppWrapper />
  </StrictMode>
);