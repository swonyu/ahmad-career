import type { Metadata, Viewport } from "next";
import { getChatGPTUser } from "../chatgpt-auth";
import PhoneApp from "./PhoneApp";
import "./phone.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Career Finder" },
  description: "Find jobs, build your shortlist and keep track of your next step on iPhone and Android.",
  manifest: "/phone.webmanifest",
  appleWebApp: { capable: true, title: "Career Finder", statusBarStyle: "default" },
  icons: { icon: "/favicon.svg", apple: "/phone-icon.png" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#23634d" };

export default async function PhonePage() {
  const user = await getChatGPTUser();
  return <PhoneApp account={user ? { id: user.userId, email: user.email, name: user.displayName } : null} />;
}
