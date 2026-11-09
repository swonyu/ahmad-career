# Saleh Career Finder Apple source

Open `AhmadCareer.xcodeproj` and the existing `AhmadCareer` scheme. The distribution variant displays Saleh Career Finder and retains bundle identifier `com.ahmadalayed.career`. Use the existing Ahmad local-storage namespace for compatible updates; do not copy personal records into this source tree.

Run `bash Checks/check.sh` for isolated native checks, or `bash Checks/check.sh --web` for the WKWebView integration checks. Preview builds use `CareerFinderPreview` storage and must use a separate preview bundle identifier.

Web assets in `AhmadCareer/Web/` must match `website/web/`. iOS uses native SwiftUI and separate storage code. Compiling, signing, uploading, beta approval and device installation are distinct steps.
