// Kalender & Mail — Widget für Scriptable (https://scriptable.app)
// Erzeugt in der App unter Einstellungen › Widgets. Nicht weitergeben:
// der Schlüssel unten gibt Lesezugriff auf Termine, Mails und Aufgaben.
//
// Widget-Parameter (optional, lange auf das Widget drücken › Widget bearbeiten):
//   kalender | mail | tag   – überschreibt den in der App gewählten Typ.

const APP_URL = "__APP_URL__";
const TOKEN = "__WIDGET_TOKEN__";
const WIDGET_NAME = "__WIDGET_NAME__";

const COLORS = {
  bg: Color.dynamic(new Color("#ffffff"), new Color("#1c1c1e")),
  text: Color.dynamic(new Color("#1c1c1e"), new Color("#f5f5f7")),
  muted: Color.dynamic(new Color("#6e6e73"), new Color("#aeaeb2")),
  red: Color.dynamic(new Color("#e0241b"), new Color("#ff453a")),
  accent: Color.dynamic(new Color("#0066d6"), new Color("#0a84ff")),
  line: Color.dynamic(new Color("#000000", 0.1), new Color("#ffffff", 0.14)),
};

const KIND_PARAM = { kalender: "calendar", calendar: "calendar", mail: "mail", tag: "day", day: "day" };
const fm = FileManager.local();
const cacheDir = fm.joinPath(fm.cacheDirectory(), "kalender-mail-widget");
if (!fm.fileExists(cacheDir)) fm.createDirectory(cacheDir, true);

// ---------------------------------------------------------------------------
// Daten
// ---------------------------------------------------------------------------

function cachePath(name) {
  return fm.joinPath(cacheDir, name.replace(/[^a-zA-Z0-9._-]/g, "_"));
}

async function loadData(kindOverride) {
  const file = cachePath(`data-${WIDGET_NAME}-${kindOverride || "auto"}.json`);
  const url = `${APP_URL}/api/widget/data${kindOverride ? `?kind=${kindOverride}` : ""}`;
  try {
    const req = new Request(url);
    req.headers = { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" };
    req.timeoutInterval = 15;
    const json = await req.loadJSON();
    const status = req.response ? req.response.statusCode : 200;
    if (status === 401) return { error: json.error || "Skript in der App neu kopieren.", fatal: true };
    if (status >= 400) throw new Error(json.error || `HTTP ${status}`);
    fm.writeString(file, JSON.stringify(json));
    return { data: json, stale: false };
  } catch (err) {
    if (fm.fileExists(file)) {
      return { data: JSON.parse(fm.readString(file)), stale: true };
    }
    return { error: "Keine Verbindung zur App.", fatal: false };
  }
}

async function loadImage(path) {
  if (!path) return null;
  const file = cachePath(`img-${path}`);
  if (fm.fileExists(file)) return fm.readImage(file);
  try {
    const req = new Request(`${APP_URL}${path}`);
    // Original artwork (shift illustrations, attachments) needs the widget key.
    if (path.startsWith("/api/")) req.headers = { Authorization: `Bearer ${TOKEN}` };
    req.timeoutInterval = 15;
    const img = await req.loadImage();
    fm.writeImage(file, img);
    return img;
  } catch (err) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

function text(stack, value, size, opts = {}) {
  const t = stack.addText(String(value ?? ""));
  t.font = opts.weight === "bold"
    ? Font.boldSystemFont(size)
    : opts.weight === "semibold"
      ? Font.semiboldSystemFont(size)
      : opts.weight === "light"
        ? Font.lightSystemFont(size)
        : opts.weight === "medium"
          ? Font.mediumSystemFont(size)
          : Font.systemFont(size);
  t.textColor = opts.color || COLORS.text;
  t.lineLimit = opts.lines ?? 1;
  if (opts.scale) t.minimumScaleFactor = opts.scale;
  return t;
}

function colorBar(stack, hex, height) {
  const bar = stack.addStack();
  bar.size = new Size(3, height);
  bar.cornerRadius = 1.5;
  bar.backgroundColor = new Color(hex || "#5ac8fa");
  return bar;
}

function hstack(parent, spacing = 0) {
  const s = parent.addStack();
  s.layoutHorizontally();
  s.spacing = spacing;
  return s;
}

function vstack(parent, spacing = 0) {
  const s = parent.addStack();
  s.layoutVertically();
  s.spacing = spacing;
  return s;
}

function upcomingFirst(day, now) {
  // Today: hide timed events that are already over.
  return day.events.filter((e) => e.allDay || !e.end || new Date(e.end) > now);
}

function isToday(data, day) {
  return day.date === data.today.date;
}

function eventsOf(data, day, now) {
  return isToday(data, day) ? upcomingFirst(day, now) : day.events;
}

function flatUpcoming(data, limit) {
  const now = new Date();
  const out = [];
  data.days.forEach((day, i) => {
    for (const ev of eventsOf(data, day, now)) out.push({ ev, day, index: i });
  });
  return out.slice(0, limit);
}

async function eventRow(parent, ev, opts = {}) {
  const row = hstack(parent, 8);
  row.centerAlignContent();
  const h = opts.compact ? 26 : 30;
  colorBar(row, ev.color, h);
  const col = vstack(row, 1);
  text(col, ev.title, opts.titleSize || 13, { weight: "semibold" });
  const meta = [opts.prefix, ev.time, opts.noLocation ? null : ev.location].filter(Boolean).join(" · ");
  text(col, meta, 11, { color: COLORS.muted });
  row.addSpacer();
  if (opts.art && ev.art) {
    const img = await loadImage(ev.art);
    if (img) {
      const wi = row.addImage(img);
      wi.imageSize = new Size(opts.artSize || 36, opts.artSize || 36);
      wi.cornerRadius = 9;
    }
  }
  return row;
}

function dateBadge(parent, data, big = 34) {
  const col = vstack(parent, 0);
  text(col, data.today.weekday.toUpperCase(), 11, { weight: "bold", color: COLORS.red });
  text(col, data.today.day, big, { weight: "light" });
  return col;
}

function footer(w, data, stale) {
  if (!stale) return;
  w.addSpacer(2);
  const time = new Date(data.generatedAt);
  const df = new DateFormatter();
  df.dateFormat = "HH:mm";
  text(w, `Offline · Stand ${df.string(time)}`, 9, { color: COLORS.muted });
}

function message(w, title, detail) {
  w.addSpacer();
  text(w, title, 14, { weight: "semibold", lines: 2 });
  if (detail) text(w, detail, 11, { color: COLORS.muted, lines: 4 });
  w.addSpacer();
}

// ---------------------------------------------------------------------------
// Kalender
// ---------------------------------------------------------------------------

/** Scriptable cannot stretch an image to the widget width, so use the known small-widget sizes. */
function smallWidgetWidth() {
  if (Device.isPad()) return 155;
  const size = Device.screenSize();
  const width = Math.min(size.width, size.height);
  if (width >= 428) return 170;
  if (width >= 414) return 169;
  if (width >= 390) return 158;
  if (width >= 375) return 155;
  return 148;
}

async function calendarSmall(w, data) {
  const ev = data.next;
  const art = ev && ev.artHeader ? await loadImage(ev.artHeader) : null;
  if (art) {
    w.setPadding(0, 0, 0, 0);
    const img = w.addImage(art);
    img.imageSize = new Size(smallWidgetWidth(), 74);
    img.applyFillingContentMode();
    const body = vstack(w, 3);
    body.setPadding(8, 14, 12, 14);
    await smallBody(body, data, ev);
    return;
  }
  dateBadge(w, data);
  w.addSpacer();
  await smallBody(w, data, ev);
}

async function smallBody(parent, data, ev) {
  const head = hstack(parent, 4);
  head.centerAlignContent();
  text(head, `${data.today.weekdayShort.toUpperCase()} ${data.today.day}`, 11, { weight: "bold", color: COLORS.red });
  // Countdown only while it is short — "in 5 Std., 45 Min." would push the date out.
  const minutesAway = ev && ev.start ? (new Date(ev.start) - Date.now()) / 60000 : null;
  if (minutesAway != null && minutesAway > 0 && minutesAway <= 90) {
    text(head, "·", 11, { color: COLORS.muted });
    const d = head.addDate(new Date(ev.start));
    d.applyRelativeStyle();
    d.font = Font.systemFont(11);
    d.textColor = COLORS.muted;
  }
  if (!ev) {
    text(parent, "Keine Termine", 13, { weight: "semibold" });
    text(parent, "in den nächsten 7 Tagen", 11, { color: COLORS.muted });
    return;
  }
  const row = hstack(parent, 7);
  colorBar(row, ev.color, 30);
  const col = vstack(row, 1);
  text(col, ev.title, 13, { weight: "semibold", lines: 2 });
  text(col, [ev.time, ev.location].filter(Boolean).join(" · "), 11, { color: COLORS.muted });
}

async function calendarMedium(w, data) {
  const cfg = data.widget.config;
  const row = hstack(w, 14);
  const left = vstack(row, 0);
  left.size = new Size(64, 0);
  dateBadge(left, data, 36);
  left.addSpacer(6);
  const todayCount = data.days[0] ? data.days[0].events.length : 0;
  text(left, todayCount === 1 ? "1 Termin" : `${todayCount} Termine`, 11, { color: COLORS.muted });
  left.addSpacer();
  const right = vstack(row, 7);
  const items = flatUpcoming(data, 3);
  if (!items.length) {
    right.addSpacer();
    text(right, "Keine weiteren Termine", 13, { weight: "semibold" });
    text(right, "in den nächsten 7 Tagen", 11, { color: COLORS.muted });
    right.addSpacer();
    return;
  }
  for (const { ev, day, index } of items) {
    await eventRow(right, ev, { art: cfg.showArt, prefix: isToday(data, day) ? null : day.label });
  }
  right.addSpacer();
}

/**
 * Agenda grouped by day. Widgets clip instead of scrolling, so rows are added against a
 * height budget (points) rather than a fixed count. Returns where it stopped so a second
 * column can continue seamlessly.
 */
async function agendaList(parent, data, { days, height, art, artSize, from = { day: 0, event: 0 } }) {
  const now = new Date();
  const rowCost = Math.max(30, art ? artSize || 36 : 0) + 6;
  const headerCost = 20;
  let used = 0;
  let shown = 0;
  const last = Math.min(days, data.days.length);
  for (let i = from.day; i < last; i += 1) {
    const day = data.days[i];
    const events = eventsOf(data, day, now);
    const startAt = i === from.day ? from.event : 0;
    if (!events.length && !isToday(data, day)) continue;
    const firstRow = events.length ? rowCost : 18;
    if (used + headerCost + firstRow > height) return { day: i, event: startAt, done: false };
    if (shown > 0) parent.addSpacer(4);
    text(parent, day.label.toUpperCase(), 10, { weight: "bold", color: COLORS.muted });
    used += headerCost;
    shown += 1;
    if (!events.length) {
      text(parent, "Keine weiteren Termine", 12, { color: COLORS.muted });
      used += 18;
      continue;
    }
    for (let e = startAt; e < events.length; e += 1) {
      if (used + rowCost > height) return { day: i, event: e, done: false };
      await eventRow(parent, events[e], { art, artSize });
      used += rowCost;
    }
  }
  if (!shown && from.day === 0) text(parent, "Keine Termine", 13, { weight: "semibold" });
  return { day: last, event: 0, done: true };
}

async function calendarLarge(w, data) {
  const cfg = data.widget.config;
  const head = hstack(w, 6);
  head.bottomAlignContent();
  text(head, data.today.weekday.toUpperCase(), 11, { weight: "bold", color: COLORS.red });
  text(head, `${data.today.day}. ${data.today.month}`, 15, { weight: "semibold" });
  head.addSpacer();
  text(head, `KW ${data.today.week}`, 11, { color: COLORS.muted });
  w.addSpacer(6);
  const list = vstack(w, 6);
  await agendaList(list, data, { days: cfg.days, height: 290, art: cfg.showArt, artSize: 38 });
  w.addSpacer();
}

// ---------------------------------------------------------------------------
// Mail
// ---------------------------------------------------------------------------

function mailIcon(stack, size) {
  const img = stack.addImage(SFSymbol.named("envelope.fill").image);
  img.imageSize = new Size(size, size);
  img.tintColor = COLORS.accent;
  return img;
}

function mailError(parent, mail) {
  if (mail && mail.error) {
    text(parent, mail.error, 11, { color: COLORS.muted, lines: 3 });
    return true;
  }
  return false;
}

function mailSmall(w, data) {
  const mail = data.mail;
  const head = hstack(w, 6);
  head.centerAlignContent();
  mailIcon(head, 18);
  head.addSpacer();
  text(head, "Posteingang", 11, { weight: "semibold", color: COLORS.muted });
  w.addSpacer(8);
  if (mailError(w, mail)) return;
  text(w, mail.unread ?? "–", 34, { weight: "semibold" });
  text(w, "ungelesen", 11, { color: COLORS.muted });
  w.addSpacer();
  const top = mail.items.find((m) => m.unread) || mail.items[0];
  if (top) {
    text(w, top.from, 13, { weight: "semibold" });
    text(w, top.subject, 11, { color: COLORS.muted });
  }
}

function mailRow(parent, m) {
  const row = hstack(parent, 8);
  const dot = row.addStack();
  dot.size = new Size(7, 7);
  dot.cornerRadius = 3.5;
  dot.backgroundColor = m.unread ? COLORS.accent : Color.clear();
  const col = vstack(row, 1);
  const top = hstack(col, 6);
  text(top, m.from, 13, { weight: m.unread ? "semibold" : "medium" });
  top.addSpacer();
  text(top, m.time, 11, { color: COLORS.muted });
  text(col, m.subject, 11, { color: COLORS.muted });
}

function mailList(w, data, count) {
  const mail = data.mail;
  const head = hstack(w, 6);
  head.centerAlignContent();
  text(head, "Posteingang", 13, { weight: "semibold", color: COLORS.accent });
  head.addSpacer();
  if (mail && mail.unread != null) text(head, `${mail.unread} ungelesen`, 11, { color: COLORS.muted });
  w.addSpacer(6);
  if (mailError(w, mail)) return;
  if (!data.widget.config.mailPreview) {
    w.addSpacer();
    text(w, `${mail.unread} ungelesene Mails`, 15, { weight: "semibold" });
    text(w, "Vorschau ist in der App ausgeschaltet.", 11, { color: COLORS.muted });
    w.addSpacer();
    return;
  }
  const list = vstack(w, 8);
  for (const m of mail.items.slice(0, count)) mailRow(list, m);
  w.addSpacer();
}

// ---------------------------------------------------------------------------
// Mein Tag (Kombi)
// ---------------------------------------------------------------------------

function taskRow(parent, t, opts = {}) {
  const row = hstack(parent, 6);
  row.centerAlignContent();
  const icon = row.addImage(SFSymbol.named("circle").image);
  icon.imageSize = new Size(12, 12);
  icon.tintColor = t.overdue ? COLORS.red : COLORS.muted;
  text(row, t.title, 12);
  if (t.due && !opts.hideDue) {
    row.addSpacer();
    text(row, t.due, 10, { color: t.overdue ? COLORS.red : COLORS.muted });
  }
}

async function dayMedium(w, data) {
  const cfg = data.widget.config;
  const row = hstack(w, 12);
  const left = vstack(row, 6);
  const head = hstack(left, 4);
  text(head, data.today.weekdayShort.toUpperCase(), 11, { weight: "bold", color: COLORS.red });
  text(head, `${data.today.day}. ${data.today.month}`, 13, { weight: "semibold" });
  const items = flatUpcoming(data, 2);
  if (!items.length) text(left, "Keine Termine", 12, { color: COLORS.muted });
  for (const { ev, day, index } of items) {
    await eventRow(left, ev, { art: false, compact: true, noLocation: true, prefix: isToday(data, day) ? null : day.label });
  }
  left.addSpacer();
  const divider = row.addStack();
  divider.size = new Size(0.5, 0);
  divider.backgroundColor = COLORS.line;
  const right = vstack(row, 5);
  right.size = new Size(128, 0);
  const mh = hstack(right, 5);
  mh.centerAlignContent();
  mailIcon(mh, 14);
  const mail = data.mail;
  text(mh, mail && mail.unread != null ? `${mail.unread} neu` : "Mail", 13, { weight: "semibold" });
  if (!mailError(right, mail) && cfg.mailPreview) {
    const top = mail.items.find((m) => m.unread) || mail.items[0];
    if (top) {
      text(right, top.from, 12, { weight: "semibold" });
      text(right, top.subject, 11, { color: COLORS.muted });
    }
  }
  if (data.tasks && data.tasks.length) {
    right.addSpacer(3);
    taskRow(right, data.tasks[0], { hideDue: true });
  }
  right.addSpacer();
}

async function dayLarge(w, data) {
  const cfg = data.widget.config;
  const head = hstack(w, 6);
  head.bottomAlignContent();
  text(head, data.today.weekday.toUpperCase(), 11, { weight: "bold", color: COLORS.red });
  text(head, `${data.today.day}. ${data.today.month}`, 15, { weight: "semibold" });
  w.addSpacer(6);
  const events = vstack(w, 6);
  const items = flatUpcoming(data, 3);
  if (!items.length) text(events, "Keine Termine", 12, { color: COLORS.muted });
  for (const { ev, day, index } of items) {
    await eventRow(events, ev, { art: cfg.showArt, artSize: 32, compact: true, prefix: isToday(data, day) ? null : day.label });
  }
  w.addSpacer(8);
  const mail = data.mail;
  const mh = hstack(w, 5);
  mh.centerAlignContent();
  mailIcon(mh, 13);
  text(mh, "MAIL", 10, { weight: "bold", color: COLORS.muted });
  mh.addSpacer();
  if (mail && mail.unread != null) text(mh, `${mail.unread} ungelesen`, 10, { color: COLORS.muted });
  w.addSpacer(4);
  if (!mailError(w, mail) && cfg.mailPreview) {
    const list = vstack(w, 6);
    for (const m of mail.items.slice(0, 2)) mailRow(list, m);
  }
  if (data.tasks && data.tasks.length) {
    w.addSpacer(8);
    text(w, "AUFGABEN", 10, { weight: "bold", color: COLORS.muted });
    w.addSpacer(4);
    const list = vstack(w, 5);
    for (const t of data.tasks.slice(0, 3)) taskRow(list, t);
  }
  w.addSpacer();
}

async function extraLarge(w, data) {
  // iPad: agenda left, mail and tasks (or more days) right.
  const cfg = data.widget.config;
  const row = hstack(w, 18);
  const left = vstack(row, 6);
  const head = hstack(left, 6);
  head.bottomAlignContent();
  text(head, data.today.weekday.toUpperCase(), 11, { weight: "bold", color: COLORS.red });
  text(head, `${data.today.day}. ${data.today.month}`, 15, { weight: "semibold" });
  const rest = await agendaList(left, data, { days: 7, height: 290, art: cfg.showArt, artSize: 38 });
  left.addSpacer();
  const right = vstack(row, 8);
  if (data.mail) {
    mailList(right, data, 4);
  }
  if (data.tasks && data.tasks.length) {
    right.addSpacer(6);
    text(right, "AUFGABEN", 10, { weight: "bold", color: COLORS.muted });
    for (const t of data.tasks.slice(0, 4)) taskRow(right, t);
  }
  if (!data.mail && !data.tasks) {
    if (rest.done) {
      text(right, "Keine weiteren Termine in den nächsten 7 Tagen", 12, { color: COLORS.muted, lines: 2 });
    } else {
      await agendaList(right, data, { days: 7, height: 310, art: cfg.showArt, artSize: 38, from: rest });
    }
  }
  right.addSpacer();
}

// ---------------------------------------------------------------------------
// Sperrbildschirm
// ---------------------------------------------------------------------------

function accessoryCircular(w, data) {
  w.addSpacer();
  if (data.widget.kind === "mail") {
    const icon = w.addImage(SFSymbol.named("envelope.fill").image);
    icon.imageSize = new Size(14, 14);
    icon.centerAlignImage();
    const t = text(w, data.mail && data.mail.unread != null ? data.mail.unread : "–", 16, { weight: "semibold", color: Color.white() });
    t.centerAlignText();
  } else {
    const a = text(w, data.today.weekdayShort.toUpperCase(), 10, { weight: "semibold", color: Color.white() });
    a.centerAlignText();
    const b = text(w, data.today.day, 20, { weight: "semibold", color: Color.white() });
    b.centerAlignText();
  }
  w.addSpacer();
}

function accessoryRectangular(w, data) {
  const white = Color.white();
  if (data.widget.kind === "mail") {
    text(w, `${data.mail && data.mail.unread != null ? data.mail.unread : "–"} ungelesen`, 13, { weight: "semibold", color: white });
    const top = data.mail && data.widget.config.mailPreview ? data.mail.items[0] : null;
    if (top) {
      text(w, top.from, 12, { color: white });
      text(w, top.subject, 11, { color: white });
    }
    return;
  }
  const ev = data.next;
  if (!ev) {
    text(w, "Keine Termine", 13, { weight: "semibold", color: white });
    return;
  }
  text(w, ev.time, 11, { color: white });
  text(w, ev.title, 13, { weight: "semibold", color: white });
  if (ev.location) text(w, ev.location, 11, { color: white });
}

function accessoryInline(w, data) {
  if (data.widget.kind === "mail") {
    text(w, `✉︎ ${data.mail && data.mail.unread != null ? data.mail.unread : "–"} ungelesen`, 12);
    return;
  }
  const ev = data.next;
  text(w, ev ? `${ev.allDay ? "" : ev.time.split("–")[0] + " "}${ev.title}` : "Keine Termine", 12);
}

// ---------------------------------------------------------------------------
// Zusammensetzen
// ---------------------------------------------------------------------------

async function build(family) {
  const param = (args.widgetParameter || "").trim().toLowerCase();
  const override = KIND_PARAM[param];
  const result = await loadData(override);
  const w = new ListWidget();
  const accessory = family.startsWith("accessory");
  if (!accessory) {
    w.backgroundColor = COLORS.bg;
    w.setPadding(14, 14, 14, 14);
  }
  // iOS decides the real interval; ask for roughly every 15 minutes.
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  if (result.error && !result.data) {
    w.url = APP_URL;
    message(w, result.fatal ? "Widget-Schlüssel ungültig" : "Keine Daten", result.error);
    return w;
  }
  const data = result.data;
  const kind = data.widget.kind;
  w.url = `${APP_URL}/?module=${kind === "mail" ? "mail" : "calendar"}`;

  if (family === "accessoryCircular") accessoryCircular(w, data);
  else if (family === "accessoryRectangular") accessoryRectangular(w, data);
  else if (family === "accessoryInline") accessoryInline(w, data);
  else if (family === "extraLarge" && kind === "mail") mailList(w, data, 6);
  else if (family === "extraLarge") await extraLarge(w, data);
  else if (kind === "mail") {
    if (family === "small") mailSmall(w, data);
    else mailList(w, data, family === "large" ? 6 : 3);
  } else if (kind === "day") {
    if (family === "small") await calendarSmall(w, data);
    else if (family === "large") await dayLarge(w, data);
    else await dayMedium(w, data);
  } else {
    if (family === "small") await calendarSmall(w, data);
    else if (family === "large") await calendarLarge(w, data);
    else await calendarMedium(w, data);
  }
  if (!accessory) footer(w, data, result.stale);
  return w;
}

if (config.runsInWidget) {
  Script.setWidget(await build(config.widgetFamily || "medium"));
} else {
  const alert = new Alert();
  alert.title = WIDGET_NAME;
  alert.message = "Vorschau wählen. Zum Hinzufügen: Home-Bildschirm lange drücken › + › Scriptable.";
  const sizes = [
    ["Klein", "small"],
    ["Mittel", "medium"],
    ["Groß", "large"],
    ["Extragroß (iPad)", "extraLarge"],
  ];
  for (const [label] of sizes) alert.addAction(label);
  alert.addCancelAction("Fertig");
  const choice = await alert.presentSheet();
  if (choice >= 0) {
    const family = sizes[choice][1];
    const w = await build(family);
    if (family === "small") await w.presentSmall();
    else if (family === "large") await w.presentLarge();
    else if (family === "extraLarge") await w.presentExtraLarge();
    else await w.presentMedium();
  }
}
Script.complete();
