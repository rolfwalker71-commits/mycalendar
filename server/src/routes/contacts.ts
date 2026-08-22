import { Router } from "express";
import { DateTime } from "luxon";
import { requireAuth } from "../auth.js";
import { TZ } from "../config.js";
import { describeGoogleApiError, getAuthedPeople } from "../google.js";
import {
  birthdayEventsForRange,
  ensureLocalCalendar,
  type ContactPerson,
} from "../localCalendars.js";
import type { people_v1 } from "googleapis";
import type { UserRow } from "../types.js";

export const contactsRouter = Router();
contactsRouter.use(requireAuth);

function mapPerson(person: people_v1.Schema$Person, resourceName: string): ContactPerson {
  const name =
    person.names?.[0]?.displayName ||
    [person.names?.[0]?.givenName, person.names?.[0]?.familyName].filter(Boolean).join(" ") ||
    person.emailAddresses?.[0]?.value ||
    "Ohne Namen";
  const b = person.birthdays?.[0]?.date;
  return {
    resourceName,
    name,
    emails: (person.emailAddresses ?? []).map((e) => e.value).filter((v): v is string => Boolean(v)),
    phones: (person.phoneNumbers ?? [])
      .map((p) => ({ value: p.value ?? "", type: p.type ?? undefined }))
      .filter((p) => p.value),
    photoUrl: person.photos?.[0]?.url ?? null,
    birthday:
      b?.month && b.day
        ? { month: b.month, day: b.day, year: b.year ?? undefined }
        : null,
    organization: person.organizations?.[0]?.name ?? null,
  };
}

const contactCache = new Map<string, { at: number; contacts: ContactPerson[] }>();

export async function loadContacts(user: UserRow): Promise<ContactPerson[]> {
  const hit = contactCache.get(user.id);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.contacts;
  const people = await getAuthedPeople(user);
  const out: ContactPerson[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  do {
    const { data } = await people.people.connections.list({
      resourceName: "people/me",
      personFields: "names,emailAddresses,phoneNumbers,photos,birthdays,organizations",
      pageSize: 200,
      pageToken,
      sortOrder: "FIRST_NAME_ASCENDING",
    });
    for (const person of data.connections ?? []) {
      const key = person.resourceName || person.etag || person.names?.[0]?.displayName || "";
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(mapPerson(person, person.resourceName || key));
    }
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken && out.length < 2000);
  contactCache.set(user.id, { at: Date.now(), contacts: out });
  return out;
}

contactsRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  try {
    let contacts = await loadContacts(req.user!);
    if (q) {
      contacts = contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.emails.some((e) => e.toLowerCase().includes(q)) ||
          c.phones.some((p) => p.value.includes(q)) ||
          (c.organization ?? "").toLowerCase().includes(q),
      );
    }
    await ensureLocalCalendar(req.user!.id, "birthday:contacts", "Geburtstage", "#f4511e");
    res.json({ contacts });
  } catch (err) {
    const described = describeGoogleApiError(err, "people");
    if (described) {
      res.status(described.status).json({ error: described.error, code: described.code, contacts: [] });
      return;
    }
    console.error(err);
    res.status(502).json({ error: "Kontakte konnten nicht geladen werden.", contacts: [] });
  }
});

contactsRouter.get("/birthdays", async (req, res) => {
  const from = DateTime.fromISO(String(req.query.from ?? ""), { setZone: true });
  const to = DateTime.fromISO(String(req.query.to ?? ""), { setZone: true });
  if (!from.isValid || !to.isValid) {
    res.status(400).json({ error: "from/to erforderlich." });
    return;
  }
  try {
    const calendar = await ensureLocalCalendar(req.user!.id, "birthday:contacts", "Geburtstage", "#f4511e");
    const contacts = await loadContacts(req.user!);
    const events = birthdayEventsForRange(contacts, calendar, from.setZone(TZ), to.setZone(TZ));
    res.json({
      calendarId: calendar.id,
      events: events.map((e) => ({
        id: e.id,
        calendarId: e.calendar_id,
        googleEventId: e.google_event_id,
        icalUid: e.ical_uid,
        summary: e.summary,
        description: e.description,
        location: e.location,
        status: e.status,
        htmlLink: e.html_link,
        hangoutLink: e.hangout_link,
        startAt: e.start_at,
        endAt: e.end_at,
        allDay: e.all_day,
        allDayStart: e.all_day_start,
        allDayEnd: e.all_day_end,
        timezone: e.timezone,
        attendees: e.attendees,
        recurrence: e.recurrence,
        recurringEventId: e.recurring_event_id,
        eventType: e.event_type,
        reminders: e.reminders,
        attachments: e.attachments,
        backgroundColor: e.background_color,
        calendarSummary: e.calendar_summary,
        calendarTimezone: e.calendar_timezone,
        updatedAt: e.updated_at,
        readOnly: true,
      })),
    });
  } catch (err) {
    const described = describeGoogleApiError(err, "people");
    if (described) {
      res.status(described.status).json({ error: described.error, code: described.code, events: [] });
      return;
    }
    console.error(err);
    res.status(502).json({ error: "Geburtstage konnten nicht geladen werden.", events: [] });
  }
});
