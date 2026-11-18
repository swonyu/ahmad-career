# Production Profile CV save and reload

**Source:** combined `d8d2e999d0348eb07942472a1d9e87d2fc4498a2`; hosted files remain identical to `963e871`. This closes the separate full-app Profile acceptance item in hosted/docs/ssr-toolchain.md. The unchanged production Worker and all 93 matched source inputs are bound in the preceding integrated-browser packet.

Through the real Chrome Profile UI, a synthetic guest name/email and valid.pdf were selected. The app reported one readable page. Replacing it with encrypted.pdf was rejected with the previous-CV-kept message. Root then clicked Save on this phone, reloaded the page, observed the saved profile and valid.pdf, and exported phone data through Settings.

| Verification | Result |
| --- | --- |
| Actual downloaded JSON | 4,183 bytes |
| JSON SHA-256 | `078972e271ac0d74442af62f11f2dcb1a42f292cadf53a700935304b52e7df27` |
| Saved PDF | 1,311 bytes, byte-for-byte equal to the original valid.pdf fixture |
| Saved PDF SHA-256 | `149f96a4dc6ed08b2adf0ae75c9d00f8fba75fcd777ea790d9a27e622fa38a61` |
| Earlier synthetic job and saved note | Retained |
| Final captured browser warning/error log | Empty |

The export's `profileDirty: true` marks local data not saved online. The local-save implementation clears the form's unsaved state separately. This flag does not imply failed local persistence or an automatic upload. The tested scope is guest.

The independent release reviewer checked the raw observations, all 93 source inputs, export bytes, decoded original PDF and local-save implementation, and closed this acceptance gap with zero mismatches. No live sign-in, online profile upload, employer request, native-device or store-distribution result is claimed.
