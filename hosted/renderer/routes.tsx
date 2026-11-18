import type { PageProps } from "../app/request-context";
import HomePage from "../app/page";
import PhonePage from "../app/phone/page";
import ConnectPage from "../app/connect/page";
import AccountPage from "../app/account/page";
import PrivacyPage from "../app/privacy/page";
import SupportPage from "../app/support/page";
import SiteFrame from "../app/components/SiteFrame";
import type { PageBootstrap } from "./bootstrap";

export default function PageContent({ page, context }: Pick<PageBootstrap, "page" | "context">) {
  const props: PageProps = { context };
  switch (page) {
    case "/": return <HomePage {...props} />;
    case "/phone": return <PhonePage {...props} />;
    case "/connect": return <ConnectPage {...props} />;
    case "/account": return <AccountPage {...props} />;
    case "/privacy": return <PrivacyPage {...props} />;
    case "/support": return <SupportPage {...props} />;
    default: return <SiteFrame narrow><section className="card prose"><h1>{context.language === "ar" ? "الصفحة غير موجودة" : "Page not found"}</h1><p>{context.language === "ar" ? "تحقق من الرابط أو عُد إلى التطبيق." : "Check the link or return to the app."}</p><a href="/phone">{context.language === "ar" ? "فتح التطبيق" : "Open app"}</a></section></SiteFrame>;
  }
}
