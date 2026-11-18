# Search keyword precision — scoped assessment

Reviewed 18 November 2026 against source `b78b83b09739fefe69a6c8b72d7d1a60a4feb22a`.

## Observation

The retained version 11 live check returned five results for `iOS`: three iOS roles, a BIOS/firmware role, and a biostatistician role. This is evidence that the query ran, not that all five roles were relevant.

## Source and contract

- [Matcher](https://github.com/swonyu/ahmad-career/blob/b78b83b09739fefe69a6c8b72d7d1a60a4feb22a/hosted/server/discovery.mjs): normalized query terms must all occur as substrings in the combined title, company and available summary. Results interleave boards and do not receive semantic relevance ranking.
- [Contract](https://github.com/swonyu/ahmad-career/blob/b78b83b09739fefe69a6c8b72d7d1a60a4feb22a/hosted/server/discovery-contract.json): plain keywords across those fields, without a promise of whole-word, exact-phrase or semantic matching.
- [UI copy](https://github.com/swonyu/ahmad-career/blob/b78b83b09739fefe69a6c8b72d7d1a60a4feb22a/hosted/app/phone/PhoneApp.tsx): describes title/employer/summary coverage in English and Arabic. It does not explicitly explain substring matching.
- [Tests](https://github.com/swonyu/ahmad-career/blob/b78b83b09739fefe69a6c8b72d7d1a60a4feb22a/hosted/tests/hosted-discovery.mjs): cover all-term matching and location/remote filters, not this acronym collision or a required word-boundary policy.

## Disposition

Known search precision limitation; no demonstrated regression or contract-breaking defect. No new app source, test, build or employer request was introduced. Do not describe substring matching as an explicitly approved or directly tested product decision.

The continuation guide should say: “Results can include partial-word matches. Use more specific keywords to narrow them.” A later change to matching semantics needs a defined multilingual policy and proportionate verification.
