import { cn } from "@/lib/utils";

export function AppLogo({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <img
      src="/logo.png"
      alt="Kalender & Mail"
      width={size}
      height={size}
      decoding="async"
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
