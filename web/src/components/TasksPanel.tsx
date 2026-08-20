import { useState } from "react";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/DateTimeFields";
import { apiClient, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { TaskItem } from "@/lib/types";

export function TasksPanel({
  tasks,
  onChange,
  reconnectHref = "/api/auth/google",
  error,
}: {
  tasks: TaskItem[];
  onChange: () => void;
  reconnectHref?: string;
  error?: string | null;
}) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  async function add() {
    if (!title.trim()) return;
    try {
      await apiClient.createTask({
        title: title.trim(),
        due: due ? `${due}T12:00:00.000Z` : undefined,
      });
      setTitle("");
      setDue("");
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Aufgabe fehlgeschlagen.");
    }
  }

  async function toggle(task: TaskItem) {
    try {
      await apiClient.patchTask(task.listId, task.id, {
        status: task.status === "completed" ? "needsAction" : "completed",
      });
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Aufgabe fehlgeschlagen.");
    }
  }

  const open = tasks.filter((t) => t.status !== "completed");

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">Aufgaben</h2>
      {error ? (
        <p className="text-xs text-muted-foreground">
          {error}{" "}
          <a className="text-primary underline" href={reconnectHref}>
            Google erneut verbinden
          </a>
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Input value={title} onValueChange={setTitle} placeholder="Neue Aufgabe" />
        <DateField value={due} onValueChange={setDue} aria-label="Fällig" />
        <Button type="button" variant="outline" onClick={() => void add()}>
          <Plus className="size-4" />
          Hinzufügen
        </Button>
      </div>
      <ul className="flex flex-col gap-1">
        {open.slice(0, 20).map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className={cn(
                "flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-muted",
                t.status === "completed" && "text-muted-foreground line-through",
              )}
              onClick={() => void toggle(t)}
            >
              <span className="flex size-4 items-center justify-center rounded border border-input">
                {t.status === "completed" ? <Check className="size-3" /> : null}
              </span>
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
