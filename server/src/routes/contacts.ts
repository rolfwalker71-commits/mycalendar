import { Router } from "express";
import { DateTime } from "luxon";
import { requireAuth } from "../auth.js";
import { TZ } from "../config.js";
import { query } from "../db.js";
import { describeGoogleApiError, getAuthedCalendar, getAuthedPeople } from "../google.js";
import {
  birthdayEventsForRange,
  ensureLocalCalendar,
  type ContactPerson,
} from "../localCalendars.js";
import { notifyLive } from "../live.js";
import { eventToGoogleBody, refreshCachedEvent } from "../sync.js";
import type { people_v1 } from "googleapis";
import type { CalendarRow, UserRow } from "../types.js";

export const contactsRouter = Router();
contactsRouter.use(requireAuth);

const PERSON_FIELDS = "names,emailAddresses,phoneNumbers,photos,birthdays,organizations,addresses";

function mapPerson(
  person: people_v1.Schema$Person,
  resourceName: string,
  source: "mine" | "other",
): ContactPerson {
  const givenName = (person.names?.[0]?.givenName ?? "").trim();
  const familyName = (person.names?.[0]?.familyName ?? "").trim();
  const name =
    person.names?.[0]?.displayName ||
    [givenName, familyName].filter(Boolean).join(" ") ||
    person.emailAddresses?.[0]?.value ||
    "Ohne Namen";
  const b = person.birthdays?.[0]?.date;
  const addresses = (person.addresses ?? [])
    .map((a) =>
      (a.formattedValue || [a.streetAddress, a.postalCode, a.city, a.country].filter(Boolean).join(", ")).trim(),
    )
    .filter(Boolean);
  return {
    resourceName,
    etag: person.etag ?? null,
    givenName,
    familyName,
    name,
    emails: (person.emailAddresses ?? []).map((e) => e.value).filter((v): v is string => Boolean(v)),
    phones: (person.phoneNumbers ?? [])
      .map((p) => ({ value: p.value ?? "", type: p.type ?? undefined }))
      .filter((p) => p.value),
    addresses,
    photoUrl: person.photos?.[0]?.url ?? null,
    birthday:
      b?.month && b.day
        ? { month: b.month, day: b.day, year: b.year ?? undefined }
        : null,
    organization: person.organizations?.[0]?.name ?? null,
    source,
  };
}

export function invalidateContactCache(userId: string): void {
  contactCache.delete(userId);
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
      personFields: PERSON_FIELDS,
      pageSize: 200,
      pageToken,
      sortOrder: "FIRST_NAME_ASCENDING",
    });
    for (const person of data.connections ?? []) {
      const key = person.resourceName || person.etag || person.names?.[0]?.displayName || "";
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(mapPerson(person, person.resourceName || key, "mine"));
    }
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken && out.length < 2000);
  contactCache.set(user.id, { at: Date.now(), contacts: out });
  return out;
}

export async function loadOtherContacts(user: UserRow): Promise<ContactPerson[]> {
  const people = await getAuthedPeople(user);
  const out: ContactPerson[] = [];
  let pageToken: string | undefined;
  do {
    const { data } = await people.otherContacts.list({
      readMask: "names,emailAddresses,phoneNumbers,photos",
      pageSize: 100,
      pageToken,
    });
    for (const person of data.otherContacts ?? []) {
      if (!person.resourceName) continue;
      out.push(mapPerson(person, person.resourceName, "other"));
    }
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken && out.length < 400);
  return out;
}

function matchesQuery(c: ContactPerson, q: string): boolean {
  return (
    c.name.toLowerCase().includes(q) ||
    c.emails.some((e) => e.toLowerCase().includes(q)) ||
    c.phones.some((p) => p.value.includes(q)) ||
    c.addresses.some((a) => a.toLowerCase().includes(q)) ||
    (c.organization ?? "").toLowerCase().includes(q)
  );
}

contactsRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  try {
    const [mine, othersRaw] = await Promise.all([
      loadContacts(req.user!),
      loadOtherContacts(req.user!).catch(() => [] as ContactPerson[]),
    ]);
    const known = new Set(mine.flatMap((c) => c.emails.map((e) => e.toLowerCase())));
    let contacts = mine;
    let other = othersRaw.filter((c) => !c.emails.some((e) => known.has(e.toLowerCase())));
    if (q) {
      contacts = contacts.filter((c) => matchesQuery(c, q));
      other = other.filter((c) => matchesQuery(c, q));
    }
    await ensureLocalCalendar(req.user!.id, "birthday:contacts", "Geburtstage", "#f4511e");
    res.json({ contacts, other });
  } catch (err) {
    const described = describeGoogleApiError(err, "people");
    if (described) {
      res.status(described.status).json({ error: described.error, code: described.code, contacts: [], other: [] });
      return;
    }
    console.error(err);
    res.status(502).json({ error: "Kontakte konnten nicht geladen werden.", contacts: [], other: [] });
  }
});

contactsRouter.post("/adopt", async (req, res) => {
  const resourceName = typeof req.body?.resourceName === "string" ? req.body.resourceName.trim() : "";
  if (!resourceName.startsWith("otherContacts/")) {
    res.status(400).json({ error: "Kein Mail-Kontakt." });
    return;
  }
  try {
    const people = await getAuthedPeople(req.user!);
    const { data } = await people.otherContacts.copyOtherContactToMyContactsGroup({
      resourceName,
      requestBody: {
        copyMask: "names,emailAddresses,phoneNumbers",
      },
    });
    invalidateContactCache(req.user!.id);
    notifyLive(req.user!.id, "contacts");
    const mapped = mapPerson(data, data.resourceName || resourceName, "mine");
    res.json({ contact: mapped });
  } catch (err) {
    const described = describeGoogleApiError(err, "people");
    if (described) {
      res.status(described.status).json({ error: described.error, code: described.code });
      return;
    }
    console.error(err);
    res.status(502).json({ error: "Kontakt konnte nicht übernommen werden." });
  }
});

type ContactInput = {
  givenName: string;
  familyName: string;
  email: string;
  phone: string;
  organization: string;
  address: string;
  birthday: { year?: number; month: number; day: number } | null;
};

function readContactInput(body: unknown): ContactInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const givenName = typeof b.givenName === "string" ? b.givenName.trim() : "";
  const familyName = typeof b.familyName === "string" ? b.familyName.trim() : "";
  if (!givenName && !familyName) return null;
  let birthday: ContactInput["birthday"] = null;
  if (typeof b.birthday === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.birthday)) {
    const [y, m, d] = b.birthday.split("-").map(Number);
    if (m && d) birthday = { year: y, month: m, day: d };
  } else if (b.birthday && typeof b.birthday === "object") {
    const bd = b.birthday as { year?: number; month?: number; day?: number };
    if (bd.month && bd.day) birthday = { year: bd.year, month: bd.month, day: bd.day };
  }
  return {
    givenName,
    familyName,
    email: typeof b.email === "string" ? b.email.trim() : "",
    phone: typeof b.phone === "string" ? b.phone.trim() : "",
    organization: typeof b.organization === "string" ? b.organization.trim() : "",
    address: typeof b.address === "string" ? b.address.trim() : "",
    birthday,
  };
}

function personBody(input: ContactInput): people_v1.Schema$Person {
  return {
    names: [{ givenName: input.givenName || undefined, familyName: input.familyName || undefined }],
    emailAddresses: input.email ? [{ value: input.email }] : [],
    phoneNumbers: input.phone ? [{ value: input.phone }] : [],
    organizations: input.organization ? [{ name: input.organization }] : [],
    addresses: input.address ? [{ formattedValue: input.address }] : [],
    birthdays: input.birthday
      ? [{ date: { year: input.birthday.year, month: input.birthday.month, day: input.birthday.day } }]
      : [],
  };
}

contactsRouter.post("/", async (req, res) => {
  const input = readContactInput(req.body);
  if (!input) {
    res.status(400).json({ error: "Vor- oder Nachname ist erforderlich." });
    return;
  }
  try {
    const people = await getAuthedPeople(req.user!);
    const { data } = await people.people.createContact({
      requestBody: personBody(input),
    });
    invalidateContactCache(req.user!.id);
    notifyLive(req.user!.id, "contacts");
    res.status(201).json({ contact: mapPerson(data, data.resourceName || "", "mine") });
  } catch (err) {
    const described = describeGoogleApiError(err, "people");
    if (described) {
      res.status(described.status).json({ error: described.error, code: described.code });
      return;
    }
    console.error(err);
    res.status(502).json({ error: "Kontakt konnte nicht angelegt werden." });
  }
});

contactsRouter.patch("/", async (req, res) => {
  const resourceName = typeof req.body?.resourceName === "string" ? req.body.resourceName.trim() : "";
  if (!resourceName.startsWith("people/")) {
    res.status(400).json({ error: "Kontakt unbekannt." });
    return;
  }
  const input = readContactInput(req.body);
  if (!input) {
    res.status(400).json({ error: "Vor- oder Nachname ist erforderlich." });
    return;
  }
  try {
    const people = await getAuthedPeople(req.user!);
    const current = await people.people.get({
      resourceName,
      personFields: `${PERSON_FIELDS},metadata`,
    });
    const { data } = await people.people.updateContact({
      resourceName,
      updatePersonFields: "names,emailAddresses,phoneNumbers,organizations,addresses,birthdays",
      requestBody: {
        ...personBody(input),
        etag: current.data.etag,
      },
    });
    invalidateContactCache(req.user!.id);
    notifyLive(req.user!.id, "contacts");
    res.json({ contact: mapPerson(data, data.resourceName || resourceName, "mine") });
  } catch (err) {
    const described = describeGoogleApiError(err, "people");
    if (described) {
      res.status(described.status).json({ error: described.error, code: described.code });
      return;
    }
    console.error(err);
    res.status(502).json({ error: "Kontakt konnte nicht gespeichert werden." });
  }
});

contactsRouter.delete("/", async (req, res) => {
  const resourceName =
    (typeof req.body?.resourceName === "string" && req.body.resourceName) ||
    (typeof req.query.resourceName === "string" && req.query.resourceName) ||
    "";
  if (!resourceName.startsWith("people/")) {
    res.status(400).json({ error: "Kontakt unbekannt." });
    return;
  }
  try {
    const people = await getAuthedPeople(req.user!);
    await people.people.deleteContact({ resourceName });
    invalidateContactCache(req.user!.id);
    notifyLive(req.user!.id, "contacts");
    res.json({ ok: true });
  } catch (err) {
    const described = describeGoogleApiError(err, "people");
    if (described) {
      res.status(described.status).json({ error: described.error, code: described.code });
      return;
    }
    console.error(err);
    res.status(502).json({ error: "Kontakt konnte nicht gelöscht werden." });
  }
});

contactsRouter.post("/event", async (req, res) => {
  const summary = typeof req.body?.summary === "string" ? req.body.summary.trim() : "";
  const start = typeof req.body?.start === "string" ? req.body.start : "";
  const end = typeof req.body?.end === "string" ? req.body.end : "";
  const allDay = Boolean(req.body?.allDay);
  const location = typeof req.body?.location === "string" ? req.body.location.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const displayName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!summary || !start || !end) {
    res.status(400).json({ error: "Titel, Start und Ende sind erforderlich." });
    return;
  }
  try {
    const { rows } = await query<CalendarRow>(
      `SELECT * FROM calendars
        WHERE user_id = $1
          AND google_cal_id NOT LIKE 'ics:%'
          AND google_cal_id NOT LIKE 'birthday:%'
        ORDER BY primary_cal DESC, selected DESC
        LIMIT 1`,
      [req.user!.id],
    );
    const calendar = rows[0];
    if (!calendar) {
      res.status(404).json({ error: "Kein Kalender." });
      return;
    }
    const api = await getAuthedCalendar(req.user!);
    const created = await api.events.insert({
      calendarId: calendar.google_cal_id,
      sendUpdates: email ? "all" : "none",
      requestBody: eventToGoogleBody({
        summary,
        location: location || undefined,
        allDay,
        start,
        end,
        timezone: calendar.timezone || TZ,
        attendees: email ? [{ email, displayName: displayName || undefined }] : undefined,
      }),
    });
    if (created.data.id) await refreshCachedEvent(req.user!, calendar, created.data.id);
    res.status(201).json({ ok: true, googleEventId: created.data.id });
  } catch (err) {
    const described = describeGoogleApiError(err, "calendar");
    if (described) {
      res.status(described.status).json({ error: described.error, code: described.code });
      return;
    }
    console.error(err);
    res.status(502).json({ error: "Termin konnte nicht angelegt werden." });
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
