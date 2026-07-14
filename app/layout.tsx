import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Sitecore Content Transfer",
  description:
    "Move Sitecore content between environments using the Content Transfer and Item Transfer APIs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
