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

self.addEventListener("push", (event) => {
  const data = (event.data?.json() ?? {}) as PushData;
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
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) await client.focus();
        if ("navigate" in client) {
          await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
