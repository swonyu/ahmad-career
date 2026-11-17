import { serverI18n } from "../i18n/server";
import SiteFrame from "../components/SiteFrame";
import { getChatGPTUser } from "../chatgpt-auth";
import AccountPanel from "./AccountPanel";
import SignInOptions from "../components/SignInOptions";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your account" };
export default async function AccountPage() {
  const { t } = await serverI18n();
  const user = await getChatGPTUser();
  return <SiteFrame active="account" narrow><section className="intro compact"><p className="eyebrow">{t("ACCOUNT & PRIVACY")}</p><h1>{t("Your workspace. Your choices.")}</h1><p className="lede">{t("Manage your connected phones, download your records, and choose what stays online.")}</p></section>{user ? <AccountPanel expectedAccountId={user.userId} /> : <section className="card"><h2>{t("Sign in to manage your workspace")}</h2><p className="muted">{t("Use the same account you used when connecting your phone.")}</p><SignInOptions destination="account" /></section>}</SiteFrame>;
}
