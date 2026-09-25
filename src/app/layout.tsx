import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "AI-Driven Kanban", template: "%s · AI-Driven Kanban" },
  description: "Kanban board where AI proposes subtasks and a human reviews every proposal.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Set by the proxy (ADR 0012). Reading headers also makes every page dynamic, which a
  // per-request nonce requires.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    // next-themes sets the `dark` class on <html> before hydration: suppress that one mismatch.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* Follows the OS theme (no toggle yet). `class` matches Tailwind's `dark` variant. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
