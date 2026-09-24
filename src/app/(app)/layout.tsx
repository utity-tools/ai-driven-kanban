import { AppHeader } from "@/components/app/app-header";
import { Toaster } from "@/components/ui/sonner";

// Pages set their own width: lists are centred, the board uses the full width.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <AppHeader />
      <main className="flex min-h-0 w-full flex-1 flex-col">{children}</main>
      {/* Toasts are announced politely by Sonner's live region. */}
      <Toaster position="bottom-right" closeButton />
    </>
  );
}
