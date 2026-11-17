#if os(iOS)
import SwiftUI
import UIKit
import UniformTypeIdentifiers

enum NativeAppearance: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var title: String { switch self { case .system: "System"; case .light: "Light"; case .dark: "Dark" } }
    var symbol: String { switch self { case .system: "circle.lefthalf.filled"; case .light: "sun.max"; case .dark: "moon" } }
    var colorScheme: ColorScheme? { switch self { case .system: nil; case .light: .light; case .dark: .dark } }
    @MainActor static var storageKey: String {
        #if DEBUG
        if CareerAppEnvironment.isUIAcceptance {
            return "career.display.appearance.acceptance." + (ProcessInfo.processInfo.environment["CAREER_UI_TEST_ID"] ?? "fixture")
        }
        #endif
        return "career.display.appearance"
    }
}

enum NativeDesign {
    private static func adaptive(light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            let hex = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((hex >> 16) & 0xff) / 255,
                           green: CGFloat((hex >> 8) & 0xff) / 255,
                           blue: CGFloat(hex & 0xff) / 255, alpha: 1)
        })
    }
    static let accent = adaptive(light: 0x5B50CE, dark: 0xB6B0FF)
    static let actionFill = Color(red: 91 / 255.0, green: 80 / 255.0, blue: 206 / 255.0)
    static let canvas = adaptive(light: 0xF4F5FA, dark: 0x10121B)
    static let surface = adaptive(light: 0xFFFFFF, dark: 0x1B1E2B)
    static let accentSurface = adaptive(light: 0xECEAFF, dark: 0x29253F)
}

@MainActor
final class NativeCareerNavigation: ObservableObject {
    @Published var selectedTab = 0
    @Published var settingsNavigationID = UUID()
    func openSettings() {
        settingsNavigationID = UUID()
        selectedTab = 4
    }
}

@MainActor
struct NativeCareerRoot: View {
    private var l10n: NativeCopy { NativeCopy(locale: (NativeLanguage(rawValue: language) ?? .system).locale) }
    @EnvironmentObject private var store: NativeCareerStore
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var applications = CareerAppEnvironment.makeApplicationsStore()
    @StateObject private var discovery = CareerAppEnvironment.makeDiscoveryStore()
    @StateObject private var navigation = NativeCareerNavigation()
    @AppStorage(NativeAppearance.storageKey) private var appearance = NativeAppearance.system.rawValue
    @AppStorage(NativeLanguage.storageKey) private var language = NativeLanguage.system.rawValue
    private var savedCount: Int {
        Set(store.savedJobs.map { MobileApplicationPolicy.jobIdentity($0.url) }
            + applications.savedOpportunities.compactMap { $0["url"]?.string }.map(MobileApplicationPolicy.jobIdentity)).count
    }

    var body: some View {
        TabView(selection: $navigation.selectedTab) {
            NavigationStack { NativeShortlistScreen().settingsShortcut() }
                .tabItem { Label(l10n("Start"), systemImage: "square.stack") }.tag(0)
            NavigationStack { NativeDiscoveryScreen().settingsShortcut() }
                .tabItem { Label(l10n("Search"), systemImage: "magnifyingglass") }.tag(1)
            NavigationStack { NativeApplicationsScreen().settingsShortcut() }
                .tabItem { Label(l10n("Apply"), systemImage: "paperplane") }.tag(2)
            NavigationStack { NativeSavedScreen().settingsShortcut() }
                .tabItem { Label(l10n("Saved"), systemImage: "heart") }.tag(3)
                .badge(savedCount)
            NavigationStack { NativeSettingsScreen() }
                .id(navigation.settingsNavigationID)
                .tabItem { Label(l10n("Settings"), systemImage: "gearshape") }.tag(4)
        }
        .environmentObject(store)
        .environmentObject(applications)
        .environmentObject(discovery)
        .environmentObject(navigation)
        .tint(.careerAccent)
        .preferredColorScheme(NativeAppearance(rawValue: appearance)?.colorScheme)
        .environment(\.locale, (NativeLanguage(rawValue: language) ?? .system).locale)
        .environment(\.layoutDirection, (NativeLanguage(rawValue: language) ?? .system).direction)
        .environment(\.calendar, Calendar(identifier: .gregorian))
        .onAppear { discovery.attach(to: applications.workspaceScope) }
        .onChange(of: applications.workspaceScope) { discovery.attach(to: $0) }
        .onChange(of: scenePhase) { phase in if phase != .active { discovery.saveDraft() } }
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
            UIAccessibility.post(notification: .announcement, argument: l10n.message(error))
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if CareerAppEnvironment.isUIAcceptance {
                // Test-only provenance must not obscure or resize the production accessibility layout.
                Text(l10n("Offline UI acceptance · synthetic data")).font(.system(size: 11, weight: .medium))
                    .lineLimit(1).padding(4).frame(maxWidth: .infinity)
                    .background(Color.yellow.opacity(0.2)).accessibilityIdentifier("acceptance.offline")
            }
            if let error = store.storageError {
                Label(l10n.message(error), systemImage: "exclamationmark.triangle")
                    .font(.footnote).padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.orange.opacity(0.14))
                    .accessibilityLabel(l10n.format("Storage problem. {0}", [l10n.message(error)]))
            }
        }
    }
}

private enum NativeStartSheet: String, Identifiable {
    case profile, opportunity
    var id: String { rawValue }
}

private struct NativeShortlistScreen: View {
    @NativeLocalization private var l10n
    @EnvironmentObject private var store: NativeCareerStore
    @EnvironmentObject private var applications: NativeApplicationsStore
    @EnvironmentObject private var navigation: NativeCareerNavigation
    @State private var sheet: NativeStartSheet?

    var body: some View {
        List {
            Section {
                NativeIntro(eyebrow: "YOUR CAREER WORKSPACE", title: "Find work that fits your life.",
                            message: "Explore employer boards, keep the roles you like and prepare your applications.")
            }.listRowBackground(Color.clear).listRowSeparator(.hidden)
            Section(l10n("Start with an opportunity")) {
                Button { navigation.selectedTab = 1 } label: {
                    Label(l10n("Find opportunities"), systemImage: "magnifyingglass")
                }.accessibilityIdentifier("home.discover")
                Button { sheet = .opportunity } label: {
                    Label(l10n(applications.opportunityDraft.hasContent ? "Continue your saved job draft" : "Add a job link"), systemImage: "link")
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(Rectangle())
                }.buttonStyle(.plain).foregroundStyle(Color.careerAccent).accessibilityIdentifier("home.addOpportunity")
                Text(l10n("Browse public employer boards without an account, or save a public job link from any country or profession."))
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section(l10n("Make your next step easier")) {
                Button {
                    sheet = .profile
                    #if DEBUG
                    if CareerAppEnvironment.isUIAcceptance { print("UI acceptance: Start requested application profile") }
                    #endif
                } label: {
                    Label(l10n(applications.profileReadiness.nextAction), systemImage: "person.crop.rectangle")
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(Rectangle())
                }.buttonStyle(.plain).foregroundStyle(Color.careerAccent).accessibilityIdentifier("home.applicationProfile")
                NativeProfileEssentials(profile: applications.profile)
                Button { navigation.selectedTab = 3 } label: {
                    Label(l10n("Open saved opportunities"), systemImage: "heart")
                }
                Button { navigation.selectedTab = 2 } label: {
                    Label(l10n(applications.availableReviews.isEmpty ? "Open your application workspace" : "Continue application review"), systemImage: "paperplane")
                }
                NavigationLink(l10n("Application preparation checklist")) { NativePlanScreen() }
            }
            Section(l10n("You stay in control")) {
                Text(l10n("Your new profile starts blank. Add your own details and CV when you are ready. An account is needed only for the connected application service."))
                Text(l10n("Live automatic submissions are currently disabled on the hosted preview. Use employer links to apply manually. A custom service requires an activated employer integration and your approval of the reviewed application. Only a provider receipt confirms a submission."))
                Text(l10n("Existing notes, saved roles and application history stay available. A search result or a saved link is not an application."))
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .nativeList()
        .navigationTitle(l10n("Career Finder"))
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
    @NativeLocalization private var l10n
    @EnvironmentObject private var store: NativeCareerStore
    @State private var editing = false
    var body: some View {
        Section {
            Text(l10n.criteriaSummary(store.workspace.profile)).font(.subheadline)
            Button(l10n("Edit criteria")) { editing = true }
        } header: { Text(l10n("Local planning preferences")) } footer: {
            Text(l10n("These preferences stay on this device for your planning notes and earlier records. Search uses the role, location and board choices you enter on the Search tab. Salary and pay basis still need confirmation."))
        }
        .sheet(isPresented: $editing) { NativeProfileEditor(profile: store.workspace.profile) }
    }
}

private enum NativeSavedFilter: String, CaseIterable, Identifiable {
    case all = "All", applied = "Applied", followUps = "Follow-ups"
    var id: String { rawValue }
}

private struct NativeSavedScreen: View {
    @NativeLocalization private var l10n
    @EnvironmentObject private var store: NativeCareerStore
    @EnvironmentObject private var applications: NativeApplicationsStore
    @EnvironmentObject private var navigation: NativeCareerNavigation
    @State private var query = ""
    @State private var adding = false
    @State private var filter = NativeSavedFilter.all
    private var jobs: [CareerJob] {
        let requested = NativeSavedSearch.terms(query)
        return store.savedJobs.filter { nativeMatches($0, terms: requested, note: store.applicationRecords[$0.id]?.receiptNote ?? "") && filter != .followUps
            && (filter != .applied || ["Applied", "Interviewing", "Offer received"].contains(store.status(for: $0))) }
    }
    private var applicationJobs: [NativeApplicationRow] {
        let requested = NativeSavedSearch.terms(query)
        return applications.savedOpportunities.compactMap { NativeApplicationRow($0) }.filter { row in
            // Use the same scoped records already available from this row's detail view.
            let notes = applications.recordVersions(for: row.value).filter { !$0.archived }.map(\.note)
            let metadata = ["title", "company", "location"].compactMap { row.value[$0]?.string }
            return NativeSavedSearch.matches(metadata + notes, terms: requested)
                && (filter != .applied || applications.isMarkedApplied(row.value))
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
                Picker(l10n("Show"), selection: $filter) { ForEach(NativeSavedFilter.allCases) { Text(l10n($0.rawValue)).tag($0) } }
                    .pickerStyle(.menu).accessibilityIdentifier("saved.filter")
                if filter == .followUps { Text(l10n("Dates you set on this phone, with overdue follow-ups first. No message or notification is sent.")).font(.footnote).foregroundStyle(.secondary) }
            }
            if applications.savedOpportunities.isEmpty && store.savedJobs.isEmpty {
                Section {
                    NativeEmpty(title: "Make a shortlist of your own.", message: "Save a role from Search or add a job link. Saving keeps it for review; it does not apply.", icon: "heart")
                    Button(l10n("Find opportunities")) { navigation.selectedTab = 1 }
                    Button(l10n("Add a job link")) { adding = true }
                }
            } else if applicationJobs.isEmpty && jobs.isEmpty {
                Section {
                    NativeEmpty(title: filter == .followUps ? "No follow-ups to show." : "No saved roles match this view.", message: filter == .followUps ? "Open an opportunity and add a follow-up date to Your record." : "Your opportunities are still here. Try another term or show all records.", icon: filter == .followUps ? "calendar" : "magnifyingglass")
                    Button(l10n("Show all opportunities")) { query = ""; filter = .all }
                }
            }
            if !applicationJobs.isEmpty {
                Section(l10n.format("Application opportunities · {0}", [String(describing: applicationJobs.count)])) {
                    ForEach(applicationJobs) { row in
                        NavigationLink { NativeSavedApplicationDetail(id: row.id) } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(row.value["title"]?.string ?? l10n("Opportunity")).font(.headline).fixedSize(horizontal: false, vertical: true)
                                Text(row.value["company"]?.string ?? "").font(.subheadline).foregroundStyle(.secondary)
                                if let location = row.value["location"]?.string, !location.isEmpty {
                                    Text(location).font(.caption).foregroundStyle(.secondary)
                                }
                                Label(l10n(row.value["recordOnly"]?.bool == true ? "Your application record" : row.value["localOnly"]?.bool == true ? "Saved on this phone" : "Saved with application service"), systemImage: "bookmark")
                                    .font(.caption).foregroundStyle(.secondary)
                                if applications.recordVersions(for: row.value).filter({ !$0.archived }).count > 1 {
                                    Label(l10n("Compare your private records"), systemImage: "doc.on.doc").font(.caption)
                                } else if let record = applications.currentRecord(for: row.value) {
                                    Text(l10n.format("You marked: {0}", [l10n(record.stage.title)])).font(.caption).foregroundStyle(.secondary)
                                }
                                if let day = applications.followUpDay(for: row.value) {
                                    Text(l10n.format(day < PhoneRecordDay.string(Date()) ? "Overdue follow-up · {0}" : day == PhoneRecordDay.string(Date()) ? "Follow up today · {0}" : "Follow up · {0}", [l10n.civilDate(day)]))
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
                } header: { Text(l10n.format("Earlier planning records · {0}", [String(describing: jobs.count)])) } footer: {
                    Text(l10n("These original records stay on this device. Open a role to copy its public details into the application workspace; your notes and status are preserved."))
                }
            }
        }.nativeList().navigationTitle(l10n("Saved opportunities"))
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, prompt: Text(l10n("Search saved opportunities")))
            .toolbar { ToolbarItem(placement: .navigationBarTrailing) {
                Button { adding = true } label: { Label(l10n("Add opportunity"), systemImage: "plus") }.accessibilityIdentifier("saved.addOpportunity")
            } }
            .sheet(isPresented: $adding) { NativeOpportunityEditor(model: applications) }
            .onChange(of: applications.workspaceScope) { _ in query = ""; filter = .all }
    }
}

struct NativeSavedApplicationDetail: View {
    @NativeLocalization private var l10n
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
                    Text(job["title"]?.string ?? l10n("Opportunity")).font(.title2.weight(.bold)).fixedSize(horizontal: false, vertical: true)
                    Text(job["company"]?.string ?? "").font(.headline)
                    if let location = job["location"]?.string, !location.isEmpty { Label(location, systemImage: "mappin") }
                }
                Section {
                    if let url = job["url"]?.string.flatMap(MobileApplicationPolicy.jobURL) {
                        Link(destination: url) { Label(l10n("Open employer posting"), systemImage: "arrow.up.right.square") }
                        ShareLink(item: url) { Label(l10n("Share job link"), systemImage: "square.and.arrow.up") }
                    }
                    Button(l10n("Open application workspace")) { navigation.selectedTab = 2 }
                } footer: {
                    Text(l10n("Review the employer's current requirements. Auto Apply eligibility is checked in the application workspace; opening or sharing this link never counts as a submission."))
                }
                Section {
                    if applications.recordVersions(for: job).filter({ !$0.archived }).count > 1 {
                        Text(l10n("Two private records are kept for this opportunity. Compare them and choose the one to use. Neither version has been deleted."))
                        Button(l10n("Compare records")) { reviewingVersions = true }
                    } else {
                        if let record = applications.currentRecord(for: job) { NativeModernRecordSummary(record: record) }
                        else { Text(l10n("Keep track of applications you complete on an employer website or LinkedIn.")).font(.subheadline).foregroundStyle(.secondary) }
                        Button(l10n(applications.currentRecord(for: job) == nil ? "Add your application record" : "Edit your application record")) { editingRecord = true }
                            .disabled(applications.busy).accessibilityIdentifier("record.edit")
                    }
                    if applications.recordVersions(for: job).contains(where: \.archived) {
                        Button(l10n("Earlier record versions")) { reviewingVersions = true }
                    }
                    if let context = applications.recordAdoptionContext(for: job) {
                        Button(l10n("Keep with connected workspace")) { adoption = context; confirmingAdoption = true }
                            .accessibilityIdentifier("record.keepWithWorkspace")
                        Text(l10n("This record is separate from your connected workspace. You can associate it without saving its job link again."))
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                } header: { Text(l10n("Your record · on this phone")) } footer: {
                    Text(l10n("Your stage, dates and notes are private. Marking Applied helps avoid duplicate applications; it does not create a provider receipt or contact an employer."))
                }
                if let currentID = job["id"]?.string, job["localOnly"]?.bool == true {
                    Section {
                        Button(l10n("Remove saved link"), role: .destructive) {
                            if let context = applications.removalContext(currentID) { removing = context }
                            else { applications.message = "Finish or stop this opportunity's application review before removing the saved link." }
                        }.disabled(applications.busy).accessibilityIdentifier("saved.removeLink")
                    }
                }
                if let message = applications.message { Section { Text(l10n(message)).font(.footnote).foregroundStyle(.secondary) } }
            } else { NativeEmpty(title: "This opportunity is no longer available here.", message: "Return to Saved to see your current opportunities.", icon: "bookmark") }
        }.nativeList().navigationTitle(l10n("Saved opportunity")).navigationBarTitleDisplayMode(.inline)
            .onAppear { if let url = job?["url"]?.string { rememberedIdentity = MobileApplicationPolicy.jobIdentity(url) } }
            .sheet(isPresented: $editingRecord) { if let job { NativeModernRecordEditor(model: applications, job: job) } }
            .sheet(isPresented: $reviewingVersions) { if let job { NativeModernRecordVersions(model: applications, job: job) } }
            .sheet(item: $removing) { NativeSavedLinkRemoval(model: applications, context: $0) }
            // An alert keeps both decisions visible; popover-style confirmation
            // dialogs can omit their cancel action on a phone.
            .alert(l10n("Keep this record with your connected workspace?"), isPresented: $confirmingAdoption) {
                Button(l10n("Keep with this workspace")) { if let adoption { _ = applications.adoptUnpairedRecord(adoption) } }
                Button(l10n("Keep separate on this phone"), role: .cancel) { adoption = nil }
            } message: {
                Text(l10n("The record will belong to the workspace currently connected on this phone. Notes and earlier versions stay private, and any other version is kept for comparison. This does not restore a removed bookmark, upload notes, or contact an employer."))
            }
    }
}

private struct NativeModernRecordSummary: View {
    @NativeLocalization private var l10n
    let record: PhoneOpportunityRecord
    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(l10n.format("You marked: {0}", [l10n(record.stage.title)])).font(.headline).accessibilityIdentifier("record.stageSummary")
            if record.appliedElsewhere { Label(l10n("You reported an application"), systemImage: "person.crop.circle.badge.checkmark").font(.subheadline) }
            if !record.appliedOn.isEmpty { Text(l10n.format("Application date · {0}", [l10n.civilDate(record.appliedOn)])).font(.subheadline) }
            if !record.followUpOn.isEmpty { Text(l10n.format("Follow-up date · {0}", [l10n.civilDate(record.followUpOn)])).font(.subheadline) }
            if !record.note.isEmpty { Text(record.note).font(.subheadline).textSelection(.enabled).fixedSize(horizontal: false, vertical: true) }
            Text(l10n("On this phone")).font(.caption).foregroundStyle(.secondary)
        }.accessibilityElement(children: .contain)
    }
}

private struct NativeModernRecordEditor: View {
    @NativeLocalization private var l10n
    @ObservedObject var model: NativeApplicationsStore
    let job: [String: ApplicationValue]
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var draft: PhoneRecordDraft
    @State private var original: PhoneRecordDraft
    @State private var context: PhoneRecordEditContext?
    @State private var baseWasApplied: Bool
    @State private var issue: String?
    @State private var discard = false
    @State private var clearApplied = false
    @State private var closingIntentionally = false
    @FocusState private var noteFocused: Bool
    init(model: NativeApplicationsStore, job: [String: ApplicationValue]) {
        self.model = model; self.job = job
        let record = model.currentRecord(for: job), original = PhoneRecordDraft(record), context = model.recordEditContext(for: job)
        let draft = context.flatMap { model.restoredRecordDraft(for: $0) } ?? original
        _draft = State(initialValue: draft); _original = State(initialValue: original)
        _baseWasApplied = State(initialValue: record?.appliedElsewhere == true)
        _context = State(initialValue: context)
    }
    private var changed: Bool { draft != original }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(job["title"]?.string ?? l10n("Opportunity")).font(.headline)
                    Text(l10n("Your record stays on this phone. Saving it does not send an application or a message."))
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if context == nil {
                    Section {
                        Text(l10n("Compare the saved record versions before editing this opportunity."))
                            .foregroundStyle(.red)
                            .accessibilityIdentifier("record.compareVersions")
                    }
                }
                if let issue { Section { Text(l10n.message(issue)).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true) } }
                Section {
                    Picker(l10n("Stage"), selection: $draft.stage) { ForEach(PhoneApplicationStage.allCases) { Text(l10n($0.title)).tag($0) } }
                        .pickerStyle(.menu).accessibilityIdentifier("record.stage")
                    if baseWasApplied && draft.stage == .saved {
                        Text(l10n("Your previous record says you applied. Clearing that mark allows a new application review; it does not withdraw an employer application."))
                            .font(.footnote).foregroundStyle(.secondary)
                        if original.stage == .saved {
                            Button(l10n("Mark as not applied")) { clearApplied = true }.accessibilityIdentifier("record.clearApplied")
                        }
                    }
                } header: { Text(l10n("Application stage")) } footer: {
                    Text(l10n("Applied, Interview and Offer mark this role as already applied. Closed keeps any earlier applied mark."))
                }
                Section {
                    Toggle(l10n("Add an application date"), isOn: Binding(get: { !draft.appliedOn.isEmpty }, set: { draft.appliedOn = $0 ? PhoneRecordDay.string(Date()) : "" }))
                        .accessibilityIdentifier("record.hasAppliedDate")
                    if !draft.appliedOn.isEmpty {
                        DatePicker(l10n("Applied on"), selection: dayBinding(\.appliedOn), displayedComponents: .date)
                            .accessibilityIdentifier("record.appliedDate")
                    }
                    Toggle(l10n("Plan a follow-up"), isOn: Binding(get: { !draft.followUpOn.isEmpty }, set: { draft.followUpOn = $0 ? PhoneRecordDay.string(Date()) : "" }))
                        .accessibilityIdentifier("record.hasFollowUp")
                    if !draft.followUpOn.isEmpty {
                        DatePicker(l10n("Follow up on"), selection: dayBinding(\.followUpOn), displayedComponents: .date)
                            .accessibilityIdentifier("record.followUpDate")
                    }
                } header: { Text(l10n("Optional dates")) } footer: {
                    Text(l10n("Leave the application date blank if you do not know it. Dates keep the day you selected when your time zone changes. Follow-ups appear in Saved; no notification or message is sent."))
                }
                Section {
                    TextEditor(text: $draft.note).frame(minHeight: 140).focused($noteFocused)
                        .accessibilityLabel(l10n("Private application note")).accessibilityIdentifier("record.note")
                    Text(l10n.format("{0} / 2,000 characters", [String(describing: draft.note.unicodeScalars.count)])).font(.caption).foregroundStyle(.secondary)
                } header: { Text(l10n("Private note (optional)")) } footer: {
                    Text(l10n("For your own preparation and reminders. This note is not included in employer application details."))
                }
            }.environment(\.calendar, PhoneRecordDay.calendar())
                .navigationTitle(l10n("Your application record")).navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(l10n("Cancel")) { noteFocused = false; if changed { discard = true } else { dismiss() } }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(l10n("Save")) {
                            noteFocused = false
                            if baseWasApplied && draft.stage == .saved && original.stage != .saved { clearApplied = true }
                            else { save() }
                        }.disabled(model.busy || context == nil).accessibilityIdentifier("record.save")
                    }
                    ToolbarItemGroup(placement: .keyboard) { Spacer(); Button(l10n("Done typing")) { noteFocused = false } }
                }
                .alert(l10n("Discard your unsaved record changes?"), isPresented: $discard) {
                    Button(l10n("Discard changes"), role: .destructive) {
                        if let context, !model.discardRecordDraft(context: context) { issue = model.message }
                        else { closingIntentionally = true; dismiss() }
                    }
                    Button(l10n("Keep editing"), role: .cancel) {}
                } message: { Text(l10n("Your previously saved record will stay unchanged.")) }
                .alert(l10n("Mark as not applied?"), isPresented: $clearApplied) {
                    Button(l10n("Mark not applied"), role: .destructive) { save(confirmNotApplied: true) }
                    Button(l10n("Keep application record"), role: .cancel) {}
                } message: { Text(l10n("This changes your private record and allows a new application review. It does not withdraw or change anything with an employer. Your earlier versions stay on this phone.")) }
        }.tint(.careerAccent).interactiveDismissDisabled(changed || model.busy)
            .onChange(of: scenePhase) { phase in if phase != .active { checkpoint() } }
            .onDisappear { if !closingIntentionally { checkpoint() } }
            .onChange(of: issue) { value in
                if let value { UIAccessibility.post(notification: .announcement, argument: l10n.message(value)) }
            }
            .onAppear {
                if context == nil {
                    UIAccessibility.post(notification: .announcement, argument: l10n("Compare the saved record versions before editing this opportunity."))
                }
            }
    }
    private func checkpoint() {
        if changed, let context, !model.keepRecordDraft(draft, context: context) { issue = model.message }
    }
    private func dayBinding(_ path: WritableKeyPath<PhoneRecordDraft, String>) -> Binding<Date> {
        Binding(get: { PhoneRecordDay.date(draft[keyPath: path]) ?? Date() }, set: { draft[keyPath: path] = PhoneRecordDay.string($0) })
    }
    private func save(confirmNotApplied: Bool = false) {
        guard let context else { return }
        if model.saveRecord(draft, context: context, confirmNotApplied: confirmNotApplied) { closingIntentionally = true; dismiss() }
        else { issue = model.message }
    }
}

private struct NativeModernRecordVersions: View {
    @NativeLocalization private var l10n
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
                    Text(l10n("Choose the details you want to keep. Other versions stay on this phone."))
                    Text(l10n("Choosing a version keeps your current applied mark. If you marked this role as not applied, an older version restores its notes and dates without marking it applied again. You can change the stage in your current record."))
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if let issue { Section { Text(l10n.message(issue)).foregroundStyle(.red) } }
                ForEach(model.recordVersions(for: job)) { record in
                    Section {
                        NativeModernRecordSummary(record: record)
                        if let updated = ApplicationReviewPolicy.date(record.updatedAt) {
                            Text(l10n.format("Saved {0}", [String(describing: l10n.date(updated, includeTime: true))])).font(.caption).foregroundStyle(.secondary)
                        }
                        Button(l10n("Use this version")) {
                            chosen = record; choiceContext = model.recordChoiceContext(for: job); confirm = true
                        }.disabled(model.busy)
                    } header: { Text(l10n(record.archived ? "Earlier version" : "Current record")) }
                }
            }.navigationTitle(l10n("Your record versions")).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button(l10n("Done")) { dismiss() } } }
                .confirmationDialog(l10n("Use this record version?"), isPresented: $confirm, titleVisibility: .visible) {
                    Button(l10n("Use this version")) {
                        guard let chosen, let choiceContext else { return }
                        if model.useRecordVersion(chosen.id, context: choiceContext) { dismiss() } else { issue = model.message }
                    }
                    Button(l10n("Keep current records"), role: .cancel) {}
                } message: { Text(l10n("Your current applied mark stays unchanged, and other versions remain in your private history. This does not send or change an employer application.")) }
        }.tint(.careerAccent)
            .onChange(of: issue) { value in
                if let value { UIAccessibility.post(notification: .announcement, argument: l10n.message(value)) }
            }
    }
}

private struct NativeJobLink: View {
    @NativeLocalization private var l10n
    @EnvironmentObject private var store: NativeCareerStore
    let job: CareerJob
    var body: some View {
        NavigationLink { NativeJobDetail(job: job) } label: {
            HStack(alignment: .top, spacing: 13) {
                Text(job.initials).font(.caption.weight(.bold))
                    .frame(width: 40, height: 40).background(NativeDesign.accentSurface, in: RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(Color.careerAccent).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 7) {
                    if store.isCurrentResearch(job), let rank = job.rank { Text(l10n.format("PRIORITY {0}", [String(format: "%02d", rank)])).font(.caption2.weight(.semibold)).foregroundStyle(.secondary) }
                    Text(job.title).font(.headline).fixedSize(horizontal: false, vertical: true)
                    Text(l10n.format("{0} · {1}", [String(describing: job.company), String(describing: job.location)])).font(.subheadline).foregroundStyle(.secondary)
                    Text(job.kind == "archived" ? l10n.format("Earlier assessment: {0}", [job.fit]) : job.fit).font(.caption.weight(.medium)).foregroundStyle(job.isExpired ? Color.primary : Color.careerAccent)
                    ForEach(store.workspace.profile.criteriaMessages(for: job), id: \.self) { message in
                        Label(l10n(message), systemImage: "questionmark.circle").font(.caption).foregroundStyle(.secondary)
                    }
                    if store.isUnrefreshed(job) { Label(l10n("Not refreshed — previous result"),systemImage:"clock.arrow.circlepath").font(.caption).foregroundStyle(.secondary) }
                    if job.isExpired { Label(l10n("Past listed deadline"), systemImage: "clock").font(.caption) }
                    if store.status(for: job) != "Not started" { Text(l10n(store.status(for: job))).font(.caption).foregroundStyle(.secondary) }
                    if store.isSaved(job) { Label(l10n("Saved"), systemImage: "heart.fill").font(.caption).foregroundStyle(Color.careerAccent) }
                }
            }.padding(.vertical, 8)
        }
    }
}

private struct NativeJobDetail: View {
    @NativeLocalization private var l10n
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

    private func speakListingWarning(expired: Bool) {
        if expired {
            UIAccessibility.post(notification: .announcement, argument: l10n("Check the employer's current status before spending time on this application."))
        } else if experienceGap {
            speakExperienceWarning()
        }
    }

    private func speakExperienceWarning() {
        guard let years = job.minYears else { return }
        UIAccessibility.post(notification: .announcement, argument: l10n("You entered fewer relevant years than the \(years)+ requested. Review eligibility before applying."))
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    Text(job.company).font(.caption.weight(.semibold)).foregroundStyle(Color.careerAccent)
                    Text(job.title).font(.title.weight(.bold)).fixedSize(horizontal: false, vertical: true)
                    Text(job.location).foregroundStyle(.secondary)
                    if let subtitle = job.subtitle, !subtitle.isEmpty { Text(l10n(subtitle)).font(.subheadline).foregroundStyle(.secondary) }
                }.padding(.vertical, 10)
                if job.isExpired { NativeNotice(title: "Past listed deadline", message: "Check the employer's current status before spending time on this application.", warning: true) }
            }.listRowBackground(Color.clear).listRowSeparator(.hidden)
            Section(l10n("The essentials")) {
                LabeledContent(l10n("Posted"), value: l10n.sourceDate(job.posted, profile: store.workspace.profile))
                LabeledContent(l10n("Closing date"), value: job.closes.map { l10n.sourceDate($0, profile: store.workspace.profile, includeTime: $0.count > 10) } ?? l10n("Not published"))
                LabeledContent(l10n("Salary"), value: l10n(job.rank == nil ? "Not checked for this lead" : "Not disclosed in research"))
                ForEach(store.workspace.profile.criteriaMessages(for: job), id: \.self) { message in
                    Label(l10n(message), systemImage: "questionmark.circle").font(.footnote)
                }
                if let mode = job.mode, mode != "Not stated" { LabeledContent(l10n("Work arrangement"), value: mode) }
            }
            Section(l10n("Evidence and freshness")) {
                if store.isCurrentResearch(job) {
                    LabeledContent(l10n("Research checked"), value: l10n.sourceDate(store.research.checkedAt, profile: store.workspace.profile))
                    Text(l10n("The fit assessment and requirement summary reflect that research date.")).font(.footnote).foregroundStyle(.secondary)
                } else if job.kind == "archived" || job.researchCheckedAt != nil {
                    LabeledContent(l10n("Archived research"), value: job.researchCheckedAt.map { l10n.sourceDate($0, profile: store.workspace.profile) } ?? l10n("Original date unavailable"))
                    Text(l10n("Preserved with the earlier assessment from your records. Historical assessments are not personalized advice for your current profile. Recheck the employer and requirements.")).font(.footnote).foregroundStyle(.secondary)
                }
                if let snapshot = store.workspace.live, snapshot.jobs.contains(where: { $0.id == job.id }) {
                    let employerObservation=store.employerObservation(job)
                    LabeledContent(l10n("Employer checked"), value: l10n.sourceDate(employerObservation.lastCheckedAt ?? snapshot.checkedAt, profile: store.workspace.profile, includeTime: true))
                    Text(l10n(store.isUnrefreshed(employerObservation) ? "Not refreshed in the latest attempt. This previous result is retained because its employer search was unavailable." : "This role appeared in that search. Recheck the official page for changes before applying.")).font(.footnote).foregroundStyle(.secondary)
                } else if job.rank == nil {
                    Text(l10n("Saved employer lead. Its current availability is not established by the latest search. Recheck the official page before applying.")).font(.footnote)
                }
            }
            Section(l10n(job.kind == "archived" ? "Preserved earlier assessment" : "Listing information to review")) {
                Text(job.fit).font(.headline).foregroundStyle(Color.careerAccent)
                Text(job.summary)
                Text(l10n("This is not a verified personal fit score. Compare the employer requirements with your own evidence."))
                    .font(.footnote).foregroundStyle(.secondary)
                if experienceGap {
                    NativeNotice(title: "Check the experience requirement", message: "You entered fewer relevant years than the \(job.minYears ?? 0)+ requested. Review eligibility before applying.", warning: true)
                }
                ForEach(Array(job.requirements.enumerated()), id: \.offset) { _, requirement in
                    Label { Text(requirement) } icon: { Image(systemName: "circle").font(.caption2) }
                }
            }
            Section(l10n("Your application, step by step")) {
                ForEach(Array(job.applicationSteps.enumerated()), id: \.offset) { index, step in
                    VStack(alignment: .leading, spacing: 7) {
                        Text(l10n.format("{0}. {1}", [String(describing: index + 1), String(describing: step.first ?? "Review this step")])).font(.headline)
                        Text(step.dropFirst().joined(separator: " ")).font(.subheadline).foregroundStyle(.secondary)
                    }.padding(.vertical, 4)
                }
            }
            Section {
                Picker(l10n("Status"), selection: Binding(get: { store.status(for: job) }, set: { store.setStatus($0, for: job) })) {
                    ForEach(NativeCareerStore.statuses, id: \.self) { Text(l10n($0)).tag($0) }
                }
                NavigationLink { NativeApplicationRecordEditor(job:job) } label: { Label(l10n("Application date and receipt note"),systemImage:"calendar.badge.clock") }
                NavigationLink { NativeLegacyNextActionEditor(job:job) } label: { Label(l10n("Your next action"),systemImage:"checklist") }
                Button { store.toggleSaved(job) } label: {
                    Label(l10n(store.isSaved(job) ? "Remove from saved" : "Save opportunity"), systemImage: store.isSaved(job) ? "heart.fill" : "heart")
                }
            } header: { Text(l10n("Your progress")) } footer: {
                Text(l10n("This is your own record. Changing status does not submit an application or contact anyone."))
            }
            Section {
                if applications.containsOpportunity(url: job.url) {
                    Label(l10n("Saved in your application workspace"), systemImage: "checkmark.circle")
                    Button(l10n("Open application workspace")) { navigation.selectedTab = 2 }
                } else if MobileApplicationPolicy.jobURL(job.url) != nil {
                    Button(l10n("Copy to application workspace")) {
                        Task { _ = await applications.addJob(url: job.url, title: job.title, company: job.company,
                                                            location: job.location, country: job.isSaudi ? "SA" : "") }
                    }.disabled(applications.busy).accessibilityIdentifier("legacy.copyToApplications")
                    Text(l10n("Copies this public job link and role details. Your original notes and status stay here. Saving does not apply."))
                        .font(.footnote).foregroundStyle(.secondary)
                    if let message = applications.message { Text(l10n(message)).font(.footnote) }
                }
                if let url = job.applicationURL {
                    Link(destination: url) { Label(l10n(job.isExpired ? "Check employer status" : store.status(for: job) == "Not started" ? "Open official application" : "View employer / existing application"), systemImage: "arrow.up.right.square") }
                }
                NavigationLink { NativeNotesPreview(text: l10n.note(for: job, in: store, includeProfile: false), includesProfile: false) } label: { Label(l10n("Review preparation note"), systemImage: "doc.text") }
                if let url = job.sourceURL { Link(l10n("Source and full requirements"), destination: url) }
            } footer: {
                Text(l10n("Review and rewrite every draft before using it. Recheck salary, deadlines and qualifications directly with the employer."))
            }
        }.nativeList().navigationTitle(l10n("Opportunity")).navigationBarTitleDisplayMode(.inline)
        .onAppear { speakListingWarning(expired: job.isExpired) }
        .onChange(of: job.isExpired) { expired in
            speakListingWarning(expired: expired)
        }
        .onChange(of: experienceGap) { gap in
            guard gap, !job.isExpired else { return }
            speakExperienceWarning()
        }
    }
}

private struct NativeLegacyNextActionEditor: View {
    @NativeLocalization private var l10n
    @EnvironmentObject private var store:NativeCareerStore
    @Environment(\.scenePhase) private var scenePhase
    let job:CareerJob
    @State private var discard=false
    @State private var notice=""
    private var draft:NextActionDraft {store.nextActionDrafts[job.id] ?? NextActionDraft()}
    private func edit(dueOn:String?=nil,note:String?=nil,completed:Bool?=nil) {
        store.editNextAction(job,dueOn:dueOn ?? draft.dueOn,actionNote:note ?? draft.actionNote,completed:completed ?? draft.completed)
        notice=""
    }
    private func reloadNextAction(discardDraft: Bool, announceExisting: Bool) {
        let before = store.nextActionErrors[job.id]
        store.beginNextAction(job, discardDraft: discardDraft)
        guard let error = store.nextActionErrors[job.id] else { return }
        if announceExisting || error != before {
            UIAccessibility.post(notification: .announcement, argument: l10n.message(error))
        }
    }
    var body:some View {
        Form {
            Section {
                Text(job.title).font(.headline)
                Text(l10n("This private plan stays with the earlier local record. It is not an application receipt and is not copied into a connected account.")).font(.footnote)
                TextField(l10n("YYYY-MM-DD, or leave blank"),text:Binding(get:{draft.dueOn},set:{edit(dueOn:$0)}))
                    .environment(\.layoutDirection,.leftToRight).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .accessibilityLabel(l10n("Next action due date, YYYY-MM-DD"))
                    .accessibilityIdentifier("legacyAction.date")
                TextEditor(text:Binding(get:{draft.actionNote},set:{edit(note:$0)})).frame(minHeight:140)
                    .accessibilityLabel(l10n("Private next action"))
                    .accessibilityIdentifier("legacyAction.note")
                Toggle(l10n("Completed"),isOn:Binding(get:{draft.completed},set:{edit(completed:$0)}))
            } header:{Text(l10n("Your next action"))} footer:{
                Text(l10n("Use up to 500 characters. A date or a completed action needs a note. No reminder, message or application is sent."))
            }
            Section {
                if draft.dirty {Text(l10n("Unsaved draft. Kept for this session; export your notes before closing the app.")).foregroundStyle(.secondary)}
                if let error=store.nextActionErrors[job.id] {Text(l10n.message(error)).foregroundStyle(.red).accessibilityAddTraits(.updatesFrequently)}
                if !notice.isEmpty {Text(l10n(notice)).accessibilityAddTraits(.updatesFrequently)}
                Button(l10n("Save next action")) {
                    notice=store.saveNextAction(job) ? "Next action saved on this phone." : ""
                    UIAccessibility.post(notification:.announcement,argument:l10n.message(store.nextActionErrors[job.id] ?? notice))
                }.accessibilityIdentifier("legacyAction.save")
                Button(l10n("Reload saved record")) {if draft.dirty {discard=true} else {reloadNextAction(discardDraft:true,announceExisting:true);notice=""}}
            }
        }.navigationTitle(l10n("Your next action")).navigationBarTitleDisplayMode(.inline)
            .onAppear{reloadNextAction(discardDraft:false,announceExisting:true)}
            .onChange(of:scenePhase){phase in if phase == .active {reloadNextAction(discardDraft:false,announceExisting:false)}}
            .confirmationDialog(l10n("Discard this unsaved draft and load the saved record?"),isPresented:$discard,titleVisibility:.visible){
                Button(l10n("Discard draft and reload"),role:.destructive){reloadNextAction(discardDraft:true,announceExisting:true);notice=""}
                Button(l10n("Keep draft"),role:.cancel){}
            }
    }
}

private struct NativeLegacyBackupDocument:FileDocument {
    static var readableContentTypes:[UTType] {[.json]}
    var data:Data
    init(data:Data){self.data=data}
    init(configuration:ReadConfiguration)throws{data=configuration.file.regularFileContents ?? Data()}
    func fileWrapper(configuration:WriteConfiguration)throws->FileWrapper{FileWrapper(regularFileWithContents:data)}
}

struct NativeLegacyBackupScreen:View {
    @NativeLocalization private var l10n
    @EnvironmentObject private var store:NativeCareerStore
    @State private var preview:NativeRestorePreview?
    @State private var document=NativeLegacyBackupDocument(data:Data())
    @State private var exporting=false
    @State private var importing=false
    @State private var confirming=false
    @State private var notice=""
    var body:some View {
        Form {
            Section {
                Text(l10n("These records are separate from every connected account. A backup includes saved roles, self-entered receipt notes, next actions and the saved planning profile. It contains no account credentials or application approvals."))
                Button(l10n("Export earlier planning records")) {
                    do {document=NativeLegacyBackupDocument(data:try store.privateBackupData());exporting=true;notice=""}
                    catch {notice=error.localizedDescription}
                }.accessibilityIdentifier("legacyBackup.export")
                NavigationLink { NativeNotesPreview(text:l10n.exportNotes(from:store),includesProfile:true) } label: {Label(l10n("Review my application notes"),systemImage:"doc.text")}
            } header: { Text(l10n("Earlier local planning records"))
            } footer:{Text(l10n("This unencrypted file contains private information. Choose a destination you trust. Unsaved drafts are available in reviewed notes, not the saved-data backup."))}
            Section {
                Button(l10n("Choose an earlier workspace backup")){preview=nil;importing=true}.accessibilityIdentifier("legacyBackup.choose")
                Text(l10n("Review the additions before restoring. Existing records, profile and checklist are preserved. Nothing is copied into an account, uploaded or submitted."))
                if let candidate=preview {
                    Text(l10n.format("{0} additions; {1} existing values preserved; {2} profile or checklist fields skipped.",[String(candidate.additions),String(candidate.conflicts),String(candidate.skipped)]))
                        .accessibilityIdentifier("legacyBackup.preview")
                    Button(l10n("Confirm additive restore")){confirming=true}.disabled(candidate.additions==0)
                        .accessibilityIdentifier("legacyBackup.confirm")
                    Button(l10n("Cancel preview"),role:.cancel){preview=nil;notice="Preview canceled. Nothing was restored."}
                }
            } header: { Text(l10n("Add earlier records from a backup"))
            } footer:{Text(l10n("Close older app versions before restoring. A local recovery copy is saved first. If the saved data changes, create a new preview. Older versions may not preserve newer records or preferences."))}
            if !notice.isEmpty {Section {Text(l10n.message(notice)).fixedSize(horizontal:false,vertical:true).accessibilityAddTraits(.updatesFrequently)}}
        }.navigationTitle(l10n("Earlier records and backups")).navigationBarTitleDisplayMode(.inline)
            .fileExporter(isPresented:$exporting,document:document,contentType:.json,defaultFilename:"Career-Finder-planning-backup") {result in
                if case .failure(let error)=result {notice=error.localizedDescription}
            }
            .fileImporter(isPresented:$importing,allowedContentTypes:[.json]) {result in
                preview=nil
                do {
                    let url=try result.get();let access=url.startAccessingSecurityScopedResource()
                    defer {if access {url.stopAccessingSecurityScopedResource()}}
                    let handle=try FileHandle(forReadingFrom:url);defer {try? handle.close()}
                    let data=try handle.read(upToCount:NativeCareerStore.backupLimit+1) ?? Data()
                    guard data.count<=NativeCareerStore.backupLimit else {throw NativeBackupError.invalid}
                    preview=try store.previewBackup(data);notice=""
                } catch {notice=error.localizedDescription}
            }
            .confirmationDialog(l10n("Add missing saved data? Existing values will be preserved."),isPresented:$confirming,titleVisibility:.visible) {
                Button(l10n("Restore additions")) {
                    guard let candidate=preview else {return}
                    do {try store.applyBackup(candidate);notice="Additions restored locally. Nothing was sent."}
                    catch {notice=error.localizedDescription}
                    preview=nil
                }
                Button(l10n("Cancel"),role:.cancel){preview=nil}
            }
            .onChange(of: notice) { text in
                guard !text.isEmpty,
                      text != "Preview canceled. Nothing was restored.",
                      text != "Additions restored locally. Nothing was sent." else { return }
                UIAccessibility.post(notification: .announcement, argument: l10n.message(text))
            }
    }
}

private struct NativeApplicationRecordEditor: View {
    @NativeLocalization private var l10n
    @EnvironmentObject private var store:NativeCareerStore
    @Environment(\.scenePhase) private var scenePhase
    let job:CareerJob
    @State private var discard=false
    @State private var savedMessage=""
    private var draft:ApplicationRecordDraft {store.recordDrafts[job.id] ?? ApplicationRecordDraft()}
    private func reloadRecord(discardDraft: Bool, announceExisting: Bool) {
        let before = store.recordErrors[job.id]
        store.beginApplicationRecord(job, discardDraft: discardDraft)
        guard let error = store.recordErrors[job.id] else { return }
        if announceExisting || error != before {
            UIAccessibility.post(notification: .announcement, argument: l10n.message(error))
        }
    }
    var body:some View {
        Form {
            Section {
                Text(job.title).font(.headline)
                Text(l10n("Optional, self-entered tracking details. Leave the date blank if unknown. The latest allowed date uses the Riyadh day; your display time zone does not shift recorded dates. Saving does not change status or contact anyone.")).font(.footnote)
                TextField(l10n("YYYY-MM-DD, or leave blank"),text:Binding(get:{draft.appliedAt},set:{store.editApplicationRecord(job,appliedAt:$0,receiptNote:draft.receiptNote);savedMessage=""}))
                    .textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityLabel(l10n("Application date, if known, YYYY-MM-DD"))
            } header:{Text(l10n("Application date, if known"))}
            Section {
                TextEditor(text:Binding(get:{draft.receiptNote},set:{store.editApplicationRecord(job,appliedAt:draft.appliedAt,receiptNote:$0);savedMessage=""}))
                    .frame(minHeight:140).accessibilityLabel(l10n("Receipt or record note"))
            } header:{Text(l10n("Receipt / record note"))} footer:{Text(l10n("Up to 2,000 characters. Plain text only. Included in reviewed tracking exports, never in preparation drafts. Avoid passwords, codes and confidential employer data."))}
            Section {
                if draft.dirty {Text(l10n("Unsaved draft. Kept for this session; export your notes before closing the app.")).foregroundStyle(.secondary)}
                if let base=draft.base {Text(l10n.format("Record last edited: {0} (not the application time).", [String(describing: ApplicationReviewPolicy.date(base.updatedAt).map { l10n.date($0, includeTime: true) } ?? base.updatedAt)])).font(.footnote)}
                if let error=store.recordErrors[job.id] {Text(l10n.message(error)).foregroundStyle(.red).accessibilityAddTraits(.updatesFrequently)}
                if !savedMessage.isEmpty {Text(l10n(savedMessage)).foregroundStyle(Color.careerAccent).accessibilityAddTraits(.updatesFrequently)}
                Button(l10n("Save application record")) {
                    savedMessage=store.saveApplicationRecord(job) ? "Application date and note saved on this device. Status is unchanged." : ""
                    UIAccessibility.post(notification:.announcement,argument:l10n.message(store.recordErrors[job.id] ?? savedMessage))
                }
                Button(l10n("Reload saved record")) {if draft.dirty {discard=true} else {reloadRecord(discardDraft:true,announceExisting:true);savedMessage=""}}
            }
        }.navigationTitle(l10n("Application record")).navigationBarTitleDisplayMode(.inline)
            .onAppear{reloadRecord(discardDraft:false,announceExisting:true)}
            .onChange(of:scenePhase){phase in if phase == .active {reloadRecord(discardDraft:false,announceExisting:false)}}
            .confirmationDialog(l10n("Discard this unsaved draft and load the saved record?"),isPresented:$discard,titleVisibility:.visible){
                Button(l10n("Discard draft and reload"),role:.destructive){reloadRecord(discardDraft:true,announceExisting:true);savedMessage=""}
                Button(l10n("Keep draft"),role:.cancel){}
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
    @NativeLocalization private var l10n
    @EnvironmentObject private var store: NativeCareerStore
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        List {
            Section {
                NativeIntro(eyebrow: "YOUR NEXT MOVE", title: "Make every application count.", message: "Build your evidence, then focus on a small number of well-matched roles.")
                ProgressView(value: Double(nativePlanItems.filter { store.workspace.completed.contains($0.id) }.count), total: Double(nativePlanItems.count)) {
                    Text(l10n.format("{0} of {1} preparation steps complete", [String(describing: nativePlanItems.filter { store.workspace.completed.contains($0.id) }.count), String(describing: nativePlanItems.count)])).font(.footnote)
                }.padding(.vertical, 5)
            }.listRowBackground(Color.clear).listRowSeparator(.hidden)
            Section {
                let prompts=store.attention()
                if prompts.isEmpty {Text(l10n("No attention prompts from your saved records."))}
                ForEach(prompts) { prompt in
                    NavigationLink {NativeJobDetail(job:prompt.job)} label:{
                        VStack(alignment:.leading,spacing:6){
                            Text(l10n(prompt.title)).font(.headline)
                            Text(prompt.job.title+" · "+prompt.job.company).font(.subheadline)
                            if prompt.kind=="requirements" {Text(prompt.job.requirements.joined(separator:"\n")).font(.caption)}
                            if prompt.kind=="deadline" {Text(l10n.format("Listed deadline: {0}", [String(describing: l10n.sourceDate(prompt.job.closes ?? "", profile: store.workspace.profile, includeTime: (prompt.job.closes?.count ?? 0)>10))])).font(.caption)}
                            if prompt.kind=="applied-date" {Text(l10n("Optional record detail; an unknown date is allowed.")).font(.caption)}
                            Text(l10n.format("Research checked: {0} · Employer checked: {1}", [String(describing: prompt.job.researchCheckedAt.map { l10n.sourceDate($0, profile: store.workspace.profile) } ?? l10n("Not researched")), String(describing: prompt.job.lastCheckedAt.map { l10n.sourceDate($0, profile: store.workspace.profile, includeTime: true) } ?? l10n("Not recorded"))])).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            } header:{Text(l10n("Needs attention"))} footer:{Text(l10n("Prompts from your saved records. Past checks do not establish current availability. Recheck employer information; these are not eligibility decisions or automatic applications."))}
            Section {
                ForEach(nativePlanItems, id: \.id) { item in
                    Toggle(isOn: Binding(get: { store.workspace.completed.contains(item.id) }, set: { store.setChecklist(item.id, done: $0) })) {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(l10n(item.title)).font(.subheadline.weight(.semibold))
                            Text(l10n(item.detail)).font(.caption).foregroundStyle(.secondary)
                        }.padding(.vertical, 4)
                    }
                }
            } header: { Text(l10n("Your preparation checklist")) } footer: {
                Text(l10n("Checked items record your preparation on this device. Recheck the requirements, dates and materials for each application."))
            }
            Section(l10n("Application records")) {
                if store.recordJobs.isEmpty {
                    NativeEmpty(title: "No applications marked yet.", message: "Open a role and update its status after you complete a step.", icon: "checkmark.bubble")
                } else { ForEach(store.recordJobs) { NativeJobLink(job: $0) } }
            }
            Section {
                NavigationLink { NativeNotesPreview(text: l10n.exportNotes(from: store), includesProfile: true) } label: { Label(l10n("Review my application notes"), systemImage: "doc.text") }
            } footer: { Text(l10n("Notes include your self-entered profile, application records, receipt notes and any unsaved record drafts. Review them before choosing a destination in the share sheet.")) }
        }.nativeList().navigationTitle(l10n("Application plan"))
            .navigationBarTitleDisplayMode(.inline)
            .onAppear{store.reloadApplicationRecords()}
            .onChange(of:scenePhase){phase in if phase == .active {store.reloadApplicationRecords()}}
    }
}

@MainActor
private struct NativeSettingsScreen: View {
    @NativeLocalization private var l10n
    @EnvironmentObject private var applications: NativeApplicationsStore
    @AppStorage(NativeAppearance.storageKey) private var appearance = NativeAppearance.system.rawValue
    @AppStorage(NativeLanguage.storageKey) private var language = NativeLanguage.system.rawValue
    @State private var connectionSheet = false
    private var selectedAppearance: NativeAppearance { NativeAppearance(rawValue: appearance) ?? .system }
    var body: some View {
        List {
            Section {
                ForEach(NativeLanguage.allCases) { option in
                    Button {
                        language = option.rawValue
                    } label: {
                        HStack {
                            Text(l10n(option.title))
                            Spacer()
                            if language == option.rawValue {
                                Image(systemName: "checkmark").foregroundStyle(Color.careerAccent)
                            }
                        }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(language == option.rawValue ? .isSelected : [])
                    .accessibilityIdentifier("settings.language." + option.rawValue)
                }
            } header: { Text(l10n("Language")) } footer: {
                Text(l10n("Language changes only this app’s display. Your saved data and account stay the same."))
            }
            Section {
                NavigationLink { NativeProfileScreen() } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(l10n("Profile")).font(.headline)
                            Text(l10n("Your details, résumé and preferences")).font(.subheadline).foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }.padding(.vertical, 5)
                    } icon: { Image(systemName: "person.crop.circle").foregroundStyle(NativeDesign.accent) }
                }.accessibilityIdentifier("settings.profile")
            }
            Section {
                ForEach(NativeAppearance.allCases) { option in
                    Button { appearance = option.rawValue } label: {
                        HStack(spacing: 12) {
                            Label(l10n(option.title), systemImage: option.symbol)
                            Spacer(minLength: 12)
                            if selectedAppearance == option {
                                Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(NativeDesign.accent)
                                    .accessibilityHidden(true)
                            }
                        }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(Rectangle())
                    }.buttonStyle(.plain).foregroundStyle(.primary)
                        .accessibilityLabel(l10n(option.title))
                        .accessibilityAddTraits(selectedAppearance == option ? .isSelected : [])
                        .accessibilityIdentifier("settings.appearance." + option.rawValue)
                }
            } header: { Text(l10n("Appearance")) } footer: {
                Text(l10n("System follows your device appearance. This choice is saved only on this phone."))
            }
            Section(l10n("Your workspace")) {
                Button { connectionSheet = true } label: {
                    Label(l10n("Application connection"), systemImage: "link")
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                }.accessibilityIdentifier("settings.connection")
                NavigationLink { NativePhoneDataScreen(model: applications) } label: {
                    Label(l10n("Phone data and recovery"), systemImage: "externaldrive")
                }.accessibilityIdentifier("settings.data")
                NavigationLink { NativePrivacyScreen() } label: {
                    Label(l10n("Privacy & support"), systemImage: "hand.raised")
                }.accessibilityIdentifier("settings.privacy")
            }
            Section(l10n("Career Finder")) {
                LabeledContent(l10n("Version"), value: (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—")
                    + " (" + (Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "—") + ")")
                Text(l10n("Save opportunities, prepare your profile and review your next step. Employer links let you apply manually."))
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }.nativeList().navigationTitle(l10n("Settings")).navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $connectionSheet) { NativeApplicationConnection(model: applications) }
    }
}

private struct NativeSettingsButton: View {
    @NativeLocalization private var l10n
    @EnvironmentObject private var navigation: NativeCareerNavigation
    var body: some View {
        Button { navigation.openSettings() } label: {
            Image(systemName: "gearshape").frame(minWidth: 44, minHeight: 44)
        }.accessibilityLabel(l10n("Settings")).accessibilityIdentifier("navigation.settings")
    }
}

private struct NativeProfileScreen: View {
    @NativeLocalization private var l10n
    @EnvironmentObject private var store: NativeCareerStore
    @EnvironmentObject private var applications: NativeApplicationsStore
    @State private var editing = false
    @State private var applicationEditing = false
    var body: some View {
        List {
            Section {
                NativeIntro(eyebrow: "YOUR PROFILE", title: "Start with what is true.", message: "Your experience gives every application its foundation.")
            }.listRowBackground(Color.clear)
            Section(l10n("Application profile")) {
                Button { applicationEditing = true } label: {
                    Label(l10n(applications.profileReadiness.nextAction), systemImage: "person.crop.rectangle")
                }.accessibilityIdentifier("profile.applicationProfile")
                NativeProfileEssentials(profile: applications.profile)
                Text(l10n("These are the details you can review for employer applications. New profiles start blank. Saving a profile never submits an application."))
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section {
              DisclosureGroup(l10n("Local planning notes and preferences")) {
                LabeledContent(l10n("Relevant years"), value: store.workspace.profile.years.isEmpty ? l10n("Not provided") : store.workspace.profile.years)
                if !store.workspace.profile.degree.isEmpty { Text(store.workspace.profile.degree).font(.subheadline) }
                Button(l10n("Edit planning notes and preferences")) { editing = true }
                Text(l10n.criteriaSummary(store.workspace.profile)).font(.footnote).foregroundStyle(.secondary)
              }
            } footer: { Text(l10n("These separate planning notes stay on this device. They do not replace your application profile or go to employers.")) }
            Section {
                NavigationLink { NativeSalaryScreen() } label: { Label(l10n("Salary & negotiation"), systemImage: "chart.bar.doc.horizontal") }
            }
        }.nativeList().navigationTitle(l10n("Your profile"))
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $editing) { NativeProfileEditor(profile: store.workspace.profile) }
            .sheet(isPresented: $applicationEditing) { NativeApplicationProfileEditor(model: applications) }
    }
}

private struct NativeNotesPreview: View {
    @NativeLocalization private var l10n
    @State var text: String
    let includesProfile: Bool
    var body: some View {
        Form {
            Section {
                Text(l10n(includesProfile ? "These notes include your self-entered profile, application records, receipt notes and any unsaved record drafts. Remove anything you do not want to share." : "This role note excludes your profile fields. Review the requirements and your local application status before sharing."))
                    .font(.footnote)
                TextEditor(text: $text).frame(minHeight: 350).accessibilityLabel(l10n("Application notes to review"))
            }
            Section {
                ShareLink(item: text) { Label(l10n("Share reviewed notes"), systemImage: "square.and.arrow.up") }
            } footer: { Text(l10n("Nothing is sent until you choose a destination and finish sharing. Edits here change only this export.")) }
        }.navigationTitle(l10n("Review notes")).navigationBarTitleDisplayMode(.inline)
    }
}

private struct NativePrivacyScreen: View {
    @NativeLocalization private var l10n
    @EnvironmentObject private var applications: NativeApplicationsStore
    var body: some View {
        List {
            Section(l10n("Information on this phone")) {
                Text(l10n("Planning notes, earlier self-entered tracking records and preparation steps stay on this device. Search keeps your board choices, search fields and public results locally. Saved shows both your application opportunities and any earlier local records."))
                Text(l10n("Your application workspace keeps a phone draft and your selected PDF. The same application profile is reachable from Start, Apply and Profile in Settings. Connecting does not upload that draft. Saving to a connected service sends the applicant fields and selected CV; adding opportunities and preparing reviews sends the links and choices you provide. The phone connection token is stored in Keychain."))
                Text(l10n("Your System, Light or Dark appearance choice is saved on this phone. It is separate from your application profile and is never sent to employers."))
                Text(l10n("A LinkedIn profile link is optional. It is saved with your application profile and appears in the details you review before sharing with an employer. Saving a link does not connect or verify a LinkedIn account, import its content or grant account access."))
                Text(l10n("Application stages, dates, follow-ups and private notes in Saved stay on this phone. They are your own records and are separate from provider receipts. Connecting alone does not move a separate phone record into an account. Choose Keep with connected workspace, or explicitly sync its job, to associate it with that workspace. Other account workspaces do not inherit it."))
            }
            Section(l10n("Connected application workspace")) {
                if MobileApplicationPolicy.isHostedService(applications.serviceAddress) {
                    Text(l10n("The hosted service offers ChatGPT sign-in and, when configured, direct Google or LinkedIn sign-in to create or recover your workspace. It stores the provider identifier, provider-asserted account email, saved profile and CV, opportunities, review choices and submission results. Matching emails do not merge accounts. A one-time code connects this phone to the selected workspace."))
                    NativeApplicationServiceLinks(address: applications.connectionSetupAddress)
                } else {
                    Text(l10n("Your configured application service stores the applicant details, CV, opportunities, review choices and submission history you send to it. Its operator controls account access, retention, recovery and deletion. Consult that operator's privacy and support information."))
                    Text(applications.serviceAddress).environment(\.layoutDirection, .leftToRight).font(.footnote).textSelection(.enabled)
                }
                Text(l10n("Approving an eligible application permits the service to send the reviewed fields and PDF to that employer's application provider. Provider acceptance is recorded only when the provider returns a valid receipt. Employer copies remain subject to the employer's own privacy policy."))
            }
            Section(l10n("Employer searches and links")) {
                Text(l10n("Search uses the public Career Finder discovery service to retrieve postings from your selected Greenhouse and Lever employer boards. It receives the role words, location text and board choices you enter, along with normal connection information. No application token, account cookie, email, applicant profile or CV is sent. Public board metadata is cached by the service; search words are not forwarded to employers but may appear in ordinary hosting request logs."))
                Text(l10n("Opening an employer, LinkedIn or salary-source link takes you to an external website governed by its own privacy policy. Any application or account you create there is managed by that provider."))
                Text(l10n("Search LinkedIn opens its public job search with only the keyword and location text you entered. No application profile, CV or Career Finder connection token is included in that link. Applications completed on LinkedIn remain manual records in Career Finder unless a supported employer provider independently returns a receipt."))
            }
            Section(l10n("Sharing and beta feedback")) {
                Text(l10n("Exported notes include your entered professional details and tracked roles, and exclude country/city/role, planning and display preferences. They leave the app only when you choose a destination in the system share sheet. Review the content before sharing."))
                Text(l10n("The app has no advertising, tracking SDKs or developer analytics service. Apple may process TestFlight testing, crash and feedback information under its own privacy practices."))
                Link(l10n("Apple privacy policy"), destination: URL(string: "https://www.apple.com/legal/privacy/")!)
            }
            Section(l10n("Retention and removal")) {
                Text(l10n("You can edit or clear profile fields, remove saved roles and reset individual tracking statuses in the app. Saved or tracked job details may remain locally after a job disappears from a search."))
                Text(l10n("Disconnect this phone to revoke its application-service connection. Disconnecting, deleting or offloading the app does not delete the hosted workspace. Use Manage account and delete hosted data for the hosted service, or contact your custom service operator. Deleting hosted data does not remove copies already received by employers or saved in exports."))
                Text(l10n("Phone drafts remain available after disconnection or hosted account deletion. Device backups and shared exports are separate copies that you manage through their own settings and destinations."))
            }
            Section(l10n("Support and feedback")) {
                Text(l10n("During beta testing, open this app in TestFlight and choose Send Beta Feedback to contact the developer. Include the screen and steps that caused the problem. Review screenshots and diagnostics before sending."))
                Text(l10n("Policy updated 16 November 2026. The connected service's published policy describes its hosted data practices.")).font(.footnote).foregroundStyle(.secondary)
            }
        }.nativeList().navigationTitle(l10n("Privacy & support"))
            .navigationBarTitleDisplayMode(.inline)
    }
}

private struct NativeProfileEditor: View {
    @NativeLocalization private var l10n
    @EnvironmentObject private var store: NativeCareerStore
    @Environment(\.dismiss) private var dismiss
    @State private var original: NativeProfile
    @State private var draft: NativeProfile
    @State private var confirmDiscard = false
    @FocusState private var focused: Bool
    init(profile: NativeProfile) { _original = State(initialValue: profile); _draft = State(initialValue: profile) }
    private func countryName(_ code: String) -> String { l10n.locale.localizedString(forRegionCode: code) ?? code }
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
                    Picker(l10n("Country or region"), selection: Binding(get: { draft.effectiveCountry }, set: { draft.targetCountry = $0 })) {
                        Text(l10n("Any country or region")).tag("")
                        ForEach(NativeProfile.countryCodes.sorted { countryName($0) < countryName($1) }, id: \.self) { code in Text(l10n.format("{0} ({1})", [String(describing: countryName(code)), String(describing: code)])).tag(code) }
                    }
                    TextField(l10n("City text, if relevant"), text: Binding(get: { draft.effectiveCity }, set: { draft.targetCity = $0 })).focused($focused)
                        .accessibilityLabel(l10n("Preferred city text, optional"))
                    Text(l10n("Matches returned location text only. Confirm the worksite and spelling with the employer.")).font(.caption).foregroundStyle(.secondary)
                    TextField(l10n("Role keywords"), text: Binding(get: { draft.roleKeywords ?? "" }, set: { draft.roleKeywords = $0 })).focused($focused)
                        .accessibilityLabel(l10n("Role keywords, optional"))
                    Text(l10n("Every space-separated word must occur in a returned role title or subtitle. This does not establish eligibility.")).font(.caption).foregroundStyle(.secondary)
                } header: { Text(l10n("Country, city and role preferences")) } footer: {
                    Text(l10n("Preferences for your planning notes and earlier records. The Search tab uses its own explicit role, location and employer-board choices. These notes do not affect saved application records."))
                }
                Section {
                    Picker(l10n("Planning currency"), selection: Binding(get: { draft.effectiveCurrency }, set: { draft.planningCurrency = $0 })) {
                        Text(l10n("Choose a currency")).tag("")
                        ForEach(NativeProfile.currencyCodes, id: \.self) { Text($0).tag($0) }
                    }
                    Picker(l10n("Planning amount period"), selection: Binding(get: { draft.effectivePayPeriod }, set: { draft.planningPayPeriod = $0 })) {
                        Text(l10n("Monthly fixed amounts")).tag("monthly")
                        Text(l10n("Annual fixed amounts")).tag("annual")
                    }
                    Text(l10n("Only a default for your local offer calculator. Existing SAR criteria and source evidence stay SAR; no conversion is performed.")).font(.caption).foregroundStyle(.secondary)
                    Picker(l10n("Display time zone"), selection: Binding(get: { draft.displayTimeZone ?? "Asia/Riyadh" }, set: { draft.displayTimeZone = $0 })) {
                        Text(l10n.format("Device time zone ({0})", [String(describing: TimeZone.current.identifier)])).tag("")
                        ForEach(displayZones, id: \.self) { Text(l10n($0)).tag($0) }
                    }
                } header: { Text(l10n("Planning and display")) } footer: {
                    Text(l10n("Display zone applies to timestamps with an explicit offset. Source date-only deadlines keep their published date. Existing application-date validation still uses the Riyadh day; dates are never shifted."))
                }
                if draft.minimumMonthlySAR != nil || draft.unknownSalary != nil {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(l10n("Minimum monthly pay, SAR")).font(.caption).foregroundStyle(.secondary)
                        TextField(l10n("Blank means no minimum"), text: Binding(get: { draft.minimumMonthlySAR ?? "" }, set: { draft.minimumMonthlySAR = $0 }))
                            .keyboardType(.numberPad).focused($focused).accessibilityLabel(l10n("Minimum monthly pay in SAR"))
                    }
                    if draft.hasPayFloor {
                        Picker(l10n("Unverified salaries"), selection: Binding(get: { draft.unknownSalary ?? "show" }, set: { draft.unknownSalary = $0 })) {
                            Text(l10n("Show for review")).tag("show")
                            Text(l10n("Hide unverified earlier leads")).tag("hide")
                        }
                    }
                    if let error = draft.criteriaError { Label(l10n.message(error), systemImage: "exclamationmark.circle").font(.caption) }
                } header: { Text(l10n("Earlier salary criteria · monthly SAR")) } footer: {
                    Text(l10n("This filter stays monthly SAR regardless of planning currency. Use whole SAR; blank or zero means no minimum. Confirm basic salary versus fixed package. This retained preference does not filter the new public board search. It stays on this device and is excluded from discovery requests and application notes."))
                }
                }
                Section(l10n("Experience and qualifications")) {
                    VStack(alignment: .leading, spacing: 8) { Text(l10n("Relevant years of experience")).font(.caption).foregroundStyle(.secondary); TextField(l10n("Relevant years of experience"), text: $draft.years).keyboardType(.decimalPad).focused($focused) }
                    if !validYears { Label(l10n("Enter a number from 0 to 60, or leave blank."), systemImage: "exclamationmark.circle").font(.caption) }
                    TextField(l10n("Degree and certifications"), text: $draft.degree, axis: .vertical).lineLimit(2...5).focused($focused)
                    if draft.degree.count > 300 { Label(l10n("Qualifications exceed 300 characters. Shorten this field before saving."), systemImage: "exclamationmark.circle").font(.caption) }
                }
                Section(l10n("Tools and responsibilities")) {
                    TextEditor(text: $draft.skills).frame(minHeight: 120).focused($focused)
                        .accessibilityLabel(l10n("Tools and responsibilities"))
                    Text(l10n.format("{0} / 3,000 characters", [String(describing: draft.skills.count)])).font(.caption).foregroundStyle(.secondary)
                    if draft.skills.count > 3_000 { Label(l10n("Shorten tools and responsibilities before saving."), systemImage: "exclamationmark.circle").font(.caption) }
                }
                Section {
                    TextEditor(text: $draft.achievements).frame(minHeight: 160).focused($focused)
                        .accessibilityLabel(l10n("Achievements you can substantiate"))
                    Text(l10n.format("{0} / 5,000 characters", [String(describing: draft.achievements.count)])).font(.caption).foregroundStyle(.secondary)
                    if draft.achievements.count > 5_000 { Label(l10n("Shorten achievements before saving."), systemImage: "exclamationmark.circle").font(.caption) }
                } header: { Text(l10n("Achievements you can substantiate")) } footer: {
                    Text(l10n("Include what changed, over what period, and your own contribution. Avoid confidential employer data."))
                }
                if let error = store.storageError { Section { Label(l10n.message(error), systemImage: "exclamationmark.triangle") } }
            }
            .navigationTitle(l10n("Edit profile")).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(l10n("Cancel")) { if dirty { confirmDiscard = true } else { dismiss() } } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(l10n("Save")) {
                        draft.years = draft.years.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: ".")
                        draft.preferencesVersion = "2"
                        store.updateProfile(draft)
                        if store.storageError == nil { dismiss() }
                    }.disabled(!validYears || !validLengths || draft.criteriaError != nil || hasConflict)
                }
                ToolbarItemGroup(placement: .keyboard) { Spacer(); Button(l10n("Done")) { focused = false } }
            }
        }
        .interactiveDismissDisabled(dirty)
        .onAppear {
            if hasConflict {
                UIAccessibility.post(notification: .announcement, argument: l10n("Keep a copy of any draft text you need, then cancel and reopen this editor to use the latest profile. Your draft has not been saved."))
            }
        }
        .onChange(of: hasConflict) { conflict in
            if conflict {
                UIAccessibility.post(notification: .announcement, argument: l10n("Keep a copy of any draft text you need, then cancel and reopen this editor to use the latest profile. Your draft has not been saved."))
            }
        }
        .confirmationDialog(l10n("Discard unsaved profile changes?"), isPresented: $confirmDiscard, titleVisibility: .visible) {
            Button(l10n("Discard changes"), role: .destructive) { dismiss() }
            Button(l10n("Keep editing"), role: .cancel) { }
        }
    }
}

private struct NativeSalaryScreen: View {
    @NativeLocalization private var l10n
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
    private func amount(_ value: Double) -> String { currency + " " + value.formatted(.number.precision(.fractionLength(0...2)).locale(l10n.locale)) }
    private func clearAmounts() { basic = ""; allowances = ""; bonus = "" }
    var body: some View {
        Form {
            Section {
                NativeNotice(title: "Compare an offer in your own terms.", message: "Choose the currency and pay period, then enter your own amounts. The calculator makes no assumptions about your profession, location, current pay or seniority.")
            }.listRowBackground(Color.clear)
            Section {
                Picker(l10n("Currency"), selection: $currency) {
                    Text(l10n("Choose a currency")).tag("")
                    ForEach(NativeProfile.currencyCodes, id: \.self) { Text($0).tag($0) }
                }
                Picker(l10n("Fixed amount period"), selection: $period) {
                    Text(l10n("Monthly")).tag("monthly")
                    Text(l10n("Annual")).tag("annual")
                }
                Text(l10n("Changing currency or period clears the calculator; amounts are never silently relabeled. No exchange rates, taxes or deductions are applied.")).font(.footnote)
                TextField(l10n("Basic pay for chosen period"), text: $basic).keyboardType(.decimalPad).focused($focused)
                    .accessibilityLabel(l10n.format("Basic pay for chosen period, {0}", [String(describing: (currency.isEmpty ? l10n("currency not selected") : currency))]))
                if basicAmount == nil { Label(l10n("Use 0 to 1,000,000 with at most two decimal places."), systemImage: "exclamationmark.circle").font(.caption) }
                TextField(l10n("Fixed allowances for chosen period"), text: $allowances).keyboardType(.decimalPad).focused($focused)
                    .accessibilityLabel(l10n.format("Fixed allowances for chosen period, {0}", [String(describing: (currency.isEmpty ? l10n("currency not selected") : currency))]))
                if allowanceAmount == nil { Label(l10n("Use 0 to 1,000,000 with at most two decimal places."), systemImage: "exclamationmark.circle").font(.caption) }
                TextField(l10n("Target annual bonus, not guaranteed"), text: $bonus).keyboardType(.decimalPad).focused($focused)
                    .accessibilityLabel(l10n.format("Target annual bonus, not guaranteed, {0}", [String(describing: (currency.isEmpty ? l10n("currency not selected") : currency))]))
                if bonusAmount == nil { Label(l10n("Use 0 to 10,000,000 with at most two decimal places."), systemImage: "exclamationmark.circle").font(.caption) }
                if !currency.isEmpty, let basicAmount, let allowanceAmount, let bonusAmount {
                    let fixedCents = Int((basicAmount * 100).rounded()) + Int((allowanceAmount * 100).rounded())
                    let annualCents = fixedCents * (period == "monthly" ? 12 : 1)
                    LabeledContent(l10n(period == "annual" ? "Monthly equivalent (annual ÷ 12)" : "Fixed monthly"), value: amount(Double(annualCents) / 1200))
                    LabeledContent(l10n("Fixed annual"), value: amount(Double(annualCents) / 100))
                    LabeledContent(l10n("Including target annual bonus"), value: amount(Double(annualCents + Int((bonusAmount * 100).rounded())) / 100))
                } else {
                    Text(l10n("Choose a currency and correct any invalid amount before calculating.")).font(.footnote)
                }
            } header: { Text(l10n("Compare your entered package")) } footer: {
                Text(l10n("Arithmetic from your entries only. These temporary amounts are not saved. Target bonus is not guaranteed. Blank fields count as zero. Use a comma for thousands and a dot for decimals; Arabic digits and separators are accepted. Input with more than two decimal places is rejected. Monthly equivalents are displayed to two decimal places."))
            }
            Section(l10n("The conversation to have")) {
                Text(l10n("Ask for the budgeted pay range, its currency and payment frequency."))
                Text(l10n("Clarify the responsibilities, working hours, decision-making scope and expectations for this role."))
                Text(l10n("Get basic pay, allowances, bonus terms, medical coverage, leave and relocation support in writing."))
                Text(l10n("Use verified achievements when negotiating. Compare commute, hours, probation and progression before committing."))
            }
            Section {
                DisclosureGroup(l10n("Historical Saudi salary examples · 2025")) {
                    Text(l10n("Optional reference for selected Saudi roles. These dated examples are not a salary estimate for your profession, country or experience. The amounts keep their original monthly SAR units regardless of the calculator settings."))
                        .font(.footnote).foregroundStyle(.secondary)
                    LabeledContent(l10n("Supply Chain Manager"), value: "SAR 30,000–45,000")
                    LabeledContent(l10n("Procurement Manager"), value: "SAR 30,000–50,000")
                    Text(l10n("Hays 2025: total fixed monthly package, including fixed allowances, using Q4 2024 data for the broad Saudi market. These are not basic-salary ranges."))
                        .font(.footnote).foregroundStyle(.secondary)
                    Link(l10n("Hays 2025 guide · page 38"), destination: URL(string: "https://www.hays.ae/documents/d/hays-salary-guide-ae/hays-saudi-arabia-salary-guide-2025")!)
                    Text(l10n("The Professionals 2025 reports Supply & Demand Manager at SAR 30,220 / 42,866 / 53,710 monthly for the 25th percentile / median / 75th percentile (p.49), including basic salary, housing and transportation (p.15). Different role definitions and samples are not interchangeable."))
                        .font(.footnote).foregroundStyle(.secondary)
                    Link(l10n("The Professionals 2025 guide"), destination: URL(string: "https://theprofessionals.sa/wp-content/uploads/2026/02/Salary-Guide-2025-The-Professionals.pdf")!)
                }
            }
        }
        .onAppear { if !initialized { currency = store.workspace.profile.effectiveCurrency; period = store.workspace.profile.effectivePayPeriod; initialized = true } }
        .onChange(of: currency) { _ in clearAmounts() }
        .onChange(of: period) { _ in clearAmounts() }
        .navigationTitle(l10n("Salary & negotiation")).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button(l10n("Done")) { focused = false } } }
    }
}

private struct NativeIntro: View {
    @NativeLocalization private var l10n
    let eyebrow: String
    let title: String
    let message: String
    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            Text(l10n(eyebrow)).font(.caption2.weight(.semibold)).tracking(1.2).foregroundStyle(NativeDesign.accent)
            Text(l10n(title)).font(.title2.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
            Text(l10n(message)).font(.subheadline).foregroundStyle(.secondary).lineSpacing(3)
        }.padding(.vertical, 12).accessibilityElement(children: .combine)
    }
}

private struct NativeNotice: View {
    @NativeLocalization private var l10n
    let title: String
    let message: String
    var warning = false
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(l10n(title), systemImage: warning ? "exclamationmark.circle" : "sparkle").font(.subheadline.weight(.semibold))
            Text(l10n(message)).font(.footnote).foregroundStyle(.secondary).lineSpacing(2)
        }.padding(15).frame(maxWidth: .infinity, alignment: .leading)
            .background(warning ? Color.orange.opacity(0.1) : NativeDesign.accentSurface, in: RoundedRectangle(cornerRadius: 16))
            .accessibilityElement(children: .combine)
    }
}

private struct NativeEmpty: View {
    @NativeLocalization private var l10n
    let title: String
    let message: String
    let icon: String
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: icon).font(.title).foregroundStyle(Color.careerAccent).accessibilityHidden(true)
            Text(l10n(title)).font(.headline)
            Text(l10n(message)).font(.subheadline).foregroundStyle(.secondary)
        }.padding(.vertical, 20).accessibilityElement(children: .combine)
    }
}

private extension View {
    func settingsShortcut() -> some View {
        self.toolbar { ToolbarItem(placement: .navigationBarTrailing) { NativeSettingsButton() } }
    }
    func nativeList() -> some View {
        self.listStyle(.insetGrouped).scrollContentBackground(.hidden)
            .background(NativeDesign.canvas)
    }
}

private extension Color {
    static let careerAccent = NativeDesign.accent
}

private func nativeMatches(_ job: CareerJob, terms: [String], note: String) -> Bool {
    NativeSavedSearch.matches([job.title, job.company, job.location, job.summary, job.subtitle ?? "", note] + job.requirements, terms: terms)
}

private func nativeHTTPS(_ value: String) -> URL? {
    guard let url = URL(string: value), url.scheme?.lowercased() == "https", url.host != nil else { return nil }
    return url
}
#endif
