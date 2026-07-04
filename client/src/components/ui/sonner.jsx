import { Toaster as Sonner } from "sonner";

export function Toaster(props) {
  return (
    <Sonner
      position="top-center"
      richColors
      closeButton
      toastOptions={{ classNames: { toast: "rounded-lg border shadow-lg" } }}
      {...props}
    />
  );
}
