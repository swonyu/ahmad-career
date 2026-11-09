# Saleh Career Finder 1.3

A career workspace with public employer discovery, saved opportunities, application tracking, search-result comparisons, and private next-action planning. The current discovery adapters focus on paid software, Python and AI opportunities in Saudi Arabia. Users enter their own experience, education, skills and preferences.

This generic publication is based on source snapshot `96e46dd7d97ec1b56df82e56914ae3446b399f8e`. No personal profile, CV, application ledger, local notes, credentials, or installation receipts are bundled. Existing repository history is preserved; this branch does not change the remote main branch.

## Run and check

Web: `cd website && npm start`, then open `http://127.0.0.1:8779`. It binds locally by default. Checks: `npm test && npm run build`.

Apple: open `apple/AhmadCareer.xcodeproj`. Internal target names and the existing `com.ahmadalayed.career` bundle identifier are retained for compatibility; the visible app name is Saleh Career Finder. Set your own signing configuration for device builds. Run `cd apple && bash Checks/check.sh --web` for isolated checks.

Records stay on each device; web, iPhone and Mac do not sync. Existing Ahmad app storage identifiers are preserved for update compatibility. The separate personalized Saleh installation is not modified by this source publication.

Discovery is limited to configured public employer sources. Listing responses do not establish eligibility, salary, application success, or newly opened vacancies. No automatic application, external message, or notification is sent. A source publication or build check does not establish App Store/TestFlight distribution or device installation.
