import SiteFrame from "../components/SiteFrame";
import { getChatGPTUser } from "../chatgpt-auth";
import ConnectionPanel from "./ConnectionPanel";
export const dynamic = "force-dynamic";
export default async function ConnectPage() {
  const user = await getChatGPTUser();
  return <SiteFrame active="connect"><section className="intro"><span className="eyebrow"><span className="status-dot" /> IPHONE & ANDROID</span><h1>Your next chapter.<br /><em>Connected.</em></h1><p className="lede">Bring your profile, saved opportunities, and application records together on your phone.</p></section>
    <div className="connect-grid"><ConnectionPanel signedIn={Boolean(user)} displayName={user?.displayName ?? ""} />
      <aside className="setup-guide" aria-labelledby="setup-heading"><p className="eyebrow">A MOMENT TO SET UP</p><h2 id="setup-heading">One workspace.<br />Your own devices.</h2><ol className="steps"><li><span className="step-number">1</span><div><h3>Sign in securely</h3><p>Use your ChatGPT account to create or recover your private Career Finder workspace.</p></div></li><li><span className="step-number">2</span><div><h3>Get a connection code</h3><p>Generate a private code, then enter it in the phone app. It works once and expires in five minutes.</p></div></li><li><span className="step-number">3</span><div><h3>Choose what to save</h3><p>Review your phone draft before saving it online. Connecting alone does not upload your existing CV.</p></div></li></ol><div className="quiet-note"><span aria-hidden="true">✓</span><p>You review each application before approving Auto Apply. A verified receipt requires confirmation from the supported provider.</p></div></aside>
    </div><section className="feature-strip" aria-label="Your controls"><div><h3>Private by default</h3><p>Your CV and application records belong to your workspace.</p></div><div><h3>Recover your workspace</h3><p>Sign in with the same account to connect a new phone.</p></div><div><h3>Keep control</h3><p>Export records, disconnect devices, or delete your cloud workspace.</p></div></section></SiteFrame>;
}
