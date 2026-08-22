import { useEffect } from "react";

export type LiveKind = "calendar" | "mail" | "contacts";

export function useLiveSync(onChange: (kind: LiveKind) => void): void {
  useEffect(() => {
    let es: EventSource | null = null;
    let retry = 0;
    let timer = 0;
    const start = () => {
      es = new EventSource("/api/sync/stream", { withCredentials: true });
      es.addEventListener("change", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as { kind?: LiveKind };
          if (data.kind) onChange(data.kind);
        } catch {
          /* ignore */
        }
      });
      es.onerror = () => {
        es?.close();
        es = null;
        retry = Math.min(retry + 1, 6);
        timer = window.setTimeout(start, 2000 * retry);
      };
    };
    start();
    return () => {
      window.clearTimeout(timer);
      es?.close();
    };
  }, [onChange]);
}
