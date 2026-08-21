import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const ACTION_W = 64;
const LONG_PRESS_MS = 480;
const MOVE_PX = 8;

export type SwipeAction = {
  key: string;
  label: string;
  icon: ReactNode;
  className: string;
  onClick: () => void;
};

export function SwipeableRow({
  children,
  actions,
  onOpen,
  className,
  disabled,
  longPressToOpen = false,
}: {
  children: ReactNode;
  actions: SwipeAction[];
  onOpen?: () => void;
  className?: string;
  disabled?: boolean;
  longPressToOpen?: boolean;
}) {
  const openX = -(ACTION_W * actions.length);
  const [x, setX] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const origin = useRef(0);
  const axis = useRef<"h" | "v" | null>(null);
  const dragged = useRef(false);
  const pointerId = useRef<number | null>(null);
  const pointerType = useRef("");
  const xRef = useRef(0);
  const onOpenRef = useRef(onOpen);
  const openXRef = useRef(openX);
  const holdTimer = useRef(0);
  const openedHold = useRef(false);
  const longPressRef = useRef(longPressToOpen);
  xRef.current = x;
  onOpenRef.current = onOpen;
  openXRef.current = openX;
  longPressRef.current = longPressToOpen;

  function clearHold() {
    window.clearTimeout(holdTimer.current);
    holdTimer.current = 0;
  }

  function finish(openEvent: boolean) {
    if (pointerId.current == null) return;
    const id = pointerId.current;
    const wasH = axis.current === "h";
    const wasDrag = dragged.current;
    const from = origin.current;
    const snap = openXRef.current;
    const held = openedHold.current;
    const mouse = pointerType.current === "mouse";
    pointerId.current = null;
    axis.current = null;
    dragged.current = false;
    openedHold.current = false;
    clearHold();
    const el = surfaceRef.current;
    if (el?.hasPointerCapture(id)) {
      try {
        el.releasePointerCapture(id);
      } catch {
        /* already released */
      }
    }

    if (wasH) {
      setX((cur) => (cur < snap / 2 ? snap : 0));
      return;
    }
    if (from !== 0) {
      setX(0);
      return;
    }
    if (held) return;
    if (!openEvent || wasDrag) return;
    if (!longPressRef.current || mouse) onOpenRef.current?.();
  }

  const finishRef = useRef(finish);
  finishRef.current = finish;

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled || e.button !== 0) return;
    pointerId.current = e.pointerId;
    pointerType.current = e.pointerType;
    startX.current = e.clientX;
    startY.current = e.clientY;
    origin.current = xRef.current;
    axis.current = null;
    dragged.current = false;
    openedHold.current = false;
    clearHold();
    if (longPressRef.current && origin.current === 0 && onOpenRef.current) {
      holdTimer.current = window.setTimeout(() => {
        if (pointerId.current == null || dragged.current || axis.current === "h") return;
        openedHold.current = true;
        clearHold();
        onOpenRef.current?.();
      }, LONG_PRESS_MS);
    }
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerId !== pointerId.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (!axis.current) {
      if (Math.abs(dx) < MOVE_PX && Math.abs(dy) < MOVE_PX) return;
      clearHold();
      axis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (axis.current === "h") {
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      } else {
        finish(false);
        return;
      }
    }
    if (axis.current !== "h") return;
    dragged.current = true;
    e.preventDefault();
    setX(Math.min(0, Math.max(openXRef.current - 24, origin.current + dx)));
  }

  useEffect(() => {
    function onWinUp(e: globalThis.PointerEvent) {
      if (pointerId.current == null || e.pointerId !== pointerId.current) return;
      finishRef.current(true);
    }
    window.addEventListener("pointerup", onWinUp, true);
    window.addEventListener("pointercancel", onWinUp, true);
    return () => {
      window.removeEventListener("pointerup", onWinUp, true);
      window.removeEventListener("pointercancel", onWinUp, true);
    };
  }, []);

  useEffect(() => {
    if (x === 0) return;
    function onDocDown(e: globalThis.PointerEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      setX(0);
    }
    document.addEventListener("pointerdown", onDocDown);
    return () => document.removeEventListener("pointerdown", onDocDown);
  }, [x]);

  return (
    <div ref={rootRef} className={cn("relative overflow-hidden rounded-lg", className)}>
      <div className="absolute inset-y-0 right-0 flex">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            className={cn(
              "flex w-16 flex-col items-center justify-center gap-1 text-white",
              action.className,
            )}
            onClick={(ev) => {
              ev.stopPropagation();
              setX(0);
              action.onClick();
            }}
          >
            {action.icon}
            <span className="text-[0.625rem] font-medium">{action.label}</span>
          </button>
        ))}
      </div>
      <div
        ref={surfaceRef}
        className="relative touch-pan-y select-none bg-card transition-transform duration-150 ease-out [&_img]:pointer-events-none [&_img]:[-webkit-user-drag:none]"
        style={{ transform: `translateX(${x}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={disabled ? undefined : onPointerMove}
        onContextMenu={longPressToOpen ? (e) => e.preventDefault() : undefined}
        onClick={disabled ? () => onOpenRef.current?.() : undefined}
        onLostPointerCapture={() => finishRef.current(false)}
        onDragStart={(e) => e.preventDefault()}
      >
        {children}
      </div>
    </div>
  );
}
