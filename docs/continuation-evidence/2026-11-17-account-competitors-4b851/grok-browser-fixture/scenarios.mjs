export const accountId = "fixture-account-a";
export const components = [
  { id: "connections", label: "ProviderConnections" },
  { id: "signin", label: "SignInOptions" },
  { id: "recovery", label: "SessionRecovery" },
  { id: "oauth", label: "OAuthFeedback" },
];
export const scenarios = [
  { id: "healthy", label: "Healthy: Google + LinkedIn connected", note: "Both synthetic connections exist. Disconnect requires the component's explicit confirmation." },
  { id: "disconnected", label: "Configured providers, disconnected", note: "Connect returns an intentionally invalid local URL. The real authorization guard must show an error without external navigation.", disconnected: true },
  { id: "unconfigured", label: "Providers not configured", note: "Provider choices are unavailable; the local ChatGPT sign-in stub remains available.", disconnected: true, unconfigured: true },
  { id: "linkedin_link_only", label: "LinkedIn connection only, no direct sign-in", note: "Configured LinkedIn must not be offered as a direct login when signInSupported is false.", linkedinLinkOnly: true },
  { id: "status_error", label: "Status unavailable (503)", note: "Use Make next responses healthy, then the component's own retry. No component remount is needed.", statusError: true },
  { id: "invalid_session", label: "Expired session (401)", note: "Exercises the real recovery button. Successful recovery navigates to a local fixture /account route.", invalidSession: true },
  { id: "account_mismatch", label: "Different account returned", note: "ProviderConnections expects account A; status returns synthetic account B.", accountMismatch: true },
  { id: "disconnect_error", label: "Disconnect fails (503)", note: "One explicit confirm produces one failed POST. Error recovery must not automatically replay it.", disconnectError: true },
  { id: "disconnect_last_method", label: "Disconnect refused: only sign-in method (409)", note: "The synthetic service refuses removal and retains the connection.", disconnectLastMethod: true },
  { id: "disconnect_unconfirmed", label: "Disconnect POST succeeds; status still connected", note: "Post-success status verification must not falsely claim a disconnection.", disconnectUnconfirmed: true },
  { id: "signout_error", label: "Session recovery fails (503)", note: "The real recovery component must leave a usable error and retry. Other synthetic endpoints remain healthy.", signoutError: true },
  { id: "oauth_connected", label: "OAuth: verified Google connection", note: "Adds oauth_provider=google&oauth_result=connected before mounting; the real component checks current status.", oauth: ["google", "connected"] },
  { id: "oauth_unconfirmed", label: "OAuth: URL claims connection, status does not", note: "The component must avoid a connected claim based solely on URL parameters.", oauth: ["google", "connected"], disconnected: true },
  { id: "oauth_signed_in", label: "OAuth: verified Google sign-in", note: "The synthetic current account method is google and its connection exists.", oauth: ["google", "signed_in"], googleMethod: true },
  { id: "oauth_status_error", label: "OAuth: status unavailable", note: "The provider returned but account verification fails. A failure notice, not a success claim, is expected.", oauth: ["google", "connected"], statusError: true },
  { id: "oauth_cancelled", label: "OAuth: cancelled", note: "No account verification request should be needed for a cancelled return.", oauth: ["google", "cancelled"] },
  { id: "oauth_failed", label: "OAuth: failed", note: "No account verification request should be needed for a failed return.", oauth: ["linkedin", "failed"] },
  { id: "oauth_email_required", label: "OAuth: LinkedIn email required", note: "Exercises the provider-specific explanation without a live provider or account.", oauth: ["linkedin", "email_required"] },
];
export function findScenario(id) {
  return scenarios.find(item => item.id === id) ?? scenarios[0];
}
export function makeStatus(scenario) {
  const configured = !scenario.unconfigured;
  const connected = !scenario.disconnected;
  const provider = (name, connectionId) => ({
    configured, signInSupported: name !== "LinkedIn" || !scenario.linkedinLinkOnly,
    connected, ...(connected ? { displayName: "Fixture " + name, connectionId } : {}),
  });
  return {
    ok: true,
    account: {
      id: scenario.accountMismatch ? "fixture-account-b" : accountId,
      email: "fixture-a@example.invalid", displayName: "Fixture Account",
      method: scenario.googleMethod ? "google" : "chatgpt",
    },
    providers: { google: provider("Google", "a".repeat(64)), linkedin: provider("LinkedIn", "b".repeat(64)) },
  };
}
