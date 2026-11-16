import SiteFrame from "../components/SiteFrame";
import { getChatGPTUser } from "../chatgpt-auth";
import AccountPanel from "./AccountPanel";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your account" };
export default async function AccountPage() {
  const user = await getChatGPTUser();
  return <SiteFrame active="account" narrow><section className="intro compact"><p className="eyebrow">YOUR WORKSPACE</p><h1>You’re in control.</h1><p className="lede">Manage your connected phones, download your records, and choose what stays online.</p></section>{user ? <AccountPanel /> : <section className="card"><h2>Sign in to manage your workspace</h2><p className="muted">Use the same ChatGPT account you used when connecting your phone.</p><a className="button primary" href="/signin-with-chatgpt?return_to=%2Faccount" target="_top">Continue with ChatGPT <svg className="arrow-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8" /></svg></a></section>}</SiteFrame>;
}
