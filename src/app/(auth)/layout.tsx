export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 justify-center px-4 py-16 sm:py-24">
      <div className="grid w-full max-w-sm content-start gap-8">{children}</div>
    </main>
  );
}
