import { AppLogo } from "@/components/AppLogo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LoginScreen() {
  const denied =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "forbidden";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <AppLogo className="mb-6 size-24" size={96} />
        <h1 className="text-3xl font-semibold tracking-tight">Kalender & Mail</h1>
        <p className="mt-2 text-muted-foreground">
          Google Workspace — privat, selbst gehostet, im Browser und als PWA.
        </p>
        {denied ? (
          <p className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Dieses Google-Konto ist nicht freigeschaltet.
          </p>
        ) : null}
        <a
          href="/api/auth/google"
          className={cn(buttonVariants({ variant: "default" }), "mt-8 w-full")}
        >
          Mit Google anmelden
        </a>
        <p className="mt-4 text-xs text-muted-foreground">
          Nur freigeschaltete Konten. Die Sitzung bleibt auf diesem Gerät. Bestehende Nutzer bitte einmal neu anmelden, damit Mail freigegeben wird.
        </p>
      </div>
    </div>
  );
}
