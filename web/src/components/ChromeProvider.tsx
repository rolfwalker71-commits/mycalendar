import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyChromeStyle,
  persistChromeStyle,
  readChromeStyle,
  type ChromeStyle,
} from "@/lib/platform";
import { applyTheme, readTheme } from "@/lib/theme";

type ChromeContextValue = {
  chrome: ChromeStyle;
  setChrome: (next: ChromeStyle) => void;
};

const ChromeContext = createContext<ChromeContextValue | null>(null);

export function ChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChromeState] = useState<ChromeStyle>(() => {
    const initial = readChromeStyle();
    applyChromeStyle(initial);
    return initial;
  });

  const value = useMemo<ChromeContextValue>(
    () => ({
      chrome,
      setChrome(next) {
        persistChromeStyle(next);
        applyTheme(readTheme());
        setChromeState(next);
      },
    }),
    [chrome],
  );

  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}

export function useChrome(): ChromeContextValue {
  const ctx = useContext(ChromeContext);
  if (!ctx) throw new Error("useChrome außerhalb von ChromeProvider.");
  return ctx;
}
