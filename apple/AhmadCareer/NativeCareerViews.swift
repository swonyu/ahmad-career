#if os(iOS)
import SwiftUI
import UIKit
import UniformTypeIdentifiers

@MainActor
struct NativeCareerRoot: View {
    @EnvironmentObject private var store: NativeCareerStore

    var body: some View {
        TabView {
            NavigationStack { NativeShortlistScreen() }
                .tabItem { Label("Shortlist", systemImage: "square.stack") }
            NavigationStack { NativeSearchScreen() }
                .tabItem { Label("Search", systemImage: "magnifyingglass") }
            NavigationStack { NativeSavedScreen() }
                .tabItem { Label("Saved", systemImage: "heart") }
                .badge(store.savedJobs.count)
            NavigationStack { NativeApplicationsScreen() }
                .tabItem { Label("Applications", systemImage: "checklist") }
                .badge(store.recordJobs.count)
            NavigationStack { NativeProfileScreen() }
                .tabItem { Label("Profile", systemImage: "person.crop.circle") }
        }
        .environmentObject(store)
        .tint(.careerAccent)
        .onReceive(store.$storageError.compactMap { $0 }) { error in
            UIAccessibility.post(notification: .announcement, argument: error)
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if let error = store.storageError {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.footnote).padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.orange.opacity(0.14))
                    .accessibilityLabel("Storage problem. \(error)")
            }
        }
    }
}

private struct NativeShortlistScreen: View {
    @EnvironmentObject private var store: NativeCareerStore
    @State private var query = ""
    @State private var discovery = NativeDiscoveryOptions()
    private var discoveryJobs: [CareerJob] {store.research.jobs.isEmpty ? store.liveJobs : store.shortlistJobs}
    private var jobs: [CareerJob] { discoveryJobs.filter { store.workspace.profile.includesInDiscovery($0) && nativeMatches($0, query: query) && discovery.includes($0, tracked: store.hasApplicationRecord($0)) } }

    var body: some View {
        List {
            if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Section {
                NativeIntro(eyebrow: "A CONSIDERED NEXT STEP", title: "Your next chapter.",
                            message: "Discover paid software, Python and AI opportunities. Add your own background and preferences in Profile.")
                NativeNotice(title: "Check role-specific requirements first.", message: "Check degree and professional-experience requirements. Personal projects are not formal employment. Confirm paid status and salary with the employer.")
            }.listRowBackground(Color.clear).listRowSeparator(.hidden)
            }
            NativeCriteriaSection()
            NativeDiscoveryFilters(options: $discovery, jobs: discoveryJobs)
            if store.research.jobs.isEmpty {
                Section {
                    Button(store.isSearching ? "Searching employers…" : "Find new openings") {Task {await store.refresh()}}
                        .disabled(store.isSearching)
                    if let error=store.searchError {Text(error).font(.footnote).foregroundStyle(.secondary)}
                }
            }
            Section {
                if jobs.isEmpty {
                    if store.workspace.profile.hidesUnverifiedSalary && !discoveryJobs.isEmpty {
                        NativeEmpty(title: "No salary-verified opportunities.", message: "Current roles have no verified salary evidence. Your criteria hide unverified pay; this does not mean there are no vacancies. Edit criteria to review these leads.", icon: "magnifyingglass")
                    } else {
                        NativeEmpty(title: "No matching opportunities.", message: "Try another role, employer or skill, or edit your criteria.", icon: "magnifyingglass")
                    }
                    if !query.isEmpty { Button("Clear search") { query = "" } }
                } else {
                    ForEach(jobs) { NativeJobLink(job: $0) }
                }
            } header: {
                Text("\(jobs.count) priority opportunities to review")
            } footer: {
                Text(store.research.jobs.isEmpty ? "Discovered employer listings, not verified qualification matches. Open Search for source coverage. Recheck each employer before applying." : "Saudi Arabia only · Research checked \(nativeDate(store.research.checkedAt)). Recheck each employer before applying.")
            }
            Section {
                DisclosureGroup("How this shortlist was ranked") {
                    Text("Search screens software and AI titles, prioritizing early-career wording and excluding explicitly senior titles. It is not an eligibility assessment.")
                    Text("Coverage is limited to nine public employer boards: Mozn, Lucidya, Foodics, Salla, Lean Technologies, Tamara, Unifonic, Devoteam and Delivery Hero. No vacancies are prefilled; a zero result is not a market-wide finding.")
                }.font(.subheadline)
            }
        }
        .nativeList()
        .navigationTitle("Saleh Career Finder")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: "Role, employer or skill")
    }
}

private struct NativeCriteriaSection: View {
    @EnvironmentObject private var store: NativeCareerStore
    @State private var editing = false
    var body: some View {
        Section {
            Text(store.workspace.profile.criteriaSummary).font(.subheadline)
            Button("Edit criteria") { editing = true }
        } header: { Text("Discovery criteria") } footer: {
            Text("Saved on this device. Refines Shortlist and Live search; saved applications stay available. Salary and pay basis still need confirmation.")
        }
        .sheet(isPresented: $editing) { NativeProfileEditor(profile: store.workspace.profile) }
    }
}

private struct NativeDiscoveryFilters: View {
    @Binding var options: NativeDiscoveryOptions
    let jobs: [CareerJob]
    private var companies: [String] { Array(Set(jobs.map(\.company) + (options.company.isEmpty ? [] : [options.company]))).sorted() }
    private var employmentTypes: [String] { Array(Set(jobs.compactMap { $0.employmentType }.filter { !$0.isEmpty } + (options.employmentType.isEmpty ? [] : [options.employmentType]))).sorted() }
    var body: some View {
        Section {
            DisclosureGroup(options.isActive ? "Result filters · active" : "Result filters") {
                Picker("Role focus", selection: $options.roleFocus) {
                    Text("All role focuses").tag("")
                    ForEach(RoleReview.roleFocuses, id: \.id) { focus in Text(focus.label).tag(focus.id) }
                }
                Text("Role focus uses title wording only. Categories may overlap; uncategorized roles appear with All role focuses.").font(.footnote).foregroundStyle(.secondary)
                Picker("Employer", selection: $options.company) {
                    Text("All employers").tag("")
                    ForEach(companies, id: \.self) { Text($0).tag($0) }
                }
                Picker("Employer publication date", selection: $options.days) {
                    Text("Any date").tag(0)
                    Text("Last 7 days").tag(7)
                    Text("Last 30 days").tag(30)
                    Text("Last 90 days").tag(90)
                }
                Picker("Employment type", selection: $options.employmentType) {
                    Text("All types").tag("")
                    ForEach(employmentTypes, id: \.self) { Text($0).tag($0) }
                }
                Toggle("Hide roles with application records", isOn: $options.hideTracked)
                Text("Date filters use Riyadh calendar days and the employer's publication or last-publication date, not when you found the role. Undated roles appear only with Any date.").font(.footnote).foregroundStyle(.secondary)
                Text("Filters affect discovery only. Saved roles and application records stay available.").font(.footnote).foregroundStyle(.secondary)
                if options.isActive { Button("Reset result filters") { options = NativeDiscoveryOptions() } }
            }
        }
    }
}

private enum NativeJobFilter: String, CaseIterable, Identifiable {
    case all = "All opportunities", healthcare = "Software & AI", leadership = "Early career", riyadh = "Riyadh"
    var id: String { rawValue }
    func includes(_ job: CareerJob) -> Bool {
        switch self {
        case .all: return true
        case .healthcare: return CareerFeed.relevant(job.title)
        case .leadership: return (job.relevance ?? CareerFeed.relevance(job.title))>=95
        case .riyadh: return job.hasRiyadhEvidence
        }
    }
}

private struct NativeSearchScreen: View {
    @EnvironmentObject private var store: NativeCareerStore
    @State private var query = ""
    @State private var filter = NativeJobFilter.all
    @State private var discovery = NativeDiscoveryOptions()
    @State private var onlyAdded = false
    private var jobs: [CareerJob] { store.liveJobs.filter { (!onlyAdded || store.isAddedToLatestResults($0)) && store.workspace.profile.includesInDiscovery($0) && nativeMatches($0, query: query) && filter.includes($0) && discovery.includes($0, tracked: store.hasApplicationRecord($0)) } }

    var body: some View {
        List {
            Section {
                if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                NativeIntro(eyebrow: "LIVE EMPLOYER SEARCH", title: "Find the next opportunity.", message: "Search selected Saudi employer boards. New leads need a closer look; they do not replace your researched shortlist.")
                }
                Button {
                    Task { await store.refresh() }
                } label: {
                    HStack {
                        if store.isSearching { ProgressView().tint(.white) }
                        Label(store.isSearching ? "Searching employers…" : "Find new openings", systemImage: "sparkle.magnifyingglass")
                    }.frame(maxWidth: .infinity).padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent).disabled(store.isSearching)
                .tint(Color(red: 0.08, green: 0.43, blue: 0.34))
                Text("Mozn · Lucidya · Foodics · Salla · Lean Technologies · Tamara · Unifonic · Devoteam · Delivery Hero\nNo sign-in or CV is sent to search.")
                    .font(.footnote).foregroundStyle(.secondary)
                if let error = store.searchError {
                    NativeNotice(title: "Review search coverage", message: error, warning: true)
                }
                if let notice=store.searchNotice {Text(notice).font(.footnote).foregroundStyle(.secondary)}
            }.listRowBackground(Color.clear).listRowSeparator(.hidden)
            NativeCriteriaSection()
            NativeDiscoveryFilters(options: $discovery, jobs: store.liveJobs)
            Section {
                if let comparison=store.searchComparison,let previous=comparison.previousCheckedAt {
                    Text("\(comparison.addedIds.count) added to the latest result list").font(.headline)
                    Text("Comparing \(nativeDate(previous, includeTime: true)) with \(nativeDate(comparison.checkedAt, includeTime: true)).").font(.footnote)
                } else {
                    Text(store.searchChangeSummary).font(.subheadline)
                }
                Text("Added means absent from the previous result list, including returning listings. Rechecked or republished roles with the same ID are not added. This does not establish when a vacancy opened, eligibility, or whether a missing role closed.").font(.footnote).foregroundStyle(.secondary)
                if store.searchComparison?.previousCheckedAt != nil || onlyAdded {
                    Toggle("Only roles added to latest results", isOn: $onlyAdded)
                    Text("Applies alongside your other filters. Counts above describe the whole result list, before filters.").font(.footnote).foregroundStyle(.secondary)
                }
            } header: {Text("Search changes") }
            if let snapshot = store.workspace.live {
                Section {
                    DisclosureGroup("\(snapshot.sources.filter(\.ok).count) of \(snapshot.sources.count) employers responded") {
                        ForEach(snapshot.sources, id: \.name) { source in
                            VStack(alignment: .leading, spacing: 5) {
                                Label(source.name, systemImage: source.ok ? "checkmark.circle" : "exclamationmark.circle")
                                    .font(.subheadline.weight(.semibold))
                                if source.ok {
                                    Text("\(source.count) matching · \(source.scanned.map { String($0) } ?? "—") scanned\(source.limited == true ? " · bounded sample" : "")")
                                        .font(.caption).foregroundStyle(.secondary)
                                    if let error = source.error, !error.isEmpty {
                                        Label(error, systemImage: "exclamationmark.circle").font(.caption)
                                    } else if let errors = source.detailErrors, errors > 0 {
                                        Label("\(errors) checks unavailable", systemImage: "exclamationmark.circle").font(.caption)
                                    }
                                } else {
                                    Text(source.error ?? "Source unavailable").font(.caption).foregroundStyle(.secondary)
                                }
                            }.padding(.vertical, 3)
                        }
                        Text("A bounded sample of selected boards. Filtering can miss suitable jobs. A source failure does not mean that employer has no openings. Earlier results from incomplete or bounded employer checks are retained and marked Not refreshed.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                } header: { Text("Checked \(nativeDate(snapshot.checkedAt, includeTime: true))") }
            }
            Section {
                if jobs.isEmpty {
                    if !store.isSearching && store.workspace.profile.hidesUnverifiedSalary && !store.liveJobs.isEmpty {
                        NativeEmpty(title: "No salary-verified leads.", message: "Current leads have no verified salary evidence. Your criteria hide unverified pay; this does not mean there are no vacancies. Edit criteria to review these leads.", icon: "magnifyingglass")
                    } else {
                        NativeEmpty(title: store.isSearching ? "Checking employer boards…" : "No matching leads yet.",
                                    message: store.isSearching ? "Results will appear here when the search finishes." : "Try a broader filter, edit your criteria or search the employers. A successful search can return zero suitable roles.", icon: "magnifyingglass")
                    }
                } else {
                    ForEach(jobs) { NativeJobLink(job: $0) }
                }
            } header: { Text("\(jobs.count) leads to review") }
        }
        .onChange(of: store.searchError) { error in
            if let error { UIAccessibility.post(notification: .announcement, argument: error) }
        }
        .nativeList().navigationTitle("Live search")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: "Filter results by role or employer")
        .refreshable { if !store.isSearching { await store.refresh() } }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Menu {
                    Picker("Show", selection: $filter) {
                        ForEach(NativeJobFilter.allCases) { Text($0.rawValue).tag($0) }
                    }
                } label: { Label(filter == .all ? "Filter" : filter.rawValue, systemImage: "line.3.horizontal.decrease.circle") }
            }
        }
    }
}

private struct NativeSavedScreen: View {
    @EnvironmentObject private var store: NativeCareerStore
    @State private var query = ""
    private var jobs: [CareerJob] { store.savedJobs.filter { nativeMatches($0, query: query) } }
    var body: some View {
        List {
            if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Section {
                NativeIntro(eyebrow: "YOUR OWN SHORTLIST", title: "The ones worth pursuing.", message: "Saved opportunities and application progress stay on this device. Website, iPhone and Mac progress do not sync.")
            }.listRowBackground(Color.clear)
            }
            Section {
                if store.savedJobs.isEmpty {
                    NativeEmpty(title: "Make a shortlist of your own.", message: "Save a role from its details to keep it here, even when a later search changes.", icon: "heart")
                } else if jobs.isEmpty {
                    NativeEmpty(title: "No saved roles match this search.", message: "Your saved opportunities are still here. Try another term or clear the search.", icon: "magnifyingglass")
                    Button("Clear search") { query = "" }
                } else {
                    ForEach(jobs) { NativeJobLink(job: $0) }
                }
            }
        }.nativeList().navigationTitle("Saved opportunities")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, prompt: "Search saved opportunities")
    }
}

private struct NativeApplicationsScreen: View {
    @EnvironmentObject private var store: NativeCareerStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var query = ""
    private var groups: [NativeApplicationGroup] {
        store.applicationGroups.map { NativeApplicationGroup(status: $0.status, jobs: $0.jobs.filter { nativeMatches($0, query: query) }) }.filter { !$0.jobs.isEmpty }
    }
    var body: some View {
        List {
            Section {
                NativeIntro(eyebrow: "YOUR APPLICATION RECORDS", title: "Know where every role stands.", message: "\(store.recordJobs.count) roles tracked on this device. Stages are entered by you and do not confirm an employer received an application.")
                NavigationLink { NativePlanScreen() } label: { Label("Preparation plan and attention prompts", systemImage: "list.bullet.clipboard") }
            }
            if store.recordJobs.isEmpty {
                Section { NativeEmpty(title: "No applications tracked yet.", message: "Open a role to set a stage, save an application record, or plan a next action. Nothing is submitted automatically.", icon: "checkmark.bubble") }
            } else if groups.isEmpty {
                Section {
                    NativeEmpty(title: "No application records match.", message: "Try another search. Your existing records have not changed.", icon: "magnifyingglass")
                    Button("Clear search") { query = "" }
                }
            }
            Section {
                NavigationLink { NativeNextActionsScreen() } label: { Label("My next actions", systemImage:"calendar.badge.clock") }
            } footer: {Text("Your local plans, including completed actions and unfinished actions for closed roles. No reminders or messages are sent.")}
            ForEach(groups) { group in
                Section {
                    if group.status == "Submission uncertain" {
                        NativeNotice(title: "Verify before retrying", message: "Check the employer account or receipt before submitting again. This stage does not mean the application succeeded or failed.", warning: true)
                    }
                    ForEach(group.jobs) { NativeJobLink(job: $0) }
                } header: { Text("\(group.status == "Not started" ? "Record only" : group.status) · \(group.jobs.count)") }
            }
            Section {
                NavigationLink { NativeNotesPreview(text: store.exportText(), includesProfile: true) } label: { Label("Review application notes", systemImage: "doc.text") }
            } footer: { Text("Application dates, receipt notes, next actions and unsaved drafts are included in this reviewed export. Website, iPhone and Mac records do not sync.") }
        }
        .nativeList().navigationTitle("Applications")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: "Search tracked roles or employers")
        .onAppear { store.reloadApplicationRecords() }
        .onChange(of: scenePhase) { phase in if phase == .active { store.reloadApplicationRecords() } }
    }
}

private struct NativeJobLink: View {
    @EnvironmentObject private var store: NativeCareerStore
    let job: CareerJob
    private var review: RoleReview { RoleReview(job: job, profile: store.workspace.profile) }
    var body: some View {
        NavigationLink { NativeJobDetail(job: job) } label: {
            HStack(alignment: .top, spacing: 13) {
                Text(job.initials).font(.caption.weight(.bold))
                    .frame(width: 40, height: 40).background(Color.careerMint, in: RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(Color.careerAccent).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 7) {
                    if store.isCurrentResearch(job), let rank = job.rank { Text("PRIORITY \(String(format: "%02d", rank))").font(.caption2.weight(.semibold)).foregroundStyle(.secondary) }
                    Text(job.title).font(.headline).fixedSize(horizontal: false, vertical: true)
                    Text("\(job.company) · \(job.location)").font(.subheadline).foregroundStyle(.secondary)
                    Text("\(job.publicationLabel): \(nativeDate(job.posted))").font(.caption).foregroundStyle(.secondary)
                    if let employmentType = job.employmentType, !employmentType.isEmpty, employmentType != "Not stated" {
                        Text(employmentType).font(.caption).foregroundStyle(.secondary)
                    }
                    Text(job.fit).font(.caption.weight(.medium)).foregroundStyle(job.isExpired ? Color.primary : Color.careerAccent)
                    if !review.categoryLabels.isEmpty {
                        Text(review.categoryLabels.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                    }
                    if !review.overlap.isEmpty {
                        Text(RoleReview.overlapLabel + ": " + review.overlap.joined(separator: ", ")).font(.caption).foregroundStyle(.secondary)
                    }
                    if !review.topics.isEmpty {
                        Text("Topics to review: " + review.topics.map(\.label).joined(separator: "; ")).font(.caption).foregroundStyle(.secondary)
                    }
                    Text(review.requirementCoverage + " · Review full listing").font(.caption).foregroundStyle(.secondary)
                    ForEach(store.workspace.profile.criteriaMessages(for: job), id: \.self) { message in
                        Label(message, systemImage: "questionmark.circle").font(.caption).foregroundStyle(.secondary)
                    }
                    if store.isAddedToLatestResults(job) { Label("Added to latest result list", systemImage:"plus.circle").font(.caption).foregroundStyle(Color.careerAccent) }
                    if store.isUnrefreshed(job) { Label("Not refreshed — previous result",systemImage:"clock.arrow.circlepath").font(.caption).foregroundStyle(.secondary) }
                    if job.isExpired { Label("Past listed deadline", systemImage: "clock").font(.caption) }
                    if store.status(for: job) != "Not started" { Text(store.status(for: job)).font(.caption).foregroundStyle(.secondary) }
                    if store.isSaved(job) { Label("Saved", systemImage: "heart.fill").font(.caption).foregroundStyle(Color.careerAccent) }
                }
            }.padding(.vertical, 8)
        }
    }
}

private struct NativeJobDetail: View {
    @EnvironmentObject private var store: NativeCareerStore
    private let inputJob: CareerJob
    init(job: CareerJob) { inputJob = job }
    private var job: CareerJob { store.current(inputJob) }
    private var experienceGap: Bool {
        guard let required = job.minYears, let entered = Double(store.workspace.profile.years.replacingOccurrences(of: ",", with: ".")) else { return false }
        return entered < Double(required)
    }
    private var review: RoleReview { RoleReview(job: job, profile: store.workspace.profile) }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    Text(job.company.uppercased()).font(.caption.weight(.semibold)).foregroundStyle(Color.careerAccent)
                    Text(job.title).font(.title.weight(.bold)).fixedSize(horizontal: false, vertical: true)
                    Text(job.location).foregroundStyle(.secondary)
                    if let subtitle = job.subtitle, !subtitle.isEmpty { Text(subtitle).font(.subheadline).foregroundStyle(.secondary) }
                }.padding(.vertical, 10)
                if job.isExpired { NativeNotice(title: "Past listed deadline", message: "Check the employer's current status before spending time on this application.", warning: true) }
            }.listRowBackground(Color.clear).listRowSeparator(.hidden)
            Section("The essentials") {
                LabeledContent(job.publicationLabel, value: nativeDate(job.posted))
                LabeledContent("Closing date", value: job.closes.map { nativeDate($0, includeTime: $0.count > 10) } ?? "Not published")
                LabeledContent("Salary", value: job.rank == nil ? "Not checked for this lead" : "Not disclosed in research")
                ForEach(store.workspace.profile.criteriaMessages(for: job), id: \.self) { message in
                    Label(message, systemImage: "questionmark.circle").font(.footnote)
                }
                LabeledContent("Work arrangement", value: job.mode.flatMap { $0.isEmpty ? nil : $0 } ?? "Not stated")
                LabeledContent("Employment type", value: job.employmentType.flatMap { $0.isEmpty ? nil : $0 } ?? "Not stated")
                LabeledContent("Experience level", value: job.experienceLevel.flatMap { $0.isEmpty ? nil : $0 } ?? "Not stated")
                if job.postedKind == "last-published" {
                    Text("Last published is the employer's latest publication timestamp. It is not necessarily the original posting date.").font(.footnote).foregroundStyle(.secondary)
                }
            }
            Section("Evidence and freshness") {
                if store.isCurrentResearch(job) {
                    LabeledContent("Research checked", value: nativeDate(store.research.checkedAt))
                    Text("The fit assessment and requirement summary reflect that research date.").font(.footnote).foregroundStyle(.secondary)
                } else if job.kind == "archived" || job.researchCheckedAt != nil {
                    LabeledContent("Archived research", value: job.researchCheckedAt.map { nativeDate($0) } ?? "Original date unavailable")
                    Text("Preserved from your earlier records; outside the current shortlist. Recheck the employer and requirements.").font(.footnote).foregroundStyle(.secondary)
                }
                if let snapshot = store.workspace.live, snapshot.jobs.contains(where: { $0.id == job.id }) {
                    let employerObservation=store.employerObservation(job)
                    LabeledContent("Employer checked", value: nativeDate(employerObservation.lastCheckedAt ?? snapshot.checkedAt, includeTime: true))
                    Text(store.isUnrefreshed(employerObservation) ? "Not refreshed in the latest attempt. This previous result is retained because its employer search was unavailable." : "This role appeared in that search. Recheck the official page for changes before applying.").font(.footnote).foregroundStyle(.secondary)
                } else if job.rank == nil {
                    Text("Saved employer lead. Its current availability is not established by the latest search. Recheck the official page before applying.").font(.footnote)
                }
            }
            Section("Review before applying") {
                if !review.categoryLabels.isEmpty {
                    LabeledContent("Title-based focus", value: review.categoryLabels.joined(separator: " · "))
                }
                NativeNotice(title: review.requirementCoverage, message: review.coverageMessage)
                Text(RoleReview.disclaimer).font(.footnote).foregroundStyle(.secondary)
                if !review.skills.isEmpty {
                    Text("Skill wording in available employer text: " + review.skills.joined(separator: ", ")).font(.subheadline)
                } else {
                    Text("No recognized skill wording in the available title and excerpts. This does not mean the role has no skill requirements.").font(.subheadline)
                }
                if !review.overlap.isEmpty {
                    Text(RoleReview.overlapLabel).font(.subheadline.weight(.semibold))
                    Text(review.overlap.joined(separator: ", ")).font(.subheadline)
                } else {
                    Text("No skill overlap established from your profile and available employer text. You can review your self-entered skills in Profile.").font(.subheadline).foregroundStyle(.secondary)
                }
                ForEach(review.topics) { topic in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(topic.label + " · review the context").font(.subheadline.weight(.semibold))
                        ForEach(Array(topic.excerpts.enumerated()), id: \.offset) { _, excerpt in
                            Text(excerpt).font(.subheadline).textSelection(.enabled)
                        }
                    }.padding(.vertical, 3)
                }
                if review.topics.isEmpty {
                    Text("No listed review topics were detected. Education, experience, student status and work authorization remain unverified.").font(.footnote).foregroundStyle(.secondary)
                }
            }
            Section("Your review checklist") {
                ForEach(Array(review.checklist.enumerated()), id: \.offset) { index, item in
                    HStack(alignment: .top, spacing: 10) {
                        Text("\(index + 1).").font(.subheadline.weight(.semibold))
                        Text(item).font(.subheadline)
                    }
                }
            }
            Section {
                if let notes = job.requirementNotes, !notes.isEmpty {
                    ForEach(Array(notes.enumerated()), id: \.offset) { _, note in Text(note).font(.subheadline) }
                } else {
                    Text("Requirement excerpts unavailable. Read the full employer description.").font(.subheadline).foregroundStyle(.secondary)
                }
            } header: { Text("Employer requirement excerpts") } footer: {
                Text("Bounded excerpts from available employer descriptions are clues, not proof of eligibility or paid status. Read the full description, including mandatory requirements and exceptions.")
            }
            if !store.applicationWarnings(for: job).isEmpty {
                Section("Local tracking advisories") {
                    ForEach(store.applicationWarnings(for: job), id: \.self) { message in
                        Label(message, systemImage: "exclamationmark.circle").font(.subheadline)
                    }
                }
            }
            Section("Fit to establish") {
                Text(job.fit).font(.headline).foregroundStyle(Color.careerAccent)
                Text(job.summary)
                Text("This assessment is provisional until your career history, qualifications and actual responsibilities are confirmed.")
                    .font(.footnote).foregroundStyle(.secondary)
                if experienceGap {
                    NativeNotice(title: "Check the experience requirement", message: "You entered fewer relevant years than the \(job.minYears ?? 0)+ requested. Review eligibility before applying.", warning: true)
                }
                ForEach(Array(job.requirements.enumerated()), id: \.offset) { _, requirement in
                    Label { Text(requirement) } icon: { Image(systemName: "circle").font(.caption2) }
                }
            }
            Section("Your application, step by step") {
                ForEach(Array(job.applicationSteps.enumerated()), id: \.offset) { index, step in
                    VStack(alignment: .leading, spacing: 7) {
                        Text("\(index + 1). \(step.first ?? "Review this step")").font(.headline)
                        Text(step.dropFirst().joined(separator: " ")).font(.subheadline).foregroundStyle(.secondary)
                    }.padding(.vertical, 4)
                }
            }
            Section {
                Picker("Status", selection: Binding(get: { store.status(for: job) }, set: { store.setStatus($0, for: job) })) {
                    ForEach(NativeCareerStore.statuses, id: \.self) { Text($0).tag($0) }
                }
                NavigationLink { NativeNextActionEditor(job:job) } label: { Label("Plan my next action",systemImage:"calendar.badge.clock") }
                NavigationLink { NativeApplicationRecordEditor(job:job) } label: { Label("Application date and receipt note",systemImage:"calendar.badge.clock") }
                Button { store.toggleSaved(job) } label: {
                    Label(store.isSaved(job) ? "Remove from saved" : "Save opportunity", systemImage: store.isSaved(job) ? "heart.fill" : "heart")
                }
            } header: { Text("Your progress") } footer: {
                Text("This is your own record. Changing status does not submit an application or contact anyone. Use Submission uncertain if you cannot verify receipt, then check the employer account before retrying.")
            }
            Section {
                if let url = job.applicationURL {
                    Link(destination: url) { Label(job.isExpired ? "Check employer status" : store.status(for: job) == "Not started" ? "Open official application" : "View employer / existing application", systemImage: "arrow.up.right.square") }
                }
                NavigationLink { NativeNotesPreview(text: store.note(for: job, includeProfile: false), includesProfile: false) } label: { Label("Review preparation note", systemImage: "doc.text") }
                if let url = job.sourceURL { Link("Source and full requirements", destination: url) }
            } footer: {
                Text("Review and rewrite every draft before using it. Recheck salary, deadlines and qualifications directly with the employer.")
            }
        }.nativeList().navigationTitle("Opportunity").navigationBarTitleDisplayMode(.inline)
    }
}

private struct NativeNextActionsScreen: View {
    @EnvironmentObject private var store:NativeCareerStore
    @Environment(\.scenePhase) private var scenePhase
    var body:some View {
        // Re-evaluate calendar-day sections while this screen stays open across Riyadh midnight.
        TimelineView(.periodic(from:.now,by:60)) { context in
            List {
                Section {Text("One private next action per role. Dates use Riyadh calendar days. These are your plans, not employer deadlines or scheduled reminders.").font(.footnote)}
                if store.nextActionGroups(at:context.date).isEmpty && store.nextActionErrors.isEmpty {Text("No next actions yet. Open any role to make a plan.")}
                if !store.nextActionErrors.isEmpty {
                    Section("Next actions needing review") {
                        ForEach(store.recordJobs.filter{store.nextActionErrors[$0.id] != nil}) {job in
                            NavigationLink {NativeNextActionEditor(job:job)} label: {
                                VStack(alignment:.leading) {
                                    Text(job.title).font(.headline)
                                    Text(store.nextActionErrors[job.id] ?? "").font(.footnote).foregroundStyle(.red)
                                }
                            }
                        }
                    }
                }
                ForEach(store.nextActionGroups(at:context.date)) { group in
                    Section(group.title) {
                        ForEach(group.jobs) { job in
                            NavigationLink { NativeNextActionEditor(job:job) } label: {
                                VStack(alignment:.leading,spacing:6) {
                                    Text(job.title).font(.headline)
                                    Text(job.company).font(.subheadline)
                                    Text(store.nextActions[job.id]?.actionNote ?? "")
                                    Text("Due: \(store.nextActions[job.id]?.dueOn.isEmpty==false ? store.nextActions[job.id]!.dueOn : "Not set") · \(store.status(for:job))").font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }.nativeList()
        }.navigationTitle("My next actions")
        .onAppear {store.reloadNextActions()}
        .onChange(of:scenePhase) { phase in if phase == .active {store.reloadNextActions()} }
    }
}

private struct NativeNextActionEditor: View {
    @EnvironmentObject private var store:NativeCareerStore
    @Environment(\.scenePhase) private var scenePhase
    let job:CareerJob
    @State private var discard=false
    @State private var savedMessage=""
    private var draft:NextActionDraft {store.nextActionDrafts[job.id] ?? NextActionDraft()}
    private func edit(dueOn:String?=nil,actionNote:String?=nil,completed:Bool?=nil) {
        store.editNextAction(job,dueOn:dueOn ?? draft.dueOn,actionNote:actionNote ?? draft.actionNote,completed:completed ?? draft.completed)
        savedMessage=""
    }
    var body:some View {
        Form {
            Section {
                Text(job.title).font(.headline)
                Text("\(job.company) · \(store.status(for:job))")
                Text("Your private local plan. Saving does not change application status, send a message, or schedule a notification.").font(.footnote)
                NavigationLink { NativeJobDetail(job:job) } label: {Text("Review role details")}
            }
            Section("Next action") {
                TextEditor(text:Binding(get:{draft.actionNote},set:{edit(actionNote:$0)})).frame(minHeight:100)
                Text("\(draft.actionNote.unicodeScalars.count) / 500 Unicode characters").font(.caption)
                TextField("Due date: YYYY-MM-DD, or leave blank",text:Binding(get:{draft.dueOn},set:{edit(dueOn:$0)}))
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                Toggle("Completed",isOn:Binding(get:{draft.completed},set:{edit(completed:$0)}))
                Text("Past and future dates are allowed, using Riyadh days. A due date or completed action requires a note.").font(.footnote)
            }
            Section {
                if draft.dirty {Text("Unsaved draft, kept for this session. Export before closing the app.").foregroundStyle(.secondary)}
                if let base=draft.base {Text("Last edited: \(base.updatedAt)").font(.footnote)}
                if let error=store.nextActionErrors[job.id] {Text(error).foregroundStyle(.red)}
                if !savedMessage.isEmpty {Text(savedMessage).foregroundStyle(.secondary)}
                Button("Save next action") {savedMessage=store.saveNextAction(job) ? "Next action saved on this device." : ""}
                Button("Clear fields") {edit(dueOn:"",actionNote:"",completed:false)}
                Text("Clear fields, then save to clear the plan. Existing files are retained. Private next actions appear in reviewed tracking exports, never in preparation notes.").font(.footnote)
                Button("Reload saved next action") {if draft.dirty {discard=true} else {store.beginNextAction(job,discardDraft:true);savedMessage=""}}
            }
        }.navigationTitle("Next action")
        .onAppear {store.beginNextAction(job)}
        .onChange(of:scenePhase) { phase in if phase == .active {store.beginNextAction(job)} }
        .confirmationDialog("Discard this unsaved draft and load the saved next action?",isPresented:$discard,titleVisibility:.visible) {
            Button("Discard draft and reload",role:.destructive) {store.beginNextAction(job,discardDraft:true);savedMessage=""}
            Button("Keep draft",role:.cancel) {}
        }
    }
}

private struct NativeApplicationRecordEditor: View {
    @EnvironmentObject private var store:NativeCareerStore
    @Environment(\.scenePhase) private var scenePhase
    let job:CareerJob
    @State private var discard=false
    @State private var savedMessage=""
    private var draft:ApplicationRecordDraft {store.recordDrafts[job.id] ?? ApplicationRecordDraft()}
    var body:some View {
        Form {
            Section {
                Text(job.title).font(.headline)
                Text("Optional, self-entered tracking details. Leave the date blank if unknown. Saving does not change status or contact anyone.").font(.footnote)
                TextField("YYYY-MM-DD, or leave blank",text:Binding(get:{draft.appliedAt},set:{store.editApplicationRecord(job,appliedAt:$0,receiptNote:draft.receiptNote);savedMessage=""}))
                    .textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityLabel("Application date, if known, YYYY-MM-DD")
            } header:{Text("Application date, if known")}
            Section {
                TextEditor(text:Binding(get:{draft.receiptNote},set:{store.editApplicationRecord(job,appliedAt:draft.appliedAt,receiptNote:$0);savedMessage=""}))
                    .frame(minHeight:140).accessibilityLabel("Receipt or record note")
            } header:{Text("Receipt / record note")} footer:{Text("Up to 2,000 characters. Plain text only. Included in reviewed tracking exports, never in preparation drafts. Avoid passwords, codes and confidential employer data.")}
            Section {
                if draft.dirty {Text("Unsaved draft. Kept for this session; export your notes before closing the app.").foregroundStyle(.secondary)}
                if let base=draft.base {Text("Record last edited: \(base.updatedAt) (not the application time).").font(.footnote)}
                if let error=store.recordErrors[job.id] {Text(error).foregroundStyle(.red).accessibilityAddTraits(.updatesFrequently)}
                if !savedMessage.isEmpty {Text(savedMessage).foregroundStyle(Color.careerAccent).accessibilityAddTraits(.updatesFrequently)}
                Button("Save application record") {
                    savedMessage=store.saveApplicationRecord(job) ? "Application date and note saved on this device. Status is unchanged." : ""
                    UIAccessibility.post(notification:.announcement,argument:store.recordErrors[job.id] ?? savedMessage)
                }
                Button("Reload saved record") {if draft.dirty {discard=true} else {store.beginApplicationRecord(job,discardDraft:true);savedMessage=""}}
            }
        }.navigationTitle("Application record").navigationBarTitleDisplayMode(.inline)
            .onAppear{store.beginApplicationRecord(job)}
            .onChange(of:scenePhase){phase in if phase == .active {store.beginApplicationRecord(job)}}
            .confirmationDialog("Discard this unsaved draft and load the saved record?",isPresented:$discard,titleVisibility:.visible){
                Button("Discard draft and reload",role:.destructive){store.beginApplicationRecord(job,discardDraft:true);savedMessage=""}
                Button("Keep draft",role:.cancel){}
            }
    }
}

private let nativePlanItems: [(id: String, title: String, detail: String)] = [
    ("profile", "Confirm your professional record", "Exact degree, work dates, responsibilities, relevant years and certifications."),
    ("evidence", "Prepare three achievement stories", "Personal projects, your contribution, tests and lessons learned. Do not invent employment or client results."),
    ("cv", "Build two focused CV versions", "Choose relevant work or project examples and describe your own contribution accurately."),
    ("priority", "Review paid software and AI opportunities", "Check experience gates before tailoring your application."),
    ("deadline", "Recheck the time-sensitive roles", "Check the current listing and existing application records to avoid duplicates."),
    ("review", "Review each application yourself", "Verify every field, attachment and claim. Nothing is automatically submitted.")
]

private struct NativePlanScreen: View {
    @EnvironmentObject private var store: NativeCareerStore
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        List {
            Section {
                NativeIntro(eyebrow: "YOUR NEXT MOVE", title: "Make every application count.", message: "Build your evidence, then focus on a small number of well-matched roles.")
                ProgressView(value: Double(nativePlanItems.filter { store.workspace.completed.contains($0.id) }.count), total: Double(nativePlanItems.count)) {
                    Text("\(nativePlanItems.filter { store.workspace.completed.contains($0.id) }.count) of \(nativePlanItems.count) preparation steps complete").font(.footnote)
                }.padding(.vertical, 5)
            }.listRowBackground(Color.clear).listRowSeparator(.hidden)
            Section {
                let prompts=store.attention()
                if prompts.isEmpty {Text("No attention prompts from your saved records.")}
                ForEach(prompts) { prompt in
                    NavigationLink {NativeJobDetail(job:prompt.job)} label:{
                        VStack(alignment:.leading,spacing:6){
                            Text(prompt.title).font(.headline)
                            Text(prompt.job.title+" · "+prompt.job.company).font(.subheadline)
                            if prompt.kind=="requirements" {Text(prompt.job.requirements.joined(separator:"\n")).font(.caption)}
                            if prompt.kind=="deadline" {Text("Listed deadline: "+nativeDate(prompt.job.closes ?? "",includeTime:(prompt.job.closes?.count ?? 0)>10)).font(.caption)}
                            if prompt.kind=="uncertain" {Text("No submission success is assumed. Verify the employer account or acknowledgement first.").font(.caption)}
                            if prompt.kind=="applied-date" {Text("Optional record detail; an unknown date is allowed.").font(.caption)}
                            Text("Research checked: \(prompt.job.researchCheckedAt ?? "Not researched") · Employer checked: \(prompt.job.lastCheckedAt ?? "Not recorded")").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            } header:{Text("Needs attention")} footer:{Text("Prompts from your saved records. Past checks do not establish current availability. Recheck employer information; these are not eligibility decisions or automatic applications.")}
            Section("Your preparation checklist") {
                ForEach(nativePlanItems, id: \.id) { item in
                    Toggle(isOn: Binding(get: { store.workspace.completed.contains(item.id) }, set: { store.setChecklist(item.id, done: $0) })) {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(item.title).font(.subheadline.weight(.semibold))
                            Text(item.detail).font(.caption).foregroundStyle(.secondary)
                        }.padding(.vertical, 4)
                    }
                }
            }
            Section("Application records") {
                if store.recordJobs.isEmpty {
                    NativeEmpty(title: "No applications marked yet.", message: "Open a role and update its status after you complete a step.", icon: "checkmark.bubble")
                } else {
                    ForEach(store.applicationGroups) { group in
                        DisclosureGroup("\(group.status) · \(group.jobs.count)") { ForEach(group.jobs) { NativeJobLink(job: $0) } }
                    }
                }
            }
            Section {
                NavigationLink { NativeNotesPreview(text: store.exportText(), includesProfile: true) } label: { Label("Review my application notes", systemImage: "doc.text") }
            } footer: { Text("Notes include your self-entered profile, application records, receipt notes, next actions and any unsaved drafts. Review them before choosing a destination in the share sheet.") }
        }.nativeList().navigationTitle("Application plan")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear{store.reloadApplicationRecords()}
            .onChange(of:scenePhase){phase in if phase == .active {store.reloadApplicationRecords()}}
    }
}

private struct NativeProfileScreen: View {
    @EnvironmentObject private var store: NativeCareerStore
    @State private var editing = false
    var body: some View {
        List {
            Section {
                NativeIntro(eyebrow: "YOUR PROFILE", title: "Start with what is true.", message: "Your experience gives every application its foundation.")
            }.listRowBackground(Color.clear)
            Section("Public professional evidence") {
                VStack(alignment: .leading, spacing: 6) {
                    Text(store.research.profile.name).font(.title2.weight(.bold))
                    Text(store.research.profile.role)
                    Text(store.research.profile.organization).foregroundStyle(.secondary)
                    Text(store.research.profile.location).font(.subheadline).foregroundStyle(.secondary)
                }.padding(.vertical, 5)
                ForEach(store.research.profile.facts, id: \.self) { Text($0).font(.subheadline) }
                if let url = nativeHTTPS(store.research.profile.url) { Link("View GitHub portfolio", destination: url) }
            }
            Section("Still to confirm") {
                ForEach(store.research.profile.unknowns, id: \.self) { Text($0).font(.subheadline) }
                Text("Add your own background and requirements. Skills are self-reported, not independently credential-verified.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section {
                LabeledContent("Relevant years", value: store.workspace.profile.years.isEmpty ? "Not provided" : store.workspace.profile.years)
                if !store.workspace.profile.degree.isEmpty { Text(store.workspace.profile.degree).font(.subheadline) }
                Button("Edit your profile") { editing = true }
            } header: { Text("Your own details") } footer: { Text("Saved on this device. These details are not verified qualifications and are not sent to employers.") }
            NativeCriteriaSection()
            Section {
                NavigationLink { NativeSalaryScreen() } label: { Label("Salary & negotiation", systemImage: "chart.bar.doc.horizontal") }
                NavigationLink { NativeBackupScreen() } label: { Label("Private workspace backup", systemImage: "externaldrive") }
                NavigationLink { NativePrivacyScreen() } label: { Label("Privacy & support", systemImage: "hand.raised") }
            }
        }.nativeList().navigationTitle("Your profile")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $editing) { NativeProfileEditor(profile: store.workspace.profile) }
    }
}

private struct NativeBackupDocument: FileDocument {
    static var readableContentTypes:[UTType] { [.json] }
    var data:Data
    init(data:Data) {self.data=data}
    init(configuration:ReadConfiguration)throws {data=configuration.file.regularFileContents ?? Data()}
    func fileWrapper(configuration:WriteConfiguration)throws->FileWrapper {FileWrapper(regularFileWithContents:data)}
}
private struct NativeBackupScreen:View {
    @EnvironmentObject private var store:NativeCareerStore
    @State private var input=""
    @State private var preview:NativeRestorePreview?
    @State private var document=NativeBackupDocument(data:Data())
    @State private var exporting=false
    @State private var importing=false
    @State private var confirming=false
    @State private var notice=""
    var body:some View {
        Form {
            Section("Private saved data only") {
                Text("Includes retained jobs, saved statuses, saved profile/checklist, receipts and next actions. Excludes search results, theme and unsaved drafts. No sync, submission or sending. Keep this unencrypted file private.")
                Button("Save private JSON backup") {
                    do {document=NativeBackupDocument(data:try store.privateBackupData());exporting=true;notice=""}
                    catch {notice=error.localizedDescription}
                }
            }
            Section("Add from backup") {
                Button("Choose JSON backup") {importing=true}
                Text("Or paste backup JSON (maximum 4 MiB):")
                TextEditor(text:$input).frame(minHeight:120).font(.caption.monospaced())
                    .onChange(of:input) { _ in preview=nil }
                Button("Preview additions") {
                    preview=nil
                    do {preview=try store.previewBackup(Data(input.utf8));notice=""}
                    catch {notice=error.localizedDescription}
                }.disabled(input.isEmpty)
                if let preview {
                    Text(preview.summary)
                    Button("Confirm additive restore") {confirming=true}.disabled(preview.additions==0)
                    Button("Cancel preview",role:.cancel) {self.preview=nil;notice="Preview canceled. Nothing was restored."}
                }
                Text("Close older app versions before restoring. Do not downgrade afterward: older builds do not understand imported receipts or tasks. All existing values stay unchanged. Profile and checklist imports are skipped. A local recovery copy is saved before restoring. Cancel or leave this screen to discard the preview.")
            }
            if !notice.isEmpty {Section {Text(notice)}}
        }.navigationTitle("Private backup")
        .fileExporter(isPresented:$exporting,document:document,contentType:.json,defaultFilename:"saleh-private-workspace") {result in
            if case .failure(let error)=result {notice=error.localizedDescription}
        }
        .fileImporter(isPresented:$importing,allowedContentTypes:[.json]) {result in
            preview=nil
            do {
                let url=try result.get();let access=url.startAccessingSecurityScopedResource()
                defer {if access {url.stopAccessingSecurityScopedResource()}}
                let handle=try FileHandle(forReadingFrom:url);defer {try? handle.close()}
                let data=try handle.read(upToCount:NativeCareerStore.backupLimit+1) ?? Data()
                guard data.count<=NativeCareerStore.backupLimit,let text=String(data:data,encoding:.utf8) else {throw NativeBackupError.invalid}
                input=text;notice="File loaded. Preview it before confirming restore."
            } catch {notice=error.localizedDescription}
        }
        .confirmationDialog("Add missing saved data? Existing values will be preserved.",isPresented:$confirming,titleVisibility:.visible) {
            Button("Restore additions") {
                guard let candidate=preview else {return}
                do {try store.applyBackup(candidate);notice="Additions restored locally. Nothing was sent.";input=""}
                catch {notice=error.localizedDescription}
                preview=nil
            }
            Button("Cancel",role:.cancel) {preview=nil}
        }
    }
}

private struct NativeNotesPreview: View {
    @State var text: String
    let includesProfile: Bool
    var body: some View {
        Form {
            Section {
                Text(includesProfile ? "These notes include your self-entered profile, application records, receipt notes, next actions and any unsaved drafts. Remove anything you do not want to share." : "This role note excludes your profile fields. Review the requirements and your local application status before sharing.")
                    .font(.footnote)
                TextEditor(text: $text).frame(minHeight: 350).accessibilityLabel("Application notes to review")
            }
            Section {
                ShareLink(item: text) { Label("Share reviewed notes", systemImage: "square.and.arrow.up") }
            } footer: { Text("Nothing is sent until you choose a destination and finish sharing. Edits here change only this export.") }
        }.navigationTitle("Review notes").navigationBarTitleDisplayMode(.inline)
    }
}

private struct NativePrivacyScreen: View {
    var body: some View {
        List {
            Section("Your information") {
                Text("Profile details, discovery criteria, saved jobs, application status, completed steps and search results are stored in this app on your device. There is no app account or cloud sync service.")
                Text("The developer does not receive your profile or application records automatically. The app includes a dated research snapshot drawn from public professional and employer information.")
            }
            Section("Employer searches and links") {
                Text("When you run a search, the app requests public job boards directly to selected employers and their recruitment providers using HTTPS. Those providers receive normal connection information, including your IP address. Your saved profile, discovery criteria and application notes are not included.")
                Text("Opening an employer or portfolio link takes you to an external website governed by its own privacy policy. Any application or account you create there is managed by that provider.")
            }
            Section("Sharing") {
                Text("Exported notes include your entered professional details and tracked roles, and exclude discovery criteria. They leave the app only when you choose a destination in the system share sheet. Review the content before sharing.")
                Text("The app has no advertising, tracking SDKs or developer analytics service. This local build does not use TestFlight feedback.")
                Link("Apple privacy policy", destination: URL(string: "https://www.apple.com/legal/privacy/")!)
            }
            Section("Retention and removal") {
                Text("You can edit or clear profile fields, remove saved roles and reset individual tracking statuses in the app. Saved or tracked job details may remain locally after a job disappears from a search.")
                Text("Deleting the app from iPhone Settings removes its local records; offloading the app keeps documents and data. Device backups may retain copies according to your Apple backup settings. Shared exports are separate copies that you manage at their destination.")
            }
            Section("Support") {
                Text("Report the screen and steps that caused the problem in the conversation where this app was provided. Review screenshots and diagnostics for personal details before sending.")
                Text("Policy updated 9 November 2026.").font(.footnote).foregroundStyle(.secondary)
            }
        }.nativeList().navigationTitle("Privacy & support")
            .navigationBarTitleDisplayMode(.inline)
    }
}

private struct NativeProfileEditor: View {
    @EnvironmentObject private var store: NativeCareerStore
    @Environment(\.dismiss) private var dismiss
    @State private var original: NativeProfile
    @State private var draft: NativeProfile
    @State private var confirmDiscard = false
    @FocusState private var focused: Bool
    init(profile: NativeProfile) { _original = State(initialValue: profile); _draft = State(initialValue: profile) }
    private var dirty: Bool { draft != original }
    private var hasConflict: Bool { store.workspace.profile != original }
    private var validLengths: Bool { draft.degree.count <= 300 && draft.skills.count <= 3_000 && draft.achievements.count <= 5_000 }
    private var validYears: Bool {
        let years = draft.years.trimmingCharacters(in: .whitespacesAndNewlines)
        if years.isEmpty { return true }
        return NativeMoney.parse(years.replacingOccurrences(of: ",", with: "."), limit: 60) != nil
    }
    var body: some View {
        NavigationStack {
            Form {
                if hasConflict {
                    Section {
                        NativeNotice(title: "Your profile changed in another window", message: "Keep a copy of any draft text you need, then cancel and reopen this editor to use the latest profile. Your draft has not been saved.", warning: true)
                    }
                }
                Section {
                    Picker("Preferred city", selection: Binding(get: { draft.preferredCity ?? "" }, set: { draft.preferredCity = $0 })) {
                        Text("Any Saudi city").tag("")
                        Text("Riyadh").tag("riyadh")
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Minimum monthly pay, SAR").font(.caption).foregroundStyle(.secondary)
                        TextField("Blank means no minimum", text: Binding(get: { draft.minimumMonthlySAR ?? "" }, set: { draft.minimumMonthlySAR = $0 }))
                            .keyboardType(.numberPad).focused($focused).accessibilityLabel("Minimum monthly pay in SAR")
                    }
                    if draft.hasPayFloor {
                        Picker("Unverified salaries", selection: Binding(get: { draft.unknownSalary ?? "show" }, set: { draft.unknownSalary = $0 })) {
                            Text("Show for review").tag("show")
                            Text("Hide from discovery").tag("hide")
                        }
                    }
                    if let error = draft.criteriaError { Label(error, systemImage: "exclamationmark.circle").font(.caption) }
                } header: { Text("Local discovery criteria") } footer: {
                    Text("Use whole SAR; blank or zero means no minimum. Confirm whether your minimum means basic salary or includes guaranteed allowances. Current roles have no verified salary evidence. Criteria stay on this device and are excluded from notes.")
                }
                Section("Experience and qualifications") {
                    VStack(alignment: .leading, spacing: 8) { Text("Years of formal relevant employment").font(.caption).foregroundStyle(.secondary); TextField("Years of formal relevant employment", text: $draft.years).keyboardType(.decimalPad).focused($focused) }
                    if !validYears { Label("Enter a number from 0 to 60, or leave blank.", systemImage: "exclamationmark.circle").font(.caption) }
                    TextField("Degree and certifications", text: $draft.degree, axis: .vertical).lineLimit(2...5).focused($focused)
                    if draft.degree.count > 300 { Label("Qualifications exceed 300 characters. Shorten this field before saving.", systemImage: "exclamationmark.circle").font(.caption) }
                }
                Section("Tools and responsibilities") {
                    TextEditor(text: $draft.skills).frame(minHeight: 120).focused($focused)
                        .accessibilityLabel("Tools and responsibilities")
                    Text("\(draft.skills.count) / 3,000 characters").font(.caption).foregroundStyle(.secondary)
                    if draft.skills.count > 3_000 { Label("Shorten tools and responsibilities before saving.", systemImage: "exclamationmark.circle").font(.caption) }
                }
                Section {
                    TextEditor(text: $draft.achievements).frame(minHeight: 160).focused($focused)
                        .accessibilityLabel("Achievements you can substantiate")
                    Text("\(draft.achievements.count) / 5,000 characters").font(.caption).foregroundStyle(.secondary)
                    if draft.achievements.count > 5_000 { Label("Shorten achievements before saving.", systemImage: "exclamationmark.circle").font(.caption) }
                } header: { Text("Achievements you can substantiate") } footer: {
                    Text("Include what changed, over what period, and your own contribution. Avoid confidential employer data.")
                }
                if let error = store.storageError { Section { Label(error, systemImage: "exclamationmark.triangle") } }
            }
            .navigationTitle("Edit profile").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { if dirty { confirmDiscard = true } else { dismiss() } } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        draft.years = draft.years.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: ".")
                        store.updateProfile(draft)
                        if store.storageError == nil { dismiss() }
                    }.disabled(!validYears || !validLengths || draft.criteriaError != nil || hasConflict)
                }
                ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done") { focused = false } }
            }
        }
        .interactiveDismissDisabled(dirty)
        .confirmationDialog("Discard unsaved profile changes?", isPresented: $confirmDiscard, titleVisibility: .visible) {
            Button("Discard changes", role: .destructive) { dismiss() }
            Button("Keep editing", role: .cancel) { }
        }
    }
}

private struct NativeSalaryScreen: View {
    @State private var basic = ""
    @State private var allowances = ""
    @State private var bonus = ""
    @FocusState private var focused: Bool
    private var basicAmount: Double? { NativeMoney.parse(basic, limit: 1_000_000) }
    private var allowanceAmount: Double? { NativeMoney.parse(allowances, limit: 1_000_000) }
    private var bonusAmount: Double? { NativeMoney.parse(bonus, limit: 10_000_000) }
    private func sar(_ value: Double) -> String { "SAR " + value.formatted(.number.precision(.fractionLength(0...2))) }
    var body: some View {
        Form {
            Section {
                NativeNotice(title: "Salary potential is not an offer.", message: "None of the researched roles has a published salary in this research. No salary target has been invented for this workspace.")
            }.listRowBackground(Color.clear)
            Section("Your offer, not a guessed benchmark") {
                Text("No verified software or AI salary benchmark is bundled. Confirm paid status, location, working hours and the approved salary range directly with the employer.")
                Text("Describe experience and education accurately and confirm role-specific requirements.")
            }
            Section {
                VStack(alignment: .leading, spacing: 8) { Text("Monthly basic salary · SAR").font(.caption).foregroundStyle(.secondary); TextField("Monthly basic salary · SAR", text: $basic).keyboardType(.decimalPad).focused($focused) }
                if basicAmount == nil { Label("Enter basic pay from 0 to SAR 1,000,000, for example 30,000 or 30000.50.", systemImage: "exclamationmark.circle").font(.caption) }
                VStack(alignment: .leading, spacing: 8) { Text("Monthly fixed allowances · SAR").font(.caption).foregroundStyle(.secondary); TextField("Monthly fixed allowances · SAR", text: $allowances).keyboardType(.decimalPad).focused($focused) }
                if allowanceAmount == nil { Label("Enter allowances from 0 to SAR 1,000,000, using a dot for decimals.", systemImage: "exclamationmark.circle").font(.caption) }
                VStack(alignment: .leading, spacing: 8) { Text("Target annual bonus · SAR").font(.caption).foregroundStyle(.secondary); TextField("Target annual bonus · SAR", text: $bonus).keyboardType(.decimalPad).focused($focused) }
                if bonusAmount == nil { Label("Enter annual bonus from 0 to SAR 10,000,000, using a dot for decimals.", systemImage: "exclamationmark.circle").font(.caption) }
                if let basicAmount, let allowanceAmount, let bonusAmount {
                    LabeledContent("Fixed monthly", value: sar(basicAmount + allowanceAmount))
                    LabeledContent("Fixed annual", value: sar((basicAmount + allowanceAmount) * 12))
                    LabeledContent("Including target bonus", value: sar((basicAmount + allowanceAmount) * 12 + bonusAmount))
                } else {
                    Text("Correct the fields with an error to calculate the package.").font(.footnote)
                }
            } header: { Text("Compare a package") } footer: {
                Text("The target bonus is not guaranteed. Blank fields count as zero. Use a comma to group thousands and a dot for decimals; Arabic digits and separators are also supported. Invalid or out-of-range values are not calculated.")
            }
            Section("The conversation to have") {
                Text("Ask for the approved grade and fixed monthly range early.")
                Text("Clarify the work, mentorship, professional-experience requirements and whether personal projects are accepted.")
                Text("Get basic pay, allowances, bonus terms, medical coverage, leave and relocation support in writing.")
                Text("Use verified achievements when negotiating. Compare commute, hours, probation and progression before committing.")
            }
        }.navigationTitle("Salary & negotiation").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done") { focused = false } } }
    }
}

private struct NativeIntro: View {
    let eyebrow: String
    let title: String
    let message: String
    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            Text(eyebrow).font(.caption2.weight(.semibold)).tracking(1.2).foregroundStyle(.secondary)
            Text(title).font(.title2.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
            Text(message).font(.subheadline).foregroundStyle(.secondary).lineSpacing(3)
        }.padding(.vertical, 12).accessibilityElement(children: .combine)
    }
}

private struct NativeNotice: View {
    let title: String
    let message: String
    var warning = false
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: warning ? "exclamationmark.circle" : "sparkle").font(.subheadline.weight(.semibold))
            Text(message).font(.footnote).foregroundStyle(.secondary).lineSpacing(2)
        }.padding(15).frame(maxWidth: .infinity, alignment: .leading)
            .background(warning ? Color.orange.opacity(0.1) : Color.careerMint, in: RoundedRectangle(cornerRadius: 16))
            .accessibilityElement(children: .combine)
    }
}

private struct NativeEmpty: View {
    let title: String
    let message: String
    let icon: String
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: icon).font(.title).foregroundStyle(Color.careerAccent).accessibilityHidden(true)
            Text(title).font(.headline)
            Text(message).font(.subheadline).foregroundStyle(.secondary)
        }.padding(.vertical, 20).accessibilityElement(children: .combine)
    }
}

private extension View {
    func nativeList() -> some View {
        self.listStyle(.insetGrouped).scrollContentBackground(.hidden)
            .background(Color(uiColor: .systemGroupedBackground))
    }
}

private extension Color {
    static let careerAccent = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.47, green: 0.83, blue: 0.70, alpha: 1)
            : UIColor(red: 0.08, green: 0.43, blue: 0.34, alpha: 1)
    })
    static let careerMint = Color(red: 0.47, green: 0.83, blue: 0.70).opacity(0.13)
}

private func nativeMatches(_ job: CareerJob, query: String) -> Bool {
    RoleReview.matches(job, query: query)
}

private func nativeDate(_ value: String, includeTime: Bool = false) -> String {
    guard let parsed = CareerFeed.parsedDate(value) else { return "Not stated" }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_SA")
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = TimeZone(identifier: "Asia/Riyadh")
    formatter.dateStyle = .medium
    formatter.timeStyle = includeTime ? .short : .none
    return formatter.string(from: parsed)
}

private func nativeHTTPS(_ value: String) -> URL? {
    guard let url = URL(string: value), url.scheme?.lowercased() == "https", url.host != nil else { return nil }
    return url
}
#endif
