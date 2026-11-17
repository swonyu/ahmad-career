# Isolated browser PDF acceptance fixture

This fixture closes a real-browser QA gap without opening or changing an existing Career Finder guest draft. It is test-only source: it adds no production page or API route and does not use account authentication, localStorage, IndexedDB, cookies, real provider accounts or employer HTTP. All profile data is synthetic and kept in page memory.

## Build

Run the builder with an absolute path to the current hosted source. Vite and TypeScript are resolved from that source's existing dependencies; no new package is installed. The builder reads the current `pdf.ts`, real module worker, shared parser and model, then extracts `PhoneApp.readPDF` and `assertCurrent` verbatim through TypeScript's syntax tree. It refuses an ambiguous/missing handler and checks the production source did not change during the build.

```sh
node hosted/tests/build-pdf-browser.mjs \
  --source-root /absolute/career-finder/hosted \
  --output-dir /absolute/new-test-only-dist \
  --fixtures-dir /absolute/synthetic-upload-folder
```

The served output must be outside the hosted source/deployment tree and must not already exist. The upload folder must also be separate. Existing differing upload files are preserved and cause an error; identical files are reused. The builder never empties an existing output directory.

For this handoff the output is `/workspace/scratch/5bc6158967e8/pdf-browser-dist`, and upload files are under `/workspace/shared/career-finder-pdf-tests`. The existing `sites-preview` process was left running for the coordinating agent to switch when ready:

```sh
sites-preview start /workspace/scratch/5bc6158967e8/pdf-browser-dist
```

The dist contains static HTML/CSS/JavaScript and a real Vite-emitted module worker. Its CSP allows same-origin scripts/workers/styles, blocks network connections, and has no inline-script/eval allowance. Worker URLs are produced by the actual production `new Worker(new URL(..., import.meta.url))` expression, not a Node worker adapter or handwritten parser URL.

## File-picker checks

Use the visible native file picker. A new page starts with `Earlier-valid.pdf`, whose bytes exactly match the existing synthetic readable résumé fixture. To restore that baseline between scenarios, click **Restore synthetic prior CV**. This affects only fixture memory; previous evidence events remain on the page.

| Mode / selected file | Expected visible result |
| --- | --- |
| Normal / `valid.pdf` | Actual handler replaces the prior CV; notice reports 1 page; current name becomes `valid.pdf`; workers started/terminated increase together. |
| Normal / `object-stream.pdf` | Success with 2 pages; exercises actual browser streaming decompression of compressed object streams. |
| Normal / `malformed.pdf` | Unsupported/readability error; prior name and SHA-256 unchanged; no profile replacement event. |
| Normal / `truncated.pdf` | Readability error; prior name and SHA-256 unchanged. |
| Normal / `encrypted.pdf` | Explicit password-protection explanation; prior name and SHA-256 unchanged. |
| Normal / `cyclic.pdf` | Bounded readability rejection; prior name and SHA-256 unchanged. |
| Cancel after real worker receives bytes / `valid.pdf` | A real `Worker.postMessage` occurs, then a test-controlled microtask aborts. The production client calls `terminate()`, and the actual handler keeps the prior CV. No worker stub or fake parser result is used. |
| Change synthetic account after validation / `valid.pdf` | Real worker succeeds and terminates; test-controlled synthetic owner/epoch then changes before the actual handler applies the result. The account-confirmation guard rejects the stale result and preserves the old CV. |

The cancellation/account-change controls are explicitly synthetic scheduling controls outside production output. Normal mode adds only Worker observation. The fixture does not instantiate all React lifecycle effects or the encrypted phone vault, so passing it is not full guest-persistence/account-recovery acceptance.

The fixture never supplies a password to the application. `encrypted.pdf` is a genuine RC4-128 encrypted, one-page synthetic document generated with the already installed `pypdf`; its test-only password is `qa-only`. It was separately checked to be encrypted and decryptable. No runtime Python/PDF-generation dependency is added: the checked-in bytes are used directly.

## Evidence

`source-manifest.json` in the dist records the exact production file hashes, extracted-handler hashes, fixture source/binary hashes, generated output hashes, emitted worker path and permitted production modules. The builder preflights all six files through the current server parser and checks the expected outcome. That is fixture verification, not browser acceptance.

The page displays worker URL/same-origin observations, real worker results and termination calls, previous-CV preservation, exact current hash and each result's notice. Any observed CSP violation is included. Save browser screenshots and visible evidence after performing actual picker checks; keep them separate from the manifest's initial `browserAcceptance: pending` status. Real provider consent, physical-device and screen-reader checks remain separate.
