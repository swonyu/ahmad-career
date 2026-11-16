import SiteFrame from "../components/SiteFrame";
import { getChatGPTUser } from "../chatgpt-auth";
import AccountPanel from "./AccountPanel";
import SignInOptions from "../components/SignInOptions";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your account" };
export default async function AccountPage() {
  const user = await getChatGPTUser();
  return <SiteFrame active="account" narrow><section className="intro compact"><p className="eyebrow">YOUR WORKSPACE</p><h1>You’re in control.</h1><p className="lede">Manage your connected phones, download your records, and choose what stays online.</p></section>{user ? <AccountPanel /> : <section className="card"><h2>Sign in to manage your workspace</h2><p className="muted">Use the same account you used when connecting your phone.</p><SignInOptions destination="account" /></section>}</SiteFrame>;
}
