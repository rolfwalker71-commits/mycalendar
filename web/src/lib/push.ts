import { apiClient } from "./api";
import { isStandalonePwa } from "./pwa";
import { isAppleMobile } from "./platform";

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * iPhone/iPad only offer Web Push to web apps opened from the Home Screen (iOS 16.4+).
 * In a Safari tab PushManager is missing, so explain how to install instead.
 */
export function pushNeedsHomeScreen(): boolean {
  return isAppleMobile() && !isStandalonePwa();
}

export function pushUnsupportedReason(): string {
  if (pushNeedsHomeScreen()) {
    return "Auf iPhone und iPad funktionieren Mitteilungen nur in der installierten App: In Safari Teilen › „Zum Home-Bildschirm“ wählen und die App dann vom Home-Bildschirm öffnen.";
  }
  return "Dieser Browser unterstützt keine Web-Push-Benachrichtigungen.";
}

async function serviceWorkerReady(): Promise<ServiceWorkerRegistration> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Service Worker ist nicht bereit. Bitte die App neu laden.")), 10_000),
  );
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await serviceWorkerReady();
  return reg.pushManager.getSubscription();
}

function sameKey(sub: PushSubscription, publicKey: string): boolean {
  const current = sub.options?.applicationServerKey;
  if (!current) return true;
  const a = new Uint8Array(current);
  const b = new Uint8Array(urlBase64ToUint8Array(publicKey) as ArrayBuffer);
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

async function subscribeWithKey(publicKey: string): Promise<PushSubscription> {
  const reg = await serviceWorkerReady();
  const existing = await reg.pushManager.getSubscription();
  if (existing && sameKey(existing, publicKey)) return existing;
  if (existing) await existing.unsubscribe().catch(() => undefined);
  const applicationServerKey = urlBase64ToUint8Array(publicKey);
  try {
    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  } catch {
    const old = await reg.pushManager.getSubscription();
    await old?.unsubscribe();
    return reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }
}

export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) {
    throw new Error(pushUnsupportedReason());
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return false;
  const { publicKey } = await apiClient.pushVapid();
  const sub = await subscribeWithKey(publicKey);
  await apiClient.pushSubscribe(sub.toJSON());
  return true;
}

export async function disablePush(): Promise<void> {
  const sub = await getExistingSubscription();
  const endpoint = sub?.endpoint;
  if (sub) await sub.unsubscribe();
  await apiClient.pushUnsubscribe(endpoint);
}

export async function syncExistingPushSubscription(): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  const existing = await getExistingSubscription();
  const { publicKey } = await apiClient.pushVapid();
  // Re-subscribe when the server's VAPID key changed, otherwise pushes silently fail.
  const sub = existing && sameKey(existing, publicKey) ? existing : await subscribeWithKey(publicKey);
  await apiClient.pushSubscribe(sub.toJSON());
}
