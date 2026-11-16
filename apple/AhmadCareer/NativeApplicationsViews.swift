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
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
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
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(spacing: 10) { metrics }
                } else { HStack(spacing: 10) { metrics } }
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
                ForEach(model.availableReviews) { review in
                    Button {
                        reviewSheet = model.resumeReview(review.value)
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "arrow.clockwise.circle").font(.title2)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(review.title).font(.subheadline.weight(.semibold))
                                    .fixedSize(horizontal: false, vertical: true)
                                Text("Continue review · \(review.items.count) application\(review.items.count == 1 ? "" : "s")")
                                    .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                                if let created = ApplicationReviewPolicy.date(review.value["createdAt"]?.string) {
                                    Text(created.formatted(date: .abbreviated, time: .shortened)).font(.caption2).foregroundStyle(.secondary)
                                }
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right").font(.caption)
                        }.padding(16).background(ApplyDesign.card, in: RoundedRectangle(cornerRadius: 16))
                    }.buttonStyle(.plain).disabled(model.busy)
                        .accessibilityLabel("Continue review for \(review.title), \(review.items.count) applications")
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
                    Text(model.profileHasConflict ? "Phone draft · resolve profile changes" : model.profileNeedsSync ? "Phone draft · ready to save" :
                            model.profile.resumeName.isEmpty ? "Add your details and a PDF CV" : model.profile.resumeName)
                        .font(.caption).foregroundStyle(.secondary).lineLimit(2)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(.secondary)
            }.padding(17).background(ApplyDesign.card, in: RoundedRectangle(cornerRadius: 20))
        }.buttonStyle(.plain).disabled(model.busy)
    }
    @ViewBuilder private var metrics: some View {
        metric("\(model.jobs.count)", "Opportunities", icon: "square.stack")
        metric("\(confirmed)", "Confirmed", icon: "checkmark.seal")
        metric("\(uncertain)", "To verify", icon: "clock.badge.questionmark")
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
                Button { addSheet = true } label: { Label("Add", systemImage: "plus").font(.subheadline.weight(.semibold)).padding(.vertical, 10) }.disabled(model.busy)
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
                    }.buttonStyle(.plain).disabled(model.busy)
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
                    if job["localOnly"]?.bool == true {
                        HStack {
                            Text("Saved on this phone").font(.caption2).foregroundStyle(.secondary)
                            Spacer()
                            Button("Remove saved link", role: .destructive) { model.removeLocalJob(id) }
                                .font(.caption).disabled(model.busy)
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
    @Environment(\.scenePhase) private var scenePhase
    @State private var draft: PhoneApplicationProfile
    @State private var original: PhoneApplicationProfile
    @State private var originallyDirty: Bool
    @State private var context: ApplicationProfileEditContext
    @State private var pickingPDF = false
    @State private var readingPDF = false
    @State private var issue: String?
    @State private var dismissalChoice = false
    @State private var replaceChoice = false
    @State private var checkpointed = false
    @State private var closingIntentionally = false

    init(model: NativeApplicationsStore) {
        self.model = model
        _draft = State(initialValue: model.profile); _original = State(initialValue: model.profile)
        _originallyDirty = State(initialValue: model.profileNeedsSync); _context = State(initialValue: model.editContext)
    }
    private var changed: Bool { draft != original }
    private var conflicts: Bool { model.hasConflict(for: context) }
    private var occupied: Bool { model.busy || readingPDF }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Use your own experience and the CV you want employers to receive. Saving this profile does not submit an application.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                if let issue { Section { Text(issue).foregroundStyle(.red).accessibilityAddTraits(.updatesFrequently) } }
                if conflicts {
                    Section {
                        Text("Your phone draft is kept. The service has a different version, so choose which details to keep before saving.")
                            .font(.subheadline).fixedSize(horizontal: false, vertical: true)
                        if let remote = model.latestServerProfile, let version = model.latestServerRevision {
                            DisclosureGroup("Compare the service profile") { serverProfile(remote) }
                            Button("Keep my phone draft against this version") {
                                if model.keepDraftAfterReview(draft, context: context, serverRevision: version) { resetFromModel() }
                                else { issue = model.message }
                            }
                            Button("Replace phone draft with service version", role: .destructive) { replaceChoice = true }
                        } else {
                            Button("Refresh service profile") { Task { await model.refresh() } }
                        }
                    } header: { Text("Resolve profile changes") } footer: {
                        Text("Keeping your draft does not upload it. Review the CV and then tap Save. An unchanged CV will use the current service file.")
                    }
                }
                Section("About you") {
                    TextField("First or single name", text: $draft.firstName).textContentType(.givenName)
                    TextField("Last name (optional)", text: $draft.lastName).textContentType(.familyName)
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
                            .fixedSize(horizontal: false, vertical: true).padding(.vertical, 8)
                    }
                    if readingPDF { ProgressView("Reading your selected PDF") }
                    if !draft.resumeName.isEmpty {
                        if let size = draft.resumeSize { Text(ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file)).font(.caption).foregroundStyle(.secondary) }
                        Text(draft.resumeData == nil ? "CV stored in this application workspace." : "Exact file bytes saved with your phone draft.")
                            .font(.caption).foregroundStyle(.secondary)
                        if let hash = draft.resumeSHA256 {
                            DisclosureGroup("CV fingerprint") {
                                Text(hash).font(.caption.monospaced()).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        Button("Remove CV", role: .destructive) { draft.removeResume() }
                    }
                } header: { Text("Your CV") } footer: {
                    Text("PDF · up to 5 MB. A copied snapshot of the selected file is retained; changes to the original file do not change your saved selection.")
                }
                Section("Your experience") {
                    TextField("Professional headline (optional)", text: $draft.headline, axis: .vertical)
                    TextField("Skills, separated by commas", text: $draft.skills, axis: .vertical)
                    TextField("Portfolio HTTPS link (optional)", text: $draft.website)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Picker("Career stage", selection: $draft.experienceLevel) {
                        Text("Any / not specified").tag("any"); Text("Entry level").tag("entry")
                        Text("Mid level").tag("mid"); Text("Senior").tag("senior")
                    }
                }
                Section {
                    TextField("Target roles, separated by commas", text: $draft.targetRoles, axis: .vertical)
                    TextField("Target country codes, e.g. SA, AE", text: $draft.targetCountries)
                        .textInputAutocapitalization(.characters).autocorrectionDisabled()
                    Toggle("Remote", isOn: $draft.remote); Toggle("Hybrid", isOn: $draft.hybrid); Toggle("On site", isOn: $draft.onsite)
                } header: { Text("What comes next") } footer: {
                    Text("These preferences describe your goals. They do not establish work authorization or qualify you for a role.")
                }
                Section {
                    Text(model.connected ? "Save synchronizes these details with your connected application service." :
                            "Your draft is stored privately on this phone. Connect an application service when you are ready to submit.")
                        .font(.caption).foregroundStyle(.secondary)
                    if changed {
                        Text("Use Cancel to save a phone draft, keep editing, or discard changes. Backgrounding the app keeps a local draft without uploading it.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .disabled(occupied)
            .navigationTitle("Application profile").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        if changed { dismissalChoice = true }
                        else { closingIntentionally = true; dismiss() }
                    }.disabled(occupied)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            if await model.saveProfile(draft, context: context) { closingIntentionally = true; dismiss() }
                            else { issue = model.message }
                        }
                    }.disabled(occupied || conflicts)
                }
            }
            .fileImporter(isPresented: $pickingPDF, allowedContentTypes: [.pdf]) { result in
                do {
                    let url = try result.get()
                    Task {
                        readingPDF = true
                        let scoped = url.startAccessingSecurityScopedResource()
                        defer { if scoped { url.stopAccessingSecurityScopedResource() }; readingPDF = false }
                        do {
                            let bytes = try await Task.detached(priority: .userInitiated) { try MobileApplicationPolicy.readResume(at: url) }.value
                            try draft.selectResume(bytes, filename: url.lastPathComponent); issue = nil
                        } catch {
                            if !MobileApplicationPolicy.isFileSelectionCancelled(error) { issue = error.localizedDescription }
                        }
                    }
                } catch {
                    if !MobileApplicationPolicy.isFileSelectionCancelled(error) { issue = error.localizedDescription }
                }
            }
            .confirmationDialog("Keep your profile changes?", isPresented: $dismissalChoice, titleVisibility: .visible) {
                Button("Save draft on this phone") {
                    if model.keepProfileDraft(draft, context: context) { closingIntentionally = true; dismiss() }
                    else { issue = model.message }
                }
                Button("Discard changes", role: .destructive) {
                    if !checkpointed || model.discardCheckpoint(restoring: original, wasDirty: originallyDirty, context: context) {
                        closingIntentionally = true; dismiss()
                    } else { issue = model.message }
                }
                Button("Keep editing", role: .cancel) {}
            } message: { Text("Saving a phone draft does not upload details or submit an application.") }
            .confirmationDialog("Replace this phone draft?", isPresented: $replaceChoice, titleVisibility: .visible) {
                Button("Use service version", role: .destructive) {
                    if model.useLatestProfile(context: context) { resetFromModel() }
                    else { issue = model.message }
                }
                Button("Keep editing", role: .cancel) {}
            } message: { Text("This replaces the phone draft and any PDF selected only on this phone.") }
        }
        .tint(ApplyDesign.green).interactiveDismissDisabled(occupied || changed)
        .onAppear { model.profileEditing = true }
        .onDisappear {
            model.profileEditing = false
            if changed && !closingIntentionally && !model.busy {
                _ = model.keepProfileDraft(draft, context: context)
            }
        }
        .onChange(of: scenePhase) { phase in
            if phase != .active && changed && !occupied {
                if model.keepProfileDraft(draft, context: context) { checkpointed = true }
                else { issue = model.message }
            }
        }
    }
    private func resetFromModel() {
        draft = model.profile; original = draft; originallyDirty = model.profileNeedsSync
        context = model.editContext; checkpointed = false; issue = nil
    }
    private func serverProfile(_ profile: PhoneApplicationProfile) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            profileField("Name", [profile.firstName, profile.lastName].filter { !$0.isEmpty }.joined(separator: " "))
            profileField("Email", profile.email); profileField("Phone", profile.phone)
            profileField("Location", [profile.city, profile.country].filter { !$0.isEmpty }.joined(separator: ", "))
            profileField("Headline", profile.headline); profileField("Skills", profile.skills)
            profileField("Portfolio", profile.website); profileField("Career stage", profile.experienceLevel)
            profileField("Target roles", profile.targetRoles); profileField("Target countries", profile.targetCountries)
            profileField("Work preferences", [profile.remote ? "Remote" : nil, profile.hybrid ? "Hybrid" : nil, profile.onsite ? "On site" : nil].compactMap { $0 }.joined(separator: ", "))
            profileField("CV", profile.resumeName)
            if let hash = profile.resumeSHA256 { profileField("CV fingerprint", hash) }
        }.padding(.vertical, 8)
    }
    private func profileField(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value.isEmpty ? "Not provided" : value).font(.subheadline).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
        }.accessibilityElement(children: .combine)
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
            }.disabled(model.busy).navigationTitle("Add opportunity").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(model.busy) }
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
    init(model: NativeApplicationsStore) {
        self.model = model; _address = State(initialValue: model.serviceAddress)
    }
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
                if let issue = issue ?? model.message { Section { Text(issue).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true) } }
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
    @State private var discardChoices = false
    private var items: [[String: ApplicationValue]] { model.plan?["items"]?.array.map(\.object) ?? [] }
    private var previouslyApproved: Bool { model.plan?["approvedAt"]?.string != nil }
    private func eligible(_ item: [String: ApplicationValue]) -> Bool {
        ApplicationReviewPolicy.eligible(item)
    }
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
                            VStack(alignment: .leading, spacing: 4) {
                                Text(fieldLabels[key] ?? key).font(.caption).foregroundStyle(.secondary)
                                Text(summary[key]?.display ?? "Not provided").font(.subheadline)
                                    .textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                            }.accessibilityElement(children: .combine)
                        }
                        if let name = item["resume"]?.object["name"]?.string {
                            Label(name, systemImage: "doc.text").font(.subheadline).fixedSize(horizontal: false, vertical: true)
                            if let size = item["resume"]?.object["size"]?.integer {
                                Text(ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file)).font(.caption).foregroundStyle(.secondary)
                            }
                            if let hash = item["resume"]?.object["sha256"]?.string {
                                DisclosureGroup("CV fingerprint") {
                                    Text(hash).font(.caption.monospaced()).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                                }
                            }
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
                            Text("Review this employer's policy before choosing. You can explicitly decline future-role contact. Changed choices are included only after you update the review.")
                                .font(.caption).foregroundStyle(.secondary)
                        } }
                        if item["state"]?.string == "rate_limited", let retry = ApplicationReviewPolicy.date(item["retryAt"]?.string) {
                            Text("Retry becomes available after \(retry.formatted(date: .abbreviated, time: .shortened)). Refresh this review when the waiting period ends.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                if changed {
                    Section {
                        Button("Update review with my choices") {
                            Task {
                                let previous = model.plan?["digest"]?.string
                                await model.prepare(manualAppliedURLs: manualAppliedURLs, replacingUnapprovedReview: true)
                                if let current = model.plan?["digest"]?.string, current != previous { changed = false; approved = false }
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
                        Task { if await model.submitReviewed() { dismiss() } }
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
            }.disabled(model.busy).navigationTitle("Review applications").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Back") { if changed { discardChoices = true } else { dismiss() } }.disabled(model.busy)
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Refresh") {
                            Task {
                                await model.refresh()
                            }
                        }.disabled(model.busy)
                    }
                }
            .confirmationDialog("Discard changes to this review?", isPresented: $discardChoices, titleVisibility: .visible) {
                Button("Discard changes and go back", role: .destructive) {
                    if let current = model.plan { _ = model.resumeReview(current) }
                    dismiss()
                }
                Button("Keep editing", role: .cancel) {}
            } message: { Text("The saved review remains available. Your unreviewed message and permission changes will be discarded.") }
        }.tint(ApplyDesign.green).interactiveDismissDisabled(model.busy || changed)
            .onChange(of: model.plan?["digest"]?.string) { _ in approved = false }
            .onChange(of: model.plan?["approvedAt"]?.string) { _ in approved = false; changed = false }
            .onChange(of: model.plan?["id"]?.string) { id in if id == nil { dismiss() } }
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
