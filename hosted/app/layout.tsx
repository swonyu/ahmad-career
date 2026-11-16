import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Career Finder", template: "%s · Career Finder" },
  description: "Find jobs, keep a shortlist, and manage your next career step on iPhone and Android.",
  robots: { index: false, follow: false },
  manifest: "/phone.webmanifest",
  appleWebApp: { capable: true, title: "Career Finder", statusBarStyle: "default" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/phone-icon.png",
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
