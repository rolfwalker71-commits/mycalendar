import { useCallback, useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import {
  Cake,
  CalendarPlus,
  LoaderCircle,
  Mail,
  MessageCircle,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Search,
  Settings,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { AppSwitcher } from "@/components/AppSwitcher";
import { EventMapSnippet } from "@/components/EventMap";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DateField, TimeField } from "@/components/DateTimeFields";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient, ApiError } from "@/lib/api";
import { now, ZONE } from "@/lib/dates";
import { useLiveSync } from "@/lib/liveSync";
import type { ContactCard, Me } from "@/lib/types";
import type { AppModule } from "@/mail/types";
import { cn } from "@/lib/utils";

function birthdayLabel(b: ContactCard["birthday"]): string | null {
  if (!b) return null;
  const d = String(b.day).padStart(2, "0");
  const m = String(b.month).padStart(2, "0");
  return b.year ? `${d}.${m}.${b.year}` : `${d}.${m}.`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function smsHref(phone: string): string {
  return `sms:${phone.replace(/[^\d+]/g, "")}`;
}

function waHref(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `49${digits.slice(1)}`;
  return `https://wa.me/${digits}`;
}

function ContactRow({
  contact,
  open,
  onToggle,
  onMailTo,
  onEvent,
  onEdit,
  onDelete,
  onAdopt,
  adopting,
}: {
  contact: ContactCard;
  open: boolean;
  onToggle: () => void;
  onMailTo: (email: string) => void;
  onEvent: (contact: ContactCard) => void;
  onEdit?: (contact: ContactCard) => void;
  onDelete?: (contact: ContactCard) => void;
  onAdopt?: (contact: ContactCard) => void;
  adopting?: boolean;
}) {
  const email = contact.emails[0];
  const phone = contact.phones[0]?.value;
  const address = contact.addresses[0];
  const bday = birthdayLabel(contact.birthday);
  return (
    <li className="border-b border-border">
      <button
        type="button"
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
        onClick={onToggle}
        aria-expanded={open}
      >
        <Avatar className="size-10">
          {contact.photoUrl ? <AvatarImage src={contact.photoUrl} alt="" /> : null}
          <AvatarFallback>{contact.name.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{contact.name}</span>
          <span className="block truncate text-sm text-muted-foreground">
            {contact.organization || email || phone || address || "—"}
          </span>
          {bday ? (
            <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Cake className="size-3" />
              {bday}
            </span>
          ) : null}
        </span>
      </button>
      {open ? (
        <div className="flex flex-col gap-3 px-4 pb-4">
          {contact.phones.length ? (
            <div className="flex flex-wrap gap-2">
              {contact.phones.map((p) => (
                <div key={p.value} className="flex flex-wrap items-center gap-1">
                  <span className="mr-1 text-sm text-muted-foreground">{p.value}</span>
                  <Button variant="outline" size="icon" className="size-11" aria-label="Anrufen" render={<a href={telHref(p.value)} />}>
                    <Phone className="size-5" />
                  </Button>
                  <Button variant="outline" size="icon" className="size-11" aria-label="SMS" render={<a href={smsHref(p.value)} />}>
                    <MessageSquare className="size-5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-11"
                    aria-label="WhatsApp"
                    render={<a href={waHref(p.value)} target="_blank" rel="noreferrer" />}
                  >
                    <MessageCircle className="size-5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
          {contact.emails.length ? (
            <div className="flex flex-wrap gap-2">
              {contact.emails.map((addr) => (
                <Button key={addr} variant="outline" className="min-h-11" onClick={() => onMailTo(addr)}>
                  <Mail className="size-4" />
                  {addr}
                </Button>
              ))}
            </div>
          ) : null}
          {address ? (
            <div>
              <p className="text-sm">{address}</p>
              <EventMapSnippet location={address} summary={contact.name} className="mt-2" />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => onEvent(contact)}>
              <CalendarPlus className="size-4" />
              In den Kalender
            </Button>
            {onEdit ? (
              <Button variant="outline" className="min-h-11" onClick={() => onEdit(contact)}>
                <Pencil className="size-4" />
                Bearbeiten
              </Button>
            ) : null}
            {onDelete ? (
              <Button variant="outline" className="min-h-11 text-destructive" onClick={() => onDelete(contact)}>
                <Trash2 className="size-4" />
                Löschen
              </Button>
            ) : null}
            {onAdopt ? (
              <Button variant="outline" className="min-h-11" disabled={adopting} onClick={() => onAdopt(contact)}>
                <UserPlus className="size-4" />
                Ins Adressbuch
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function ContactsView({
  me,
  onLogout,
  module,
  onModule,
  onOpenSettings,
  onMailTo,
}: {
  me: Me;
  onLogout: () => void;
  module: AppModule;
  onModule: (next: AppModule) => void;
  onOpenSettings: () => void;
  onMailTo: (email: string) => void;
}) {
  const [contacts, setContacts] = useState<ContactCard[]>([]);
  const [other, setOther] = useState<ContactCard[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [scopeHint, setScopeHint] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adopting, setAdopting] = useState<string | null>(null);
  const [eventFor, setEventFor] = useState<ContactCard | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState(() => now().toISODate() ?? "");
  const [eventTime, setEventTime] = useState("10:00");
  const [eventSaving, setEventSaving] = useState(false);
  const [editor, setEditor] = useState<"new" | ContactCard | null>(null);
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [organization, setOrganization] = useState("");
  const [address, setAddress] = useState("");
  const [birthday, setBirthday] = useState("");
  const [editorSaving, setEditorSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ContactCard | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.contacts();
      setContacts(res.contacts);
      setOther(res.other ?? []);
      setScopeHint(null);
    } catch (err) {
      setContacts([]);
      setOther([]);
      setScopeHint(err instanceof ApiError ? err.message : "Kontakte nicht verfügbar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useLiveSync(
    useCallback(
      (kind) => {
        if (kind === "contacts") void load();
      },
      [load],
    ),
  );

  useEffect(() => {
    void load();
  }, [load]);

  const filteredMine = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        c.emails.some((e) => e.toLowerCase().includes(needle)) ||
        c.phones.some((p) => p.value.includes(needle)) ||
        c.addresses.some((a) => a.toLowerCase().includes(needle)) ||
        (c.organization ?? "").toLowerCase().includes(needle),
    );
  }, [contacts, q]);

  const filteredOther = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return other;
    return other.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        c.emails.some((e) => e.toLowerCase().includes(needle)) ||
        c.phones.some((p) => p.value.includes(needle)),
    );
  }, [other, q]);

  function fillEditor(contact?: ContactCard) {
    if (!contact) {
      setGivenName("");
      setFamilyName("");
      setEmail("");
      setPhone("");
      setOrganization("");
      setAddress("");
      setBirthday("");
      return;
    }
    const parts = contact.name.trim().split(/\s+/);
    setGivenName(contact.givenName || parts[0] || "");
    setFamilyName(contact.familyName || parts.slice(1).join(" "));
    setEmail(contact.emails[0] ?? "");
    setPhone(contact.phones[0]?.value ?? "");
    setOrganization(contact.organization ?? "");
    setAddress(contact.addresses[0] ?? "");
    if (contact.birthday) {
      const y = contact.birthday.year ?? now().year;
      const m = String(contact.birthday.month).padStart(2, "0");
      const d = String(contact.birthday.day).padStart(2, "0");
      setBirthday(`${y}-${m}-${d}`);
    } else {
      setBirthday("");
    }
  }

  function openEditor(contact?: ContactCard) {
    fillEditor(contact);
    setEditor(contact ?? "new");
  }

  function editorPayload() {
    return {
      givenName: givenName.trim(),
      familyName: familyName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      organization: organization.trim(),
      address: address.trim(),
      birthday: birthday || null,
    };
  }

  async function saveEditor() {
    if (!givenName.trim() && !familyName.trim()) {
      toast.error("Vor- oder Nachname fehlt.");
      return;
    }
    setEditorSaving(true);
    try {
      const body = editorPayload();
      const res =
        editor && editor !== "new"
          ? await apiClient.patchContact({ ...body, resourceName: editor.resourceName })
          : await apiClient.createContact(body);
      setContacts((xs) => {
        const next = editor && editor !== "new"
          ? xs.map((c) => (c.resourceName === editor.resourceName ? res.contact : c))
          : [...xs, res.contact];
        return next.sort((a, b) => a.name.localeCompare(b.name, "de"));
      });
      setOpenId(res.contact.resourceName);
      setEditor(null);
      toast.success(editor === "new" ? "Kontakt angelegt." : "Kontakt gespeichert.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Speichern fehlgeschlagen. Bitte Google neu verbinden.");
    } finally {
      setEditorSaving(false);
    }
  }

  async function removeContact(contact: ContactCard) {
    try {
      await apiClient.deleteContact(contact.resourceName);
      setContacts((xs) => xs.filter((c) => c.resourceName !== contact.resourceName));
      if (openId === contact.resourceName) setOpenId(null);
      setConfirmDelete(null);
      toast.success("Kontakt gelöscht.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Löschen fehlgeschlagen.");
    }
  }

  function openEvent(contact: ContactCard) {
    setEventFor(contact);
    setEventTitle(`Kaffee mit ${firstName(contact.name)}`);
    setEventDate(now().toISODate() ?? "");
    setEventTime("10:00");
  }

  async function saveEvent() {
    if (!eventFor || !eventTitle.trim() || !eventDate) return;
    const start = DateTime.fromISO(`${eventDate}T${eventTime}`, { zone: ZONE });
    if (!start.isValid) {
      toast.error("Datum oder Uhrzeit ungültig.");
      return;
    }
    setEventSaving(true);
    try {
      await apiClient.contactEvent({
        summary: eventTitle.trim(),
        start: start.toISO() ?? "",
        end: start.plus({ hours: 1 }).toISO() ?? "",
        location: eventFor.addresses[0],
        email: eventFor.emails[0],
        name: eventFor.name,
      });
      toast.success("Termin liegt im Kalender.");
      setEventFor(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Termin fehlgeschlagen.");
    } finally {
      setEventSaving(false);
    }
  }

  async function adopt(contact: ContactCard) {
    setAdopting(contact.resourceName);
    try {
      const res = await apiClient.adoptContact(contact.resourceName);
      setOther((xs) => xs.filter((c) => c.resourceName !== contact.resourceName));
      setContacts((xs) =>
        [...xs, res.contact].sort((a, b) => a.name.localeCompare(b.name, "de")),
      );
      setOpenId(res.contact.resourceName);
      toast.success(`${contact.name} ist im Adressbuch.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Übernehmen fehlgeschlagen. Bitte Google neu verbinden.");
    } finally {
      setAdopting(null);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 lg:px-4">
        <AppSwitcher value={module} onChange={onModule} />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Einstellungen" onClick={onOpenSettings}>
            <Settings className="size-5" />
          </Button>
          <Button variant="ghost" onClick={() => apiClient.logout().finally(onLogout)}>
            Abmelden
          </Button>
        </div>
      </header>
      <div className="border-b border-border px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onValueChange={setQ}
            placeholder="Name, Mail, Telefon oder Adresse"
            className="rounded-full bg-muted pl-9"
            aria-label="Kontakte suchen"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Laden…
          </div>
        ) : scopeHint ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <p>{scopeHint}</p>
            <a href="/api/auth/google" className="mt-3 inline-block text-foreground underline">
              Google erneut verbinden
            </a>
          </div>
        ) : !filteredMine.length && !filteredOther.length ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Keine Kontakte. Unten rechts anlegen.
          </p>
        ) : (
          <>
            <ul>
              {filteredMine.map((c) => (
                <ContactRow
                  key={c.resourceName}
                  contact={c}
                  open={openId === c.resourceName}
                  onToggle={() => setOpenId((id) => (id === c.resourceName ? null : c.resourceName))}
                  onMailTo={onMailTo}
                  onEvent={openEvent}
                  onEdit={openEditor}
                  onDelete={setConfirmDelete}
                />
              ))}
            </ul>
            {filteredOther.length ? (
              <section>
                <h2 className={cn("px-4 pt-5 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground")}>
                  Aus Mails
                </h2>
                <p className="px-4 pb-2 text-xs text-muted-foreground">
                  Google kennt diese Personen nur aus Nachrichten. Übernehmen legt sie ins Adressbuch.
                </p>
                <ul>
                  {filteredOther.map((c) => (
                    <ContactRow
                      key={c.resourceName}
                      contact={c}
                      open={openId === c.resourceName}
                      onToggle={() => setOpenId((id) => (id === c.resourceName ? null : c.resourceName))}
                      onMailTo={onMailTo}
                      onEvent={openEvent}
                      onAdopt={adopt}
                      adopting={adopting === c.resourceName}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
      <p className="px-4 py-2 pb-24 text-[0.6875rem] text-muted-foreground lg:pb-2">
        {me.name || me.email} · Tippen öffnet den Kontakt. Bearbeiten ändert ihn in Google Kontakte.
      </p>
      <Button
        className="fixed right-4 bottom-6 z-40 size-14 rounded-full shadow-lg"
        size="icon"
        aria-label="Neuer Kontakt"
        onClick={() => openEditor()}
      >
        <Plus className="size-6" />
      </Button>
      <Dialog open={Boolean(eventFor)} onOpenChange={(open) => !open && setEventFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Termin mit {eventFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-event-title">Titel</Label>
              <Input id="contact-event-title" value={eventTitle} onValueChange={setEventTitle} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Datum</Label>
                <DateField value={eventDate} onValueChange={setEventDate} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Uhrzeit</Label>
                <TimeField value={eventTime} onValueChange={setEventTime} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEventFor(null)}>
              Abbrechen
            </Button>
            <Button onClick={() => void saveEvent()} disabled={eventSaving || !eventTitle.trim()}>
              Anlegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="max-h-[min(90dvh,40rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editor === "new" ? "Neuer Kontakt" : "Kontakt bearbeiten"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contact-given">Vorname</Label>
                <Input id="contact-given" value={givenName} onValueChange={setGivenName} autoComplete="given-name" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contact-family">Nachname</Label>
                <Input id="contact-family" value={familyName} onValueChange={setFamilyName} autoComplete="family-name" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-phone">Telefon</Label>
              <Input id="contact-phone" value={phone} onValueChange={setPhone} type="tel" autoComplete="tel" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-email">E-Mail</Label>
              <Input id="contact-email" value={email} onValueChange={setEmail} type="email" autoComplete="email" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-org">Firma</Label>
              <Input id="contact-org" value={organization} onValueChange={setOrganization} autoComplete="organization" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-address">Adresse</Label>
              <Input id="contact-address" value={address} onValueChange={setAddress} autoComplete="street-address" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Geburtstag</Label>
              <DateField value={birthday} onValueChange={setBirthday} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor(null)}>
              Abbrechen
            </Button>
            <Button onClick={() => void saveEditor()} disabled={editorSaving || (!givenName.trim() && !familyName.trim())}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(confirmDelete)} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Kontakt löschen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmDelete?.name} wird aus Google Kontakte entfernt.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={() => confirmDelete && void removeContact(confirmDelete)}>
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
