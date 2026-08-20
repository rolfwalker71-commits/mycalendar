import { apiClient } from "./api";

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

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function subscribeWithKey(publicKey: string): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.ready;
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
    throw new Error("Dieser Browser unterstützt keine Web-Push-Benachrichtigungen.");
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
  if (existing) {
    await apiClient.pushSubscribe(existing.toJSON());
    return;
  }
  await enablePush();
}
