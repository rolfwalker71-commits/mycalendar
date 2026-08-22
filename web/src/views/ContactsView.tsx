import { useCallback, useEffect, useMemo, useState } from "react";
import { Cake, LoaderCircle, Mail, Phone, Search, Settings } from "lucide-react";
import { toast } from "sonner";
import { AppSwitcher } from "@/components/AppSwitcher";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient, ApiError } from "@/lib/api";
import { useLiveSync } from "@/lib/liveSync";
import type { Me } from "@/lib/types";
import type { AppModule } from "@/mail/types";

type Contact = {
  resourceName: string;
  name: string;
  emails: string[];
  phones: { value: string; type?: string }[];
  photoUrl: string | null;
  birthday: { month: number; day: number; year?: number } | null;
  organization?: string | null;
};

function birthdayLabel(b: Contact["birthday"]): string | null {
  if (!b) return null;
  const d = String(b.day).padStart(2, "0");
  const m = String(b.month).padStart(2, "0");
  return b.year ? `${d}.${m}.${b.year}` : `${d}.${m}.`;
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
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [scopeHint, setScopeHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.contacts();
      setContacts(res.contacts);
      setScopeHint(null);
    } catch (err) {
      setContacts([]);
      setScopeHint(err instanceof ApiError ? err.message : "Kontakte nicht verfügbar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveSync(
    useCallback(
      (kind) => {
        if (kind === "contacts") void load();
      },
      [load],
    ),
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        c.emails.some((e) => e.toLowerCase().includes(needle)) ||
        c.phones.some((p) => p.value.includes(needle)) ||
        (c.organization ?? "").toLowerCase().includes(needle),
    );
  }, [contacts, q]);

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
            placeholder="Name, Mail oder Telefon"
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
        ) : !filtered.length ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Keine Kontakte.</p>
        ) : (
          <ul>
            {filtered.map((c) => {
              const email = c.emails[0];
              const phone = c.phones[0]?.value;
              const bday = birthdayLabel(c.birthday);
              return (
                <li key={c.resourceName} className="flex items-center gap-3 border-b border-border px-4 py-3">
                  <Avatar className="size-10">
                    {c.photoUrl ? <AvatarImage src={c.photoUrl} alt="" /> : null}
                    <AvatarFallback>{c.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {c.organization || email || phone || "—"}
                    </p>
                    {bday ? (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Cake className="size-3" />
                        {bday}
                      </p>
                    ) : null}
                  </div>
                  {phone ? (
                    <Button variant="ghost" size="icon" aria-label="Anrufen" render={<a href={`tel:${phone.replace(/\s/g, "")}`} />}>
                      <Phone className="size-5" />
                    </Button>
                  ) : null}
                  {email ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Mail schreiben"
                      onClick={() => onMailTo(email)}
                    >
                      <Mail className="size-5" />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="px-4 py-2 text-[0.6875rem] text-muted-foreground">
        {me.name || me.email} · Geburtstage erscheinen im Kalender „Geburtstage“.
      </p>
    </div>
  );
}
