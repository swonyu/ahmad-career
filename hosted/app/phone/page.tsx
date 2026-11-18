import type { PageProps } from "../request-context";
import { getChatGPTUser } from "../chatgpt-auth";
import PhoneApp from "./PhoneApp";

export const dynamic = "force-dynamic";
export const metadata = {
  title: { absolute: "Career Finder" },
  description: "Search selected employer boards, save jobs and prepare applications on iPhone and Android.",
  manifest: "/phone.webmanifest",
  appleWebApp: { capable: true, title: "Career Finder", statusBarStyle: "default" },
  icons: { icon: [{ url: "/favicon.ico" }, { url: "/favicon-32.png", sizes: "32x32", type: "image/png" }], apple: "/apple-touch-icon.png" },
};
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f5f6fa" }, { media: "(prefers-color-scheme: dark)", color: "#10121b" }] };

export default function PhonePage({ context }: PageProps) {
  const user = getChatGPTUser(context);
  return <PhoneApp account={user ? { id: user.userId, email: user.email, name: user.displayName } : null} />;
}
