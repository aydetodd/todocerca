import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AppWrapper from "./AppWrapper";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

// Force Vite to re-optimize dependencies
createRoot(rootElement).render(
  <StrictMode>
    <AppWrapper />
  </StrictMode>
);
