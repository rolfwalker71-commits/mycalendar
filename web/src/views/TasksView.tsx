import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { CalendarClock, Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateField } from "@/components/DateTimeFields";
import { SwipeableRow } from "@/components/SwipeableRow";
import { TaskEditor, dueToRfc, taskDueDay } from "@/components/TaskEditor";
import { apiClient, ApiError } from "@/lib/api";
import { now } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TaskItem } from "@/lib/types";

type GroupId = "overdue" | "today" | "soon" | "none" | "done";

const GROUP_LABEL: Record<GroupId, string> = {
  overdue: "Überfällig",
  today: "Heute",
  soon: "Demnächst",
  none: "Ohne Datum",
  done: "Erledigt",
};

function groupOf(task: TaskItem, today: DateTime): GroupId {
  if (task.status === "completed") return "done";
  const due = taskDueDay(task.due);
  if (!due) return "none";
  if (due < today) return "overdue";
  if (due.equals(today)) return "today";
  return "soon";
}

function dueLabel(task: TaskItem, today: DateTime): { text: string; overdue: boolean } {
  const due = taskDueDay(task.due);
  if (!due) return { text: "", overdue: false };
  if (due.equals(today)) return { text: "Heute", overdue: false };
  if (due.equals(today.plus({ days: 1 }))) return { text: "Morgen", overdue: false };
  return {
    text: due.toFormat("d. LLL"),
    overdue: due < today && task.status !== "completed",
  };
}

export function TasksView({
  tasks,
  error,
  onReload,
  compact,
  composeOpen,
  onComposeOpenChange,
}: {
  tasks: TaskItem[];
  error?: string | null;
  onReload: () => void;
  compact?: boolean;
  composeOpen?: boolean;
  onComposeOpenChange?: (open: boolean) => void;
}) {
  const [localCompose, setLocalCompose] = useState(false);
  const [edit, setEdit] = useState<TaskItem | null | "new">(null);
  const [moveTask, setMoveTask] = useState<TaskItem | null>(null);
  const [moveDate, setMoveDate] = useState("");
  const [showDone, setShowDone] = useState(false);
  const compose = composeOpen ?? localCompose;
  const setCompose = onComposeOpenChange ?? setLocalCompose;
  const today = now().startOf("day");

  const groups = useMemo(() => {
    const map: Record<GroupId, TaskItem[]> = {
      overdue: [],
      today: [],
      soon: [],
      none: [],
      done: [],
    };
    for (const task of tasks) {
      map[groupOf(task, today)].push(task);
    }
    for (const key of Object.keys(map) as GroupId[]) {
      map[key].sort((a, b) => {
        const da = taskDueDay(a.due)?.toMillis() ?? Number.MAX_SAFE_INTEGER;
        const db = taskDueDay(b.due)?.toMillis() ?? Number.MAX_SAFE_INTEGER;
        if (da !== db) return da - db;
        return a.title.localeCompare(b.title, "de");
      });
    }
    return map;
  }, [tasks, today]);

  async function toggle(task: TaskItem) {
    try {
      await apiClient.patchTask(task.listId, task.id, {
        status: task.status === "completed" ? "needsAction" : "completed",
      });
      onReload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Aufgabe fehlgeschlagen.");
    }
  }

  async function applyMove(task: TaskItem, iso: string | null) {
    try {
      await apiClient.patchTask(task.listId, task.id, { due: iso ? dueToRfc(iso) : null });
      setMoveTask(null);
      onReload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Datum nicht gespeichert.");
    }
  }

  async function remove(task: TaskItem) {
    try {
      await apiClient.deleteTask(task.listId, task.id);
      onReload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Löschen fehlgeschlagen.");
    }
  }

  const order: GroupId[] = ["overdue", "today", "soon", "none"];
  const openCount = order.reduce((n, id) => n + groups[id].length, 0);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", compact ? "gap-3" : "gap-5 pb-44 lg:pb-6")}>
      {error ? (
        <p className={cn("text-sm text-muted-foreground", !compact && "px-4 pt-3")}>
          {error}{" "}
          <a className="text-primary underline" href="/api/auth/google">
            Google erneut verbinden
          </a>
        </p>
      ) : null}

      {!compact ? (
        <p className="px-4 pt-3 text-sm text-muted-foreground">
          {openCount === 0 ? "Nichts offen" : `${openCount} offen`}
        </p>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Aufgaben</h2>
          <Button type="button" variant="ghost" size="icon" aria-label="Neue Aufgabe" onClick={() => setEdit("new")}>
            <Plus className="size-5" />
          </Button>
        </div>
      )}

      {openCount === 0 && !error ? (
        <p className={cn("text-sm text-muted-foreground", compact ? "" : "px-4")}>
          Keine offenen Aufgaben.
        </p>
      ) : null}

      {order.map((id) =>
        groups[id].length ? (
          <section key={id} className={compact ? "" : "px-3"}>
            <h2
              className={cn(
                "pb-2 text-sm font-medium",
                id === "overdue" ? "text-destructive" : "text-muted-foreground",
                compact && "px-0",
              )}
            >
              {GROUP_LABEL[id]}
            </h2>
            <ul className="flex flex-col gap-1.5">
              {groups[id].map((task) => (
                <li key={`${task.listId}-${task.id}`}>
                  <TaskRow
                    task={task}
                    today={today}
                    compact={compact}
                    onToggle={() => void toggle(task)}
                    onOpen={() => setEdit(task)}
                    onMove={() => {
                      setMoveTask(task);
                      setMoveDate(taskDueDay(task.due)?.toISODate() ?? "");
                    }}
                    onDelete={() => void remove(task)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}

      {groups.done.length ? (
        <section className={compact ? "" : "px-3"}>
          <button
            type="button"
            className="pb-2 text-sm font-medium text-muted-foreground"
            onClick={() => setShowDone((v) => !v)}
          >
            Erledigt ({groups.done.length})
          </button>
          {showDone ? (
            <ul className="flex flex-col gap-1.5">
              {groups.done.slice(0, 30).map((task) => (
                <li key={`${task.listId}-${task.id}`}>
                  <TaskRow
                    task={task}
                    today={today}
                    compact={compact}
                    onToggle={() => void toggle(task)}
                    onOpen={() => setEdit(task)}
                    onMove={() => {
                      setMoveTask(task);
                      setMoveDate(taskDueDay(task.due)?.toISODate() ?? "");
                    }}
                    onDelete={() => void remove(task)}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <TaskEditor
        open={edit !== null || compose}
        task={edit === "new" || compose ? null : edit}
        onOpenChange={(open) => {
          if (!open) {
            setEdit(null);
            setCompose(false);
          }
        }}
        onSaved={onReload}
      />

      <Dialog open={Boolean(moveTask)} onOpenChange={(open) => !open && setMoveTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verschieben</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{moveTask?.title}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => moveTask && void applyMove(moveTask, today.toISODate())}
              >
                Heute
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => moveTask && void applyMove(moveTask, today.plus({ days: 1 }).toISODate())}
              >
                Morgen
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => moveTask && void applyMove(moveTask, today.plus({ days: 7 }).toISODate())}
              >
                In einer Woche
              </Button>
              <Button type="button" variant="outline" onClick={() => moveTask && void applyMove(moveTask, null)}>
                Kein Datum
              </Button>
            </div>
            <DateField value={moveDate} onValueChange={setMoveDate} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMoveTask(null)}>
              Abbrechen
            </Button>
            <Button
              type="button"
              onClick={() => moveTask && void applyMove(moveTask, moveDate || null)}
            >
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskRow({
  task,
  today,
  compact,
  onToggle,
  onOpen,
  onMove,
  onDelete,
}: {
  task: TaskItem;
  today: DateTime;
  compact?: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const due = dueLabel(task, today);
  const done = task.status === "completed";
  const body = (
    <div className="flex min-h-11 items-center gap-2 bg-card px-3 py-2">
      <button
        type="button"
        className="flex size-7 shrink-0 items-center justify-center"
        aria-label={done ? "Wieder öffnen" : "Abschließen"}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-full border",
            done ? "border-primary bg-primary text-primary-foreground" : "border-input",
          )}
        >
          {done ? <Check className="size-3" /> : null}
        </span>
      </button>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <span className={cn("block break-words leading-snug text-sm", done && "text-muted-foreground line-through")}>
          {task.title || "Ohne Titel"}
        </span>
        {due.text ? (
          <span className={cn("text-xs", due.overdue ? "text-destructive" : "text-muted-foreground")}>
            {due.text}
            {task.listTitle && task.listTitle !== "Aufgaben" ? ` · ${task.listTitle}` : ""}
          </span>
        ) : task.listTitle && task.listTitle !== "Aufgaben" ? (
          <span className="text-xs text-muted-foreground">{task.listTitle}</span>
        ) : null}
      </button>
      {compact ? (
        <div className="flex shrink-0">
          <Button type="button" variant="ghost" size="icon" aria-label="Verschieben" className="size-8" onClick={onMove}>
            <CalendarClock className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Löschen" className="size-8" onClick={onDelete}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );

  if (compact) {
    return <div className="overflow-hidden rounded-lg ring-1 ring-border">{body}</div>;
  }

  return (
    <SwipeableRow
      className="shadow-sm ring-1 ring-border"
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
          key: "delete",
          label: "Löschen",
          icon: <Trash2 className="size-5" />,
          className: "bg-red-600",
          onClick: onDelete,
        },
      ]}
    >
      {body}
    </SwipeableRow>
  );
}
