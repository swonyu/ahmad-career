import type { Metadata } from "next";
import { headers } from "next/headers";
import LocaleProvider from "./i18n/LocaleProvider";
import { cookiePreference, requestLanguage } from "./i18n/core";
import "./globals.css";
import "./i18n/i18n.css";

export const metadata: Metadata = {
  title: { default: "Career Finder", template: "%s · Career Finder" },
  description: "Find jobs, keep a shortlist, and manage your next career step on iPhone and Android.",
  robots: { index: false, follow: false },
  manifest: "/phone.webmanifest",
  appleWebApp: { capable: true, title: "Career Finder", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/favicon-32.png", type: "image/png", sizes: "32x32" }],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const incoming = await headers();
  const language = requestLanguage(incoming.get("cookie") ?? "", incoming.get("accept-language") ?? "");
  return (
    <html lang={language} dir={language === "ar" ? "rtl" : "ltr"} suppressHydrationWarning>
      <head>
        {/* A local blocking script sets only appearance, before first paint. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-init.js" />
      </head>
      <body><LocaleProvider initialLanguage={language} initialPreference={cookiePreference(incoming.get("cookie") ?? "")}>{children}</LocaleProvider></body>
    </html>
  );
}
