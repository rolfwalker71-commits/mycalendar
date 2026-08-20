import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const THRESHOLD = 68;

function isScrollable(el: HTMLElement): boolean {
  const oy = getComputedStyle(el).overflowY;
  return (oy === "auto" || oy === "scroll" || oy === "overlay") && el.scrollHeight > el.clientHeight + 1;
}

function canPullFrom(target: EventTarget | null): boolean {
  let el = target instanceof HTMLElement ? target : null;
  while (el) {
    if (isScrollable(el)) return el.scrollTop <= 2;
    el = el.parentElement;
  }
  return true;
}

export function PullToRefresh({
  onRefresh,
  children,
  className,
  disabled,
}: {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const offsetRef = useRef(0);
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onMove = (e: globalThis.TouchEvent) => {
      if (startY.current == null || disabled || refreshing) return;
      const y = e.touches[0]?.clientY ?? startY.current;
      const delta = y - startY.current;
      if (delta <= 0) {
        offsetRef.current = 0;
        setOffset(0);
        return;
      }
      if (e.cancelable) e.preventDefault();
      const next = Math.min(120, delta * 0.42);
      offsetRef.current = next;
      setOffset(next);
    };
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => el.removeEventListener("touchmove", onMove);
  }, [disabled, refreshing]);

  function onTouchStart(e: TouchEvent) {
    if (disabled || refreshing) return;
    if (!canPullFrom(e.target)) {
      startY.current = null;
      return;
    }
    startY.current = e.touches[0]?.clientY ?? null;
  }

  async function finish() {
    if (startY.current == null) return;
    const should = offsetRef.current >= THRESHOLD && !disabled && !refreshing;
    startY.current = null;
    if (!should) {
      offsetRef.current = 0;
      setOffset(0);
      return;
    }
    setRefreshing(true);
    offsetRef.current = THRESHOLD;
    setOffset(THRESHOLD);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      offsetRef.current = 0;
      setOffset(0);
    }
  }

  const shown = refreshing ? THRESHOLD : offset;
  const armed = shown >= THRESHOLD;

  return (
    <div
      ref={root}
      className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col", className)}
      onTouchStart={onTouchStart}
      onTouchEnd={() => void finish()}
      onTouchCancel={() => {
        startY.current = null;
        if (!refreshing) {
          offsetRef.current = 0;
          setOffset(0);
        }
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-2"
        style={{ opacity: shown ? Math.min(1, shown / THRESHOLD) : 0 }}
      >
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-full bg-card shadow-md ring-1 ring-border",
            armed || refreshing ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <LoaderCircle className={cn("size-4", refreshing || armed ? "animate-spin" : "")} />
        </span>
      </div>
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        style={{ transform: shown ? `translateY(${shown}px)` : undefined }}
      >
        {children}
      </div>
    </div>
  );
}
