#if os(iOS)
import SwiftUI
import UIKit

@MainActor
final class NativeCareerNavigation: ObservableObject {
    @Published var selectedTab = 0
}

@MainActor
struct NativeCareerRoot: View {
    @EnvironmentObject private var store: NativeCareerStore
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var applications = CareerAppEnvironment.makeApplicationsStore()
    @StateObject private var discovery = CareerAppEnvironment.makeDiscoveryStore()
    @StateObject private var navigation = NativeCareerNavigation()
    private var savedCount: Int {
        Set(store.savedJobs.map { MobileApplicationPolicy.jobIdentity($0.url) }
            + applications.savedOpportunities.compactMap { $0["url"]?.string }.map(MobileApplicationPolicy.jobIdentity)).count
    }

    var body: some View {
        TabView(selection: $navigation.selectedTab) {
            NavigationStack { NativeShortlistScreen() }
                .tabItem { Label("Start", systemImage: "square.stack") }.tag(0)
            NavigationStack { NativeDiscoveryScreen() }
                .tabItem { Label("Search", systemImage: "magnifyingglass") }.tag(1)
            NavigationStack { NativeApplicationsScreen() }
                .tabItem { Label("Apply", systemImage: "paperplane") }.tag(2)
            NavigationStack { NativeSavedScreen() }
                .tabItem { Label("Saved", systemImage: "heart") }.tag(3)
                .badge(savedCount)
            NavigationStack { NativeProfileScreen() }
                .tabItem { Label("Profile", systemImage: "person.crop.circle") }.tag(4)
        }
        .environmentObject(store)
        .environmentObject(applications)
        .environmentObject(discovery)
        .environmentObject(navigation)
        .tint(.careerAccent)
        .task(id: scenePhase == .active) {
            guard scenePhase == .active else { return }
            await applications.refresh()
            while !Task.isCancelled {
                do { try await Task.sleep(nanoseconds: 4_000_000_000) } catch { break }
                guard !Task.isCancelled else { break }
                if !applications.activePlanIDs.isEmpty { await applications.pollApprovedApplications() }
            }
        }
        .onReceive(store.$storageError.compactMap { $0 }) { error in
            UIAccessibility.post(notification: .announcement, argument: error)
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if CareerAppEnvironment.isUIAcceptance {
                // Test-only provenance must not obscure or resize the production accessibility layout.
                Text("Offline UI acceptance · synthetic data").font(.system(size: 11, weight: .medium))
                    .lineLimit(1).padding(4).frame(maxWidth: .infinity)
                    .background(Color.yellow.opacity(0.2)).accessibilityIdentifier("acceptance.offline")
            }
            if let error = store.storageError {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.footnote).padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.orange.opacity(0.14))
                    .accessibilityLabel("Storage problem. \(error)")
            }
        }
    }
}

private enum NativeStartSheet: String, Identifiable {
    case profile, opportunity
    var id: String { rawValue }
}

private struct NativeShortlistScreen: View {
    @EnvironmentObject private var store: NativeCareerStore
    @EnvironmentObject private var applications: NativeApplicationsStore
    @EnvironmentObject private var navigation: NativeCareerNavigation
    @State private var sheet: NativeStartSheet?

    var body: some View {
        List {
            Section {
                NativeIntro(eyebrow: "YOUR CAREER WORKSPACE", title: "Find work that fits your life.",
                            message: "Explore employer boards, keep the roles you like and review every application before it is sent.")
            }.listRowBackground(Color.clear).listRowSeparator(.hidden)
            Section("Start with an opportunity") {
                Button { navigation.selectedTab = 1 } label: {
                    Label("Find opportunities", systemImage: "magnifyingglass")
                }.accessibilityIdentifier("home.discover")
                Button { sheet = .opportunity } label: {
                    Label(applications.opportunityDraft.hasContent ? "Continue your saved job draft" : "Add a job link", systemImage: "link")
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(Rectangle())
                }.buttonStyle(.plain).foregroundStyle(Color.careerAccent).accessibilityIdentifier("home.addOpportunity")
                Text("Browse public employer boards without an account, or save a public job link from any country or profession.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section("Make your next step easier") {
                Button {
                    sheet = .profile
                    #if DEBUG
                    if CareerAppEnvironment.isUIAcceptance { print("UI acceptance: Start requested application profile") }
                    #endif
                } label: {
                    Label(applications.profileReadiness.nextAction, systemImage: "person.crop.rectangle")
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(Rectangle())
                }.buttonStyle(.plain).foregroundStyle(Color.careerAccent).accessibilityIdentifier("home.applicationProfile")
                NativeProfileEssentials(profile: applications.profile)
                Button { navigation.selectedTab = 3 } label: {
                    Label("Open saved opportunities", systemImage: "heart")
                }
                Button { navigation.selectedTab = 2 } label: {
                    Label(applications.availableReviews.isEmpty ? "Open your application workspace" : "Continue application review", systemImage: "paperplane")
                }
                NavigationLink("Application preparation checklist") { NativePlanScreen() }
            }
            Section("You stay in control") {
                Text("Your new profile starts blank. Add your own details and CV when you are ready. An account is needed only for the connected application service.")
                Text("Auto Apply is available for activated employer integrations. Other roles open on the employer's website. Only a provider receipt confirms a submission.")
                Text("Existing notes, saved roles and application history stay available. A search result or a saved link is not an application.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .nativeList()
        .navigationTitle("Career Finder")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $sheet) { destination in
            switch destination {
            case .profile: NativeApplicationProfileEditor(model: applications)
            case .opportunity: NativeOpportunityEditor(model: applications)
            }
        }
    }
}

private struct NativeCriteriaSection: View {
    @EnvironmentObject private var store: NativeCareerStore
    @State private var editing = false
    var body: some View {
        Section {
            Text(store.workspace.profile.criteriaSummary).font(.subheadline)
            Button("Edit criteria") { editing = true }
        } header: { Text("Local planning preferences") } footer: {
            Text("These preferences stay on this device for your planning notes and earlier records. Search uses the role, location and board choices you enter on the Search tab. Salary and pay basis still need confirmation.")
        }
        .sheet(isPresented: $editing) { NativeProfileEditor(profile: store.workspace.profile) }
    }
}

private enum NativeSavedFilter: String, CaseIterable, Identifiable {
    case all = "All", applied = "Applied", followUps = "Follow-ups"
    var id: String { rawValue }
}

private struct NativeSavedScreen: View {
    @EnvironmentObject private var store: NativeCareerStore
    @EnvironmentObject private var applications: NativeApplicationsStore
    @EnvironmentObject private var navigation: NativeCareerNavigation
    @State private var query = ""
    @State private var adding = false
    @State private var filter = NativeSavedFilter.all
    private var jobs: [CareerJob] {
        store.savedJobs.filter { nativeMatches($0, query: query) && filter != .followUps
            && (filter != .applied || ["Applied", "Interviewing", "Offer received"].contains(store.status(for: $0))) }
    }
    private var applicationJobs: [NativeApplicationRow] {
        let words = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return applications.savedOpportunities.compactMap { NativeApplicationRow($0) }.filter { row in
            (words.isEmpty || ["title", "company", "location"].compactMap { row.value[$0]?.string }
                .joined(separator: " ").localizedCaseInsensitiveContains(words)
            ) && (filter != .applied || applications.isMarkedApplied(row.value))
                && (filter != .followUps || applications.followUpDay(for: row.value) != nil)
        }.sorted { left, right in
            if filter == .followUps {
                let a = applications.followUpDay(for: left.value) ?? "", b = applications.followUpDay(for: right.value) ?? ""
                if a != b { return a < b }
            }
            return (left.value["title"]?.string ?? "").localizedStandardCompare(right.value["title"]?.string ?? "") == .orderedAscending
        }
    }
    var body: some View {
        List {
            if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Section {
                NativeIntro(eyebrow: "YOUR OWN SHORTLIST", title: "Keep your next move close.", message: "Jobs saved from Search and your own links are ready in the application workspace. Earlier planning records remain available below.")
            }.listRowBackground(Color.clear)
            }
            Section {
                Picker("Show", selection: $filter) { ForEach(NativeSavedFilter.allCases) { Text($0.rawValue).tag($0) } }
                    .pickerStyle(.menu).accessibilityIdentifier("saved.filter")
                if filter == .followUps { Text("Dates you set on this phone, with overdue follow-ups first. No message or notification is sent.").font(.footnote).foregroundStyle(.secondary) }
            }
            if applications.savedOpportunities.isEmpty && store.savedJobs.isEmpty {
                Section {
                    NativeEmpty(title: "Make a shortlist of your own.", message: "Save a role from Search or add a job link. Saving keeps it for review; it does not apply.", icon: "heart")
                    Button("Find opportunities") { navigation.selectedTab = 1 }
                    Button("Add a job link") { adding = true }
                }
            } else if applicationJobs.isEmpty && jobs.isEmpty {
                Section {
                    NativeEmpty(title: filter == .followUps ? "No follow-ups to show." : "No saved roles match this view.", message: filter == .followUps ? "Open an opportunity and add a follow-up date to Your record." : "Your opportunities are still here. Try another term or show all records.", icon: filter == .followUps ? "calendar" : "magnifyingglass")
                    Button("Show all opportunities") { query = ""; filter = .all }
                }
            }
            if !applicationJobs.isEmpty {
                Section("Application opportunities · \(applicationJobs.count)") {
                    ForEach(applicationJobs) { row in
                        NavigationLink { NativeSavedApplicationDetail(id: row.id) } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(row.value["title"]?.string ?? "Opportunity").font(.headline).fixedSize(horizontal: false, vertical: true)
                                Text(row.value["company"]?.string ?? "").font(.subheadline).foregroundStyle(.secondary)
                                if let location = row.value["location"]?.string, !location.isEmpty {
                                    Text(location).font(.caption).foregroundStyle(.secondary)
                                }
                                Label(row.value["recordOnly"]?.bool == true ? "Your application record" : row.value["localOnly"]?.bool == true ? "Saved on this phone" : "Saved with application service", systemImage: "bookmark")
                                    .font(.caption).foregroundStyle(.secondary)
                                if applications.recordVersions(for: row.value).filter({ !$0.archived }).count > 1 {
                                    Label("Compare your private records", systemImage: "doc.on.doc").font(.caption)
                                } else if let record = applications.currentRecord(for: row.value) {
                                    Text("You marked: " + record.stage.title).font(.caption).foregroundStyle(.secondary)
                                }
                                if let day = applications.followUpDay(for: row.value) {
                                    Text((day < PhoneRecordDay.string(Date()) ? "Overdue follow-up · " : day == PhoneRecordDay.string(Date()) ? "Follow up today · " : "Follow up · ") + day)
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }.padding(.vertical, 5)
                        }
                    }
                }
            }
            if !jobs.isEmpty {
                Section {
                    ForEach(jobs) { NativeJobLink(job: $0) }
                } header: { Text("Earlier planning records · \(jobs.count)") } footer: {
                    Text("These original records stay on this device. Open a role to copy its public details into the application workspace; your notes and status are preserved.")
                }
            }
        }.nativeList().navigationTitle("Saved opportunities")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, prompt: "Search saved opportunities")
            .toolbar { ToolbarItem(placement: .navigationBarTrailing) {
                Button { adding = true } label: { Label("Add opportunity", systemImage: "plus") }.accessibilityIdentifier("saved.addOpportunity")
            } }
            .sheet(isPresented: $adding) { NativeOpportunityEditor(model: applications) }
    }
}

struct NativeSavedApplicationDetail: View {
    @EnvironmentObject private var applications: NativeApplicationsStore
    @EnvironmentObject private var navigation: NativeCareerNavigation
    let id: String
    @State private var rememberedIdentity: String?
    @State private var editingRecord = false
    @State private var reviewingVersions = false
    @State private var removing: PhoneLocalRemovalContext?
    @State private var adoption: PhoneRecordAdoptionContext?
    @State private var confirmingAdoption = false
    private var job: [String: ApplicationValue]? {
        applications.savedOpportunity(id) ?? applications.savedOpportunities.first {
            rememberedIdentity != nil && MobileApplicationPolicy.jobIdentity($0["url"]?.string ?? "") == rememberedIdentity
        }
    }
    var body: some View {
        List {
            if let job {
                Section {
                    Text(job["title"]?.string ?? "Opportunity").font(.title2.weight(.bold)).fixedSize(horizontal: false, vertical: true)
                    Text(job["company"]?.string ?? "").font(.headline)
                    if let location = job["location"]?.string, !location.isEmpty { Label(location, systemImage: "mappin") }
                }
                Section {
                    if let url = job["url"]?.string.flatMap(MobileApplicationPolicy.jobURL) {
                        Link(destination: url) { Label("Open employer posting", systemImage: "arrow.up.right.square") }
                        ShareLink(item: url) { Label("Share job link", systemImage: "square.and.arrow.up") }
                    }
                    Button("Open application workspace") { navigation.selectedTab = 2 }
                } footer: {
                    Text("Review the employer's current requirements. Auto Apply eligibility is checked in the application workspace; opening or sharing this link never counts as a submission.")
                }
                Section {
                    if applications.recordVersions(for: job).filter({ !$0.archived }).count > 1 {
                        Text("Two private records are kept for this opportunity. Compare them and choose the one to use. Neither version has been deleted.")
                        Button("Compare records") { reviewingVersions = true }
                    } else {
                        if let record = applications.currentRecord(for: job) { NativeModernRecordSummary(record: record) }
                        else { Text("Keep track of applications you complete on an employer website or LinkedIn.").font(.subheadline).foregroundStyle(.secondary) }
                        Button(applications.currentRecord(for: job) == nil ? "Add your application record" : "Edit your application record") { editingRecord = true }
                            .disabled(applications.busy).accessibilityIdentifier("record.edit")
                    }
                    if applications.recordVersions(for: job).contains(where: \.archived) {
                        Button("Earlier record versions") { reviewingVersions = true }
                    }
                    if let context = applications.recordAdoptionContext(for: job) {
                        Button("Keep with connected workspace") { adoption = context; confirmingAdoption = true }
                            .accessibilityIdentifier("record.keepWithWorkspace")
                        Text("This record is separate from your connected workspace. You can associate it without saving its job link again.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                } header: { Text("Your record · on this phone") } footer: {
                    Text("Your stage, dates and notes are private. Marking Applied helps avoid duplicate applications; it does not create a provider receipt or contact an employer.")
                }
                if let currentID = job["id"]?.string, job["localOnly"]?.bool == true {
                    Section {
                        Button("Remove saved link", role: .destructive) {
                            if let context = applications.removalContext(currentID) { removing = context }
                            else { applications.message = "Finish or stop this opportunity's application review before removing the saved link." }
                        }.disabled(applications.busy).accessibilityIdentifier("saved.removeLink")
                    }
                }
                if let message = applications.message { Section { Text(message).font(.footnote).foregroundStyle(.secondary) } }
            } else { NativeEmpty(title: "This opportunity is no longer available here.", message: "Return to Saved to see your current opportunities.", icon: "bookmark") }
        }.nativeList().navigationTitle("Saved opportunity").navigationBarTitleDisplayMode(.inline)
            .onAppear { if let url = job?["url"]?.string { rememberedIdentity = MobileApplicationPolicy.jobIdentity(url) } }
            .sheet(isPresented: $editingRecord) { if let job { NativeModernRecordEditor(model: applications, job: job) } }
            .sheet(isPresented: $reviewingVersions) { if let job { NativeModernRecordVersions(model: applications, job: job) } }
            .sheet(item: $removing) { NativeSavedLinkRemoval(model: applications, context: $0) }
            // An alert keeps both decisions visible; popover-style confirmation
            // dialogs can omit their cancel action on a phone.
            .alert("Keep this record with your connected workspace?", isPresented: $confirmingAdoption) {
                Button("Keep with this workspace") { if let adoption { _ = applications.adoptUnpairedRecord(adoption) } }
                Button("Keep separate on this phone", role: .cancel) { adoption = nil }
            } message: {
                Text("The record will belong to the workspace currently connected on this phone. Notes and earlier versions stay private, and any other version is kept for comparison. This does not restore a removed bookmark, upload notes, or contact an employer.")
            }
    }
}

private struct NativeModernRecordSummary: View {
    let record: PhoneOpportunityRecord
    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("You marked: " + record.stage.title).font(.headline).accessibilityIdentifier("record.stageSummary")
            if record.appliedElsewhere { Label("You reported an application", systemImage: "person.crop.circle.badge.checkmark").font(.subheadline) }
            if !record.appliedOn.isEmpty { Text("Application date · " + record.appliedOn).font(.subheadline) }
            if !record.followUpOn.isEmpty { Text("Follow-up date · " + record.followUpOn).font(.subheadline) }
            if !record.note.isEmpty { Text(record.note).font(.subheadline).textSelection(.enabled).fixedSize(horizontal: false, vertical: true) }
            Text("On this phone").font(.caption).foregroundStyle(.secondary)
        }.accessibilityElement(children: .contain)
    }
}

private struct NativeModernRecordEditor: View {
    @ObservedObject var model: NativeApplicationsStore
    let job: [String: ApplicationValue]
    @Environment(\.dismiss) private var dismiss
    @State private var draft: PhoneRecordDraft
    @State private var original: PhoneRecordDraft
    @State private var context: PhoneRecordEditContext?
    @State private var baseWasApplied: Bool
    @State private var issue: String?
    @State private var discard = false
    @State private var clearApplied = false
    @FocusState private var noteFocused: Bool
    init(model: NativeApplicationsStore, job: [String: ApplicationValue]) {
        self.model = model; self.job = job
        let record = model.currentRecord(for: job), draft = PhoneRecordDraft(model.currentRecord(for: job))
        _draft = State(initialValue: draft); _original = State(initialValue: draft)
        _baseWasApplied = State(initialValue: record?.appliedElsewhere == true)
        _context = State(initialValue: model.recordEditContext(for: job))
    }
    private var changed: Bool { draft != original }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(job["title"]?.string ?? "Opportunity").font(.headline)
                    Text("Your record stays on this phone. Saving it does not send an application or a message.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if context == nil { Section { Text("Compare the saved record versions before editing this opportunity.").foregroundStyle(.red) } }
                if let issue { Section { Text(issue).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true) } }
                Section {
                    Picker("Stage", selection: $draft.stage) { ForEach(PhoneApplicationStage.allCases) { Text($0.title).tag($0) } }
                        .pickerStyle(.menu).accessibilityIdentifier("record.stage")
                    if baseWasApplied && draft.stage == .saved {
                        Text("Your previous record says you applied. Clearing that mark allows a new application review; it does not withdraw an employer application.")
                            .font(.footnote).foregroundStyle(.secondary)
                        if original.stage == .saved {
                            Button("Mark as not applied") { clearApplied = true }.accessibilityIdentifier("record.clearApplied")
                        }
                    }
                } header: { Text("Application stage") } footer: {
                    Text("Applied, Interview and Offer mark this role as already applied. Closed keeps any earlier applied mark.")
                }
                Section {
                    Toggle("Add an application date", isOn: Binding(get: { !draft.appliedOn.isEmpty }, set: { draft.appliedOn = $0 ? PhoneRecordDay.string(Date()) : "" }))
                        .accessibilityIdentifier("record.hasAppliedDate")
                    if !draft.appliedOn.isEmpty {
                        DatePicker("Applied on", selection: dayBinding(\.appliedOn), displayedComponents: .date)
                            .accessibilityIdentifier("record.appliedDate")
                    }
                    Toggle("Plan a follow-up", isOn: Binding(get: { !draft.followUpOn.isEmpty }, set: { draft.followUpOn = $0 ? PhoneRecordDay.string(Date()) : "" }))
                        .accessibilityIdentifier("record.hasFollowUp")
                    if !draft.followUpOn.isEmpty {
                        DatePicker("Follow up on", selection: dayBinding(\.followUpOn), displayedComponents: .date)
                            .accessibilityIdentifier("record.followUpDate")
                    }
                } header: { Text("Optional dates") } footer: {
                    Text("Leave the application date blank if you do not know it. Dates keep the day you selected when your time zone changes. Follow-ups appear in Saved; no notification or message is sent.")
                }
                Section {
                    TextEditor(text: $draft.note).frame(minHeight: 140).focused($noteFocused)
                        .accessibilityLabel("Private application note").accessibilityIdentifier("record.note")
                    Text("\(draft.note.unicodeScalars.count) / 2,000 characters").font(.caption).foregroundStyle(.secondary)
                } header: { Text("Private note (optional)") } footer: {
                    Text("For your own preparation and reminders. This note is not included in employer application details.")
                }
            }.environment(\.calendar, PhoneRecordDay.calendar())
                .navigationTitle("Your application record").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { noteFocused = false; if changed { discard = true } else { dismiss() } }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            noteFocused = false
                            if baseWasApplied && draft.stage == .saved && original.stage != .saved { clearApplied = true }
                            else { save() }
                        }.disabled(model.busy || context == nil).accessibilityIdentifier("record.save")
                    }
                    ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done typing") { noteFocused = false } }
                }
                .alert("Discard your unsaved record changes?", isPresented: $discard) {
                    Button("Discard changes", role: .destructive) { dismiss() }
                    Button("Keep editing", role: .cancel) {}
                } message: { Text("Your previously saved record will stay unchanged.") }
                .alert("Mark as not applied?", isPresented: $clearApplied) {
                    Button("Mark not applied", role: .destructive) { save(confirmNotApplied: true) }
                    Button("Keep application record", role: .cancel) {}
                } message: { Text("This changes your private record and allows a new application review. It does not withdraw or change anything with an employer. Your earlier versions stay on this phone.") }
        }.tint(.careerAccent).interactiveDismissDisabled(changed || model.busy)
    }
    private func dayBinding(_ path: WritableKeyPath<PhoneRecordDraft, String>) -> Binding<Date> {
        Binding(get: { PhoneRecordDay.date(draft[keyPath: path]) ?? Date() }, set: { draft[keyPath: path] = PhoneRecordDay.string($0) })
    }
    private func save(confirmNotApplied: Bool = false) {
        guard let context else { return }
        if model.saveRecord(draft, context: context, confirmNotApplied: confirmNotApplied) { dismiss() }
        else { issue = model.message }
    }
}

private struct NativeModernRecordVersions: View {
    @ObservedObject var model: NativeApplicationsStore
    let job: [String: ApplicationValue]
    @Environment(\.dismiss) private var dismiss
    @State private var chosen: PhoneOpportunityRecord?
    @State private var choiceContext: PhoneRecordChoiceContext?
    @State private var confirm = false
    @State private var issue: String?
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Choose the details you want to keep. Other versions stay on this phone.")
                    Text("Choosing a version keeps your current applied mark. If you marked this role as not applied, an older version restores its notes and dates without marking it applied again. You can change the stage in your current record.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if let issue { Section { Text(issue).foregroundStyle(.red) } }
                ForEach(model.recordVersions(for: job)) { record in
                    Section {
                        NativeModernRecordSummary(record: record)
                        if let updated = ApplicationReviewPolicy.date(record.updatedAt) {
                            Text("Saved " + updated.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary)
                        }
                        Button("Use this version") {
                            chosen = record; choiceContext = model.recordChoiceContext(for: job); confirm = true
                        }.disabled(model.busy)
                    } header: { Text(record.archived ? "Earlier version" : "Current record") }
                }
            }.navigationTitle("Your record versions").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
                .confirmationDialog("Use this record version?", isPresented: $confirm, titleVisibility: .visible) {
                    Button("Use this version") {
                        guard let chosen, let choiceContext else { return }
                        if model.useRecordVersion(chosen.id, context: choiceContext) { dismiss() } else { issue = model.message }
                    }
                    Button("Keep current records", role: .cancel) {}
                } message: { Text("Your current applied mark stays unchanged, and other versions remain in your private history. This does not send or change an employer application.") }
        }.tint(.careerAccent)
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
                    Text(job.kind == "archived" ? "Earlier assessment: "+job.fit : job.fit).font(.caption.weight(.medium)).foregroundStyle(job.isExpired ? Color.primary : Color.careerAccent)
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
    @EnvironmentObject private var applications: NativeApplicationsStore
    @EnvironmentObject private var navigation: NativeCareerNavigation
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
                LabeledContent("Posted", value: store.workspace.profile.formattedDate(job.posted))
                LabeledContent("Closing date", value: job.closes.map { store.workspace.profile.formattedDate($0, includeTime: $0.count > 10) } ?? "Not published")
                LabeledContent("Salary", value: job.rank == nil ? "Not checked for this lead" : "Not disclosed in research")
                ForEach(store.workspace.profile.criteriaMessages(for: job), id: \.self) { message in
                    Label(message, systemImage: "questionmark.circle").font(.footnote)
                }
                if let mode = job.mode, mode != "Not stated" { LabeledContent("Work arrangement", value: mode) }
            }
            Section("Evidence and freshness") {
                if store.isCurrentResearch(job) {
                    LabeledContent("Research checked", value: store.workspace.profile.formattedDate(store.research.checkedAt))
                    Text("The fit assessment and requirement summary reflect that research date.").font(.footnote).foregroundStyle(.secondary)
                } else if job.kind == "archived" || job.researchCheckedAt != nil {
                    LabeledContent("Archived research", value: job.researchCheckedAt.map { store.workspace.profile.formattedDate($0) } ?? "Original date unavailable")
                    Text("Preserved with the earlier assessment from your records. Historical assessments are not personalized advice for your current profile. Recheck the employer and requirements.").font(.footnote).foregroundStyle(.secondary)
                }
                if let snapshot = store.workspace.live, snapshot.jobs.contains(where: { $0.id == job.id }) {
                    let employerObservation=store.employerObservation(job)
                    LabeledContent("Employer checked", value: store.workspace.profile.formattedDate(employerObservation.lastCheckedAt ?? snapshot.checkedAt, includeTime: true))
                    Text(store.isUnrefreshed(employerObservation) ? "Not refreshed in the latest attempt. This previous result is retained because its employer search was unavailable." : "This role appeared in that search. Recheck the official page for changes before applying.").font(.footnote).foregroundStyle(.secondary)
                } else if job.rank == nil {
                    Text("Saved employer lead. Its current availability is not established by the latest search. Recheck the official page before applying.").font(.footnote)
                }
            }
            Section(job.kind == "archived" ? "Preserved earlier assessment" : "Listing information to review") {
                Text(job.fit).font(.headline).foregroundStyle(Color.careerAccent)
                Text(job.summary)
                Text("This is not a verified personal fit score. Compare the employer requirements with your own evidence.")
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
                if applications.containsOpportunity(url: job.url) {
                    Label("Saved in your application workspace", systemImage: "checkmark.circle")
                    Button("Open application workspace") { navigation.selectedTab = 2 }
                } else if MobileApplicationPolicy.jobURL(job.url) != nil {
                    Button("Copy to application workspace") {
                        Task { _ = await applications.addJob(url: job.url, title: job.title, company: job.company,
                                                            location: job.location, country: job.isSaudi ? "SA" : "") }
                    }.disabled(applications.busy).accessibilityIdentifier("legacy.copyToApplications")
                    Text("Copies this public job link and role details. Your original notes and status stay here. Saving does not apply.")
                        .font(.footnote).foregroundStyle(.secondary)
                    if let message = applications.message { Text(message).font(.footnote) }
                }
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
                Text("Optional, self-entered tracking details. Leave the date blank if unknown. The latest allowed date uses the Riyadh day; your display time zone does not shift recorded dates. Saving does not change status or contact anyone.").font(.footnote)
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
    ("evidence", "Prepare three achievement stories", "Describe your own actions and outcomes. Use accurate, shareable results and avoid confidential information."),
    ("cv", "Prepare your CV materials", "For each application, tailor a version using your own experience and qualifications."),
    ("priority", "Review selected role requirements", "Before each application, check that role's experience and other requirements."),
    ("deadline", "Check selected deadlines", "Before each application, check that role's deadline and current vacancy status directly with the employer."),
    ("review", "Review each application yourself", "Verify every field, attachment and claim. Preparation alone does not send an application; Auto Apply requires your explicit approval.")
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
                            if prompt.kind=="deadline" {Text("Listed deadline: "+store.workspace.profile.formattedDate(prompt.job.closes ?? "",includeTime:(prompt.job.closes?.count ?? 0)>10)).font(.caption)}
                            if prompt.kind=="applied-date" {Text("Optional record detail; an unknown date is allowed.").font(.caption)}
                            Text("Research checked: \(prompt.job.researchCheckedAt ?? "Not researched") · Employer checked: \(prompt.job.lastCheckedAt ?? "Not recorded")").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            } header:{Text("Needs attention")} footer:{Text("Prompts from your saved records. Past checks do not establish current availability. Recheck employer information; these are not eligibility decisions or automatic applications.")}
            Section {
                ForEach(nativePlanItems, id: \.id) { item in
                    Toggle(isOn: Binding(get: { store.workspace.completed.contains(item.id) }, set: { store.setChecklist(item.id, done: $0) })) {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(item.title).font(.subheadline.weight(.semibold))
                            Text(item.detail).font(.caption).foregroundStyle(.secondary)
                        }.padding(.vertical, 4)
                    }
                }
            } header: { Text("Your preparation checklist") } footer: {
                Text("Checked items record your preparation on this device. Recheck the requirements, dates and materials for each application.")
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
    @EnvironmentObject private var applications: NativeApplicationsStore
    @State private var editing = false
    @State private var applicationEditing = false
    var body: some View {
        List {
            Section {
                NativeIntro(eyebrow: "YOUR PROFILE", title: "Start with what is true.", message: "Your experience gives every application its foundation.")
            }.listRowBackground(Color.clear)
            Section("Application profile") {
                Button { applicationEditing = true } label: {
                    Label(applications.profileReadiness.nextAction, systemImage: "person.crop.rectangle")
                }.accessibilityIdentifier("profile.applicationProfile")
                NativeProfileEssentials(profile: applications.profile)
                Text("These are the details you can review for employer applications. New profiles start blank. Saving a profile never submits an application.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section {
              DisclosureGroup("Local planning notes and preferences") {
                LabeledContent("Relevant years", value: store.workspace.profile.years.isEmpty ? "Not provided" : store.workspace.profile.years)
                if !store.workspace.profile.degree.isEmpty { Text(store.workspace.profile.degree).font(.subheadline) }
                Button("Edit planning notes and preferences") { editing = true }
                Text(store.workspace.profile.criteriaSummary).font(.footnote).foregroundStyle(.secondary)
              }
            } footer: { Text("These separate planning notes stay on this device. They do not replace your application profile or go to employers.") }
            Section {
                NavigationLink { NativeSalaryScreen() } label: { Label("Salary & negotiation", systemImage: "chart.bar.doc.horizontal") }
                NavigationLink { NativePrivacyScreen() } label: { Label("Privacy & support", systemImage: "hand.raised") }
            }
        }.nativeList().navigationTitle("Your profile")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $editing) { NativeProfileEditor(profile: store.workspace.profile) }
            .sheet(isPresented: $applicationEditing) { NativeApplicationProfileEditor(model: applications) }
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
    @EnvironmentObject private var applications: NativeApplicationsStore
    var body: some View {
        List {
            Section("Information on this phone") {
                Text("Planning notes, earlier self-entered tracking records and preparation steps stay on this device. Search keeps your board choices, search fields and public results locally. Saved shows both your application opportunities and any earlier local records.")
                Text("Your application workspace keeps a phone draft and your selected PDF. The same application profile is reachable from Start, Profile and Apply. Connecting does not upload that draft. Saving to a connected service sends the applicant fields and selected CV; adding opportunities and preparing reviews sends the links and choices you provide. The phone connection token is stored in Keychain.")
                Text("A LinkedIn profile link is optional. It is saved with your application profile and appears in the details you review before sharing with an employer. Saving a link does not connect or verify a LinkedIn account, import its content or grant account access.")
                Text("Application stages, dates, follow-ups and private notes in Saved stay on this phone. They are your own records and are separate from provider receipts. Connecting alone does not move a separate phone record into an account. Choose Keep with connected workspace, or explicitly sync its job, to associate it with that workspace. Other account workspaces do not inherit it.")
            }
            Section("Connected application workspace") {
                if MobileApplicationPolicy.isHostedService(applications.serviceAddress) {
                    Text("The hosted service uses ChatGPT sign-in in your browser to create or recover your workspace. It stores the linked account identifier, saved applicant profile and CV, opportunities, review choices, attempts and provider receipts. A one-time code connects this phone to that workspace.")
                    NativeApplicationServiceLinks(address: applications.connectionSetupAddress)
                } else {
                    Text("Your configured application service stores the applicant details, CV, opportunities, review choices and submission history you send to it. Its operator controls account access, retention, recovery and deletion. Consult that operator's privacy and support information.")
                    Text(applications.serviceAddress).font(.footnote).textSelection(.enabled)
                }
                Text("Approving an eligible application permits the service to send the reviewed fields and PDF to that employer's application provider. Provider acceptance is recorded only when the provider returns a valid receipt. Employer copies remain subject to the employer's own privacy policy.")
            }
            Section("Employer searches and links") {
                Text("Search uses the public Career Finder discovery service to retrieve postings from your selected Greenhouse and Lever employer boards. It receives the role words, location text and board choices you enter, along with normal connection information. No application token, account cookie, email, applicant profile or CV is sent. Public board metadata is cached by the service; search words are not forwarded to employers but may appear in ordinary hosting request logs.")
                Text("Opening an employer, LinkedIn or salary-source link takes you to an external website governed by its own privacy policy. Any application or account you create there is managed by that provider.")
                Text("Search LinkedIn opens its public job search with only the keyword and location text you entered. No application profile, CV or Career Finder connection token is included in that link. Applications completed on LinkedIn remain manual records in Career Finder unless a supported employer provider independently returns a receipt.")
            }
            Section("Sharing and beta feedback") {
                Text("Exported notes include your entered professional details and tracked roles, and exclude country/city/role, planning and display preferences. They leave the app only when you choose a destination in the system share sheet. Review the content before sharing.")
                Text("The app has no advertising, tracking SDKs or developer analytics service. Apple may process TestFlight testing, crash and feedback information under its own privacy practices.")
                Link("Apple privacy policy", destination: URL(string: "https://www.apple.com/legal/privacy/")!)
            }
            Section("Retention and removal") {
                Text("You can edit or clear profile fields, remove saved roles and reset individual tracking statuses in the app. Saved or tracked job details may remain locally after a job disappears from a search.")
                Text("Disconnect this phone to revoke its application-service connection. Disconnecting, deleting or offloading the app does not delete the hosted workspace. Use Manage account and delete hosted data for the hosted service, or contact your custom service operator. Deleting hosted data does not remove copies already received by employers or saved in exports.")
                Text("Phone drafts remain available after disconnection or hosted account deletion. Device backups and shared exports are separate copies that you manage through their own settings and destinations.")
            }
            Section("Support and feedback") {
                Text("During beta testing, open this app in TestFlight and choose Send Beta Feedback to contact the developer. Include the screen and steps that caused the problem. Review screenshots and diagnostics before sending.")
                Text("Policy updated 16 November 2026. The connected service's published policy describes its hosted data practices.").font(.footnote).foregroundStyle(.secondary)
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
    private func countryName(_ code: String) -> String { Locale.current.localizedString(forRegionCode: code) ?? code }
    private var displayZones: [String] { Array(Set(TimeZone.knownTimeZoneIdentifiers + ["UTC", "Asia/Riyadh", TimeZone.current.identifier, draft.effectiveTimeZone])).sorted() }
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
                    Picker("Country or region", selection: Binding(get: { draft.effectiveCountry }, set: { draft.targetCountry = $0 })) {
                        Text("Any country or region").tag("")
                        ForEach(NativeProfile.countryCodes.sorted { countryName($0) < countryName($1) }, id: \.self) { code in Text(countryName(code)+" ("+code+")").tag(code) }
                    }
                    TextField("City text, if relevant", text: Binding(get: { draft.effectiveCity }, set: { draft.targetCity = $0 })).focused($focused)
                        .accessibilityLabel("Preferred city text, optional")
                    Text("Matches returned location text only. Confirm the worksite and spelling with the employer.").font(.caption).foregroundStyle(.secondary)
                    TextField("Role keywords", text: Binding(get: { draft.roleKeywords ?? "" }, set: { draft.roleKeywords = $0 })).focused($focused)
                        .accessibilityLabel("Role keywords, optional")
                    Text("Every space-separated word must occur in a returned role title or subtitle. This does not establish eligibility.").font(.caption).foregroundStyle(.secondary)
                } header: { Text("Country, city and role preferences") } footer: {
                    Text("Preferences for your planning notes and earlier records. The Search tab uses its own explicit role, location and employer-board choices. These notes do not affect saved application records.")
                }
                Section {
                    Picker("Planning currency", selection: Binding(get: { draft.effectiveCurrency }, set: { draft.planningCurrency = $0 })) {
                        Text("Choose a currency").tag("")
                        ForEach(NativeProfile.currencyCodes, id: \.self) { Text($0).tag($0) }
                    }
                    Picker("Planning amount period", selection: Binding(get: { draft.effectivePayPeriod }, set: { draft.planningPayPeriod = $0 })) {
                        Text("Monthly fixed amounts").tag("monthly")
                        Text("Annual fixed amounts").tag("annual")
                    }
                    Text("Only a default for your local offer calculator. Existing SAR criteria and source evidence stay SAR; no conversion is performed.").font(.caption).foregroundStyle(.secondary)
                    Picker("Display time zone", selection: Binding(get: { draft.displayTimeZone ?? "Asia/Riyadh" }, set: { draft.displayTimeZone = $0 })) {
                        Text("Device time zone ("+TimeZone.current.identifier+")").tag("")
                        ForEach(displayZones, id: \.self) { Text($0).tag($0) }
                    }
                } header: { Text("Planning and display") } footer: {
                    Text("Display zone applies to timestamps with an explicit offset. Source date-only deadlines keep their published date. Existing application-date validation still uses the Riyadh day; dates are never shifted.")
                }
                if draft.minimumMonthlySAR != nil || draft.unknownSalary != nil {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Minimum monthly pay, SAR").font(.caption).foregroundStyle(.secondary)
                        TextField("Blank means no minimum", text: Binding(get: { draft.minimumMonthlySAR ?? "" }, set: { draft.minimumMonthlySAR = $0 }))
                            .keyboardType(.numberPad).focused($focused).accessibilityLabel("Minimum monthly pay in SAR")
                    }
                    if draft.hasPayFloor {
                        Picker("Unverified salaries", selection: Binding(get: { draft.unknownSalary ?? "show" }, set: { draft.unknownSalary = $0 })) {
                            Text("Show for review").tag("show")
                            Text("Hide unverified earlier leads").tag("hide")
                        }
                    }
                    if let error = draft.criteriaError { Label(error, systemImage: "exclamationmark.circle").font(.caption) }
                } header: { Text("Earlier salary criteria · monthly SAR") } footer: {
                    Text("This filter stays monthly SAR regardless of planning currency. Use whole SAR; blank or zero means no minimum. Confirm basic salary versus fixed package. This retained preference does not filter the new public board search. It stays on this device and is excluded from discovery requests and application notes.")
                }
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
                        draft.preferencesVersion = "2"
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
    @EnvironmentObject private var store: NativeCareerStore
    @State private var currency = ""
    @State private var period = "monthly"
    @State private var initialized = false
    @State private var basic = ""
    @State private var allowances = ""
    @State private var bonus = ""
    @FocusState private var focused: Bool
    private var basicAmount: Double? { NativeMoney.parse(basic, limit: 1_000_000) }
    private var allowanceAmount: Double? { NativeMoney.parse(allowances, limit: 1_000_000) }
    private var bonusAmount: Double? { NativeMoney.parse(bonus, limit: 10_000_000) }
    private func amount(_ value: Double) -> String { currency + " " + value.formatted(.number.precision(.fractionLength(0...2))) }
    private func clearAmounts() { basic = ""; allowances = ""; bonus = "" }
    var body: some View {
        Form {
            Section {
                NativeNotice(title: "Compare an offer in your own terms.", message: "Choose the currency and pay period, then enter your own amounts. The calculator makes no assumptions about your profession, location, current pay or seniority.")
            }.listRowBackground(Color.clear)
            Section {
                Picker("Currency", selection: $currency) {
                    Text("Choose a currency").tag("")
                    ForEach(NativeProfile.currencyCodes, id: \.self) { Text($0).tag($0) }
                }
                Picker("Fixed amount period", selection: $period) {
                    Text("Monthly").tag("monthly")
                    Text("Annual").tag("annual")
                }
                Text("Changing currency or period clears the calculator; amounts are never silently relabeled. No exchange rates, taxes or deductions are applied.").font(.footnote)
                TextField("Basic pay for chosen period", text: $basic).keyboardType(.decimalPad).focused($focused)
                    .accessibilityLabel("Basic pay for chosen period, "+(currency.isEmpty ? "currency not selected" : currency))
                if basicAmount == nil { Label("Use 0 to 1,000,000 with at most two decimal places.", systemImage: "exclamationmark.circle").font(.caption) }
                TextField("Fixed allowances for chosen period", text: $allowances).keyboardType(.decimalPad).focused($focused)
                    .accessibilityLabel("Fixed allowances for chosen period, "+(currency.isEmpty ? "currency not selected" : currency))
                if allowanceAmount == nil { Label("Use 0 to 1,000,000 with at most two decimal places.", systemImage: "exclamationmark.circle").font(.caption) }
                TextField("Target annual bonus, not guaranteed", text: $bonus).keyboardType(.decimalPad).focused($focused)
                    .accessibilityLabel("Target annual bonus, not guaranteed, "+(currency.isEmpty ? "currency not selected" : currency))
                if bonusAmount == nil { Label("Use 0 to 10,000,000 with at most two decimal places.", systemImage: "exclamationmark.circle").font(.caption) }
                if !currency.isEmpty, let basicAmount, let allowanceAmount, let bonusAmount {
                    let fixedCents = Int((basicAmount * 100).rounded()) + Int((allowanceAmount * 100).rounded())
                    let annualCents = fixedCents * (period == "monthly" ? 12 : 1)
                    LabeledContent(period == "annual" ? "Monthly equivalent (annual ÷ 12)" : "Fixed monthly", value: amount(Double(annualCents) / 1200))
                    LabeledContent("Fixed annual", value: amount(Double(annualCents) / 100))
                    LabeledContent("Including target annual bonus", value: amount(Double(annualCents + Int((bonusAmount * 100).rounded())) / 100))
                } else {
                    Text("Choose a currency and correct any invalid amount before calculating.").font(.footnote)
                }
            } header: { Text("Compare your entered package") } footer: {
                Text("Arithmetic from your entries only. These temporary amounts are not saved. Target bonus is not guaranteed. Blank fields count as zero. Use a comma for thousands and a dot for decimals; Arabic digits and separators are accepted. Input with more than two decimal places is rejected. Monthly equivalents are displayed to two decimal places.")
            }
            Section("The conversation to have") {
                Text("Ask for the budgeted pay range, its currency and payment frequency.")
                Text("Clarify the responsibilities, working hours, decision-making scope and expectations for this role.")
                Text("Get basic pay, allowances, bonus terms, medical coverage, leave and relocation support in writing.")
                Text("Use verified achievements when negotiating. Compare commute, hours, probation and progression before committing.")
            }
            Section {
                DisclosureGroup("Historical Saudi salary examples · 2025") {
                    Text("Optional reference for selected Saudi roles. These dated examples are not a salary estimate for your profession, country or experience. The amounts keep their original monthly SAR units regardless of the calculator settings.")
                        .font(.footnote).foregroundStyle(.secondary)
                    LabeledContent("Supply Chain Manager", value: "SAR 30,000–45,000")
                    LabeledContent("Procurement Manager", value: "SAR 30,000–50,000")
                    Text("Hays 2025: total fixed monthly package, including fixed allowances, using Q4 2024 data for the broad Saudi market. These are not basic-salary ranges.")
                        .font(.footnote).foregroundStyle(.secondary)
                    Link("Hays 2025 guide · page 38", destination: URL(string: "https://www.hays.ae/documents/d/hays-salary-guide-ae/hays-saudi-arabia-salary-guide-2025")!)
                    Text("The Professionals 2025 reports Supply & Demand Manager at SAR 30,220 / 42,866 / 53,710 monthly for the 25th percentile / median / 75th percentile (p.49), including basic salary, housing and transportation (p.15). Different role definitions and samples are not interchangeable.")
                        .font(.footnote).foregroundStyle(.secondary)
                    Link("The Professionals 2025 guide", destination: URL(string: "https://theprofessionals.sa/wp-content/uploads/2026/02/Salary-Guide-2025-The-Professionals.pdf")!)
                }
            }
        }
        .onAppear { if !initialized { currency = store.workspace.profile.effectiveCurrency; period = store.workspace.profile.effectivePayPeriod; initialized = true } }
        .onChange(of: currency) { _ in clearAmounts() }
        .onChange(of: period) { _ in clearAmounts() }
        .navigationTitle("Salary & negotiation").navigationBarTitleDisplayMode(.inline)
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

private func nativeHTTPS(_ value: String) -> URL? {
    guard let url = URL(string: value), url.scheme?.lowercased() == "https", url.host != nil else { return nil }
    return url
}
#endif
