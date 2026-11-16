/** Sites owns authentication. This describes its Google option without claiming a direct Google OAuth flow. */
export default function SignInOptions({ destination }: { destination: "connect" | "account" }) {
  return <div className="sign-in-options">
    <div className="sign-in-choice" id="sign-in-method-help">
      <h3>Want to use Google?</h3>
      <p>Continue below, then choose <strong>Continue with Google</strong> on the secure ChatGPT sign-in screen.</p>
    </div>
    <a className="button primary full" href={`/signin-with-chatgpt?return_to=%2F${destination}`} target="_top" aria-describedby="sign-in-method-help sign-in-account-help">
      Continue to secure sign-in
      <svg className="arrow-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8" /></svg>
    </a>
    <p className="small muted" id="sign-in-account-help">This preview uses a ChatGPT account to protect your Career Finder workspace. You can create or use that account with Google. If you previously used another sign-in method, use the same account to keep your saved workspace.</p>
    <p className="small muted">Career Finder does not receive your Google password or read your ChatGPT conversations. Browsing jobs in the phone app does not require an account.</p>
  </div>;
}
