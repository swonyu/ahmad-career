#if os(iOS)
import SwiftUI
import UniformTypeIdentifiers
import UIKit

private enum ApplyDesign {
    static let green = Color(red: 0.04, green: 0.38, blue: 0.27)
    static let accent = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark ? UIColor(red: 0.47, green: 0.83, blue: 0.70, alpha: 1)
            : UIColor(red: 0.04, green: 0.38, blue: 0.27, alpha: 1)
    })
    static let canvas = Color(uiColor: .systemGroupedBackground)
    static let card = Color(uiColor: .secondarySystemGroupedBackground)
}

struct NativeApplicationRow: Identifiable {
    let id: String
    let value: [String: ApplicationValue]
    init?(_ value: [String: ApplicationValue], idKey: String = "id") {
        guard let id = value[idKey]?.string ?? value["attemptId"]?.string, !id.isEmpty else { return nil }
        self.id = id; self.value = value
    }
}

struct NativeProfileEssentials: View {
    let profile: PhoneApplicationProfile
    private var readiness: ApplicationProfileReadiness { ApplicationProfileReadiness(profile: profile) }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            essential(readiness.nameReady ? "Name added" : "Name needed", ready: readiness.nameReady, id: "name")
            essential(readiness.emailReady ? "Email added" : profile.email.isEmpty ? "Email needed" : "Check your email", ready: readiness.emailReady, id: "email")
            essential(readiness.resumeReady ? "PDF CV added" : "PDF CV needed", ready: readiness.resumeReady, id: "resume")
        }
    }
    private func essential(_ label: String, ready: Bool, id: String) -> some View {
        Label(label, systemImage: ready ? "checkmark.circle" : "circle")
            .font(.subheadline).foregroundStyle(ready ? ApplyDesign.accent : Color.secondary)
            .fixedSize(horizontal: false, vertical: true).accessibilityElement(children: .combine)
            .accessibilityIdentifier("profile.essential." + id)
    }
}

struct NativeSavedLinkRemoval: View {
    @ObservedObject var model: NativeApplicationsStore
    let context: PhoneLocalRemovalContext
    @Environment(\.dismiss) private var dismiss
    @State private var issue: String?
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(context.title).font(.headline).fixedSize(horizontal: false, vertical: true)
                    Text(context.company).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    Text(context.keepsRecord ? "The saved link will be removed. Your private application record and its notes will stay on this phone." : "This removes the link saved on this phone.")
                    Text("Applications already sent and provider receipts are kept.").font(.footnote).foregroundStyle(.secondary)
                }
                if let issue { Section { Text(issue).foregroundStyle(.red) } }
                Section {
                    Button("Remove saved link", role: .destructive) {
                        if model.removeLocalJob(context) { dismiss() } else { issue = model.message }
                    }.disabled(model.busy).accessibilityIdentifier("opportunity.confirmRemove")
                    Button("Keep opportunity", role: .cancel) { dismiss() }
                        .accessibilityIdentifier("opportunity.keepSaved")
                }
            }.navigationTitle("Remove link").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Keep opportunity") { dismiss() } } }
        }.tint(ApplyDesign.accent)
    }
}

struct NativeApplicationsScreen: View {
    @EnvironmentObject private var model: NativeApplicationsStore
    @EnvironmentObject private var career: NativeCareerStore
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var profileSheet = false
    @State private var connectionSheet = false
    @State private var addSheet = false
    @State private var reviewSheet = false
    @State private var activity = false
    @State private var exported: URL?
    @State private var exportSheet = false
    @State private var removing: PhoneLocalRemovalContext?

    private var reviewActionTitle: String {
        guard model.connected else { return "Set up Auto Apply" }
        if model.mode != "test" && model.liveSubmissionEnabled != true {
            return model.selected.isEmpty ? "Select opportunities to check" : "Check application options"
        }
        return model.selected.isEmpty ? "Select opportunities to apply" : "Review \(model.selected.count) application\(model.selected.count == 1 ? "" : "s")"
    }
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
                if model.connected && model.mode != "test" && model.liveSubmissionEnabled != true {
                    submissionAvailability
                }
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(spacing: 10) { metrics }
                } else { HStack(spacing: 10) { metrics } }
                if !model.activePlanIDs.isEmpty {
                    HStack(spacing: 12) {
                        ProgressView()
                        VStack(alignment: .leading, spacing: 4) {
                            Text(model.hasSubmissionHold ? "Sending paused on this phone" : model.advancingApprovedApplication ? "Sending an approved application" : "Approved applications are processing")
                                .font(.subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
                            Text(model.hasSubmissionHold ? "Your Stop request is kept, including after reopening or reconnecting. Retry Stop to confirm it with the service. A request already sent may still finish." : model.requiresClientContinuation
                                ? "Keep Career Finder open to continue the queue. Closing it pauses further sends; a request already sent may still finish. Receipts stay with the service."
                                : "You can leave this screen. Receipts are saved by the service.")
                                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                        Button(model.hasSubmissionHold ? "Retry Stop" : "Stop") { Task { await model.stop() } }.disabled(model.busy)
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
                if dynamicTypeSize.isAccessibilitySize {
                    Picker("Show", selection: $activity) { Text("Opportunities").tag(false); Text("Activity").tag(true) }
                        .pickerStyle(.menu).accessibilityIdentifier("applications.viewPicker")
                } else {
                    Picker("Applications view", selection: $activity) { Text("Opportunities").tag(false); Text("Activity").tag(true) }
                        .pickerStyle(.segmented).accessibilityIdentifier("applications.viewPicker")
                }
                if activity { activityList } else { opportunities }
                coverage
            }.padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 24)
        }
        .accessibilityIdentifier("applications.content")
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
                        Group {
                            if dynamicTypeSize.isAccessibilitySize {
                                VStack(alignment: .leading, spacing: 8) {
                                    if model.busy { ProgressView().tint(.white) }
                                    Text(reviewActionTitle)
                                        .font(.subheadline.weight(.semibold))
                                        .multilineTextAlignment(.leading).lineLimit(nil)
                                        .fixedSize(horizontal: false, vertical: true)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            } else {
                                HStack {
                                    if model.busy { ProgressView().tint(.white) }
                                    Image(systemName: "paperplane.fill")
                                    Text(reviewActionTitle).font(.subheadline.weight(.semibold))
                                    Spacer(minLength: 4)
                                    Image(systemName: "arrow.right")
                                }
                            }
                        }.padding(16).frame(maxWidth: .infinity).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain).foregroundStyle(.white)
                    .background(ApplyDesign.green, in: RoundedRectangle(cornerRadius: 16))
                    .accessibilityIdentifier("applications.review")
                    .accessibilityLabel(reviewActionTitle)
                    .disabled(model.busy || model.connected && model.selected.isEmpty)
                    .opacity(model.busy || model.connected && model.selected.isEmpty ? 0.65 : 1)
                    if !dynamicTypeSize.isAccessibilitySize {
                        Text("Your details. Your choice. A receipt for every confirmed submission.")
                            .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }
                }.padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 10).background(.regularMaterial)
            }
        }
        .sheet(isPresented: $profileSheet) { NativeApplicationProfileEditor(model: model) }
        .sheet(isPresented: $connectionSheet) { NativeApplicationConnection(model: model) }
        .sheet(isPresented: $addSheet) { NativeOpportunityEditor(model: model) }
        .sheet(isPresented: $reviewSheet) { NativeApplicationReview(model: model, manualAppliedURLs: appliedURLs) }
        .sheet(item: $removing) { NativeSavedLinkRemoval(model: model, context: $0) }
        .sheet(isPresented: $exportSheet) {
            if let exported { NativeApplicationShare(items: [exported]) }
        }
        .refreshable { await model.refresh() }
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
            }.foregroundStyle(ApplyDesign.accent)
            Text("Your application workspace.")
                .font(.system(.largeTitle, design: .rounded, weight: .bold))
                .fixedSize(horizontal: false, vertical: true)
            Text("Bring your experience. Choose your opportunities. Apply with confidence.")
                .font(.subheadline).foregroundStyle(.secondary).lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private var profileCard: some View {
        VStack(alignment: .leading, spacing: 16) {
          Button { profileSheet = true } label: {
            HStack(alignment: .center, spacing: 14) {
                Image(systemName: "person.crop.rectangle")
                    .font(.title2).foregroundStyle(ApplyDesign.accent)
                    .frame(width: 48, height: 56).background(ApplyDesign.green.opacity(0.09), in: RoundedRectangle(cornerRadius: 13))
                VStack(alignment: .leading, spacing: 5) {
                    Text(model.profile.firstName.isEmpty ? "Make it yours" : "\(model.profile.firstName)'s application profile")
                        .font(.headline).foregroundStyle(.primary)
                    Text(model.profileHasConflict ? "Phone draft · resolve profile changes" : model.profileNeedsSync ? "Phone draft · save before applying" : model.profileReadiness.nextAction)
                        .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(.secondary)
            }
          }.buttonStyle(.plain).disabled(model.busy).accessibilityIdentifier("applications.profile")
          NativeProfileEssentials(profile: model.profile)
        }.padding(17).background(ApplyDesign.card, in: RoundedRectangle(cornerRadius: 20))
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
                Button { addSheet = true } label: { Label("Add", systemImage: "plus").font(.subheadline.weight(.semibold)).padding(.vertical, 10) }
                    .disabled(model.busy).accessibilityLabel("Add an opportunity").accessibilityIdentifier("applications.addOpportunity")
            }
            if model.jobs.isEmpty {
                empty(icon: "square.stack.3d.up", title: "Your next move starts here.",
                      detail: "Save a job link from any industry or country. You decide which opportunities belong in your next chapter.")
                Button { addSheet = true } label: { Label("Add your first opportunity", systemImage: "plus").frame(maxWidth: .infinity).padding(14) }
                    .buttonStyle(.bordered).tint(ApplyDesign.green)
            }
            ForEach(model.jobs.compactMap { NativeApplicationRow($0) }) { row in
                let job = row.value, id = row.id
                VStack(alignment: .leading, spacing: 12) {
                    Button {
                        if model.selected.contains(id) { model.selected.remove(id) }
                        else if model.selected.count < 20 { model.selected.insert(id) }
                        else { model.message = "Review up to 20 opportunities in one batch." }
                    } label: {
                        HStack(alignment: .top, spacing: 12) {
                            Text(String((job["company"]?.string ?? "?").prefix(1)).uppercased())
                                .font(.title3.weight(.semibold)).foregroundStyle(ApplyDesign.accent)
                                .frame(width: 42, height: 42).background(ApplyDesign.green.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(job["title"]?.string ?? "Opportunity").font(.headline).foregroundStyle(.primary)
                                Text(job["company"]?.string ?? "").font(.subheadline).foregroundStyle(.secondary)
                                if let location = job["location"]?.string, !location.isEmpty {
                                    Label(location, systemImage: "mappin").font(.caption).foregroundStyle(.secondary)
                                }
                            }.frame(maxWidth: .infinity, alignment: .leading)
                            Image(systemName: model.selected.contains(id) ? "checkmark.circle.fill" : "circle")
                                .font(.title2).foregroundStyle(model.selected.contains(id) ? ApplyDesign.accent : Color.secondary)
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
                    if model.isMarkedApplied(job) {
                        Label("You marked this as applied", systemImage: "person.crop.circle.badge.checkmark")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    if job["localOnly"]?.bool == true {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Saved on this phone").font(.caption2).foregroundStyle(.secondary)
                            Button("Remove saved link", role: .destructive) {
                                if let context = model.removalContext(id) { removing = context }
                                else { model.message = "This opportunity is part of a review or queue. Finish or stop that review before removing the saved link." }
                            }.font(.caption).frame(minHeight: 44).disabled(model.busy)
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
            ForEach(model.attempts.reversed().compactMap { NativeApplicationRow($0) }) { row in
                NativeApplicationReceipt(attempt: row.value)
            }
        }
    }
    private var coverage: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("A workspace for every career", systemImage: "globe").font(.subheadline.weight(.semibold))
            Text("Save opportunities from any country or profession. Auto Apply works with connected employers whose application requirements are supported. Other jobs open on the employer's website.")
                .font(.caption).foregroundStyle(.secondary).lineSpacing(3)
            if dynamicTypeSize.isAccessibilitySize {
                Text("Your details. Your choice. A receipt for every confirmed submission.")
                    .font(.caption2).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            if !model.connected {
                Text("Automatic submission needs an activated application service. Your phone workspace remains available while it is disconnected.")
                    .font(.caption).foregroundStyle(.secondary).lineSpacing(3)
            }
        }.padding(.vertical, 6)
    }
    private var submissionAvailability: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(model.liveSubmissionEnabled == false ? "Auto Apply is not activated" : "Submission availability is unverified",
                  systemImage: "info.circle").font(.subheadline.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("applications.availability.heading")
            Button("Refresh availability") { Task { await model.refresh() } }
                .font(.subheadline).frame(minHeight: 44).disabled(model.busy)
                .accessibilityIdentifier("applications.availability.refresh")
            Text(model.liveSubmissionEnabled == false
                 ? "Your workspace is connected. Keep saving opportunities and preparing your profile. Automatic submission needs an activated employer integration; you can apply through employer links."
                 : "Your workspace is connected, but the service has not confirmed that live submission is available. Keep preparing your profile and checking employer links.")
                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(ApplyDesign.card, in: RoundedRectangle(cornerRadius: 16))
    }
    private func empty(icon: String, title: String, detail: String) -> some View {
        VStack(spacing: 15) {
            Image(systemName: icon).font(.system(size: 31, weight: .light)).foregroundStyle(ApplyDesign.accent)
                .frame(width: 72, height: 72).background(ApplyDesign.green.opacity(0.07), in: RoundedRectangle(cornerRadius: 23))
            Text(title).font(.headline).multilineTextAlignment(.center)
            Text(detail).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center).lineSpacing(3)
        }.frame(maxWidth: .infinity).padding(.horizontal, 24).padding(.vertical, 30)
            .background(ApplyDesign.card, in: RoundedRectangle(cornerRadius: 20))
    }
}

struct NativeApplicationProfileEditor: View {
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
    @FocusState private var focusedField: String?

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
                        .accessibilityIdentifier("application.firstName").focused($focusedField, equals: "firstName")
                    TextField("Last name (optional)", text: $draft.lastName).textContentType(.familyName)
                        .focused($focusedField, equals: "lastName")
                    TextField("Email", text: $draft.email).textContentType(.emailAddress).keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .accessibilityIdentifier("application.email").focused($focusedField, equals: "email")
                    TextField("Phone (optional)", text: $draft.phone).textContentType(.telephoneNumber).keyboardType(.phonePad)
                        .focused($focusedField, equals: "phone")
                    TextField("City (optional)", text: $draft.city).textContentType(.addressCity)
                        .focused($focusedField, equals: "city")
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
                        .focused($focusedField, equals: "headline")
                    TextField("Skills, separated by commas", text: $draft.skills, axis: .vertical)
                        .focused($focusedField, equals: "skills")
                    TextField("Portfolio HTTPS link (optional)", text: $draft.website)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .focused($focusedField, equals: "website")
                    Picker("Career stage", selection: $draft.experienceLevel) {
                        Text("Any / not specified").tag("any"); Text("Entry level").tag("entry")
                        Text("Mid level").tag("mid"); Text("Senior").tag("senior")
                    }
                }
                Section {
                    TextField("LinkedIn profile (optional)", text: $draft.linkedin)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .focused($focusedField, equals: "linkedin").accessibilityIdentifier("application.linkedin")
                    if let url = MobileApplicationPolicy.linkedInProfileURL(draft.linkedin) {
                        Link(destination: url) { Label("Open LinkedIn profile", systemImage: "arrow.up.right.square") }
                            .accessibilityIdentifier("application.openLinkedIn")
                    }
                } header: { Text("LinkedIn") } footer: {
                    Text("Save your public profile link and review it before sharing it with an employer. This does not connect or verify your LinkedIn account. Opening LinkedIn uses its website or app.")
                }
                Section {
                    TextField("Target roles, separated by commas", text: $draft.targetRoles, axis: .vertical)
                        .focused($focusedField, equals: "roles")
                    TextField("Target country codes (optional)", text: $draft.targetCountries)
                        .textInputAutocapitalization(.characters).autocorrectionDisabled()
                        .focused($focusedField, equals: "countries")
                    Toggle("Remote", isOn: $draft.remote); Toggle("Hybrid", isOn: $draft.hybrid); Toggle("On site", isOn: $draft.onsite)
                } header: { Text("What comes next") } footer: {
                    Text("Leave countries blank for any country, or enter two-letter country codes separated by commas. These preferences describe your goals; they do not establish work authorization or qualify you for a role.")
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
                        focusedField = nil
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
                ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done typing") { focusedField = nil } }
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
                Button("Keep editing") { dismissalChoice = false }
            } message: { Text("Saving a phone draft does not upload details or submit an application.") }
            .confirmationDialog("Replace this phone draft?", isPresented: $replaceChoice, titleVisibility: .visible) {
                Button("Use service version", role: .destructive) {
                    if model.useLatestProfile(context: context) { resetFromModel() }
                    else { issue = model.message }
                }
                Button("Keep editing") { replaceChoice = false }
            } message: { Text("This replaces the phone draft and any PDF selected only on this phone.") }
        }
        .tint(ApplyDesign.accent).interactiveDismissDisabled(occupied || changed)
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
            profileField("Portfolio", profile.website); profileField("LinkedIn profile", profile.linkedin)
            profileField("Career stage", profile.experienceLevel)
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

struct NativeOpportunityEditor: View {
    @ObservedObject var model: NativeApplicationsStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var draft: PhoneOpportunityDraft
    @State private var original: PhoneOpportunityDraft
    @State private var dismissalChoice = false
    @State private var closingIntentionally = false
    @State private var issue: String?
    @FocusState private var focusedField: String?
    init(model: NativeApplicationsStore) {
        self.model = model
        _draft = State(initialValue: model.opportunityDraft)
        _original = State(initialValue: model.opportunityDraft)
    }
    private var changed: Bool { draft != original }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://…", text: $draft.url).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .accessibilityLabel("Public HTTPS job link").accessibilityIdentifier("opportunity.url")
                        .focused($focusedField, equals: "url").submitLabel(.next).onSubmit { focusedField = "title" }
                } header: { Text("Job link") } footer: {
                    Text("Use the employer's public HTTPS posting. Connected Lever postings can import their published details. Drafts stay on this phone until you add the opportunity.")
                }
                Section("Opportunity details") {
                    TextField("Role title", text: $draft.title).accessibilityIdentifier("opportunity.title")
                        .focused($focusedField, equals: "title").submitLabel(.next).onSubmit { focusedField = "company" }
                    TextField("Employer", text: $draft.company).accessibilityIdentifier("opportunity.company")
                        .focused($focusedField, equals: "company").submitLabel(.next).onSubmit { focusedField = "location" }
                    TextField("Location or remote", text: $draft.location).focused($focusedField, equals: "location")
                    Picker("Country or region", selection: $draft.country) {
                        Text("Not specified").tag("")
                        ForEach(Locale.Region.isoRegions.map(\.identifier).sorted {
                            (Locale.current.localizedString(forRegionCode: $0) ?? $0) < (Locale.current.localizedString(forRegionCode: $1) ?? $1)
                        }, id: \.self) { code in
                            Text(Locale.current.localizedString(forRegionCode: code) ?? code).tag(code)
                        }
                    }
                }
                if let issue { Section { Text(issue).foregroundStyle(.red).accessibilityIdentifier("opportunity.error") } }
                Section {
                    Text("Saving a job does not apply to it. Automatic submission eligibility is checked when you review your selection.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }.disabled(model.busy).navigationTitle("Add opportunity").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") {
                            focusedField = nil
                            if changed { dismissalChoice = true }
                            else { closingIntentionally = true; dismiss() }
                        }.disabled(model.busy)
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Add") { Task {
                            guard model.keepOpportunityDraft(draft) else { issue = model.message; return }
                            if await model.addJob(url: draft.url, title: draft.title, company: draft.company, location: draft.location, country: draft.country) {
                                closingIntentionally = true; dismiss()
                            }
                            else { issue = model.message }
                        } }.disabled(model.busy || draft.url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            .accessibilityIdentifier("opportunity.save")
                    }
                    ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done typing") { focusedField = nil } }
                }
                .confirmationDialog("Keep this opportunity draft?", isPresented: $dismissalChoice, titleVisibility: .visible) {
                    Button("Save draft on this phone") {
                        if model.keepOpportunityDraft(draft) { closingIntentionally = true; dismiss() }
                        else { issue = model.message }
                    }
                    Button("Discard draft", role: .destructive) {
                        if model.keepOpportunityDraft(PhoneOpportunityDraft()) { closingIntentionally = true; dismiss() }
                        else { issue = model.message }
                    }
                    Button("Keep editing") { dismissalChoice = false }
                        .accessibilityIdentifier("opportunity.keepEditing")
                } message: { Text("Saving a draft does not add it to the service or submit an application.") }
        }.tint(ApplyDesign.accent).interactiveDismissDisabled(model.busy || changed)
            .onChange(of: scenePhase) { phase in
                if phase != .active && changed { if !model.keepOpportunityDraft(draft) { issue = model.message } }
            }
            .onDisappear {
                if changed && !closingIntentionally { model.keepOpportunityDraft(draft) }
            }
    }
}

private struct NativeApplicationConnection: View {
    @ObservedObject var model: NativeApplicationsStore
    @Environment(\.dismiss) private var dismiss
    @State private var address = ""
    @State private var code = ""
    @State private var issue: String?
    @State private var advanced = false
    @State private var disconnecting = false
    @State private var disconnectContext: ApplicationProfileEditContext?
    @FocusState private var focusedField: String?
    init(model: NativeApplicationsStore) {
        self.model = model; _address = State(initialValue: model.connectionSetupAddress)
        _advanced = State(initialValue: !MobileApplicationPolicy.isHostedService(model.connectionSetupAddress))
    }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Image(systemName: "lock.shield").font(.largeTitle).foregroundStyle(ApplyDesign.accent).padding(.vertical, 8)
                    Text(model.connected ? "Your application workspace is connected." : "Connect your phone in two steps.")
                        .font(.title3.weight(.semibold))
                    Text("Your phone draft is uploaded only when you choose to save it to the connected service.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                if model.connected {
                    Section("Connected service") {
                        Text(MobileApplicationPolicy.isHostedService(model.serviceAddress) ? "Career Finder" : "Your custom service").font(.headline)
                        Button("Refresh applications") { Task { await model.refresh() } }
                        Button("Disconnect this phone", role: .destructive) { disconnectContext = model.editContext; disconnecting = true }
                        DisclosureGroup("Connection details") {
                            Text(model.serviceAddress).font(.footnote).textSelection(.enabled)
                            Text("The connection token stays in this phone's Keychain. Disconnecting keeps your phone draft and service history.")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                } else {
                    if MobileApplicationPolicy.isHostedService(address),
                       let setup = MobileApplicationPolicy.servicePageURL(.connect, address: address) {
                        Section("1. Sign in and get a code") {
                            Text("Career Finder").font(.headline)
                            Link(destination: setup) { Label("Sign in and get a code", systemImage: "safari") }
                                .accessibilityIdentifier("connection.signIn")
                            Text("Choose Continue with Google on ChatGPT sign-in, or use your usual sign-in method. Create a code, then return here. Use the same account on your other phones.")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    } else {
                        Section("1. Get a code") {
                            Text("Ask your custom service operator for a one-time connection code.")
                            Text("Check the address under Use another service before connecting.").font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    Section {
                        SecureField("One-time connection code", text: $code).textInputAutocapitalization(.characters).autocorrectionDisabled()
                            .focused($focusedField, equals: "code").submitLabel(.done).onSubmit { focusedField = nil }
                            .accessibilityIdentifier("connection.code")
                        Button {
                            Task {
                                if await model.connect(address: address, code: code) { code = ""; dismiss() }
                                else { code = ""; issue = model.message }
                            }
                        } label: {
                            HStack { if model.busy { ProgressView() }; Text("Connect this phone") }
                        }.disabled(model.busy || address.isEmpty || code.isEmpty)
                            .accessibilityIdentifier("connection.connect")
                    } header: { Text("2. Paste your code") } footer: {
                        Text("Enter the code you just created. Connecting alone does not upload your profile or apply for a job.")
                    }
                    Section {
                        DisclosureGroup("Use another service", isExpanded: $advanced) {
                            TextField("https://service.example", text: $address).keyboardType(.URL)
                                .textInputAutocapitalization(.never).autocorrectionDisabled()
                                .focused($focusedField, equals: "address").submitLabel(.done).onSubmit { focusedField = nil }
                                .accessibilityLabel("Application service HTTPS address").accessibilityIdentifier("connection.address")
                            Text("Advanced: use the HTTPS address from your own service operator. Its account, privacy and submission features may differ.")
                                .font(.footnote).foregroundStyle(.secondary)
                            if !MobileApplicationPolicy.isHostedService(address) {
                                Button("Use Career Finder") { address = MobileApplicationPolicy.hostedServiceOrigin; advanced = false }
                            }
                        }
                    }
                }
                if let issue {
                    Section { Text(issue).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true) }
                } else if let notice = model.message {
                    Section { Text(notice).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
                }
                Section("Account and privacy") {
                    NativeApplicationServiceLinks(address: model.connected ? model.serviceAddress : address,
                                                  includeConnection: model.connected)
                    DisclosureGroup("How your data is kept") {
                        Text("The service keeps application attempts and provider receipts. Auto Apply needs an activated employer integration; other jobs still open on the employer website.")
                        Text("Disconnecting keeps your phone draft and does not delete service data. Manage account opens the separate deletion option. Employer copies are governed by that employer.")
                    }.font(.footnote).foregroundStyle(.secondary)
                }
            }.navigationTitle("Application connection").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                    ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done typing") { focusedField = nil } }
                }
        }.tint(ApplyDesign.accent).interactiveDismissDisabled(model.busy)
            .onChange(of: address) { _ in code = ""; issue = nil }
            .confirmationDialog("Disconnect this phone?", isPresented: $disconnecting, titleVisibility: .visible) {
                Button("Disconnect this phone", role: .destructive) {
                    guard let captured = disconnectContext,
                          captured.workspaceID == model.editContext.workspaceID,
                          captured.serviceAddress == model.editContext.serviceAddress else { issue = "The connection changed. It has been kept."; return }
                    Task { await model.disconnect(); if !model.connected { dismiss() } }
                }
                Button("Keep connected", role: .cancel) { disconnectContext = nil }
            } message: { Text("Your phone draft and service application history will be kept. You can reconnect with a new code.") }
    }
}

struct NativeApplicationServiceLinks: View {
    let address: String
    var includeConnection = true
    var body: some View {
        if MobileApplicationPolicy.isHostedService(address) {
            if includeConnection, let url = MobileApplicationPolicy.servicePageURL(.connect, address: address) {
                Link("Set up or recover workspace access", destination: url)
            }
            if let url = MobileApplicationPolicy.servicePageURL(.privacy, address: address) {
                Link("Hosted service privacy policy", destination: url)
            }
            if let url = MobileApplicationPolicy.servicePageURL(.support, address: address) {
                Link("Get application-service support", destination: url)
            }
            if let url = MobileApplicationPolicy.servicePageURL(.account, address: address) {
                Link("Manage account and delete hosted data", destination: url)
            }
        } else {
            Text("For this custom service, ask its operator for a new workspace invitation, its privacy policy, support and account deletion. Its connection and data practices are separate from the hosted Career Finder service.")
                .font(.footnote).foregroundStyle(.secondary)
        }
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
    private let fieldLabels = ["name": "Name", "email": "Email", "phone": "Phone", "website": "Portfolio", "linkedin": "LinkedIn profile", "comments": "Message",
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
                ForEach(items.compactMap { NativeApplicationRow($0, idKey: "jobId") }) { row in
                    let item = row.value
                    let job = item["job"]?.object ?? [:]
                    let jobID = item["jobId"]?.string ?? ""
                    Section {
                        Text(job["title"]?.string ?? "Opportunity").font(.headline)
                        Text(job["company"]?.string ?? "").foregroundStyle(.secondary)
                        if eligible(item) {
                            Label("Ready for your approval", systemImage: "checkmark.circle").foregroundStyle(ApplyDesign.accent)
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
                    if !model.submissionAvailable {
                        Text("Automatic submission is unavailable for this connection. Return to the application workspace to refresh availability, or use the employer's website.")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    Toggle("I approve sending these details and my selected CV to the listed eligible employers.", isOn: $approved)
                        .font(.subheadline)
                        .disabled(!model.submissionAvailable)
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
                        .disabled(!approved || changed || ready == 0 || model.busy || model.profileNeedsSync || !model.submissionAvailable)
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
                Button("Keep editing") { discardChoices = false }
            } message: { Text("The saved review remains available. Your unreviewed message and permission changes will be discarded.") }
        }.tint(ApplyDesign.accent).interactiveDismissDisabled(model.busy || changed)
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

struct NativePhoneDataScreen: View {
    @ObservedObject var model: NativeApplicationsStore
    @EnvironmentObject private var discovery: CareerDiscoveryStore
    @State private var exported: URL?
    @State private var sharing = false
    @State private var selecting = false
    @State private var reading = false
    @State private var pending: PhoneWorkspaceBackup?
    @State private var context: PhoneWorkspaceActionContext?
    @State private var importing = false
    @State private var clearing = false
    @State private var copyingUnpaired = false
    @State private var issue: String?
    private var target: String {
        model.workspaceScope.isLocal ? "Unpaired phone workspace" : model.workspaceScope.origin + " · " + String(model.workspaceScope.workspaceID.suffix(8))
    }
    var body: some View {
        List {
            Section("Current phone workspace") {
                Text(target).font(.subheadline).textSelection(.enabled)
                Text("Your local profile, selected PDF, saved links, private records, their history and unfinished record drafts are kept separately for each workspace.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if let issue { Section { Text(issue).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true) } }
            if let notice = model.message { Section { Text(notice).font(.footnote).fixedSize(horizontal: false, vertical: true) } }
            Section("Export and recovery") {
                Button("Export this phone workspace") {
                    do {
                        if let file = model.exportWorkspace(context: model.workspaceActionContext, discoverySnapshot: try discovery.exportSnapshot()) { exported = file; sharing = true; issue = nil }
                        else { issue = model.message }
                    } catch { issue = error.localizedDescription }
                }.accessibilityIdentifier("phoneData.export")
                Button(reading ? "Reading backup…" : "Import a phone workspace backup") {
                    context = model.workspaceActionContext; selecting = true
                }.disabled(reading).accessibilityIdentifier("phoneData.import")
                Text("The JSON backup contains readable personal information, including your selected PDF when it is on this phone and this workspace's search draft/results. Keep it private. It does not contain connection credentials, online application approvals, provider receipts, or the separate planning notes.")
                    .font(.footnote).foregroundStyle(.secondary)
                Text("Import replaces this phone's profile draft and merges saved links and private record history. Existing record versions are retained for comparison. It does not upload data or approve applications.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if model.hasUnpairedDraft {
                Section("Separate unpaired draft") {
                    Button("Review copying my unpaired draft here") { context = model.workspaceActionContext; copyingUnpaired = true }
                    Text("Connecting kept your earlier phone draft separate. Copy it only if it belongs to the person using this workspace; the original remains available.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            if !model.savedWorkspaceScopes.isEmpty {
                Section("Other workspaces on this phone") {
                    ForEach(Array(model.savedWorkspaceScopes.enumerated()), id: \.offset) { _, scope in
                        Button(scope.isLocal ? "Open unpaired phone workspace" : "Open saved workspace · " + String(scope.workspaceID.suffix(8))) {
                            if !model.openPhoneWorkspace(scope, context: model.workspaceActionContext) { issue = model.message }
                            else { issue = nil }
                        }
                    }
                    Text("Opening another saved workspace disconnects this phone first. It does not move a profile, CV or note into another account.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            Section {
                Button("Clear this workspace from this phone", role: .destructive) { context = model.workspaceActionContext; clearing = true }
                    .accessibilityIdentifier("phoneData.clear")
            } header: { Text("Local data") } footer: {
                Text("Export first if you need a copy. Clearing removes this workspace's local profile, PDF, saved links and private notes/history, and disables this phone connection. Other workspaces and cloud/employer records remain. Restrictive Stop holds remain so an old approved plan cannot silently resume.")
            }
        }.navigationTitle("Phone data").navigationBarTitleDisplayMode(.inline).tint(ApplyDesign.accent)
            .disabled(model.busy || reading)
            .sheet(isPresented: $sharing) { if let exported { NativeApplicationShare(items: [exported]) } }
            .fileImporter(isPresented: $selecting, allowedContentTypes: [.json]) { result in
                do {
                    let url = try result.get()
                    Task {
                        reading = true; let access = url.startAccessingSecurityScopedResource()
                        defer { reading = false; if access { url.stopAccessingSecurityScopedResource() } }
                        do {
                            let backup = try await Task.detached(priority: .userInitiated) { try NativeApplicationsStore.readWorkspaceBackup(at: url) }.value
                            if let search = backup.discoverySnapshot { try CareerDiscoveryStore.validateBackup(search) }
                            pending = backup
                            importing = true; issue = nil
                        } catch { issue = error.localizedDescription }
                    }
                } catch { if !MobileApplicationPolicy.isFileSelectionCancelled(error) { issue = error.localizedDescription } }
            }
            .alert("Import into this phone workspace?", isPresented: $importing) {
                Button("Replace draft and merge records") {
                    if let pending, let context {
                        if model.mergeBackup(pending, context: context) {
                            if let search = pending.discoverySnapshot {
                                do { try discovery.importSnapshot(search) }
                                catch { issue = "Your phone profile and records were imported, but the previous search was preserved: " + error.localizedDescription }
                            }
                        } else { issue = model.message }
                    }
                    self.pending = nil
                }
                Button("Keep current data", role: .cancel) { pending = nil }
            } message: {
                Text("Destination: " + target + ". The backup's profile replaces the local draft; links and history are merged. A cloud-only PDF must be selected again. Nothing is uploaded or submitted.")
            }
            .alert("Copy your unpaired draft here?", isPresented: $copyingUnpaired) {
                Button("Copy draft and merge records") {
                    if let context, !model.importUnpairedDraft(context: context) { issue = model.message }
                }
                Button("Keep separate", role: .cancel) {}
            } message: { Text("Destination: " + target + ". Review whose information this is. The local profile will be replaced, saved records merged, and the original unpaired draft kept. Nothing will be uploaded.") }
            .alert("Clear this phone workspace?", isPresented: $clearing) {
                Button("Clear phone data", role: .destructive) {
                    if let context {
                        if model.clearWorkspaceOnPhone(context: context) {
                            do { try discovery.clearCurrentScope() }
                            catch { issue = "The profile and records were cleared, but the search file could not be cleared: " + error.localizedDescription }
                        } else { issue = model.message }
                    }
                }
                Button("Keep phone data", role: .cancel) {}
            } message: { Text("This removes the local profile, PDF, links, search and private notes/history for " + target + ". An exported backup can restore them. Cloud/employer records and safety holds remain.") }
    }
}

private struct NativeApplicationShare: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
#endif
