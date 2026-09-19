/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: unknown[] };

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//, /^\/health$/],
  }),
);

const MAIL_CACHE = "mail-offline-v1";

function shouldCacheMail(url: URL): boolean {
  return (
    (url.pathname.startsWith("/api/mail/threads") ||
      url.pathname.startsWith("/api/mail/messages") ||
      url.pathname.startsWith("/api/mail/labels") ||
      url.pathname === "/api/contacts") &&
    !url.pathname.includes("/attachments/")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !shouldCacheMail(url)) return;
  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) {
          const cache = await caches.open(MAIL_CACHE);
          await cache.put(req, fresh.clone());
        }
        return fresh;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        throw new Error("offline");
      }
    })(),
  );
});

type PushData = {
  title?: string;
  body?: string;
  icon?: string;
  badge?: string;
  image?: string;
  tag?: string;
  data?: { url?: string; module?: string };
};

function readPush(event: PushEvent): PushData {
  if (!event.data) return {};
  try {
    return (event.data.json() ?? {}) as PushData;
  } catch {
    return { body: event.data.text() };
  }
}

// iOS/iPadOS revoke the subscription if a push does not show a notification, so always show one.
self.addEventListener("push", (event) => {
  const data = readPush(event);
  event.waitUntil(
    self.registration.showNotification(data.title || "Kalender & Mail", {
      body: data.body || "",
      icon: data.icon || "/icons/icon-192.png",
      badge: data.badge || "/icons/icon-192.png",
      image: data.image,
      tag: data.tag || "kalender-mail",
      renotify: Boolean(data.tag),
      data: {
        url: data.data?.url || "/",
        module: data.data?.module,
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = String(event.notification.data?.url || "/");
  event.waitUntil(
    (async () => {
      const url = new URL(target, self.location.origin).href;
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        try {
          const focused = "focus" in client ? await client.focus() : client;
          if ("navigate" in focused) {
            await (focused as WindowClient).navigate(url);
            return;
          }
        } catch {
          // Uncontrolled clients (e.g. first launch on iOS) cannot navigate — open fresh below.
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// Browsers may rotate the subscription; re-register it so pushes keep arriving.
self.addEventListener("pushsubscriptionchange", (event) => {
  const change = event as Event & {
    oldSubscription?: PushSubscription | null;
    newSubscription?: PushSubscription | null;
    waitUntil: (p: Promise<unknown>) => void;
  };
  change.waitUntil(
    (async () => {
      let sub = change.newSubscription ?? null;
      if (!sub) {
        const res = await fetch("/api/push/vapid", { credentials: "same-origin" });
        if (!res.ok) return;
        const { publicKey } = (await res.json()) as { publicKey: string };
        const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
        const raw = atob((publicKey + padding).replace(/-/g, "+").replace(/_/g, "/"));
        const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
        sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
      }
      await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
    })().catch(() => undefined),
  );
});
