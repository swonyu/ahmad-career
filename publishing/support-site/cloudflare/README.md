# Career Finder Cloudflare support site

Static English and Arabic support/privacy pages for Career Finder.

## Hosting

- Worker: `career-finder-support`
- URL: https://career-finder-support.salayed98.workers.dev
- State: Live HTTPS verified 2026-11-17T15:55:14.369258+00:00; all packaged HTML/CSS matched exact source bytes.
- Runtime: Workers Static Assets only. No application Worker handler, database, application account or file-upload service is included.

From this directory, deploy with an authorized Cloudflare login using `npx wrangler deploy --config wrangler.jsonc`. The account and Worker name are explicit in the configuration. Never put API tokens in this repository.

## Source and scope

Based on reviewed public documentation from `https://github.com/swonyu/ahmad-career` at commit `156b3363b409c660e88ff2fb96fc02bf0f55baca` on `docs/public-support-20261117-01a49`. The original GitHub Pages files and deployment branch are preserved.

Only the website-host disclosures in the Cloudflare copy identify Cloudflare instead of GitHub Pages. Public GitHub support-channel disclosures and native-app behavior are unchanged. Career Finder service links, where present, continue to point to its existing ChatGPT Sites service; this package does not migrate accounts or application data.

The public directory contains only reviewed HTML/CSS and the Cloudflare `_headers` control file. Source provenance, local logs, repository metadata and deployment receipts are deliberately excluded from the public assets. No analytics, embedded external resources, forms, JavaScript or third-party fonts are added.

## Validation

Wrangler 4.164.0 local static-assets checks passed on 17 November 2026: every HTML/CSS response matched source bytes; language and RTL markers were checked; security and cache headers were verified; unknown and private configuration paths returned 404; conditional ETag requests returned 304. These checks do not establish native-app release or store acceptance.

HTML uses revalidation to keep policy updates current. Unversioned CSS has a one-hour browser cache with revalidation; it is not marked immutable. The narrower CSS rule explicitly detaches the earlier Cache-Control header to avoid conflicting values. Unknown URLs return 404 and do not fall back to an application page.

Official references: [static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/), [HTML routing](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/), [Cloudflare privacy](https://www.cloudflare.com/privacypolicy/).
