import "./app/globals.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// Font loaded via <link> in index.html — set the CSS variable used by globals.css
document.documentElement.style.setProperty(
  "--font-sans",
  '"Plus Jakarta Sans", sans-serif',
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
