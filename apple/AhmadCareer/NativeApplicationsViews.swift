#if os(iOS)
import SwiftUI
import UniformTypeIdentifiers
import UIKit

private enum ApplyDesign {
    static let green = Color(red: 0.04, green: 0.38, blue: 0.27)
    static let canvas = Color(uiColor: .systemGroupedBackground)
    static let card = Color(uiColor: .secondarySystemGroupedBackground)
}

struct NativeApplicationsScreen: View {
    @StateObject private var model = NativeApplicationsStore()
    @EnvironmentObject private var career: NativeCareerStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var profileSheet = false
    @State private var connectionSheet = false
    @State private var addSheet = false
    @State private var reviewSheet = false
    @State private var activity = false
    @State private var exported: URL?
    @State private var exportSheet = false

    private var confirmed: Int {
        model.attempts.filter { MobileApplicationPolicy.isVerified($0) && $0["evidenceMode"]?.string == "live" }.count
    }
    private var uncertain: Int { model.attempts.filter { $0["state"]?.string == "uncertain" }.count }
    private var appliedURLs: Set<String> {
        // Existing self-entered statuses remain separate from provider receipts.
        Set(career.workspace.snapshots.values.filter { job in
            ["Applied", "Interviewing", "Offer received"].contains(career.workspace.statuses[job.id] ?? "")
        }.map(\.url))
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header
                if let message = model.message {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "info.circle")
                        Text(message).font(.subheadline).fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                        Button { model.message = nil } label: { Image(systemName: "xmark").padding(8) }
                            .accessibilityLabel("Dismiss message")
                    }
                    .padding(15).background(ApplyDesign.card, in: RoundedRectangle(cornerRadius: 16))
                    .accessibilityElement(children: .contain)
                }
                profileCard
                HStack(spacing: 10) {
                    metric("\(model.jobs.count)", "Opportunities", icon: "square.stack")
                    metric("\(confirmed)", "Confirmed", icon: "checkmark.seal")
                    metric("\(uncertain)", "To verify", icon: "clock.badge.questionmark")
                }
                if !model.activePlanIDs.isEmpty {
                    HStack(spacing: 12) {
                        ProgressView()
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Applications are processing").font(.subheadline.weight(.semibold))
                            Text("You can leave this screen. Receipts are saved by the service.").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                        Button("Stop") { Task { await model.stop() } }.disabled(model.busy)
                    }.padding().background(ApplyDesign.card, in: RoundedRectangle(cornerRadius: 16))
                }
                if let review = model.recoverablePlans.first(where: { candidate in
                    !model.activePlanIDs.contains(candidate["id"]?.string ?? "")
                }) {
                    Button {
                        reviewSheet = model.resumeReview(review)
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "arrow.clockwise.circle").font(.title2)
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Continue an application review").font(.subheadline.weight(.semibold))
                                Text("Your saved details and any provider cooldown are preserved.").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right").font(.caption)
                        }.padding(16).background(ApplyDesign.card, in: RoundedRectangle(cornerRadius: 16))
                    }.buttonStyle(.plain)
                }
                Picker("Applications view", selection: $activity) {
                    Text("Opportunities").tag(false)
                    Text("Application activity").tag(true)
                }.pickerStyle(.segmented)
                if activity { activityList } else { opportunities }
                coverage
            }.padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 24)
        }
        .background(ApplyDesign.canvas)
        .navigationTitle("Career Finder")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { connectionSheet = true } label: {
                    Image(systemName: model.connected ? "checkmark.shield" : "link")
                }.accessibilityLabel(model.connected ? "Manage application connection" : "Connect application service")
            }
        }
        .safeAreaInset(edge: .bottom) {
            if !activity {
                VStack(spacing: 8) {
                    Button {
                        if !model.connected { connectionSheet = true }
                        else { Task { await model.prepare(manualAppliedURLs: appliedURLs); reviewSheet = model.plan != nil } }
                    } label: {
                        HStack {
                            if model.busy { ProgressView().tint(.white) }
                            Image(systemName: "paperplane.fill")
                            Text(model.connected ? (model.selected.isEmpty ? "Select opportunities to apply" : "Review \(model.selected.count) application\(model.selected.count == 1 ? "" : "s")") : "Set up Auto Apply")
                                .font(.subheadline.weight(.semibold))
                            Spacer(minLength: 4)
                            Image(systemName: "arrow.right")
                        }.padding(16).frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain).foregroundStyle(.white)
                    .background(ApplyDesign.green, in: RoundedRectangle(cornerRadius: 16))
                    .disabled(model.busy || model.connected && model.selected.isEmpty)
                    .opacity(model.busy || model.connected && model.selected.isEmpty ? 0.65 : 1)
                    Text("Your details. Your choice. A receipt for every confirmed submission.")
                        .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }.padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 10).background(.regularMaterial)
            }
        }
        .sheet(isPresented: $profileSheet) { NativeApplicationProfileEditor(model: model) }
        .sheet(isPresented: $connectionSheet) { NativeApplicationConnection(model: model) }
        .sheet(isPresented: $addSheet) { NativeOpportunityEditor(model: model) }
        .sheet(isPresented: $reviewSheet) { NativeApplicationReview(model: model, manualAppliedURLs: appliedURLs) }
        .sheet(isPresented: $exportSheet) {
            if let exported { NativeApplicationShare(items: [exported]) }
        }
        .refreshable { await model.refresh() }
        .task { await model.refresh() }
        .task(id: model.activePlanIDs) {
            guard !model.activePlanIDs.isEmpty else { return }
            while !Task.isCancelled && !model.activePlanIDs.isEmpty {
                do { try await Task.sleep(nanoseconds: 2_000_000_000) } catch { break }
                await model.refresh()
            }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active { Task { await model.refresh() } }
        }
        .onChange(of: model.message) { value in
            if let value { UIAccessibility.post(notification: .announcement, argument: value) }
        }
    }
    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: model.mode == "test" ? "testtube.2" : "sparkle")
                Text(model.mode == "test" ? "TEST WORKSPACE" : "YOUR NEXT CHAPTER")
                    .font(.caption.weight(.semibold)).tracking(1.8)
            }.foregroundStyle(ApplyDesign.green)
            Text("A career that\nfits your life.")
                .font(.system(.largeTitle, design: .rounded, weight: .bold))
                .fixedSize(horizontal: false, vertical: true)
            Text("Bring your experience. Choose your opportunities. Apply with confidence.")
                .font(.subheadline).foregroundStyle(.secondary).lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private var profileCard: some View {
        Button { profileSheet = true } label: {
            HStack(alignment: .center, spacing: 14) {
                Image(systemName: "person.crop.rectangle")
                    .font(.title2).foregroundStyle(ApplyDesign.green)
                    .frame(width: 48, height: 56).background(ApplyDesign.green.opacity(0.09), in: RoundedRectangle(cornerRadius: 13))
                VStack(alignment: .leading, spacing: 5) {
                    Text(model.profile.firstName.isEmpty ? "Make it yours" : "\(model.profile.firstName)'s application profile")
                        .font(.headline).foregroundStyle(.primary)
                    Text(model.profileNeedsSync ? "Phone draft · ready to save" :
                            model.profile.resumeName.isEmpty ? "Add your details and a PDF CV" : model.profile.resumeName)
                        .font(.caption).foregroundStyle(.secondary).lineLimit(2)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(.secondary)
            }.padding(17).background(ApplyDesign.card, in: RoundedRectangle(cornerRadius: 20))
        }.buttonStyle(.plain)
    }
    private func metric(_ value: String, _ label: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon).font(.subheadline).foregroundStyle(.secondary)
            Text(value).font(.system(.title2, design: .rounded, weight: .semibold)).monospacedDigit()
            Text(label).font(.caption2).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(14)
            .background(ApplyDesign.card, in: RoundedRectangle(cornerRadius: 16))
            .accessibilityElement(children: .combine)
    }
    private var opportunities: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Your opportunities").font(.title3.weight(.semibold))
                Spacer()
                Button { addSheet = true } label: { Label("Add", systemImage: "plus").font(.subheadline.weight(.semibold)).padding(.vertical, 10) }
            }
            if model.jobs.isEmpty {
                empty(icon: "square.stack.3d.up", title: "Your next move starts here.",
                      detail: "Save a job link from any industry or country. You decide which opportunities belong in your next chapter.")
                Button { addSheet = true } label: { Label("Add your first opportunity", systemImage: "plus").frame(maxWidth: .infinity).padding(14) }
                    .buttonStyle(.bordered).tint(ApplyDesign.green)
            }
            ForEach(Array(model.jobs.enumerated()), id: \.offset) { _, job in
                let id = job["id"]?.string ?? ""
                VStack(alignment: .leading, spacing: 12) {
                    Button {
                        if model.selected.contains(id) { model.selected.remove(id) }
                        else if model.selected.count < 20 { model.selected.insert(id) }
                        else { model.message = "Review up to 20 opportunities in one batch." }
                    } label: {
                        HStack(alignment: .top, spacing: 12) {
                            Text(String((job["company"]?.string ?? "?").prefix(1)).uppercased())
                                .font(.title3.weight(.semibold)).foregroundStyle(ApplyDesign.green)
                                .frame(width: 42, height: 42).background(ApplyDesign.green.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                            VStack(alignment: .leading, spacing: 5) {
                                Text(job["title"]?.string ?? "Opportunity").font(.headline).foregroundStyle(.primary)
                                Text(job["company"]?.string ?? "").font(.subheadline).foregroundStyle(.secondary)
                                if let location = job["location"]?.string, !location.isEmpty {
                                    Label(location, systemImage: "mappin").font(.caption).foregroundStyle(.secondary)
                                }
                            }.frame(maxWidth: .infinity, alignment: .leading)
                            Image(systemName: model.selected.contains(id) ? "checkmark.circle.fill" : "circle")
                                .font(.title2).foregroundStyle(model.selected.contains(id) ? ApplyDesign.green : Color.secondary)
                                .frame(minWidth: 30, minHeight: 44)
                        }
                    }.buttonStyle(.plain)
                        .accessibilityLabel("\(job["title"]?.string ?? "Opportunity") at \(job["company"]?.string ?? "")")
                        .accessibilityValue(model.selected.contains(id) ? "Selected" : "Not selected")
                        .accessibilityHint("Select for application review")
                    HStack(spacing: 8) {
                        Text(job["provider"]?.string == "lever" ? "Lever · eligibility checked at review" : "Employer website")
                            .font(.caption2).foregroundStyle(.secondary)
                        Spacer()
                        if let raw = job["url"]?.string, let url = MobileApplicationPolicy.jobURL(raw) {
                            Link(destination: url) { Label("View", systemImage: "arrow.up.right").font(.caption.weight(.semibold)).padding(.vertical, 8) }
                        }
                    }
                }.padding(17).background(ApplyDesign.card, in: RoundedRectangle(cornerRadius: 18))
            }
        }
    }
    private var activityList: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Every attempt, accounted for.").font(.headline)
                Spacer()
                if !model.attempts.isEmpty {
                    Button { Task { exported = await model.exportReceipts(); exportSheet = exported != nil } } label: {
                        Image(systemName: "square.and.arrow.up").frame(minWidth: 44, minHeight: 44)
                    }.accessibilityLabel("Export application receipts")
                }
            }
            if model.attempts.isEmpty {
                empty(icon: "checkmark.seal", title: "Receipts will live here.",
                      detail: "A confirmed application includes a provider receipt. Opening a job link or preparing a draft never counts as a submission.")
            }
            ForEach(Array(model.attempts.reversed().enumerated()), id: \.offset) { _, attempt in
                NativeApplicationReceipt(attempt: attempt)
            }
        }
    }
    private var coverage: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("A workspace for every career", systemImage: "globe").font(.subheadline.weight(.semibold))
            Text("Save opportunities from any country or profession. Auto Apply works with connected employers whose application requirements are supported. Other jobs open on the employer's website.")
                .font(.caption).foregroundStyle(.secondary).lineSpacing(3)
            if !model.connected {
                Text("Automatic submission needs an activated application service. Your phone workspace remains available while it is disconnected.")
                    .font(.caption).foregroundStyle(.secondary).lineSpacing(3)
            }
        }.padding(.vertical, 6)
    }
    private func empty(icon: String, title: String, detail: String) -> some View {
        VStack(spacing: 15) {
            Image(systemName: icon).font(.system(size: 31, weight: .light)).foregroundStyle(ApplyDesign.green)
                .frame(width: 72, height: 72).background(ApplyDesign.green.opacity(0.07), in: RoundedRectangle(cornerRadius: 23))
            Text(title).font(.headline).multilineTextAlignment(.center)
            Text(detail).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center).lineSpacing(3)
        }.frame(maxWidth: .infinity).padding(.horizontal, 24).padding(.vertical, 30)
            .background(ApplyDesign.card, in: RoundedRectangle(cornerRadius: 20))
    }
}

private struct NativeApplicationProfileEditor: View {
    @ObservedObject var model: NativeApplicationsStore
    @Environment(\.dismiss) private var dismiss
    @State private var draft: PhoneApplicationProfile
    @State private var pickingPDF = false
    @State private var issue: String?
    @State private var expectedRevision: Int
    init(model: NativeApplicationsStore) {
        self.model = model; _draft = State(initialValue: model.profile)
        _expectedRevision = State(initialValue: model.revision)
    }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Use your own experience and the CV you want employers to receive. Nothing is submitted when you save this profile.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                if let issue { Section { Text(issue).foregroundStyle(.red).accessibilityAddTraits(.updatesFrequently) } }
                Section("About you") {
                    TextField("First name", text: $draft.firstName).textContentType(.givenName)
                    TextField("Last name", text: $draft.lastName).textContentType(.familyName)
                    TextField("Email", text: $draft.email).textContentType(.emailAddress).keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("Phone (optional)", text: $draft.phone).textContentType(.telephoneNumber).keyboardType(.phonePad)
                    TextField("City (optional)", text: $draft.city).textContentType(.addressCity)
                    Picker("Country or region", selection: $draft.country) {
                        Text("Choose (optional)").tag("")
                        ForEach(Locale.Region.isoRegions.map(\.identifier).sorted { countryName($0) < countryName($1) }, id: \.self) { code in
                            Text(countryName(code)).tag(code)
                        }
                    }
                }
                Section {
                    Button { pickingPDF = true } label: {
                        Label(draft.resumeName.isEmpty ? "Choose your PDF CV" : draft.resumeName, systemImage: "doc.badge.plus")
                            .lineLimit(2).padding(.vertical, 8)
                    }
                    if !draft.resumeName.isEmpty {
                        Button("Remove CV", role: .destructive) {
                            draft.resumeData = nil; draft.resumeName = ""; draft.resumeRemoved = true; draft.resumeChanged = true
                        }
                    }
                } header: { Text("Your CV") } footer: {
                    Text("PDF · up to 5 MB. The selected file is used exactly as provided. Each submission receipt records its fingerprint.")
                }
                Section("Your experience") {
                    TextField("Professional headline (optional)", text: $draft.headline, axis: .vertical)
                    TextField("Skills, separated by commas", text: $draft.skills, axis: .vertical)
                    TextField("Portfolio HTTPS link (optional)", text: $draft.website)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Picker("Career stage", selection: $draft.experienceLevel) {
                        Text("Any / not specified").tag("any")
                        Text("Entry level").tag("entry")
                        Text("Mid level").tag("mid")
                        Text("Senior").tag("senior")
                    }
                }
                Section {
                    TextField("Target roles, separated by commas", text: $draft.targetRoles, axis: .vertical)
                    TextField("Target country codes, e.g. SA, AE", text: $draft.targetCountries)
                        .textInputAutocapitalization(.characters).autocorrectionDisabled()
                    Toggle("Remote", isOn: $draft.remote)
                    Toggle("Hybrid", isOn: $draft.hybrid)
                    Toggle("On site", isOn: $draft.onsite)
                } header: { Text("What comes next") } footer: {
                    Text("These preferences describe your goals. They do not establish work authorization or qualify you for a role.")
                }
                Section {
                    Text(model.connected ? "Saving synchronizes these details with your connected application service." :
                            "Your draft is stored privately on this phone. Connect an application service when you are ready to submit.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }.navigationTitle("Application profile").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") { Task { if await model.saveProfile(draft, expectedRevision: expectedRevision) { dismiss() } else { issue = model.message } } }
                            .disabled(model.busy)
                    }
                }
                .fileImporter(isPresented: $pickingPDF, allowedContentTypes: [.pdf]) { result in
                    do {
                        let url = try result.get()
                        let scoped = url.startAccessingSecurityScopedResource()
                        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                        guard size <= MobileApplicationPolicy.maximumResumeBytes else { throw MobileApplicationError(message: "Choose a PDF no larger than 5 MB.") }
                        let data = try Data(contentsOf: url, options: .mappedIfSafe)
                        if let error = MobileApplicationPolicy.resumeError(data, filename: url.lastPathComponent) { throw MobileApplicationError(message: error) }
                        draft.resumeData = data; draft.resumeName = url.lastPathComponent
                        draft.resumeChanged = true; draft.resumeRemoved = false; issue = nil
                    } catch { issue = error.localizedDescription }
                }
        }.tint(ApplyDesign.green).interactiveDismissDisabled(model.busy)
    }
    private func countryName(_ code: String) -> String { Locale.current.localizedString(forRegionCode: code) ?? code }
}

private struct NativeOpportunityEditor: View {
    @ObservedObject var model: NativeApplicationsStore
    @Environment(\.dismiss) private var dismiss
    @State private var url = ""
    @State private var title = ""
    @State private var company = ""
    @State private var location = ""
    @State private var country = ""
    @State private var issue: String?
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://…", text: $url).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                } header: { Text("Job link") } footer: {
                    Text("Use the employer's job posting. Connected Lever postings can import their published details.")
                }
                Section("Opportunity details") {
                    TextField("Role title", text: $title)
                    TextField("Employer", text: $company)
                    TextField("Location or remote", text: $location)
                    Picker("Country or region", selection: $country) {
                        Text("Not specified").tag("")
                        ForEach(Locale.Region.isoRegions.map(\.identifier).sorted(), id: \.self) { code in
                            Text(Locale.current.localizedString(forRegionCode: code) ?? code).tag(code)
                        }
                    }
                }
                if let issue { Section { Text(issue).foregroundStyle(.red) } }
                Section {
                    Text("Saving a job does not apply to it. Automatic submission eligibility is checked when you review your selection.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }.navigationTitle("Add opportunity").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Add") { Task {
                            if await model.addJob(url: url, title: title, company: company, location: location, country: country) { dismiss() }
                            else { issue = model.message }
                        } }.disabled(model.busy || url.isEmpty)
                    }
                }
        }.tint(ApplyDesign.green).interactiveDismissDisabled(model.busy)
    }
}

private struct NativeApplicationConnection: View {
    @ObservedObject var model: NativeApplicationsStore
    @Environment(\.dismiss) private var dismiss
    @State private var address = ""
    @State private var code = ""
    @State private var issue: String?
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Image(systemName: "lock.shield").font(.largeTitle).foregroundStyle(ApplyDesign.green).padding(.vertical, 8)
                    Text(model.connected ? "Your application workspace is connected." : "Connect once. Keep every receipt.")
                        .font(.title3.weight(.semibold))
                    Text("Your application service keeps submission attempts and provider receipts so closing the app cannot cause an automatic duplicate.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                if model.connected {
                    Section("Connected service") {
                        Text(model.serviceAddress).font(.footnote).textSelection(.enabled)
                        Button("Refresh applications") { Task { await model.refresh() } }
                        Button("Disconnect this phone", role: .destructive) { Task { await model.disconnect(); if !model.connected { dismiss() } } }
                    }
                } else {
                    Section {
                        TextField("https://service.example", text: $address).keyboardType(.URL)
                            .textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityLabel("Application service HTTPS address")
                        SecureField("One-time invitation code", text: $code).textInputAutocapitalization(.characters).autocorrectionDisabled()
                    } header: { Text("Your invitation") } footer: {
                        Text("Use the service address and short-lived code from your workspace invitation. A provider integration must be activated before automatic submission is available.")
                    }
                    Button {
                        Task {
                            if await model.connect(address: address, code: code) { code = ""; dismiss() }
                            else { code = ""; issue = model.message }
                        }
                    } label: {
                        HStack { if model.busy { ProgressView() }; Text("Connect securely") }
                    }.disabled(model.busy || address.isEmpty || code.isEmpty)
                }
                if let issue { Section { Text(issue).foregroundStyle(.red) } }
                Section {
                    Text("Saved phone drafts stay on your device until you explicitly save them to the connected service. Your connection token is kept in the iPhone Keychain.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }.navigationTitle("Application connection").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
        }.tint(ApplyDesign.green).interactiveDismissDisabled(model.busy)
    }
}

private struct NativeApplicationReview: View {
    @ObservedObject var model: NativeApplicationsStore
    let manualAppliedURLs: Set<String>
    @Environment(\.dismiss) private var dismiss
    @State private var approved = false
    @State private var changed = false
    private var items: [[String: ApplicationValue]] { model.plan?["items"]?.array.map(\.object) ?? [] }
    private var previouslyApproved: Bool { model.plan?["approvedAt"]?.string != nil }
    private func eligible(_ item: [String: ApplicationValue]) -> Bool {
        if item["state"]?.string == "ready" { return true }
        if item["state"]?.string == "rate_limited", let raw = item["retryAt"]?.string,
           let date = Self.dateFormatter.date(from: raw) { return date <= Date() }
        return false
    }
    private static let dateFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f
    }()
    private var ready: Int { items.filter(eligible).count }
    private let fieldLabels = ["name": "Name", "email": "Email", "phone": "Phone", "website": "Portfolio", "comments": "Message",
                               "consentStore": "Application data permission", "consentMarketing": "Future opportunities"]
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("One final look.").font(.largeTitle.weight(.bold))
                    Text("Review the exact details below. Only eligible applications in this review will be sent.")
                        .font(.subheadline).foregroundStyle(.secondary)
                    if model.mode == "test" {
                        Label("Test workspace — no real employer application", systemImage: "testtube.2").foregroundStyle(.orange)
                    }
                }
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    let job = item["job"]?.object ?? [:]
                    let jobID = item["jobId"]?.string ?? ""
                    Section {
                        Text(job["title"]?.string ?? "Opportunity").font(.headline)
                        Text(job["company"]?.string ?? "").foregroundStyle(.secondary)
                        if eligible(item) {
                            Label("Ready for your approval", systemImage: "checkmark.circle").foregroundStyle(ApplyDesign.green)
                        } else {
                            Label(item["reason"]?.string ?? "Complete this application on the employer's website.", systemImage: "exclamationmark.circle")
                                .font(.subheadline).foregroundStyle(.orange)
                        }
                        let summary = item["payloadSummary"]?.object ?? [:]
                        ForEach(summary.keys.sorted(), id: \.self) { key in
                            LabeledContent(fieldLabels[key] ?? key, value: summary[key]?.display ?? "")
                                .font(.subheadline)
                        }
                        if let name = item["resume"]?.object["name"]?.string {
                            Label(name, systemImage: "doc.text").font(.subheadline)
                        }
                        if let raw = item["privacyPolicyUrl"]?.string, let url = MobileApplicationPolicy.jobURL(raw) {
                            Link("Read this employer's privacy policy", destination: url)
                        }
                        if !previouslyApproved { DisclosureGroup("Application choices") {
                            TextField("Message to this employer (optional)", text: Binding(
                                get: { model.answers[jobID]?["comments"]?.string ?? "" },
                                set: { model.answers[jobID, default: [:]]["comments"] = .string($0); changed = true; approved = false }
                            ), axis: .vertical)
                            Picker("Store and process this application", selection: consentBinding(jobID, "consentStore")) {
                                Text("Not answered").tag("")
                                Text("I agree").tag("yes")
                                Text("I do not agree").tag("no")
                            }
                            Picker("Contact me about future roles", selection: consentBinding(jobID, "consentMarketing")) {
                                Text("Not answered").tag("")
                                Text("Yes").tag("yes")
                                Text("No").tag("no")
                            }
                            Text("Review this employer's policy before choosing. These choices are only included after you update the review.")
                                .font(.caption).foregroundStyle(.secondary)
                        } }
                        if item["state"]?.string == "rate_limited", let retry = item["retryAt"]?.string {
                            Text("Retry becomes available after \(retry). Refresh this review when the waiting period ends.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                if changed {
                    Section {
                        Button("Update review with my choices") {
                            Task {
                                let previous = model.plan?["digest"]?.string
                                await model.prepare(manualAppliedURLs: manualAppliedURLs)
                                if model.plan?["digest"]?.string != previous { changed = false; approved = false }
                            }
                        }.disabled(model.busy)
                        if let message = model.message { Text(message).font(.caption).foregroundStyle(.secondary) }
                    }
                }
                Section {
                    Toggle("I approve sending these details and my selected CV to the listed eligible employers.", isOn: $approved)
                        .font(.subheadline)
                    if model.profileNeedsSync {
                        Text("Save your current application details before approving this review.")
                            .font(.caption).foregroundStyle(.orange)
                    }
                    Text("An uncertain result will stay paused for verification. Opening an employer link does not count as a submission.")
                        .font(.caption).foregroundStyle(.secondary)
                    if previouslyApproved {
                        Text("This restores the same reviewed details. Stop this review first if you need to change them.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                Section {
                    Button {
                        Task { await model.submitReviewed(); dismiss() }
                    } label: {
                        Label("Auto Apply to \(ready) job\(ready == 1 ? "" : "s")", systemImage: "paperplane.fill")
                            .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 10)
                    }.buttonStyle(.borderedProminent).tint(ApplyDesign.green)
                        .disabled(!approved || changed || ready == 0 || model.busy || model.profileNeedsSync)
                }
                if let id = model.plan?["id"]?.string {
                    Section {
                        Button("Stop this review", role: .destructive) {
                            Task { await model.stopReview(id); if model.plan == nil { dismiss() } }
                        }.disabled(model.busy)
                    }
                }
            }.navigationTitle("Review applications").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Back") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Refresh") {
                            Task {
                                let id = model.plan?["id"]?.string
                                await model.refresh()
                                if let latest = model.recoverablePlans.first(where: { $0["id"]?.string == id }) { model.resumeReview(latest) }
                            }
                        }.disabled(model.busy)
                    }
                }
        }.tint(ApplyDesign.green).interactiveDismissDisabled(model.busy)
            .onChange(of: model.plan?["digest"]?.string) { _ in approved = false }
    }
    private func consentBinding(_ jobID: String, _ field: String) -> Binding<String> {
        Binding(get: {
            guard let value = model.answers[jobID]?[field] else { return "" }
            return value.bool ? "yes" : "no"
        }, set: { choice in
            if choice.isEmpty { model.answers[jobID, default: [:]].removeValue(forKey: field) }
            else { model.answers[jobID, default: [:]][field] = .bool(choice == "yes") }
            changed = true; approved = false
        })
    }
}

private struct NativeApplicationReceipt: View {
    let attempt: [String: ApplicationValue]
    private var test: Bool { attempt["evidenceMode"]?.string == "test" }
    private var verified: Bool { MobileApplicationPolicy.isVerified(attempt) }
    private var state: String {
        let state = attempt["state"]?.string ?? ""
        return state == "confirmed" && !verified ? "uncertain" : state
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(attempt["title"]?.string ?? attempt["job"]?.object["title"]?.string ?? "Application").font(.headline)
                    Text(attempt["company"]?.string ?? attempt["job"]?.object["company"]?.string ?? "").font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                Image(systemName: verified ? "checkmark.seal.fill" : state == "uncertain" ? "clock.badge.questionmark" : "paperplane")
                    .foregroundStyle(verified && !test ? ApplyDesign.green : Color.secondary)
            }
            Text(MobileApplicationPolicy.stateTitle(state, test: test)).font(.caption.weight(.semibold))
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background((verified && !test ? ApplyDesign.green : Color.secondary).opacity(0.09), in: Capsule())
            if state == "uncertain" {
                Text("The service could not establish whether the employer accepted this application. It will not be sent again automatically.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let message = attempt["error"]?.object["message"]?.string ?? attempt["reason"]?.string, !message.isEmpty {
                Text(message).font(.caption).foregroundStyle(.secondary)
            }
            DisclosureGroup("Receipt details") {
                VStack(alignment: .leading, spacing: 10) {
                    if let id = attempt["applicationId"]?.string, verified {
                        LabeledContent("Provider application ID", value: id).textSelection(.enabled)
                    }
                    if let at = attempt["confirmedAt"]?.string ?? attempt["dispatchedAt"]?.string {
                        LabeledContent("Recorded at", value: at).textSelection(.enabled)
                    }
                    ForEach(["attemptId", "resumeSHA256", "payloadSHA256", "requirementsRevision"], id: \.self) { key in
                        if let value = attempt[key]?.string {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(key == "resumeSHA256" ? "CV fingerprint" : key == "payloadSHA256" ? "Application fingerprint" :
                                        key == "attemptId" ? "Attempt ID" : "Employer requirements version").foregroundStyle(.secondary)
                                Text(value).font(.caption.monospaced()).textSelection(.enabled)
                            }
                        }
                    }
                    if test { Text("Synthetic test evidence. This is not a real employer receipt.").foregroundStyle(.orange) }
                }.font(.caption).padding(.top, 10)
            }.font(.caption)
        }.padding(17).background(ApplyDesign.card, in: RoundedRectangle(cornerRadius: 18))
    }
}

private struct NativeApplicationShare: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
#endif
