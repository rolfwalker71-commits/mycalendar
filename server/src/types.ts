export type UserRow = {
  id: string;
  google_sub: string;
  email: string;
  name: string | null;
  picture_url: string | null;
  refresh_token_enc: string | null;
  token_expiry: Date | null;
  week_start: number;
  last_sync_at: Date | null;
  created_at: Date;
  last_login_at: Date | null;
};

export type CalendarRow = {
  id: string;
  user_id: string;
  google_cal_id: string;
  summary: string | null;
  color: string | null;
  background_color: string | null;
  foreground_color: string | null;
  timezone: string | null;
  selected: boolean;
  primary_cal: boolean;
  access_role: string | null;
  sync_token: string | null;
  updated_at: Date;
};

export type AttendeeJson = {
  email: string;
  displayName?: string;
  responseStatus?: string;
  organizer?: boolean;
  self?: boolean;
};

export type EventRow = {
  id: string;
  user_id: string;
  calendar_id: string;
  google_event_id: string;
  ical_uid: string | null;
  summary: string | null;
  description: string | null;
  location: string | null;
  status: string | null;
  html_link: string | null;
  hangout_link: string | null;
  start_at: Date | null;
  end_at: Date | null;
  all_day: boolean;
  all_day_start: string | null;
  all_day_end: string | null;
  timezone: string | null;
  attendees: AttendeeJson[] | null;
  recurrence: string[] | null;
  recurring_event_id: string | null;
  transparency: string | null;
  visibility: string | null;
  conference_data: unknown;
  updated_at: Date;
};
