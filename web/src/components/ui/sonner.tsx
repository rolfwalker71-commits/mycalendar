import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/components/ThemeProvider";

function Toaster(props: ToasterProps) {
  const { dark } = useTheme();
  return (
    <Sonner
      theme={dark ? "dark" : "light"}
      className="toaster group"
      position="top-center"
      richColors
      closeButton
      {...props}
    />
  );
}

export { Toaster };
