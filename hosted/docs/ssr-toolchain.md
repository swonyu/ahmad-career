# Career Finder hosted rendering and toolchain

This package builds the existing six pages with React SSR and hydration through esbuild. The deployable entrypoint is `dist/server/index.js`, a Worker ES module whose default export has `fetch(request, env, ctx)`. The existing `.openai/hosting.json`, project identity, DB and BUCKET bindings, and all Drizzle migrations are copied unchanged. Public assets are an explicit, byte-hashed allowlist embedded in the Worker; no ASSETS binding is assumed.

## Commands

Use Node 22.13 or newer and the checked-in npm lockfile:

- `npm run install:ci` or the CI workflow's ordinary `npm ci`.
- `npm run typecheck`.
- `npm run lint`: reviewed explicit Oxlint configuration, original React/hooks/a11y/import JavaScript plugins, strict zero-warning and unused-directive gates.
- `npm test`: unchanged original service, model and privacy assertions.
- `node tests/hosted-worker.mjs` and `node --test tests/browser-api.mjs tests/browser-pairing.mjs`: unchanged runtime assertions.
- `npm run build`, then `npm run test:ssr`: self-contained production output and actual workerd SSR, request isolation, asset and routing acceptance.
- `npm audit --json`: unfiltered vulnerability evidence.
- `npm run dev -- --port 5173`: loopback preview using the existing local sign-in and connector-preview middleware. Restart after source changes; hot module replacement is not implemented. The production service's exact-origin policy remains active, so service calls on a loopback origin can correctly return host_denied. This preview does not establish live provider or hosted acceptance.
- `npm start -- --port 8787`: local Wrangler serving the previously built production Worker.

A build owns `.sites-runtime/build.lock`; a preview owns `.sites-runtime/preview.lock`. Never remove either while its recorded process is active. Previous successful output is retained under `.sites-runtime/previous-output-*`; a failed staging directory is preserved for diagnosis.

## Request and browser boundaries

Verified identity is resolved by the unchanged identity module and passed explicitly into the renderer. Page functions and language helpers receive request context as arguments. Internal x-career headers cannot manufacture identity; a bad Career Finder cookie does not fall back to a different Sites account. The bootstrap includes only the already-public current identity fields, language preference and closed asset paths. JSON is escaped at the HTML parser boundary and validated before hydration.

The existing API, OAuth, account, provider, storage, discovery and connector handler modules remain unchanged. Rendering supplies the same page components, texts and styles. Hosted navigation remains Search, Saved, Apply, Profile and Settings; native navigation belongs to its separate source and tests.

## Lint applicability

The Phase1 comparison preserves the original 1,174 global definitions, file profiles, rule options and three exact vendor exceptions. The three existing hook directive comments use the registered `original-hooks` namespace; no new source suppression was added.

Actual Next removal changes only these Next-specific obligations:

1. The Next Link-router requirement no longer applies to the application's ordinary anchor navigation.
2. The Next relative location-assignment obligation no longer has a Next router to update.
3. `nextjs/no-img-element` is disabled only for the two documented image files: SiteFrame and GoogleSignInArtwork. Both old Next images were already unoptimized local assets. Literal img elements keep their alt text, accessible parent context, explicit dimensions, lazy loading and asynchronous decoding. All other image accessibility rules and remaining Next checks stay enabled.

## PDF browser acceptance

The historical `tests/build-pdf-browser.mjs` and all its fixture files are retained unchanged as prior Vite evidence. Vite is no longer installed or invoked by the current workflow.

The required current builder is separately named:

```text
npm run test:pdf:browser:build -- --source-root /absolute/hosted --output-dir /absolute/test-only/output --fixtures-dir /absolute/synthetic-upload-folder
```

Both output directories must remain outside the hosted source/deployment tree. This builder retains the original fixture template, TypeScript-AST extraction of the actual PhoneApp readPDF/assertCurrent handlers, source hash checks, six parser fixtures, strict production module allowlist and one real same-origin module worker. It emits an explicit esbuild worker URL matching the production PDF adapter. It checks fixture data before compilation and does not mark browser acceptance complete.

A browser check must select the six original PDFs through the file input, then perform the template's cancellation and synthetic account-change modes. Validate previous-CV preservation, actual worker termination, expected parser outcomes, no external/API requests and no persistent fixture storage. The full production browser should also validate a CV, reject a replacement, save to its fresh encrypted test vault and retain the original draft after reload. These checks do not establish live accounts, providers, native installation or store release.
