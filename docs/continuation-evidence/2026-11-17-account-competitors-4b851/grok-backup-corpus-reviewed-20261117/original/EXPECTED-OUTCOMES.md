# Expected outcomes for the synthetic backup corpus

Shape check only. `python3 build_corpus.py` does not call `WorkspaceTransfer.decode`, the iPhone decoder, or a device. A green shape row is not import acceptance.

Baseline: phone-backup writers `WorkspaceTransfer.kt` git blob `8e1c1dec5bcc1f12a97427c49974e717473e7ccc` and `MobileApplicationState.swift` blob `edc87b8f2769…` are identical in the uploaded packet snapshots `8bfd3136`, `3a709eb1`, `84247268` and at `ca3d3411`. `ca3` `hosted/app/phone/model.ts` differs only by URL parsing and optional hosted `location`. That delta is not a phone-backup field.

Common format is `career-finder-phone-workspace` version 1. Android `objectOnly` rejects unknown root, source, and data keys. iPhone `JSONDecoder` ignores unknown keys. Do not write one assertion for both.

## 01 — two unfinished notes, one job

File contains two `data.recordDrafts` entries, same Lever global URL, notes `ملاحظة أولى لم تُحفظ` and `ملاحظة ثانية مختلفة`. No `appliedElsewhere`, no receipt, no approval field. Wire stage stays `saved`.

Android `decode` groups by identity: first checkpoint becomes `recordDrafts`, the second `recordDraftAlternatives`. Both notes remain.

iPhone `mergeBackup` appends only when that scope and identity have no destination draft. On an empty destination the second note is skipped. The source file must stay byte-for-byte unchanged either way.

False pass: counting two array entries and calling the iPhone import successful.

## 02 — destination note plus two imported alternatives

`02-destination-existing-note.json` is the destination draft `ملاحظة الوجهة الحالية`. `02-import-two-alternatives.json` is the file being imported (`بديل مستورد ألف`, `بديل مستورد باء`). They are not one merged document.

Android `importWorkspace`, as read: an existing destination draft stays; each different incoming draft is appended to alternatives. All three notes remain. Choosing one later must not delete the others.

iPhone `mergeBackup`: destination already has that identity, so both imported notes are skipped. Say "import omission", not "file destroyed".

False pass: one test that expects three notes on both platforms.

## 03 — distinct Lever and Greenhouse links

Four jobs and four notes:

- `jobs.lever.co` and `jobs.eu.lever.co` with the same posting UUID
- `boards.greenhouse.io/canonical` and `job-boards.greenhouse.io/canonical`

Android and iPhone job identity keep the host. These four must stay four records. Do not apply server `parseDiscoverySource`, which collapses both Greenhouse hosts to `greenhouse:canonical`. That rule is for search boards, not saved-job records.

False pass: asserting these four collapse because the discovery parser would.

## 04 — slash and utm on one Greenhouse URL

Two `jobs` entries: `https://boards.greenhouse.io/canonical` and the same path with a trailing slash and `utm_source`. Android identity strips trailing slash and `utm_*`, then `decode` requires distinct identities and throws `The backup contains duplicate saved links.` Destination data must be unchanged.

iPhone backup `valid` does not check distinct identities. The native owner must show whether both rows are stored and whether later identity checks collapse them. Do not claim this file is rejected on iPhone.

## 05 — unknown `approved` root field

`approved: true` is not a backup field. Android `objectOnly` rejects the file and must not write. iPhone decoding ignores unknown keys, so this file can still decode. The ignored Boolean must not set `approvedAt`, submit, or change `appliedElsewhere`. The draft note stays `ملاحظة محفوظة في الملف`.

False pass: "both platforms reject unknown fields."

## 06 — oversized note

The draft note is 2001 `N` characters. Android draft validation and iPhone checkpoint validity both cap notes at 2000. Rejection must happen before replacement. Shorter notes in other fixtures must not be truncated.

## 07 — damaged bytes

`07-damaged-truncated.json` is not JSON. Both decoders must fail closed. No partial profile, no cleared drafts.

## 08 — self-reported flag and prepared receipt

Representable fields only:

- Record stage `applied` with `appliedElsewhere: true` and a note that says it is self-reported. That is the caller's tracker flag, not server approval. There is no `approvedAt` in this format.
- Draft stage remains `saved` with `مسودة غير معتمدة`.
- `continuationHolds` contains plan `33333333-3333-4333-8333-333333333333`. That is local Stop intent. It is not evidence that Stop was sent and it is not `activePlanIds`.
- `extensions.android.receiptArchive` uses `receiptJson` keys only. One row is `state: ready`, `evidenceMode: live`, empty `applicationId`. The other is `state: dispatching`. Neither has `planId` because `receiptJson` has no such key.

Android import copies those receipts with `evidenceMode = "imported"`. `isLiveReceipt` requires `live` + provider `lever` + confirmed id, so these rows must not count as verified. `blocksResubmission` is true for state `dispatching` even after the mode copy. The owner must prove imported dispatching rows do not call submit or advance, and must not assume the mode rewrite alone clears that block.

iPhone common backup has no receipt archive. The `android` extension is ignored. Import must not invent receipts or approval. `continuationHolds` become submission holds only when the source scope is a real workspace and the hold validates. This file uses the documented HTTPS origin and a synthetic workspace id so that path is in schema. Unpaired holds fail iPhone `PhoneSubmissionHold.valid`.

False pass: labeling the `ready` row "Approved, waiting to send", or treating `evidenceMode: live` inside an import as a live receipt.

## 09 — proposed server view, not a backup

`proposed/09-server-expired-dispatch.json` uses `attemptView` fields (`planId`, `state: dispatching`, `dispatchCount`) plus empty `activePlanIds` and `recoverablePlans`. Those lists are workspace GET fields. They cannot be added to the phone backup without inventing a field Android would reject.

Owner proof, still unrun: one explicit Stop, zero submit/advance, expired lease becomes uncertain, a live lease stays dispatching, a late real result is kept, and no automatic resend follows an uncertain result. A phone file that merely lists a hold does not prove that.

## What the native recovery owner must run

On their own source, not this transcription:

1. Android `WorkspaceTransfer.decode` / `importWorkspace` for files 01, 02, 03, 04, 06, 07, 08, with the destination snapshot kept on failure.
2. iPhone `PhoneWorkspaceBackup` decode plus `mergeBackup` for 01, 02, 05, and 08, including restart and re-export.
3. Assert raw Arabic notes, wire `experienceLevel: mid`, and wire `workModes` `remote`/`hybrid` survive. Do not store translated labels.
4. Assert the source file hash is unchanged after a failed or partial import.
5. Do not count this corpus runner as that result.
