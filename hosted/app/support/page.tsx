import SiteFrame from "../components/SiteFrame";

export const metadata = { title: "Help and support" };

export default function SupportPage() {
  return <SiteFrame active="support" narrow>
    <section className="intro compact"><p className="eyebrow">HELP AND SUPPORT</p><h1>Find your<br /><em>next step.</em></h1><p className="lede">Start with a job search. Connect your phone when you want to save your application profile online.</p></section>
    <nav className="help-topics" aria-label="Help topics"><a href="#getting-started">Get started</a><a href="#connection">Sign in</a><a href="#linkedin">LinkedIn</a><a href="#applications">Applications</a><a href="#your-data">Your data</a><a href="#troubleshooting">Get help</a></nav>
    <section className="card prose" id="getting-started">
      <h2>Get started in three steps</h2>
      <p><a href="/phone">Open Career Finder</a> in your phone browser. The four sections are <strong>Search</strong>, <strong>Saved</strong>, <strong>Apply</strong>, and <strong>Profile</strong>.</p>
      <ol><li><strong>Find a job.</strong> Search in the phone app, or save a job link you already have. You can browse without signing in.</li><li><strong>Prepare your profile.</strong> Add your contact details and choose your PDF CV. Review your information before saving it online.</li><li><strong>Choose how to apply.</strong> Open the employer’s form, or review an application for Auto Apply when an authorized integration is available.</li></ol>
      <details><summary>How does job search work?</summary><p>Choose up to four public employer boards, add a role or keywords, and optionally add a location or select remote roles. You can add a public Greenhouse or Lever employer-board address.</p><p>Search covers the boards you select. Check the original posting for requirements and location restrictions, including for remote jobs.</p><p>If a source cannot refresh, the app shows when any retained results were last checked. A source error is different from finding no matching jobs. If results change while you load another page, start a new search.</p></details>
      <details><summary>How do I keep track after applying?</summary><p>Open a job in Saved and choose Edit application record. Add a stage, applied date, follow-up date, or private note. The Follow-ups filter lists open records in date order. These details stay on the phone and do not create an employer-confirmed receipt.</p><p>Removing a bookmark keeps its application record. Closing an application keeps the applied mark. To correct an applied mark, choose Saved and confirm Mark as not applied; this does not withdraw an employer-held application.</p></details>
      <details><summary>Can I add the web app to my home screen?</summary><p>On iPhone, open Career Finder in Safari, tap Share, then Add to Home Screen. On Android, open the browser menu and choose Add to Home screen or Install app if offered. An internet connection is needed to open this web app and confirm an account. Clearing browser data can remove its local drafts.</p></details>
    </section>
    <section className="card prose" id="connection">
      <h2>Sign in and connect your phone</h2>
      <p><strong>Using the web app?</strong> Open Profile, sign in, and choose Create private workspace. You do not need a connection code. Save on this phone keeps a draft locally; Save profile online uploads the details and CV you selected.</p>
      <p><strong>Using the native iPhone or Android app?</strong> Follow these connection steps:</p>
      <ol><li>Open <a href="/connect">Connect</a> and continue to secure sign-in. To use Google, choose <strong>Continue with Google</strong> on the ChatGPT sign-in screen.</li><li>Create a connection code. Open the connection settings in the phone app and enter the code.</li><li>Review your phone draft, then choose what to save online. Connecting alone does not upload your CV.</li></ol>
      <p>A code works once and expires after five minutes. Use the same account when you connect another phone to recover your saved information.</p>
      <details><summary>Is this a direct Google sign-in?</summary><p>The hosted preview uses ChatGPT sign-in, which offers Google. It is not a separate Career Finder Google account. Use the same Google-linked ChatGPT account or other sign-in method each time to keep the same saved workspace. Career Finder does not receive your Google password.</p></details>
      <details><summary>Why must my application email match?</summary><p>Auto Apply uses the email of the account you connected. This helps prevent someone from submitting under another person’s email. You can keep a different email in a local draft and use an employer’s own form.</p></details>
      <details><summary>My code expired or my phone is lost</summary><p>Generate a new code if the old one expired. For a lost phone, open <a href="/account">Account</a> and disconnect it, then connect your replacement. Disconnecting stops future account access; it cannot erase files already on a device.</p></details>
    </section>
    <section className="card prose" id="linkedin">
      <h2>Use your LinkedIn profile</h2>
      <p>Add your personal LinkedIn profile URL in the phone app’s profile form. It is optional and separate from your portfolio. The app removes tracking information from the link.</p><p>Choose <strong>Search LinkedIn</strong> to open LinkedIn with your search keywords and location. Finish any LinkedIn sign-in or application on LinkedIn.</p>
      <details><summary>What does saving a LinkedIn link do?</summary><p>It saves the profile link you provide. It does not connect or verify your LinkedIn account, import your employment history, or allow Career Finder to apply through LinkedIn. You will see the exact link in an application review before an authorized employer integration can receive it.</p></details>
      <details><summary>Can I change or remove the link?</summary><p>Yes. Edit or clear the LinkedIn field and save your profile. Prepare a new application review after any change. Earlier application records keep the information you approved at the time.</p></details>
    </section>
    <section className="card prose" id="applications">
      <h2>Understand your application status</h2>
      <dl><dt>Ready for approval</dt><dd>Check the employer, profile, CV, links, and answers. Nothing is sent until you approve.</dd><dt>Confirmed receipt</dt><dd>The supported provider returned an application ID. This confirms receipt, not recruiter review or selection.</dd><dt>Uncertain</dt><dd>We could not confirm receipt. Check your email or the employer’s application portal before trying again. Auto Apply blocks a resend to avoid duplicates.</dd><dt>Rate limited</dt><dd>The provider asked you to wait. After the displayed waiting period, reopen the review and approve a retry.</dd><dt>Manual application</dt><dd>Use the employer’s application page. Saving a job or marking it applied elsewhere does not create a verified receipt.</dd></dl>
      <details><summary>Why is Auto Apply unavailable?</summary><p>An employer must authorize its integration and provide current application requirements. Jobs with unsupported questions use the employer’s own form. A saved profile or LinkedIn link does not enable an employer integration.</p></details>
      <details><summary>Should I keep the app open?</summary><p>Yes, while approved applications are processing. Closing the app can leave unsent work waiting until you return. A request that has already started may finish after you close the app. Stop prevents remaining unsent applications; it cannot recall a request already sent.</p></details>
    </section>
    <section className="card prose" id="your-data">
      <h2>Keep control of your data</h2>
      <p>Open <a href="/account">Account</a> to download your records or CVs, disconnect phones, or delete your cloud workspace. Read the <a href="/privacy">privacy notice</a> for details.</p>
      <details><summary>My CV upload stopped</summary><p>Keep your PDF on your phone. After one minute, open Account and choose Recover interrupted uploads. A recovered file stays private. Save the profile from your phone to attach it, or upload the original PDF again if asked.</p></details>
      <details><summary>Another phone changed my profile</summary><p>Review both versions in the phone app before choosing which to keep. Your unsaved phone draft stays available.</p></details>
      <details><summary>Another browser tab changed my phone draft</summary><p>The web app keeps the newer saved version and asks you to reload. Keep the current page open if it contains unsaved edits. Export a recovery copy before resetting damaged or unfamiliar saved data. A different account or a newly created workspace never silently adopts an earlier account’s draft.</p></details>
      <details><summary>What happens when I delete my workspace?</summary><p>The service removes active account records and CV files. It cannot recall applications sent to employers or erase local files on a phone. Deletion also removes duplicate-prevention history, so keep your export and check earlier applications before starting again.</p></details>
      <details><summary>What are the preview limits?</summary><p>A workspace can keep five PDFs within 25 MiB, 200 opportunities, 100 application reviews, 500 application records, and ten phone connections. Each PDF can be up to 5 MiB. The service currently allows up to 250 workspaces and has shared storage and application limits. A capacity message preserves existing records and does not start a paid upgrade. The phone interface is currently English.</p></details>
    </section>
    <section className="card prose" id="troubleshooting">
      <h2>Still need help?</h2><p>Report a reproducible technical problem in the project’s public issue tracker. Include your phone model, OS and app versions, and the steps that caused the problem.</p><p><strong>Keep private information out of public issues.</strong> Do not attach your CV, email address, connection code, session token, or an unredacted account export. This is a development preview; a response time is not guaranteed.</p>
      <a className="button secondary" href="https://github.com/swonyu/ahmad-career/issues" target="_blank" rel="noopener noreferrer">Report a problem</a>
    </section>
  </SiteFrame>;
}
