import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@/lib/utils";

type InputProps = React.ComponentProps<"input"> & {
  onValueChange?: (value: string) => void;
};

function Input({
  className,
  type,
  autoComplete,
  onChange,
  onValueChange,
  value,
  defaultValue,
  ...props
}: InputProps) {
  const rawValue = value;
  const isEmptyDateOrTime =
    (type === "date" || type === "time") &&
    (rawValue === undefined || rawValue === null || rawValue === "");

  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-empty={isEmptyDateOrTime ? "true" : undefined}
      autoComplete={type === "date" || type === "time" ? "off" : autoComplete}
      className={cn(
        "h-11 min-h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-1 text-base font-medium text-foreground transition-colors outline-none placeholder:font-normal placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        isEmptyDateOrTime && "font-normal text-muted-foreground",
        className,
      )}
      value={value as string | number | readonly string[] | undefined}
      defaultValue={defaultValue as string | number | readonly string[] | undefined}
      onValueChange={(next) => {
        const str = String(next ?? "");
        onValueChange?.(str);
        if (onChange) {
          onChange({
            target: { value: str },
            currentTarget: { value: str },
          } as React.ChangeEvent<HTMLInputElement>);
        }
      }}
      {...props}
    />
  );
}

export { Input };
