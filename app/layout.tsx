import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { AuthProvider } from "@/lib/auth-context";
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
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
