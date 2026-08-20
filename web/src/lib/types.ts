export type Attendee = {
  email: string;
  displayName?: string;
  responseStatus?: string;
  organizer?: boolean;
  self?: boolean;
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
  backgroundColor: string | null;
  calendarSummary: string | null;
  calendarTimezone: string | null;
  updatedAt?: string;
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
  geminiAvailable: boolean;
};

export type ViewId = "day" | "week" | "month" | "year" | "agenda";
export type MobileTab = "today" | "calendar" | "search" | "more";
export type RecurrenceScope = "this" | "thisAndFollowing" | "all";
