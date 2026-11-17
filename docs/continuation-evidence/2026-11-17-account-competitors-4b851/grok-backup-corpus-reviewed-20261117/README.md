# Reviewed Grok Build 2 backup and receipt corpus

Review completed: 17 November 2026. This directory is a synthetic test-data handoff for the existing native recovery owner `01a1ea9cfd25`. Acceptance here covers provenance, bounded generator review, file integrity, JSON syntax, and static interpretation of the pinned source. Native decoder/import behavior, native tests, devices, hosted integration, CI, store status, and release readiness remain unverified by this corpus review.

Evidence directory on Saleh's Mac:

`/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/grok-backup-corpus-reviewed-20261117`

The parent coordinator will commit and route the reviewed test data. No native or production file was edited for this review. The generator was not rerun during recovery of the interrupted handoff.

## Provenance and exact artifacts

The raw delivery is preserved in `delivery.txt`, copied from the adjacent `grok-build2-followup-delivery-20261117.txt`. It contains 31,225 characters, 31,632 UTF-8 bytes and 612 lines. SHA-256: `1cf2f3d146cc47eefea77c3742493833f732c2ca3eaded9df1c3aedde24add20`.

The three extracted original blocks match Grok's claimed lengths and hashes exactly, including final newlines. They remain unchanged under `original/`.

| Original artifact | Bytes | SHA-256 |
|---|---:|---|
| `original/build_corpus.py` | 16346 | `3092402340d2071d59c574cafab84a71fde2e5e44e8905407265999bfea59e08` |
| `original/manifest.json` | 3602 | `345252ff401c05dbd0bb23aba64a91f4f8a88c18a5e8075e68bddbff788bf6e9` |
| `original/EXPECTED-OUTCOMES.md` | 7085 | `7f8a122c06c08becdb95677388fe86ad6414a2066d04ffcbb6eb7a10143c7b22` |
| `original/SELF-REVIEW.txt` | 2241 | `a83247fa7886ce7fee1cbf30404a6ccd8d19b2323b3fee0f250fbd08c3af0f29` |

The self-review hash is a local preservation check, not a claimed Grok checksum. `extraction-review.json` records extraction variants, the selected exact blocks, and original claims.

**No ZIP was retrieved or verified.** A ZIP length/hash claim appears in the delivery; it is not evidence of a downloaded ZIP. Use the verified expanded files. Do not describe them as a verified ZIP.

## Generator review and the one adaptation

The prior review inspected the complete generator and its AST before execution. Runtime imports are `hashlib`, `json`, and `pathlib.Path`, with future annotations. The source performs bounded synthetic writes to fixed names. It has no network, subprocess, credential, eval, or other external operations; the service origin is fixture text.

The only adaptation in `build_corpus.reviewed.py` is:

```diff
-ROOT = Path(__file__).resolve().parent
+ROOT = Path(__file__).resolve().parent / "generated"
```

`output-root-adaptation.patch` preserves that exact diff. Fresh comparison during this recovery confirmed that replacing this single line in the original yields the reviewed file exactly. Reviewed generator: 16,360 bytes; SHA-256 `d93d56a8e614bc8c80bfb13a3e1eace40046c1b2a27ef5af6100c5f15b4f73c0`.

The prior execution receipt `generator-execution.json` records Python 3.15 with `-I -B`, exit code **0**, no stderr, and stdout `{"files": 10, "shapeFailures": []}`. The review decision is timestamped 2026-11-17T20:04:08.608564+00:00 in `static-generator-review.json`. The successful execution was recovered from saved evidence; it was not repeated.

The generator's shape checker is not the Android or iPhone decoder. Its summary must not be called ten successful imports. The manifest deliberately identifies unsupported-field, oversized-note, malformed-JSON and server-view cases.

## Materialized files and fresh integrity verification

All paths below are relative to `generated/`. Fresh read-only verification found **10/10 byte counts and SHA-256 hashes matching the original manifest**. Nine files parse as JSON objects. The remaining file, 07, is deliberately truncated and fails JSON parsing. Parsing JSON says nothing about native import acceptance.

| File | Bytes | SHA-256 |
|---|---:|---|
| `01-two-unfinished-notes-one-job.json` | 1970 | `609ef2b2bd33c36c577af8cfe9257531a89adbe9411b36dfb5412b3d13c0e5a6` |
| `02-destination-existing-note.json` | 1540 | `a011a1c60559bf5c1acf8b8da87c4103e6a7ddd1eb23593cb83f9fb6204dae5a` |
| `02-import-two-alternatives.json` | 1953 | `7d996b908f9057a4d7e75e42c0ab1f33be982f4360ab2b5cc8dd9e562770c3ab` |
| `03-distinct-lever-global-eu-and-greenhouse-hosts.json` | 3873 | `be6a94d3814691c09197073402cab91eb8055261bb09c56958139f040aee5ca0` |
| `04-same-greenhouse-link-with-slash-and-utm.json` | 1268 | `49a65365e3c79a482cbcd7b34e0819077e50498f8f27be0f95f0d5623fde39e0` |
| `05-unknown-root-approval-field.json` | 1557 | `56c0a62cc3ecf19c4792691197dc97308c64dcdd0d5744387a33ea353d5c89b2` |
| `06-oversized-draft-note.json` | 3501 | `3c300e4cead6e9e0b6bee3823048504b11e82153b613f05af886f00166b8693f` |
| `07-damaged-truncated.json` | 61 | `786c4841b2ba48dd6fe0df325714f92de2891187605f9eac6fc631f48d114bd7` |
| `08-self-reported-flag-and-prepared-receipt.json` | 3183 | `ede4156bfb5e801efe6da2b698f589817af5a3c42fcad0f45fcb3f8867b0c369` |
| `proposed/09-server-expired-dispatch.json` | 1263 | `7dd0268b3ef790a88eef955a89b06b5acc958fa9c33d9467be58c4b444fb6f07` |

The generated `manifest.json` is byte-identical to `original/manifest.json`: 3,602 bytes, SHA-256 `345252ff401c05dbd0bb23aba64a91f4f8a88c18a5e8075e68bddbff788bf6e9`.

`materialization-verification.json` holds the original independent materialization check. `final-review-verification.json` records the post-handoff integrity recheck and README checksum. All hash/syntax checks are data-integrity checks, not application tests.

## Source baseline and comparison limits

Static interpretation uses immutable source copies under `schema-baseline/` at commit:

`ca3d3411d8b5b36fa7093dff782f4a7b931261c7`

The five schema files named by Grok are Android `WorkspaceTransfer.kt`, `Models.kt`, `WorkspaceStorage.kt`, and iPhone `MobileApplicationState.swift`, `NativeApplicationsStore.swift`. Saved verification proves their content matches the locally available packet commits `3a709eb15f1024df78ee03474f511568df2dc3de` and `842472684b194e993355f632902ccc81366c164c`. The additional `CareerViewModel.kt` comparison also matches those available snapshots.

The claimed snapshot `8bfd3136227ce79625df8e2b57678de5fbfa201e` is unavailable in this local repository. Its comparison is unverified. A git lookup failure does not establish a source mismatch. The original claim that all three uploaded snapshots were verified must not be repeated.

`hosted/app/phone/model.ts` differs across the available snapshots. Its saved delta from 84247268 is in `model-delta-from-84247268.patch`; it is not a native decoder execution. Receipts: `schema-baseline-verification.json`, `additional-schema-baselines.json`, `schema-excerpts.txt`, and `policy-excerpts.txt`.

Any newer dirty tree or integrated native recovery change must be checked by its current owner before use. These baseline observations do not describe that newer work's result.

## Corrections that supersede the original interpretation

The originals are preserved for audit. Apply these corrections when turning them into native assertions.

1. **iPhone already deduplicates saved links during import.** In the pinned `NativeApplicationsStore.swift`, `mergeBackup` builds a `Set` from destination job identities and inserts an imported job only when its identity is new. This is visible in the saved source at lines 1059–1062. The original fixture-04 wording about discovering whether duplicates are stored and collapse only later is incomplete. Verify the actual resulting state under the current owner revision; do not assert that both duplicate rows must survive.

2. **Fixture 04 cannot demonstrate note loss.** It contains two saved-link entries but empty `applicationRecords` and `recordDrafts` arrays. The original SELF-REVIEW sentence claiming that this fixture can lose a note is unsupported. A separate fixture containing distinct notes would be required to test that hypothesis. No such fixture was added in this review.

3. **iPhone Stop restoration requires a matching destination workspace.** A valid source workspace is insufficient. `mergeBackup` restores holds only when the destination is non-local and `backup.draft.scope == next.recordScope` (saved lines 1082–1085). The synthetic source origin/workspace therefore requires a corresponding test destination. Exercise matching, different-workspace and local destinations separately. A restored local hold is not proof of a network Stop.

4. **The iPhone draft-preservation gap is a baseline observation.** The pinned merge appends a draft only when no destination draft has that scope and identity (saved lines 1076–1080). Thus 01 can omit the second distinct imported note and 02 can omit both imported alternatives when the destination already has one. This is import omission, not deletion of the source file. It is not a result for the recovery owner's newer revision.

5. **Check the complete destination state.** The files include a synthetic profile. iPhone's merge defaults to profile replacement; Android imports also have explicit merge/replacement behavior. A legitimate, confirmed profile replacement differs from unintended loss of unrelated data. Snapshot the full destination and the chosen options, then verify only the intended changes occur, including after restart and re-export. Source-file immutability alone does not prove preservation.

## Owner acceptance matrix — all runtime work remains pending here

| Case | Required native proof on the owner's exact revision |
|---|---|
| 01 | Preserve both distinct unfinished Arabic notes; assert imported destination contents, restart and re-export. Record the pinned iPhone omission as a regression baseline, not a passing expectation for a fix. |
| 02 destination + import | Seed the destination with its separate file, then import the two alternatives. Preserve the existing note and both distinct alternatives; choosing one must not silently discard others. Track profile replacement options explicitly. |
| 03 | Keep the two Lever hosts and two Greenhouse hosts distinct for saved-job/record identity. Discovery-board canonicalization is a different operation. |
| 04 | Android's pinned decoder rejects duplicate saved-link identities; preserve destination on rejection. iPhone's pinned merge deduplicates those links. Assert resulting link identity/count on current source. Do not assert note preservation from this note-free fixture. |
| 05 | Android's pinned root allowlist rejects `approved`; iPhone's synthesized JSON decoding may ignore it. No approval, submit or advance may result. Preserve the unfinished note on an accepted import. |
| 06 | Reject the 2,001-character note before replacing destination state. Truncation to 2,000 is not a passing preservation result. |
| 07 | Malformed JSON must fail before any partial profile/draft persistence; retain complete destination and original bytes. |
| 08 | Distinguish self-reported applied tracking from approval. Android imported receipts must become `evidenceMode: imported`; prepared/dispatching rows must not count as verified live evidence or initiate submit/advance. iPhone must not invent receipts from the Android extension. Preserve the unfinished draft. Check Stop-hold destination matching and actual network-call counts separately. |
| proposed 09 | This is a proposed server-response view, not a phone backup. Do not send it to either phone importer. In a separately controlled recovery test, prove one explicit Stop, zero submit/advance, expired-lease uncertainty, live-lease dispatching, retention of a late genuine result, and no automatic resend. |

Across applicable cases, verify raw Arabic notes and stable wire values (`experienceLevel: mid`, `workModes: remote/hybrid`), unchanged source bytes, unrelated destination data, persistence failure behavior where relevant, and exact before/after snapshots. Use synthetic workspaces and network spies/fakes under the existing owner's test lane; do not create a competing native build or application-submission lane.

The corpus does not prove an account, search, real application, device, full hosted regression, or store-release journey. Its runtime execution used Python for deterministic fixture materialization; it does not satisfy the project's pinned Node/full-regression requirement.

## Routing and scope

Route the verified `generated/` files, originals, this README, manifest, and review receipts to native recovery owner `01a1ea9cfd25`. The parent coordinator owns integration and reporting of commit IDs. No external message was posted by this review agent.

Preserve the original work window: cutoff **18 November 2026 22:26:12 UTC / 19 November 2026 01:26:12 Riyadh**. This review does not restart the clock or expand scope. **Good Spender remains excluded.**
