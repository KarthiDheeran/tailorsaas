import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { CurrentUserProvider } from "@/components/auth/current-user-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "TailorSaaS",
  description: "Order & customer management for the shop",
  applicationName: "TailorSaaS",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TailorSaaS",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

// The persistent sidebar/nav (AppShell) is applied by app/(shell)/layout.tsx,
// not here — print routes (app/orders/[id]/print/**) live outside that route
// group specifically so they render with no app chrome at all, not just a
// print:hidden sidebar. Every other route lives under (shell) and is
// unaffected (route groups don't change URLs).
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`} suppressHydrationWarning>
        <LanguageProvider>
          <CurrentUserProvider>
            {children}
            <ServiceWorkerRegister />
          </CurrentUserProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
