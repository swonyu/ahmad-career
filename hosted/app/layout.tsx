import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Career Finder · Connect your phone", template: "%s · Career Finder" },
  description: "Connect Career Finder on iPhone and Android. Manage your private workspace, phone connections, and application records.",
  robots: { index: false, follow: false },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
