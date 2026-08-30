import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyChromeStyle,
  DESKTOP_MQ,
  persistChromePreference,
  readChromePreference,
  resolveChromeStyle,
  type ChromePreference,
  type ChromeStyle,
} from "@/lib/platform";
import { applyTheme, readTheme } from "@/lib/theme";

type ChromeContextValue = {
  preference: ChromePreference;
  chrome: ChromeStyle;
  setChrome: (next: ChromePreference) => void;
};

const ChromeContext = createContext<ChromeContextValue | null>(null);

function useWideViewport(): boolean {
  const [wide, setWide] = useState(resolveChromeStyle("auto") === "desktop");
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return wide;
}

export function ChromeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ChromePreference>(readChromePreference);
  const wide = useWideViewport();
  const chrome = resolveChromeStyle(preference, wide);

  useEffect(() => {
    applyChromeStyle(chrome);
    applyTheme(readTheme());
  }, [chrome]);

  const value = useMemo<ChromeContextValue>(
    () => ({
      preference,
      chrome,
      setChrome(next) {
        persistChromePreference(next);
        setPreference(next);
      },
    }),
    [preference, chrome],
  );

  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}

export function useChrome(): ChromeContextValue {
  const ctx = useContext(ChromeContext);
  if (!ctx) throw new Error("useChrome außerhalb von ChromeProvider.");
  return ctx;
}
