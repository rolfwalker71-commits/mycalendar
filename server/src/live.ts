import { EventEmitter } from "node:events";

export type LiveKind = "calendar" | "mail" | "contacts";

type LivePayload = { kind: LiveKind; at: string };

const bus = new EventEmitter();
bus.setMaxListeners(200);

const listeners = new Map<string, number>();

export function notifyLive(userId: string, kind: LiveKind): void {
  const payload: LivePayload = { kind, at: new Date().toISOString() };
  bus.emit(userId, payload);
}

export function subscribeLive(
  userId: string,
  fn: (payload: LivePayload) => void,
): () => void {
  listeners.set(userId, (listeners.get(userId) ?? 0) + 1);
  bus.on(userId, fn);
  return () => {
    bus.off(userId, fn);
    const n = (listeners.get(userId) ?? 1) - 1;
    if (n <= 0) listeners.delete(userId);
    else listeners.set(userId, n);
  };
}

export function liveUserIds(): string[] {
  return [...listeners.keys()];
}

export function hasLiveListeners(userId?: string): boolean {
  if (userId) return (listeners.get(userId) ?? 0) > 0;
  return listeners.size > 0;
}
