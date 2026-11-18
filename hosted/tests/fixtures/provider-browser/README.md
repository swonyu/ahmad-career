# Synthetic provider browser acceptance

This fixture renders the actual `ProviderConnections` component and `useAuthStatus` hook with React StrictMode. At build time, their HTTP transport is replaced with synthetic, deliberately delayed responses, and the Next image renderer is replaced with a plain image element using the same locally bundled artwork. No account or provider behavior is mocked inside the actual component or hook. The transport rejects every unrecognized endpoint and has no fetch/network fallback; the builder refuses to output a bundle containing the production HTTP adapter. The generated page also sets `connect-src 'none'`.

Build outside the source tree:

```sh
node tests/build-provider-browser.mjs --output-dir /absolute/test-only/provider-browser
```

The builder refuses output inside the hosted source tree. Serve the resulting directory using the authorized local preview workflow. Neither the fixture nor generated output is a production route. `source-manifest.json` records hashes of the actual components, test sources and generated HTML.

## Checks

Use a fresh page for each scenario. All shown identities and connection IDs are synthetic.

1. Choose **Connect Google to this Career Finder account**, then **Unmount connection card**, then **Resolve delayed request**. The request evidence must show `aborted: true`. The page must remain in the harness; there must be no provider navigation or connection success notice.
2. Choose **Disconnect LinkedIn**, **Confirm disconnect**, **Revalidate current account**, then **Resolve delayed request**. The request must be aborted. No obsolete disconnection success may be shown.
3. Choose **Disconnect LinkedIn**, then **Reconnect as replacement identity** before confirming. The former confirmation must disappear. A newly opened confirmation must submit the replacement `expectedConnectionId` (`b` repeated 64 times), never reuse the former one (`a` repeated 64 times).
4. Begin a connection, choose **Switch browser account**, then resolve the delayed response. The original account card must show an identity mismatch and cannot expose either account's connection controls or navigate to a provider.
5. Complete an ordinary LinkedIn disconnection without invalidating the page. Its status refresh must show disconnected before the success notice appears. Profile/history preservation is a server test; this fixture does not establish it.

The delayed Google resolver supplies the official authorization origin with a synthetic state so the production URL validator is exercised. **Use it only after unmounting or invalidating that pending request.** A current Google success navigation is covered by the controller tests and is not part of this isolated browser scenario. This fixture contains no real provider credentials or consent and does not establish Google/LinkedIn activation, production identity isolation, physical-device accessibility or release readiness.
