export type Attendee = {
  email: string;
  displayName?: string;
  responseStatus?: string;
  organizer?: boolean;
  self?: boolean;
  resource?: boolean;
};

export type EventReminder = {
  useDefault: boolean;
  overrides?: { method: string; minutes: number }[];
};

export type EventAttachment = {
  fileUrl: string;
  title?: string;
  mimeType?: string;
  iconLink?: string;
  fileId?: string;
};

export type WorkingHours = {
  enabled: boolean;
  days: Record<string, { start: string; end: string } | null>;
};

export type CalendarItem = {
  id: string;
  googleCalId: string;
  summary: string | null;
  color: string | null;
  backgroundColor: string | null;
  foregroundColor: string | null;
  timezone: string | null;
  selected: boolean;
  primary: boolean;
  accessRole: string | null;
  defaultReminders?: { method: string; minutes: number }[];
  source?: "google" | "ics" | "birthday" | string;
};

export type CalendarEvent = {
  id: string;
  calendarId: string;
  googleEventId: string;
  icalUid?: string | null;
  summary: string | null;
  description: string | null;
  location: string | null;
  status: string | null;
  htmlLink?: string | null;
  hangoutLink: string | null;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  allDayStart: string | null;
  allDayEnd: string | null;
  timezone: string | null;
  attendees: Attendee[] | null;
  recurrence: string[] | null;
  recurringEventId: string | null;
  transparency?: string | null;
  visibility?: string | null;
  conferenceData?: unknown;
  eventType?: string | null;
  reminders?: EventReminder | null;
  attachments?: EventAttachment[] | null;
  backgroundColor: string | null;
  calendarSummary: string | null;
  calendarTimezone: string | null;
  updatedAt?: string;
  coverUrl?: string | null;
  readOnly?: boolean;
};

export type ContactCard = {
  resourceName: string;
  name: string;
  emails: string[];
  phones: { value: string; type?: string }[];
  addresses: string[];
  photoUrl: string | null;
  birthday: { month: number; day: number; year?: number } | null;
  organization?: string | null;
  source: "mine" | "other";
};

export type TaskItem = {
  id: string;
  listId: string;
  listTitle?: string;
  title: string;
  notes?: string;
  status: "needsAction" | "completed";
  due: string | null;
};

export type Me = {
  id: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
  weekStart: 0 | 1;
  lastSyncAt: string | null;
  timezone: string;
  notifyCalendar: boolean;
  notifyMail: boolean;
  hideDeclined: boolean;
  secondTimezone: string | null;
  workingHours: WorkingHours | null;
  geminiAvailable: boolean;
};

export type ViewId = "day" | "week" | "month" | "year" | "agenda";
export type MobileTab = "today" | "calendar" | "tasks" | "search" | "more";
export type RecurrenceScope = "this" | "thisAndFollowing" | "all";
