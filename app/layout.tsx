import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Inter } from "next/font/google";
import "./globals.css";
import { CurrentUserProvider } from "@/components/auth/current-user-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  DEFAULT_THEME,
  isDisplayTheme,
  THEME_COOKIE_NAME,
  type DisplayTheme,
} from "@/lib/theme";

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
  themeColor: "#1F6B57",
};

// The persistent app navigation (AppShell) is applied by app/(shell)/layout.tsx,
// not here — print routes (app/orders/[id]/print/**) live outside that route
// group specifically so they render with no app chrome at all, not just a
// print:hidden shell. Every other route lives under (shell) and is
// unaffected (route groups don't change URLs).
async function getInitialTheme(): Promise<DisplayTheme> {
  const cookieTheme = cookies().get(THEME_COOKIE_NAME)?.value;
  let theme = isDisplayTheme(cookieTheme) ? cookieTheme : DEFAULT_THEME;

  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("preferred_theme")
        .eq("id", user.id)
        .maybeSingle();
      if (isDisplayTheme(data?.preferred_theme)) {
        theme = data.preferred_theme;
      }
    }
  } catch {
    // Older local databases may not have the preferred_theme column until
    // migration 0064 is applied. The cookie/default fallback keeps boot safe.
  }

  return theme;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialTheme = await getInitialTheme();

  return (
    <html lang="en" data-theme={initialTheme} suppressHydrationWarning>
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
