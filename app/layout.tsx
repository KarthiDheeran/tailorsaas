import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "TailorSaaS",
  description: "Order & customer management for the shop",
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
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
