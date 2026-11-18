import Foundation

@main struct RoleReviewCheck {
    static func expect(_ condition: Bool, _ message: String, file: StaticString = #file, line: UInt = #line) {
        precondition(condition, message, file: file, line: line)
    }
    @MainActor static func main() throws {
        let fixture = URL(fileURLWithPath: CommandLine.arguments[1])
        let research = try JSONDecoder().decode(CareerResearch.self, from: Data(contentsOf: fixture))
        var job = research.jobs[0]
        job.title = "Software AI Cloud iOS QA Developer"
        job.requirementNotes = [
            "Bachelor's degree preferred, or equivalent practical experience. Python and TypeScript are used.",
            "Current university student or recent graduate. No minimum professional years stated.",
            "Confirm work authorization and citizenship requirements with the employer.",
            "This is not an unpaid internship. Check compensation with the employer."
        ]
        var profile = NativeProfile()
        profile.skills = "Python, TypeScript, SwiftUI, Git, machine learning from personal projects"
        profile.years = "20"; profile.degree = "SQL"; profile.achievements = "Kubernetes"
        let originalJob = job, originalProfile = profile
        let review = RoleReview(job: job, profile: profile)
        expect(review.categories == ["software", "data-ai", "platform", "mobile", "quality"], "Overlapping categories preserve the fixed order")
        expect(review.categoryLabels == ["Software & web", "Data & AI", "Cloud & platform", "Mobile", "Quality & testing"], "Human-readable focus labels")
        expect(review.skills == ["Python", "TypeScript"], "Skills only come from title and bounded requirement excerpts")
        expect(review.overlap == ["Python", "TypeScript"], "Only self-entered skills count toward text overlap")
        expect(review.topics.map(\.id) == ["degree", "student", "experience", "authorization", "unpaid"], "Topics preserve the fixed order")
        expect(review.topics[0].excerpts == [job.requirementNotes![0]], "Preferred and equivalent qualifiers stay verbatim")
        expect(review.topics.last!.excerpts == [job.requirementNotes![3]], "Negation is retained; a topic is not an unpaid verdict")
        expect(review.hasExcerpts && review.requirementCoverage == "Partial employer requirements", "Requirements are never labeled complete")
        expect(review.checklist.joined().contains("mandatory, preferred and equivalent"), "Checklist preserves routes and context")
        expect(RoleReview.overlapLabel == "Mentioned in your profile and available employer text", "Overlap is a text observation")
        expect(RoleReview.disclaimer.contains("self-entered") && RoleReview.disclaimer.contains("not an eligibility assessment"), "Review cannot claim verified capability")
        var unrelatedProfile = profile
        unrelatedProfile.years = "No professional employment"
        unrelatedProfile.degree = "No degree recorded"
        unrelatedProfile.achievements = "Different project"
        expect(RoleReview(job: job, profile: unrelatedProfile) == review, "Degree, years and achievements cannot create status or eligibility inferences")
        expect(job == originalJob && profile == originalProfile, "Pure review leaves both input values unchanged")
        expect(RoleReview(job: job).overlap.isEmpty, "Missing self-entered skills cannot establish overlap")
        profile.skills = "Docker"
        expect(RoleReview(job: job, profile: profile).overlap.isEmpty, "Non-overlapping profile creates no claim")

        job.title = "Bioscience Swiftly GitHub NoSQL Reactivity JavaScripted"
        job.requirementNotes = nil
        job.summary = "Python SQL and Kubernetes"
        job.gaps = ["Bachelor degree, 10 years of Python experience"]
        job.experienceLevel = "Python"; job.employmentType = "TypeScript"
        expect(RoleReview(job: job).categories.isEmpty && RoleReview(job: job).skills.isEmpty, "False-positive substrings and editorial/metadata text do not supply review evidence")
        expect(RoleReview(job: job).topics.isEmpty && !RoleReview(job: job).hasExcerpts, "Missing employer excerpts remain missing despite editorial context")
        expect(RoleReview(job: job).requirementCoverage == "Employer requirements unavailable", "Missing requirement warning")
        expect(RoleReview(job: job).checklist.joined().contains("No skill overlap is established"), "No overlap is not a negative eligibility verdict")
        for text in ["éSwift", "Swifté", "Swift_kit", "Kit_Swift", "Python٣", "٣Python", "React界", "界React"] {
            job.title = text
            expect(RoleReview(job: job).skills.isEmpty, "Unicode and underscore boundaries: \(text)")
        }
        job.title = "PYTHON, JavaScript/TypeScript; SwiftUI SQL React.js nodejs Docker k8s Amazon Web Services Azure Git ML"
        profile.skills = job.title
        let allSkills = ["Python", "JavaScript", "TypeScript", "Swift", "SQL", "React", "Node.js", "Docker", "Kubernetes", "AWS", "Azure", "Git", "Machine learning"]
        expect(RoleReview(job: job, profile: profile).skills == allSkills, "Bounded aliases preserve canonical skill order")
        expect(RoleReview(job: job, profile: profile).overlap == allSkills, "Profile and employer use the same aliases")
        for text in ["Machine learning", "machine-learning", "ML"] {
            job.title = text
            expect(RoleReview(job: job).skills == ["Machine learning"], "Machine learning alias: \(text)")
        }
        for title in ["Android Engineer", "SwiftUI Engineer", "Mobile Engineer", "Mobile Developer"] {
            expect(CareerFeed.relevant(title), "Native mobile titles pass discovery screening")
            expect(RoleReview.categories(for: title).contains("mobile"), "Mobile role focus includes the title")
        }
        for title in ["Senior Android Engineer", "Mobile Sales Manager", "Androidish Engineer", "Swiftly Engineer"] {
            expect(!CareerFeed.relevant(title), "Excluded or substring-only mobile title is not a discovery lead")
        }
        job.title = "AI developer"
        profile.skills = "AI"
        expect(RoleReview(job: job, profile: profile).categories == ["software", "data-ai"] && RoleReview(job: job, profile: profile).skills.isEmpty, "AI category is not ML skill evidence")
        job.title = "مطور برمجيات وبيانات ذكاء اصطناعي"
        expect(RoleReview(job: job).categories == ["software", "data-ai"], "Arabic title terms are recognized")

        job.title = "Software developers for cloud databases"
        expect(RoleReview(job: job).categories == ["software", "platform"], "Plural role aliases")
        job.requirementNotes = ["University students may apply. Citizens and nationality rules require confirmation."]
        expect(RoleReview(job: job).topics.map(\.id) == ["student", "authorization"], "Plural student and citizenship wording")
        job.requirementNotes = ["Eligible for Tamheer. GPA requirements need review."]
        expect(RoleReview(job: job).topics.map(\.id) == ["program"], "Program and GPA wording creates a literal review topic, not a verdict")
        job.title = "Python developer"
        for malformed in ["", " \n\t ", "<script>Python degree</script>", "Python\u{0000} degree", "Bachelor degree " + String(repeating: "x", count: 301)] {
            job.requirementNotes = [malformed]
            let result = RoleReview(job: job)
            expect(!result.hasExcerpts && result.topics.isEmpty, "Malformed or blank excerpt rejected without truncation")
            expect(result.skills == ["Python"], "Valid title survives unusable excerpt")
        }
        let comparator = "Professional experience > 3 years is preferred; Python experience may be substituted."
        job.requirementNotes = [comparator]
        let compared = RoleReview(job: job)
        expect(compared.hasExcerpts && compared.topics.first { $0.id == "experience" }?.excerpts == [comparator], "Plain comparison symbols preserve exact qualifiers and are not marked missing")
        job.requirementNotes = ["Expected experience < 4 years, but not mandatory."]
        expect(RoleReview(job: job).hasExcerpts, "Less-than comparison is valid plain text")
        job.requirementNotes = ["SQL\nGit\tPython"]
        expect(RoleReview(job: job).skills == ["Python", "SQL", "Git"], "Normal tab and newline are usable")
        let exactBound = "Degree preferred or equivalent experience. " + String(repeating: "x", count: 300 - "Degree preferred or equivalent experience. ".utf16.count)
        expect(exactBound.utf16.count == 300, "Fixture uses the note limit")
        job.requirementNotes = [exactBound]
        expect(RoleReview(job: job).topics[0].excerpts == [exactBound], "Full bounded excerpt remains verbatim")
        job.requirementNotes = [exactBound + " or equivalent"]
        expect(!RoleReview(job: job).hasExcerpts, "Oversized excerpt is ignored rather than losing trailing qualifications")
        job.requirementNotes = Array(repeating: "No listed wording.", count: 6) + ["Swift degree required"]
        expect(RoleReview(job: job).skills == ["Python"] && RoleReview(job: job).topics.isEmpty, "Review inspects at most six original notes")
        job.title = "Python " + String(repeating: "x", count: 2000)
        job.requirementNotes = nil
        expect(RoleReview(job: job).skills.isEmpty && RoleReview(job: job).categories.isEmpty, "Oversized title is not truncated into evidence")
        job.title = "Python developer"
        profile.skills = "Python " + String(repeating: "x", count: 3000)
        expect(RoleReview(job: job, profile: profile).overlap.isEmpty, "Oversized self-entered skills do not create overlap")
        var badJSON = try JSONSerialization.jsonObject(with: JSONEncoder().encode(job)) as! [String: Any]
        badJSON["requirementNotes"] = [NSNull(), 42]
        expect((try? JSONDecoder().decode(CareerJob.self, from: JSONSerialization.data(withJSONObject: badJSON))) == nil, "Malformed typed requirement text fails decoding safely")

        var filters = NativeDiscoveryOptions()
        expect(!filters.isActive && filters.includes(job), "Default role focus includes all")
        filters.roleFocus = "software"
        expect(filters.isActive && filters.includes(job), "Role focus is an active discovery-only filter")
        filters.roleFocus = "mobile"
        expect(!filters.includes(job), "Nonmatching focus excludes discovery")
        job.title = "Swift Software Developer"
        expect(filters.includes(job), "Multi-category role is included by either focus")
        filters.roleFocus = "software"; expect(filters.includes(job), "Software focus includes overlapping mobile role")
        filters.company = "Other"; expect(!filters.includes(job), "Focus composes with employer filter")
        filters.company = ""; filters.hideTracked = true
        expect(!filters.includes(job, tracked: true), "Focus composes with tracked exclusion")
        filters = NativeDiscoveryOptions(); expect(filters.includes(job), "Reset clears focus without changing the role")
        let fields = ["title", "company", "location", "summary", "requirements", "experience", "employment", "mode"]
        for field in fields {
            var candidate = originalJob
            let term = "uniquereviewquery"
            switch field {
            case "title": candidate.title = term
            case "company": candidate.company = term
            case "location": candidate.location = term
            case "summary": candidate.summary = term
            case "requirements": candidate.requirementNotes = [term]
            case "experience": candidate.experienceLevel = term
            case "employment": candidate.employmentType = term
            default: candidate.mode = term
            }
            expect(RoleReview.matches(candidate, query: "  UNIQUEREVIEWQUERY  "), "Search covers \(field)")
        }
        expect(RoleReview.matches(job, query: " \n") && !RoleReview.matches(job, query: "nonexistentword"), "Search trims queries and handles absent matches")

        // Synthetic sandbox only: prove repeated review/filtering cannot rewrite any stored record.
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("career-role-review-check-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let storage = root.appendingPathComponent("workspace.json")
        let store = NativeCareerStore(researchURL: fixture, storageURL: storage)
        store.toggleSaved(originalJob)
        store.setStatus("Submission uncertain", for: originalJob)
        store.beginApplicationRecord(originalJob)
        store.editApplicationRecord(originalJob, appliedAt: "", receiptNote: "Synthetic receipt, not submission proof")
        expect(store.saveApplicationRecord(originalJob), "Synthetic application record saves")
        store.beginNextAction(originalJob)
        store.editNextAction(originalJob, dueOn: "", actionNote: "Review exact wording", completed: false)
        expect(store.saveNextAction(originalJob), "Synthetic planning record saves")
        func files() throws -> [String: Data] {
            let paths = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey])!
            var result: [String: Data] = [:]
            for case let url as URL in paths where (try url.resourceValues(forKeys: [.isRegularFileKey])).isRegularFile == true {
                result[url.path] = try Data(contentsOf: url)
            }
            return result
        }
        let before = try files(), beforeJob = store.current(originalJob)
        for _ in 0..<20 {
            _ = RoleReview(job: store.current(originalJob), profile: store.workspace.profile)
            _ = NativeDiscoveryOptions(roleFocus: "mobile").includes(store.current(originalJob), tracked: true)
        }
        expect(try files() == before, "Review and filters leave every synthetic storage file byte-for-byte unchanged")
        expect(store.current(originalJob) == beforeJob, "Original saved record remains intact")
        let reloaded = NativeCareerStore(researchURL: fixture, storageURL: storage)
        expect(reloaded.isSaved(originalJob) && reloaded.status(for: originalJob) == "Submission uncertain", "Saved and tracking records survive review")
        expect(reloaded.applicationRecords[originalJob.id]?.receiptNote == "Synthetic receipt, not submission proof", "Receipt unaffected")
        expect(reloaded.nextActions[originalJob.id]?.actionNote == "Review exact wording", "Next action unaffected")
        print("Role review checks passed: deterministic overlapping focus, Unicode boundaries, explicit self-entered text overlap, exact qualified excerpts, missing/partial requirements, bounded malformed inputs, no eligibility inference, expanded search, composable filters, and byte-identical isolated records.")
    }
}
