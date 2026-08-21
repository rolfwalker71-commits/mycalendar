import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DateField } from "@/components/DateTimeFields";
import { apiClient, ApiError } from "@/lib/api";
import { now } from "@/lib/dates";
import type { TaskItem } from "@/lib/types";

export function dueToRfc(isoDate: string): string {
  return `${isoDate}T00:00:00.000Z`;
}

export function taskDueDay(due: string | null | undefined): DateTime | null {
  if (!due) return null;
  const d = DateTime.fromISO(due.slice(0, 10), { zone: "Europe/Berlin" });
  return d.isValid ? d.startOf("day") : null;
}

export function TaskEditor({
  open,
  task,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  task: TaskItem | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setNotes(task?.notes ?? "");
    setDue(taskDueDay(task?.due)?.toISODate() ?? "");
  }, [open, task]);

  async function save() {
    if (!title.trim()) {
      toast.error("Titel fehlt.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        notes: notes.trim(),
        due: due ? dueToRfc(due) : null,
      };
      if (task) {
        await apiClient.patchTask(task.listId, task.id, payload);
      } else {
        await apiClient.createTask({
          title: payload.title,
          notes: payload.notes,
          due: payload.due ?? undefined,
        });
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Aufgabe fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!task) return;
    setSaving(true);
    try {
      await apiClient.deleteTask(task.listId, task.id);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Löschen fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  const today = now().toISODate() ?? "";
  const tomorrow = now().plus({ days: 1 }).toISODate() ?? "";
  const nextWeek = now().plus({ days: 7 }).toISODate() ?? "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0">
        <SheetHeader>
          <SheetTitle>{task ? "Aufgabe" : "Neue Aufgabe"}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 overflow-auto px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-title">Titel</Label>
            <Input
              id="task-title"
              value={title}
              onValueChange={setTitle}
              placeholder="Was ist zu tun?"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-notes">Notiz</Label>
            <Textarea
              id="task-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className="min-h-20"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Fällig</Label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant={due === today ? "default" : "outline"} onClick={() => setDue(today)}>
                Heute
              </Button>
              <Button type="button" variant={due === tomorrow ? "default" : "outline"} onClick={() => setDue(tomorrow)}>
                Morgen
              </Button>
              <Button type="button" variant={due === nextWeek ? "default" : "outline"} onClick={() => setDue(nextWeek)}>
                In einer Woche
              </Button>
              <Button type="button" variant={!due ? "default" : "outline"} onClick={() => setDue("")}>
                Kein Datum
              </Button>
            </div>
            <DateField value={due} onValueChange={setDue} />
          </div>
        </div>
        <SheetFooter>
          {task ? (
            <Button type="button" variant="destructive" onClick={() => void remove()} disabled={saving}>
              Löschen
            </Button>
          ) : null}
          <Button type="button" onClick={() => void save()} disabled={saving}>
            Speichern
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
