import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Inter } from "next/font/google";
import "./globals.css";
import { CurrentUserProvider } from "@/components/auth/current-user-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { RequestActivityProvider } from "@/components/ui/request-activity-provider";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  DEFAULT_TEXT_SIZE,
  DEFAULT_THEME,
  isAppTextSize,
  isDisplayTheme,
  TEXT_SIZE_COOKIE_NAME,
  THEME_COOKIE_NAME,
  type AppTextSize,
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
async function getInitialAppearance(): Promise<{ initialTheme: DisplayTheme; initialTextSize: AppTextSize }> {
  const cookieTheme = cookies().get(THEME_COOKIE_NAME)?.value;
  let theme = isDisplayTheme(cookieTheme) ? cookieTheme : DEFAULT_THEME;
  const cookieTextSize = cookies().get(TEXT_SIZE_COOKIE_NAME)?.value;
  let textSize = isAppTextSize(cookieTextSize) ? cookieTextSize : DEFAULT_TEXT_SIZE;

  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("preferred_theme, preferred_text_size")
        .eq("id", user.id)
        .maybeSingle();
      if (isDisplayTheme(data?.preferred_theme)) {
        theme = data.preferred_theme;
      }
      if (isAppTextSize(data?.preferred_text_size)) {
        textSize = data.preferred_text_size;
      }
    }
  } catch {
    // Older local databases may not have the preferred_theme column until
    // migration 0064 is applied. The cookie/default fallback keeps boot safe.
  }

  return { initialTheme: theme, initialTextSize: textSize };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { initialTheme, initialTextSize } = await getInitialAppearance();

  return (
    <html lang="en" data-theme={initialTheme} data-text-size={initialTextSize} suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`} suppressHydrationWarning>
        <RequestActivityProvider>
          <LanguageProvider>
            <CurrentUserProvider>
              {children}
              <ServiceWorkerRegister />
            </CurrentUserProvider>
          </LanguageProvider>
        </RequestActivityProvider>
      </body>
    </html>
  );
}
