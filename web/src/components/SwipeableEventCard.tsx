import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Copy, CalendarClock, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ACTION_W = 64;
const ACTIONS = 3;
const OPEN_X = -(ACTION_W * ACTIONS);

export function SwipeableEventCard({
  children,
  onOpen,
  onDelete,
  onDuplicate,
  onMove,
  className,
}: {
  children: ReactNode;
  onOpen: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: () => void;
  className?: string;
}) {
  const [x, setX] = useState(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const origin = useRef(0);
  const axis = useRef<"h" | "v" | null>(null);
  const dragged = useRef(false);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    startX.current = e.clientX;
    startY.current = e.clientY;
    origin.current = x;
    axis.current = null;
    dragged.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (!axis.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (axis.current !== "h") return;
    dragged.current = true;
    const next = Math.min(0, Math.max(OPEN_X - 24, origin.current + dx));
    setX(next);
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (axis.current !== "h") {
      if (!dragged.current) onOpen();
      return;
    }
    setX((cur) => (cur < OPEN_X / 2 ? OPEN_X : 0));
  }

  return (
    <div className={cn("relative overflow-hidden rounded-2xl", className)}>
      <div className="absolute inset-y-0 right-0 flex">
        <button
          type="button"
          className="flex w-16 flex-col items-center justify-center gap-1 bg-sky-600 text-white"
          onClick={(ev) => {
            ev.stopPropagation();
            setX(0);
            onMove();
          }}
        >
          <CalendarClock className="size-5" />
          <span className="text-[10px] font-medium">Verschieben</span>
        </button>
        <button
          type="button"
          className="flex w-16 flex-col items-center justify-center gap-1 bg-violet-600 text-white"
          onClick={(ev) => {
            ev.stopPropagation();
            setX(0);
            onDuplicate();
          }}
        >
          <Copy className="size-5" />
          <span className="text-[10px] font-medium">Kopie</span>
        </button>
        <button
          type="button"
          className="flex w-16 flex-col items-center justify-center gap-1 bg-red-600 text-white"
          onClick={(ev) => {
            ev.stopPropagation();
            setX(0);
            onDelete();
          }}
        >
          <Trash2 className="size-5" />
          <span className="text-[10px] font-medium">Löschen</span>
        </button>
      </div>
      <div
        className="relative touch-pan-y bg-card transition-transform duration-150 ease-out"
        style={{ transform: `translateX(${x}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </div>
  );
}
