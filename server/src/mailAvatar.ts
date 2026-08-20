import { createHash } from "node:crypto";

export function gravatarUrl(
  email: string | undefined,
  opts?: { size?: number; fallback?: "404" | "identicon" },
): string | null {
  const value = email?.trim().toLowerCase();
  if (!value || !value.includes("@")) return null;
  const hash = createHash("md5").update(value).digest("hex");
  const size = opts?.size ?? 96;
  const fallback = opts?.fallback ?? "404";
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=${fallback}`;
}
