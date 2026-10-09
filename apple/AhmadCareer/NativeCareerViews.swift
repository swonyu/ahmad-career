#if os(iOS)
import SwiftUI
import UIKit

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
            NavigationStack { NativePlanScreen() }
                .tabItem { Label("Plan", systemImage: "checklist") }
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
    private var jobs: [CareerJob] { store.shortlistJobs.filter { store.workspace.profile.includesInDiscovery($0) && nativeMatches($0, query: query) } }

    var body: some View {
        List {
            if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Section {
                NativeIntro(eyebrow: "A CONSIDERED NEXT STEP", title: "Your next chapter, Ahmad.",
                            message: "Opportunities that build on your healthcare experience. More responsibility. Better prospects.")
                NativeNotice(title: "Check role-specific requirements first.", message: "Contract, tender and KPI experience support conditional leads. Review the specialist requirements and grade before applying. Salary is undisclosed.")
            }.listRowBackground(Color.clear).listRowSeparator(.hidden)
            }
            NativeCriteriaSection()
            Section {
                if jobs.isEmpty {
                    if store.workspace.profile.hidesUnverifiedSalary && !store.shortlistJobs.isEmpty {
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
                Text("Saudi Arabia only · Research checked \(nativeDate(store.research.checkedAt)). Recheck each employer before applying.")
            }
            Section {
                DisclosureGroup("How this shortlist was ranked") {
                    Text("Priority considers healthcare relevance, KPI and supply-chain overlap, responsibility, current opening evidence, and qualification gaps. It is a research judgment, not an interview probability.")
                    Text("Only healthcare employers and healthcare assignments are included. Conditional, stretch and reserve labels identify unconfirmed requirements. We do not add unsuitable jobs to reach ten; salary is undisclosed.")
                }.font(.subheadline)
            }
        }
        .nativeList()
        .navigationTitle("Ahmad Career")
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

private enum NativeJobFilter: String, CaseIterable, Identifiable {
    case all = "All opportunities", healthcare = "Healthcare", leadership = "Leadership", riyadh = "Riyadh"
    var id: String { rawValue }
    func includes(_ job: CareerJob) -> Bool {
        switch self {
        case .all: return true
        case .healthcare: return job.healthcare == true || ["Alcon", "Roche", "Johnson & Johnson", "GSK", "Novartis", "BD"].contains(job.company) || job.title.range(of: "healthcare|medical|pharma", options: [.regularExpression, .caseInsensitive]) != nil
        case .leadership: return job.leadership == true || job.title.range(of: "manager|director|head|lead", options: [.regularExpression, .caseInsensitive]) != nil
        case .riyadh: return job.hasRiyadhEvidence
        }
    }
}

private struct NativeSearchScreen: View {
    @EnvironmentObject private var store: NativeCareerStore
    @State private var query = ""
    @State private var filter = NativeJobFilter.all
    private var jobs: [CareerJob] { store.liveJobs.filter { store.workspace.profile.includesInDiscovery($0) && nativeMatches($0, query: query) && filter.includes($0) } }

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
                Text("Alcon · J&J · Roche · Novartis · GSK · BD\nNo sign-in or CV is sent to search.")
                    .font(.footnote).foregroundStyle(.secondary)
                if let error = store.searchError {
                    NativeNotice(title: "Review search coverage", message: error, warning: true)
                }
            }.listRowBackground(Color.clear).listRowSeparator(.hidden)
            NativeCriteriaSection()
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
                        Text("A bounded sample of selected boards. Filtering can miss suitable jobs. A source failure does not mean that employer has no openings. Earlier results from unavailable employers are retained and marked Not refreshed.")
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

private struct NativeJobLink: View {
    @EnvironmentObject private var store: NativeCareerStore
    let job: CareerJob
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
                    Text(job.fit).font(.caption.weight(.medium)).foregroundStyle(job.isExpired ? Color.primary : Color.careerAccent)
                    ForEach(store.workspace.profile.criteriaMessages(for: job), id: \.self) { message in
                        Label(message, systemImage: "questionmark.circle").font(.caption).foregroundStyle(.secondary)
                    }
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
                LabeledContent("Posted", value: nativeDate(job.posted))
                LabeledContent("Closing date", value: job.closes.map { nativeDate($0, includeTime: $0.count > 10) } ?? "Not published")
                LabeledContent("Salary", value: job.rank == nil ? "Not checked for this lead" : "Not disclosed in research")
                ForEach(store.workspace.profile.criteriaMessages(for: job), id: \.self) { message in
                    Label(message, systemImage: "questionmark.circle").font(.footnote)
                }
                if let mode = job.mode, mode != "Not stated" { LabeledContent("Work arrangement", value: mode) }
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
                NavigationLink { NativeApplicationRecordEditor(job:job) } label: { Label("Application date and receipt note",systemImage:"calendar.badge.clock") }
                Button { store.toggleSaved(job) } label: {
                    Label(store.isSaved(job) ? "Remove from saved" : "Save opportunity", systemImage: store.isSaved(job) ? "heart.fill" : "heart")
                }
            } header: { Text("Your progress") } footer: {
                Text("This is your own record. Changing status does not submit an application or contact anyone.")
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
    ("evidence", "Prepare three achievement stories", "Availability, supplier performance and operational improvement. Use accurate, shareable results."),
    ("cv", "Build two focused CV versions", "Healthcare procurement and performance improvement. Tie each to the target requirements."),
    ("priority", "Review healthcare roles that meet your requirements", "Check experience gates before tailoring your application."),
    ("deadline", "Recheck the time-sensitive roles", "Check the current Roche, Alcon and J&J deadlines directly with each employer."),
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
                } else { ForEach(store.recordJobs) { NativeJobLink(job: $0) } }
            }
            Section {
                NavigationLink { NativeNotesPreview(text: store.exportText(), includesProfile: true) } label: { Label("Review my application notes", systemImage: "doc.text") }
            } footer: { Text("Notes include your self-entered profile, application records, receipt notes and any unsaved record drafts. Review them before choosing a destination in the share sheet.") }
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
                if let url = nativeHTTPS(store.research.profile.url) { Link("View LinkedIn profile", destination: url) }
            }
            Section("Still to confirm") {
                ForEach(store.research.profile.unknowns, id: \.self) { Text($0).font(.subheadline) }
                Text("LinkedIn lists a dated, self-reported career history. This public snapshot excludes private CV documents and messages. Credentials, specialist experience and measurable outcomes still need confirmation; overlapping jobs are not counted twice.")
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
                NavigationLink { NativePrivacyScreen() } label: { Label("Privacy & beta support", systemImage: "hand.raised") }
            }
        }.nativeList().navigationTitle("Your profile")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $editing) { NativeProfileEditor(profile: store.workspace.profile) }
    }
}

private struct NativeNotesPreview: View {
    @State var text: String
    let includesProfile: Bool
    var body: some View {
        Form {
            Section {
                Text(includesProfile ? "These notes include your self-entered profile, application records, receipt notes and any unsaved record drafts. Remove anything you do not want to share." : "This role note excludes your profile fields. Review the requirements and your local application status before sharing.")
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
                Text("When you run a search, the app sends fixed job queries directly to selected employers and their recruitment providers using HTTPS. Those providers receive normal connection information, including your IP address. Your saved profile, discovery criteria and application notes are not included.")
                Text("Opening an employer, LinkedIn or salary-source link takes you to an external website governed by its own privacy policy. Any application or account you create there is managed by that provider.")
            }
            Section("Sharing and beta feedback") {
                Text("Exported notes include your entered professional details and tracked roles, and exclude discovery criteria. They leave the app only when you choose a destination in the system share sheet. Review the content before sharing.")
                Text("The app has no advertising, tracking SDKs or developer analytics service. Apple may process TestFlight testing, crash and feedback information under its own privacy practices.")
                Link("Apple privacy policy", destination: URL(string: "https://www.apple.com/legal/privacy/")!)
            }
            Section("Retention and removal") {
                Text("You can edit or clear profile fields, remove saved roles and reset individual tracking statuses in the app. Saved or tracked job details may remain locally after a job disappears from a search.")
                Text("Deleting the app from iPhone Settings removes its local records; offloading the app keeps documents and data. Device backups may retain copies according to your Apple backup settings. Shared exports are separate copies that you manage at their destination.")
            }
            Section("Beta support") {
                Text("Open TestFlight, select Ahmad Career and choose Send Beta Feedback to contact the developer. Include the screen and steps that caused the problem. Review screenshots and diagnostics before sending.")
                Text("Policy updated 9 October 2026.").font(.footnote).foregroundStyle(.secondary)
            }
        }.nativeList().navigationTitle("Privacy & beta support")
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
                    VStack(alignment: .leading, spacing: 8) { Text("Relevant years of experience").font(.caption).foregroundStyle(.secondary); TextField("Relevant years of experience", text: $draft.years).keyboardType(.decimalPad).focused($focused) }
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
                NativeNotice(title: "Salary potential is not an offer.", message: "None of the researched roles has a published salary in this research. These historical market benchmarks are not job-specific estimates or guaranteed pay.")
            }.listRowBackground(Color.clear)
            Section("Historical 2025 · Hays") {
                LabeledContent("Supply Chain Manager", value: "SAR 30,000–45,000")
                LabeledContent("Procurement Manager", value: "SAR 30,000–50,000")
                Text("Total fixed monthly package, including fixed allowances. Data as of Q4 2024; broad Saudi market, not healthcare-specific. These are not basic-salary ranges.")
                    .font(.footnote).foregroundStyle(.secondary)
                Link("Hays 2025 guide · page 38", destination: URL(string: "https://www.hays.ae/documents/d/hays-salary-guide-ae/hays-saudi-arabia-salary-guide-2025")!)
                Link("Hays 2026 guide", destination: URL(string: "https://www.hays.ae/salary-guide/saudi-arabia-salary-guide")!)
                Text("The 2026 guide exists; its detailed tables were unavailable without a contact form in this research.").font(.footnote).foregroundStyle(.secondary)
            }
            Section {
                DisclosureGroup("Cross-check with another guide") {
                    Text("The Professionals 2025 reports Supply & Demand Manager at SAR 30,220 / 42,866 / 53,710 monthly for the 25th percentile / median / 75th percentile (p.49). Methodology (p.15): basic salary, housing and transportation. Different definitions and samples make this context, not an interchangeable quote.").font(.subheadline)
                    Link("The Professionals 2025 guide", destination: URL(string: "https://theprofessionals.sa/wp-content/uploads/2026/02/Salary-Guide-2025-The-Professionals.pdf")!)
                }
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
                Text("Clarify direct reports, spend authority, KPI ownership and delivery expectations.")
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
    let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
    return text.isEmpty || ([job.title, job.company, job.location, job.summary, job.subtitle ?? ""] + job.requirements).joined(separator: " ").localizedCaseInsensitiveContains(text)
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
