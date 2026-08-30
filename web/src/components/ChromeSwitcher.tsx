import { useChrome } from "@/components/ChromeProvider";
import { CHROME_OPTIONS, type ChromeStyle } from "@/lib/platform";
import { cn } from "@/lib/utils";

export function ChromeSwitcher({ className }: { className?: string }) {
  const { chrome, setChrome } = useChrome();
  const current = CHROME_OPTIONS.find((option) => option.value === chrome);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="rounded-full bg-muted p-0.5">
        <div className="grid grid-cols-3 gap-0.5">
          {CHROME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "h-8 rounded-full text-sm font-medium leading-none",
                chrome === option.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
              onClick={() => setChrome(option.value as ChromeStyle)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {current?.hint}. Zum Vergleich — später einen Stil festlegen.
      </p>
    </div>
  );
}
