-- Idempotentes Schema für Kalender. Wird beim Start angewendet.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  picture_url TEXT,
  refresh_token_enc TEXT,
  token_expiry TIMESTAMPTZ,
  week_start SMALLINT NOT NULL DEFAULT 1,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_cal_id TEXT NOT NULL,
  summary TEXT,
  color TEXT,
  background_color TEXT,
  foreground_color TEXT,
  timezone TEXT,
  selected BOOLEAN NOT NULL DEFAULT TRUE,
  primary_cal BOOLEAN NOT NULL DEFAULT FALSE,
  access_role TEXT,
  sync_token TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, google_cal_id)
);

CREATE INDEX IF NOT EXISTS calendars_user_idx ON calendars (user_id);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  calendar_id UUID NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL,
  ical_uid TEXT,
  summary TEXT,
  description TEXT,
  location TEXT,
  status TEXT,
  html_link TEXT,
  hangout_link TEXT,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  all_day_start DATE,
  all_day_end DATE,
  timezone TEXT,
  attendees JSONB,
  recurrence JSONB,
  recurring_event_id TEXT,
  transparency TEXT,
  visibility TEXT,
  conference_data JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (calendar_id, google_event_id)
);

CREATE INDEX IF NOT EXISTS events_user_range_idx ON events (user_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS events_user_google_idx ON events (user_id, google_event_id);
CREATE INDEX IF NOT EXISTS events_search_idx ON events (user_id, start_at);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS oauth_states_expires_idx ON oauth_states (expires_at);

ALTER TABLE users ADD COLUMN IF NOT EXISTS gmail_history_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_calendar BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_mail BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_declined BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS second_timezone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS working_hours JSONB;

ALTER TABLE calendars ADD COLUMN IF NOT EXISTS default_reminders JSONB;

ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS reminders JSONB;
ALTER TABLE events ADD COLUMN IF NOT EXISTS attachments JSONB;

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS notification_sent (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, kind, ref)
);

CREATE INDEX IF NOT EXISTS notification_sent_at_idx ON notification_sent (sent_at);

CREATE TABLE IF NOT EXISTS gemini_cache (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, kind, ref)
);

ALTER TABLE calendars ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'google';

ALTER TABLE users ADD COLUMN IF NOT EXISTS ms_sub TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ms_email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ms_refresh_token_enc TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ms_token_expiry TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS users_ms_sub_uidx ON users (ms_sub) WHERE ms_sub IS NOT NULL;

CREATE TABLE IF NOT EXISTS google_watches (
  channel_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  calendar_id UUID REFERENCES calendars(id) ON DELETE CASCADE,
  resource_id TEXT,
  expiration TIMESTAMPTZ,
  kind TEXT NOT NULL DEFAULT 'calendar',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS google_watches_user_idx ON google_watches (user_id);
CREATE INDEX IF NOT EXISTS google_watches_exp_idx ON google_watches (expiration);

CREATE TABLE IF NOT EXISTS ics_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  calendar_id UUID NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  etag TEXT,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, url)
);

CREATE INDEX IF NOT EXISTS ics_feeds_user_idx ON ics_feeds (user_id);

CREATE TABLE IF NOT EXISTS hidden_events (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_key)
);

