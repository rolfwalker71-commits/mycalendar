import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { ThemeProvider } from "@/components/ThemeProvider";
import { applyTheme, readTheme } from "@/lib/theme";
import { applyFontScale, readFontScale } from "@/lib/fontScale";
import "./index.css";

applyTheme(readTheme());
applyFontScale(readFontScale());
registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
