import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { ThemeProvider } from "@/components/ThemeProvider";
import { applyTheme, readTheme } from "@/lib/theme";
import { applyFontScale, readFontScale } from "@/lib/fontScale";
import { applyChromeStyle, readChromeStyle } from "@/lib/platform";
import { ChromeProvider } from "@/components/ChromeProvider";
import "./index.css";

applyFontScale(readFontScale());
applyChromeStyle(readChromeStyle());
applyTheme(readTheme());
registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <ChromeProvider>
        <App />
      </ChromeProvider>
    </ThemeProvider>
  </StrictMode>,
);
