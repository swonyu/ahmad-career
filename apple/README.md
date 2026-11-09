# Saleh Career Finder Apple source

Open `AhmadCareer.xcodeproj` and the existing `AhmadCareer` scheme. The distribution variant displays Saleh Career Finder and retains bundle identifier `com.ahmadalayed.career`. Use the existing Ahmad local-storage namespace for compatible updates; do not copy personal records into this source tree.

Run `bash Checks/check.sh` for isolated native checks, or `bash Checks/check.sh --web` for the WKWebView integration checks. Preview builds use `CareerFinderPreview` storage and must use a separate preview bundle identifier.

Web assets in `AhmadCareer/Web/` must match `website/web/`. iOS uses native SwiftUI and separate storage code. Compiling, signing, uploading, beta approval and device installation are distinct steps.

Version 1.4 adds private JSON backups, explicit additive restore previews, stale-record and size protection, and native Mac JSON save/open panels. Run the aggregate web and native checks before release. Profile/checklist imports are skipped; unsaved drafts and live cache are excluded. Keep backups private, close older versions before restoring, and do not downgrade after using imported receipt/task maps.
