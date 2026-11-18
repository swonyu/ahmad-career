import type { ReactNode } from "react";
import LocaleProvider from "./i18n/LocaleProvider";
import { metadata as phoneMetadata, viewport } from "./phone/page";
import { serializeBootstrap, type PageBootstrap } from "../renderer/bootstrap";

export const metadata = {
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

export default function RootLayout({ children, bootstrap }: Readonly<{ children: ReactNode; bootstrap: PageBootstrap }>) {
  const { context, assets, page } = bootstrap;
  const phone = page === "/" || page === "/phone";
  const pageTitles = { "/account": "Your account", "/privacy": "Privacy", "/support": "Help and support", "not-found": context.language === "ar" ? "الصفحة غير موجودة" : "Page not found" };
  const title = page in pageTitles ? pageTitles[page as keyof typeof pageTitles] + " · Career Finder" : metadata.title.default;
  return (
    <html lang={context.language} dir={context.language === "ar" ? "rtl" : "ltr"} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content={"width=device-width, initial-scale=1" + (phone ? ", viewport-fit=" + viewport.viewportFit : "")} />
        <title>{title}</title>
        <meta name="description" content={phone ? phoneMetadata.description : metadata.description} />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="manifest" href="/phone.webmanifest" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Career Finder" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {phone ? viewport.themeColor.map(color => <meta key={color.media} name="theme-color" media={color.media} content={color.color} />) : null}
        {/* A local blocking script sets only appearance, before first paint. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-init.js" />
        <link rel="stylesheet" href={assets.styles} />
        {phone ? <link rel="stylesheet" href={assets.phoneStyles} /> : null}
      </head>
      <body>
        <LocaleProvider initialLanguage={context.language} initialPreference={context.languagePreference}>{children}</LocaleProvider>
        <script id="career-bootstrap" type="application/json" dangerouslySetInnerHTML={{ __html: serializeBootstrap(bootstrap) }} />
        <script type="module" src={assets.client} defer />
      </body>
    </html>
  );
}
