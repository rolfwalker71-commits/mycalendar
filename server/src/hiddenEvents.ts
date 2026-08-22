import { query } from "./db.js";

export async function hiddenKeySet(userId: string): Promise<Set<string>> {
  const { rows } = await query<{ event_key: string }>(
    "SELECT event_key FROM hidden_events WHERE user_id = $1",
    [userId],
  );
  return new Set(rows.map((r) => r.event_key));
}

export async function hideEventKeys(userId: string, keys: string[]): Promise<void> {
  const unique = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
  for (const key of unique) {
    await query(
      `INSERT INTO hidden_events (user_id, event_key)
       VALUES ($1, $2)
       ON CONFLICT (user_id, event_key) DO NOTHING`,
      [userId, key],
    );
  }
}

export function hideKeysForGoogleEvent(event: {
  google_event_id: string;
  recurring_event_id?: string | null;
  ical_uid?: string | null;
}): string[] {
  return [event.google_event_id, event.recurring_event_id, event.ical_uid].filter(
    (k): k is string => Boolean(k),
  );
}

export function birthdayContactKey(resourceName: string): string {
  return `bday:${resourceName.replace(/[^\w-]/g, "")}`;
}

export function birthdayContactKeyFromEventId(id: string): string | null {
  const match = id.match(/^bday-(.+)-(\d{4})$/);
  return match ? `bday:${match[1]}` : null;
}

export function isHiddenGoogleEvent(
  hidden: Set<string>,
  event: { id?: string | null; recurringEventId?: string | null; iCalUID?: string | null },
): boolean {
  if (event.id && hidden.has(event.id)) return true;
  if (event.recurringEventId && hidden.has(event.recurringEventId)) return true;
  if (event.iCalUID && hidden.has(event.iCalUID)) return true;
  return false;
}
