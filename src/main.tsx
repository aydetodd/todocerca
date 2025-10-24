import React from "react";
import { createRoot } from "react-dom/client";
import AppWrapper from "./AppWrapper";
import "./index.css";

// Force Vite to rebuild React dependencies
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppWrapper />
  </React.StrictMode>
);
