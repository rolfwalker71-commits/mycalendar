import type { ReactNode } from "react";
import { Copy, CalendarClock, Trash2 } from "lucide-react";
import { SwipeableRow } from "@/components/SwipeableRow";

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
  return (
    <SwipeableRow
      className={className}
      onOpen={onOpen}
      actions={[
        {
          key: "move",
          label: "Verschieben",
          icon: <CalendarClock className="size-5" />,
          className: "bg-sky-600",
          onClick: onMove,
        },
        {
          key: "copy",
          label: "Kopie",
          icon: <Copy className="size-5" />,
          className: "bg-violet-600",
          onClick: onDuplicate,
        },
        {
          key: "delete",
          label: "Löschen",
          icon: <Trash2 className="size-5" />,
          className: "bg-red-600",
          onClick: onDelete,
        },
      ]}
    >
      {children}
    </SwipeableRow>
  );
}
