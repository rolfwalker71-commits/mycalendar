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

function ignoreOpen(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("[data-swipe-ignore]"));
}

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
  const [locked, setLocked] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const origin = useRef(0);
  const axis = useRef<"h" | "v" | null>(null);
  const dragged = useRef(false);
  const active = useRef(false);
  const pointerId = useRef<number | null>(null);
  const pointerType = useRef("");
  const downTarget = useRef<EventTarget | null>(null);
  const xRef = useRef(0);
  const onOpenRef = useRef(onOpen);
  const openXRef = useRef(openX);
  const holdTimer = useRef(0);
  const openedHold = useRef(false);
  const longPressRef = useRef(longPressToOpen);
  const disabledRef = useRef(disabled);
  const swipedAt = useRef(0);
  xRef.current = x;
  onOpenRef.current = onOpen;
  openXRef.current = openX;
  longPressRef.current = longPressToOpen;
  disabledRef.current = disabled;

  function clearHold() {
    window.clearTimeout(holdTimer.current);
    holdTimer.current = 0;
  }

  function finish(openEvent: boolean) {
    if (!active.current) return;
    const wasH = axis.current === "h";
    const wasDrag = dragged.current;
    const from = origin.current;
    const snap = openXRef.current;
    const held = openedHold.current;
    const mouse = pointerType.current === "mouse";
    const skipOpen = ignoreOpen(downTarget.current);
    active.current = false;
    pointerId.current = null;
    axis.current = null;
    dragged.current = false;
    openedHold.current = false;
    downTarget.current = null;
    clearHold();
    setLocked(false);

    if (wasH || wasDrag) swipedAt.current = Date.now();

    if (wasH) {
      setX((cur) => (cur < snap / 2 ? snap : 0));
      return;
    }
    if (from !== 0) {
      setX(0);
      return;
    }
    if (held || skipOpen) return;
    if (!openEvent || wasDrag) return;
    if (!longPressRef.current || mouse) onOpenRef.current?.();
  }

  const finishRef = useRef(finish);
  finishRef.current = finish;

  function applyMove(clientX: number, clientY: number, ev?: { preventDefault(): void; cancelable: boolean }) {
    if (!active.current || disabledRef.current) return;
    const dx = clientX - startX.current;
    const dy = clientY - startY.current;
    if (!axis.current) {
      if (Math.abs(dx) < MOVE_PX && Math.abs(dy) < MOVE_PX) return;
      clearHold();
      axis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (axis.current === "h") {
        setLocked(true);
        if (ev?.cancelable) ev.preventDefault();
      } else {
        finishRef.current(false);
        return;
      }
    }
    if (axis.current !== "h") return;
    dragged.current = true;
    if (ev?.cancelable) ev.preventDefault();
    setX(Math.min(0, Math.max(openXRef.current - 24, origin.current + dx)));
  }

  const applyMoveRef = useRef(applyMove);
  applyMoveRef.current = applyMove;

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled || e.button !== 0) return;
    active.current = true;
    pointerId.current = e.pointerId;
    pointerType.current = e.pointerType;
    downTarget.current = e.target;
    startX.current = e.clientX;
    startY.current = e.clientY;
    origin.current = xRef.current;
    axis.current = null;
    dragged.current = false;
    openedHold.current = false;
    clearHold();
    if (longPressRef.current && origin.current === 0 && onOpenRef.current) {
      holdTimer.current = window.setTimeout(() => {
        if (!active.current || dragged.current || axis.current === "h") return;
        openedHold.current = true;
        clearHold();
        onOpenRef.current?.();
      }, LONG_PRESS_MS);
    }
  }

  useEffect(() => {
    function matchesPointer(e: globalThis.PointerEvent) {
      return pointerId.current == null || e.pointerId === pointerId.current;
    }

    function onWinMove(e: globalThis.PointerEvent) {
      if (!active.current || !matchesPointer(e)) return;
      applyMoveRef.current(e.clientX, e.clientY, e);
    }

    function onTouchMove(e: TouchEvent) {
      if (!active.current) return;
      const t = e.touches[0];
      if (!t) return;
      applyMoveRef.current(t.clientX, t.clientY, e);
    }

    function onWinUp(e: globalThis.PointerEvent) {
      if (!active.current || !matchesPointer(e)) return;
      finishRef.current(true);
    }

    function onWinCancel(e: globalThis.PointerEvent) {
      if (!active.current || !matchesPointer(e)) return;
      if (e.pointerType === "mouse") {
        finishRef.current(true);
        return;
      }
      pointerId.current = null;
    }

    function onTouchEnd() {
      if (!active.current) return;
      finishRef.current(true);
    }

    window.addEventListener("pointermove", onWinMove, { capture: true, passive: false });
    window.addEventListener("pointerup", onWinUp, true);
    window.addEventListener("pointercancel", onWinCancel, true);
    window.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    window.addEventListener("touchend", onTouchEnd, true);
    window.addEventListener("touchcancel", onTouchEnd, true);
    return () => {
      window.removeEventListener("pointermove", onWinMove, true);
      window.removeEventListener("pointerup", onWinUp, true);
      window.removeEventListener("pointercancel", onWinCancel, true);
      window.removeEventListener("touchmove", onTouchMove, true);
      window.removeEventListener("touchend", onTouchEnd, true);
      window.removeEventListener("touchcancel", onTouchEnd, true);
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
    <div ref={rootRef} className={cn("relative overflow-hidden rounded-2xl bg-card", className)}>
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
        className={cn(
          "relative select-none bg-card transition-transform duration-150 ease-out [&_img]:pointer-events-none [&_img]:[-webkit-user-drag:none]",
          locked ? "touch-none" : "touch-pan-y",
        )}
        style={{ transform: `translateX(${x}px)` }}
        onPointerDown={onPointerDown}
        onContextMenu={longPressToOpen ? (e) => e.preventDefault() : undefined}
        onClickCapture={(e) => {
          if (Date.now() - swipedAt.current < 400) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onClick={disabled ? () => onOpenRef.current?.() : undefined}
        onDragStart={(e) => e.preventDefault()}
      >
        {children}
      </div>
    </div>
  );
}
