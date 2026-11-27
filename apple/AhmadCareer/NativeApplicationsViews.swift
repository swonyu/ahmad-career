#if os(iOS)
import SwiftUI
import UniformTypeIdentifiers
import UIKit
import SafariServices

private enum ApplyDesign {
    static let actionFill = NativeDesign.actionFill
    static let actionText = NativeDesign.actionText
    static let accent = NativeDesign.accent
    static let canvas = NativeDesign.canvas
    static let card = NativeDesign.surface
    static let accentSurface = NativeDesign.accentSurface
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
    @NativeLocalization private var l10n
    let profile: PhoneApplicationProfile
    private var readiness: ApplicationProfileReadiness { ApplicationProfileReadiness(profile: profile) }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            essential(readiness.nameReady ? "Name added" : "Name needed", ready: readiness.nameReady, id: "name")
            essential(readiness.emailEssentialLabel, ready: readiness.emailReady, id: "email")
            essential(readiness.resumeReady ? "PDF CV added" : "PDF CV needed", ready: readiness.resumeReady, id: "resume")
        }
    }
    private func essential(_ label: String, ready: Bool, id: String) -> some View {
        Label(l10n(label), systemImage: ready ? "checkmark.circle" : "circle")
            .font(.subheadline).foregroundStyle(ready ? ApplyDesign.accent : NativeDesign.muted)
            .fixedSize(horizontal: false, vertical: true).accessibilityElement(children: .combine)
            .accessibilityIdentifier("profile.essential." + id)
    }
}

struct NativeSavedLinkRemoval: View {
    @NativeLocalization private var l10n
    @ObservedObject var model: NativeApplicationsStore
    let context: PhoneLocalRemovalContext
    @Environment(\.dismiss) private var dismiss
    @State private var issue: String?
    var body: some View {
        NavigationStack {
            NativeList {
                Section {
                    Text(context.title).font(.headline).fixedSize(horizontal: false, vertical: true)
                    Text(context.company).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    Text(l10n(context.keepsRecord ? "The saved link will be removed. Your private application record and its notes will stay on this phone." : "This removes the link saved on this phone."))
                    Text(l10n("Applications already sent and provider receipts are kept.")).font(.footnote).foregroundStyle(.secondary)
                }
                if let issue { Section { Text(l10n.message(issue)).foregroundStyle(NativeDesign.danger) } }
                Section {
                    Button(l10n("Remove saved link"), role: .destructive) {
                        if model.removeLocalJob(context) { dismiss() } else { issue = model.message }
                    }.disabled(model.busy).accessibilityIdentifier("opportunity.confirmRemove")
                    Button(l10n("Keep opportunity"), role: .cancel) { dismiss() }
                        .accessibilityIdentifier("opportunity.keepSaved")
                }
            }.navigationTitle(l10n("Remove link")).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button(l10n("Keep opportunity")) { dismiss() } } }
        }.tint(ApplyDesign.accent)
            .onChange(of: issue) { value in
                if let value { UIAccessibility.post(notification: .announcement, argument: l10n.message(value)) }
            }
    }
}

private struct NativeHistoricalRecovery: View {
    @NativeLocalization private var l10n
    @ObservedObject var model: NativeApplicationsStore
    @State private var exportLease: PhoneRecoveryExportLease?
    @State private var sharing = false
    @State private var exporting = false
    @State private var exportTask: Task<Void, Never>?
    private func export(_ reference: PhoneRecoveryReference? = nil) {
        guard exportTask == nil else { return }
        exporting = true
        exportTask = Task {
            let result = await model.exportHistoricalRecovery(reference)
            if Task.isCancelled {
                if let result { PhoneRecoveryStorage.removeTemporaryExport(result) }
            } else if let result {
                exportLease = PhoneRecoveryExportLease(file: result)
                sharing = true
            }
            exporting = false; exportTask = nil
        }
    }
    private func title(_ reference: PhoneRecoveryReference) -> String {
        let names = ["workspace": "Workspace", "profile": "Profile", "job": "Opportunity", "plan": "Review", "plan-state": "Review", "receipts": "Application receipts"]
        return l10n(names[reference.kind] ?? "Workspace") + " · " + reference.asOf
    }
    var body: some View {
        if let notice = model.historicalRecoveryNotice {
            VStack(alignment: .leading, spacing: 12) {
                Label(l10n("Historical data recovery"), systemImage: "doc.badge.clock").font(.headline)
                Text(l10n(notice)).font(.footnote).fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("applications.historicalRecovery.notice")
                if model.pendingRecovery != nil || model.recoveryExportChoices.count <= 1 {
                    Button(l10n(exporting ? "Preparing recovery file…" : "Export complete recovery file")) { export() }
                        .disabled(exporting || model.busy || !model.hasHistoricalRecovery)
                        .accessibilityIdentifier("applications.historicalRecovery.export")
                } else {
                    Menu(l10n(exporting ? "Preparing recovery file…" : "Export complete recovery file")) {
                        ForEach(model.recoveryExportChoices, id: \.documentFileName) { reference in
                            Button(title(reference)) { export(reference) }
                        }
                    }.disabled(exporting || model.busy).accessibilityIdentifier("applications.historicalRecovery.export")
                }
                if exporting {
                    Button(l10n("Cancel recovery download"), role: .cancel) { exportTask?.cancel() }
                        .accessibilityIdentifier("applications.historicalRecovery.cancel")
                }
                Text(l10n("This file keeps a copy of the original records. It is an archive only: it cannot be imported as a profile or used to approve an application or prove it was sent."))
                    .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                if model.reconciliationRequired {
                    Button(l10n("Refresh workspace")) { Task { await model.refresh() } }.disabled(model.busy)
                        .accessibilityIdentifier("applications.historicalRecovery.refresh")
                }
            }
            .sheet(isPresented: $sharing, onDismiss: {
                exportLease?.cleanup(); exportLease = nil
            }) {
                if let exportLease {
                    NativeApplicationShare(items: [exportLease.file], onCompletion: { exportLease.cleanup() })
                }
            }
            .onDisappear { exportTask?.cancel() }
        }
    }
}

struct NativeApplicationsScreen: View {
    @NativeLocalization private var l10n
    @EnvironmentObject private var model: NativeApplicationsStore
    @EnvironmentObject private var career: NativeCareerStore
    @EnvironmentObject private var navigation: NativeCareerNavigation
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var profileSheet = false
    @State private var connectionSheet = false
    @State private var addSheet = false
    @State private var reviewSheet = false
    @State private var activity = false
    @State private var exported: URL?
    @State private var recoveryExportLease: PhoneRecoveryExportLease?
    @State private var exportSheet = false
    @State private var removing: PhoneLocalRemovalContext?
    @State private var announcedMessage: String?

    private func speakVisibleMessage(_ value: String?) {
        guard let value else { announcedMessage = nil; return }
        guard value != announcedMessage else { return }
        announcedMessage = value
        UIAccessibility.post(notification: .announcement, argument: l10n(value))
    }

    private var hasSavedOpportunities: Bool { !model.savedOpportunities.isEmpty || !career.savedJobs.isEmpty }
    private var reviewActionTitle: String {
        guard model.connected else { return hasSavedOpportunities ? "Open saved jobs" : "Search jobs" }
        if model.mode != "test" && model.liveSubmissionEnabled != true {
            return model.selected.isEmpty ? "Select opportunities to check" : "Check application options"
        }
        return model.selected.isEmpty ? "Select opportunities to apply" : "Review applications: \(model.selected.count)"
    }
    private var confirmed: Int { model.displayConfirmedApplicationCount }
    private var uncertain: Int { model.displayUncertainApplicationCount }
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
                NativeHistoricalRecovery(model: model)
                if let message = model.message {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "info.circle")
                        Text(l10n(message)).font(.subheadline).fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("applications.message")
                        Spacer(minLength: 0)
                        Button { model.message = nil } label: { Image(systemName: "xmark").padding(8) }
                            .accessibilityLabel(l10n("Dismiss message"))
                    }
                    .padding(15).background(ApplyDesign.card, in: RoundedRectangle(cornerRadius: 16))
                    .accessibilityElement(children: .contain)
                }
                if !model.connected { manualApplicationGuide }
                profileCard
                if model.connected && model.mode != "test" && model.liveSubmissionEnabled != true {
                    submissionAvailability
                }
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(spacing: 10) { metrics }
                } else { HStack(spacing: 10) { metrics } }
                if let savedAt = model.applicationHistorySavedAt, let date = ApplicationReviewPolicy.date(savedAt) {
                    Text(l10n.format("Saved history from {0}. Connect and refresh to check the latest status.", [l10n.date(date, includeTime: true)]))
                        .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("applications.savedHistoryNotice")
                }
                if !model.activePlanIDs.isEmpty {
                    HStack(spacing: 12) {
                        ProgressView()
                        VStack(alignment: .leading, spacing: 4) {
                            Text(l10n(model.hasSubmissionHold ? "Sending paused on this phone" : model.advancingApprovedApplication ? "Sending an approved application" : "Approved applications are processing"))
                                .font(.subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
                            Text(l10n(model.hasSubmissionHold ? "Your Stop request is kept, including after reopening or reconnecting. Retry Stop to confirm it with the service. A request already sent may still finish." : model.requiresClientContinuation
                                ? "Keep Career Finder open to continue the queue. Closing it pauses further sends; a request already sent may still finish. Receipts stay with the service."
                                : "You can leave this screen. Receipts are saved by the service."))
                                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                        Button(l10n(model.hasSubmissionHold ? "Retry Stop" : "Stop")) { Task { await model.stop() } }.disabled(model.busy)
                    }.padding().background(ApplyDesign.card, in: RoundedRectangle(cornerRadius: 16))
                }
                ForEach(model.availableReviews) { review in
                    Button {
                        reviewSheet = model.resumeReview(review.value)
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "arrow.clockwise.circle").font(.title2)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(review.items.first?["job"]?.object["title"]?.string ?? l10n("Application review")).font(.subheadline.weight(.semibold))
                                    .fixedSize(horizontal: false, vertical: true)
                                Text(l10n.format("Continue review · applications: {0}", [String(describing: review.items.count)]))
                                    .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                                if let created = ApplicationReviewPolicy.date(review.value["createdAt"]?.string) {
                                    Text(l10n(l10n.date(created, includeTime: true))).font(.caption2).foregroundStyle(.secondary)
                                }
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right").font(.caption)
                        }.padding(16).background(ApplyDesign.card, in: RoundedRectangle(cornerRadius: 16))
                    }.buttonStyle(.plain).disabled(model.busy)
                        .accessibilityLabel(l10n.format("Continue review for {0}, {1} applications", [String(describing: review.items.first?["job"]?.object["title"]?.string ?? l10n("Application review")), String(describing: review.items.count)]))
                }
                if dynamicTypeSize.isAccessibilitySize {
                    Picker(l10n("Show"), selection: $activity) { Text(l10n("Opportunities")).tag(false); Text(l10n("Activity")).tag(true) }
                        .pickerStyle(.menu).accessibilityIdentifier("applications.viewPicker")
                } else {
                    Picker(l10n("Applications view"), selection: $activity) { Text(l10n("Opportunities")).tag(false); Text(l10n("Activity")).tag(true) }
                        .pickerStyle(.segmented).accessibilityIdentifier("applications.viewPicker")
                }
                if activity { activityList } else { opportunities }
                coverage
            }.padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 24)
        }
        .modifier(NativeScrollPalette())
        .accessibilityIdentifier("applications.content")
        .background(ApplyDesign.canvas)
        .navigationTitle(l10n("Career Finder"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { connectionSheet = true } label: {
                    Image(systemName: model.connected ? "checkmark.shield" : "link")
                }.accessibilityLabel(l10n(model.connected ? "Manage application connection" : "Connect application service"))
            }
        }
        .safeAreaInset(edge: .bottom) {
            if !activity {
                VStack(spacing: 8) {
                    Button {
                        if !model.connected { navigation.selectedTab = hasSavedOpportunities ? 3 : 1 }
                        else { Task { await model.prepare(manualAppliedURLs: appliedURLs); reviewSheet = model.plan != nil } }
                    } label: {
                        Group {
                            if dynamicTypeSize.isAccessibilitySize {
                                VStack(alignment: .leading, spacing: 8) {
                                    if model.busy { ProgressView().tint(ApplyDesign.actionText) }
                                    Text(l10n(reviewActionTitle))
                                        .font(.subheadline.weight(.semibold))
                                        .multilineTextAlignment(.leading).lineLimit(nil)
                                        .fixedSize(horizontal: false, vertical: true)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            } else {
                                HStack {
                                    if model.busy { ProgressView().tint(ApplyDesign.actionText) }
                                    Image(systemName: "paperplane.fill")
                                    Text(l10n(reviewActionTitle)).font(.subheadline.weight(.semibold))
                                    Spacer(minLength: 4)
                                    Image(systemName: "arrow.right")
                                }
                            }
                        }.padding(16).frame(maxWidth: .infinity).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain).foregroundStyle(ApplyDesign.actionText)
                    .background(ApplyDesign.actionFill, in: RoundedRectangle(cornerRadius: 16))
                    .accessibilityIdentifier(model.connected ? "applications.review" : "applications.manual")
                    .accessibilityLabel(l10n(reviewActionTitle))
                    .disabled(model.busy || model.connected && model.selected.isEmpty)
                    .opacity(model.busy || model.connected && model.selected.isEmpty ? 0.65 : 1)
                    if !dynamicTypeSize.isAccessibilitySize {
                        Text(l10n("Confirmed submissions include a provider receipt."))
                            .font(.caption2).foregroundStyle(NativeDesign.muted).multilineTextAlignment(.center)
                    }
                }.padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 10).background(.regularMaterial)
            }
        }
        .sheet(isPresented: $profileSheet) { NativeApplicationProfileEditor(model: model) }
        .sheet(isPresented: $connectionSheet) { NativeApplicationConnection(model: model) }
        .sheet(isPresented: $addSheet) { NativeOpportunityEditor(model: model) }
        .sheet(isPresented: $reviewSheet) { NativeApplicationReview(model: model, manualAppliedURLs: appliedURLs) }
        .sheet(item: $removing) { NativeSavedLinkRemoval(model: model, context: $0) }
        .sheet(isPresented: $exportSheet, onDismiss: {
            recoveryExportLease?.cleanup(); recoveryExportLease = nil
        }) {
            if let exported, let recoveryExportLease {
                NativeApplicationShare(items: [exported], onCompletion: { recoveryExportLease.cleanup() })
            } else if let exported { NativeApplicationShare(items: [exported]) }
        }
        .refreshable { await model.refresh() }
        .onAppear { speakVisibleMessage(model.message) }
        .onChange(of: model.message) { value in speakVisibleMessage(value) }
    }
    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            if model.mode == "test" || !dynamicTypeSize.isAccessibilitySize {
                HStack(spacing: 6) {
                    Image(systemName: model.mode == "test" ? "testtube.2" : "sparkle")
                    Text(l10n(model.mode == "test" ? "TEST WORKSPACE" : "APPLICATIONS"))
                        .font(.caption.weight(.semibold)).tracking(1.8)
                }.foregroundStyle(ApplyDesign.accent)
            }
            Text(l10n("Applications"))
                .font(.system(.title, design: .default, weight: .semibold))
                .fixedSize(horizontal: false, vertical: true)
            if !dynamicTypeSize.isAccessibilitySize {
                Text(l10n("Prepare your details, choose a role and review your application options."))
                    .font(.subheadline).foregroundStyle(.secondary).lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private var manualApplicationGuide: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(l10n("Apply on the employer’s website")).font(.headline)
                .fixedSize(horizontal: false, vertical: true)
            Text(l10n("Save the job before opening the employer’s page. Check its requirements, location and deadline there."))
                .font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            Button(l10n("Connect application workspace")) { connectionSheet = true }
                .font(.subheadline).frame(minHeight: 44).disabled(model.busy)
                .accessibilityIdentifier("applications.connect")
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(ApplyDesign.card, in: RoundedRectangle(cornerRadius: 16))
    }
    private var profileCard: some View {
        VStack(alignment: .leading, spacing: 16) {
          Button { profileSheet = true } label: {
            HStack(alignment: .center, spacing: 14) {
                Image(systemName: "person.crop.rectangle")
                    .font(.title2).foregroundStyle(ApplyDesign.accent)
                    .frame(width: 48, height: 56).background(ApplyDesign.accentSurface, in: RoundedRectangle(cornerRadius: 13))
                VStack(alignment: .leading, spacing: 5) {
                    Text(model.profile.firstName.isEmpty ? l10n("Add your profile") : l10n.format("{0}'s application profile", [model.profile.firstName]))
                        .font(.headline).foregroundStyle(.primary)
                    Text(l10n(model.profileHasConflict ? "Phone draft · resolve profile changes" : model.profileNeedsSync ? "Phone draft · save before applying" : model.profileReadiness.nextAction))
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
            Text(l10n(label)).font(.caption2).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(14)
            .background(ApplyDesign.card, in: RoundedRectangle(cornerRadius: 16))
            .accessibilityElement(children: .combine)
    }
    private func opportunityAccessibilityLabel(for job: [String: ApplicationValue]) -> String {
        let title: String = job["title"]?.string ?? l10n("Opportunity")
        let company: String = job["company"]?.string ?? ""
        let location: String = job["location"]?.string ?? ""
        let titleAndCompany: String = l10n.format("{0} at {1}", [title, company])
        let locationLabel: String = l10n("Location")
        let spokenLocation: String = location.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? l10n("Location not specified") : location
        return titleAndCompany + ", " + locationLabel + ": \u{2068}" + spokenLocation + "\u{2069}"
    }
    private var opportunities: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(l10n("Your opportunities")).font(.title3.weight(.semibold))
                Spacer()
                Button { addSheet = true } label: { Label(l10n("Add"), systemImage: "plus").font(.subheadline.weight(.semibold)).padding(.vertical, 10) }
                    .disabled(model.busy).accessibilityLabel(l10n("Add an opportunity")).accessibilityIdentifier("applications.addOpportunity")
            }
            if model.jobs.isEmpty {
                empty(icon: "square.stack.3d.up", title: "No saved jobs yet",
                      detail: "Save a job link from any industry or country to review it later.")
                Button { addSheet = true } label: { Label(l10n("Add your first opportunity"), systemImage: "plus").frame(maxWidth: .infinity).padding(14) }
                    .buttonStyle(.bordered).tint(ApplyDesign.accent)
            }
            ForEach(model.jobs.compactMap { NativeApplicationRow($0) }) { row in
                let job = row.value, id = row.id
                let companyForInitial: String = job["company"]?.string ?? "?"
                let companyInitial: String = String(companyForInitial.prefix(1)).uppercased()
                VStack(alignment: .leading, spacing: 12) {
                    Button {
                        if model.selected.contains(id) { model.selected.remove(id) }
                        else if model.selected.count < 20 { model.selected.insert(id) }
                        else { model.message = "Review up to 20 opportunities in one batch." }
                    } label: {
                        HStack(alignment: .top, spacing: 12) {
                            Text(companyInitial)
                                .font(.title3.weight(.semibold)).foregroundStyle(ApplyDesign.accent)
                                .frame(width: 42, height: 42).background(ApplyDesign.accentSurface, in: RoundedRectangle(cornerRadius: 12))
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(job["title"]?.string ?? l10n("Opportunity")).font(.headline).foregroundStyle(.primary)
                                Text(job["company"]?.string ?? "").font(.subheadline).foregroundStyle(.secondary)
                                if let location = job["location"]?.string, !location.isEmpty {
                                    Label(location, systemImage: "mappin").font(.caption).foregroundStyle(.secondary)
                                }
                            }.frame(maxWidth: .infinity, alignment: .leading)
                            Image(systemName: model.selected.contains(id) ? "checkmark.circle.fill" : "circle")
                                .font(.title2).foregroundStyle(model.selected.contains(id) ? ApplyDesign.accent : NativeDesign.muted)
                                .frame(minWidth: 30, minHeight: 44)
                        }
                    }.buttonStyle(.plain).disabled(model.busy)
                        .accessibilityLabel(opportunityAccessibilityLabel(for: job))
                        .accessibilityIdentifier("applications.select." + id)
                        .accessibilityValue(l10n(model.selected.contains(id) ? "Selected" : "Not selected"))
                        .accessibilityHint(l10n("Select for application review"))
                    VStack(alignment: .leading, spacing: 8) {
                        Text(l10n(job["provider"]?.string == "lever" ? "Lever · eligibility checked at review" : "Employer website"))
                            .font(.caption2).foregroundStyle(.secondary)
                        if let raw = job["url"]?.string, let url = MobileApplicationPolicy.jobURL(raw) {
                            Link(destination: url) {
                                Label(l10n("Apply on the employer’s website"), systemImage: "arrow.up.right")
                                    .font(.subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
                                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                            }
                        }
                    }
                    if model.isMarkedApplied(job) {
                        Label(l10n("You marked this as applied"), systemImage: "person.crop.circle.badge.checkmark")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    if job["localOnly"]?.bool == true {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(l10n("Saved on this phone")).font(.caption2).foregroundStyle(.secondary)
                            Button(l10n("Remove saved link"), role: .destructive) {
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
                Text(l10n("Application receipts")).font(.headline)
                Spacer()
                if model.canExportApplicationReceipts {
                    Button { Task {
                        let result = await model.exportReceipts()
                        if let result, PhoneRecoveryStorage.isTemporaryExport(result) {
                            recoveryExportLease = PhoneRecoveryExportLease(file: result)
                        } else { recoveryExportLease = nil }
                        exported = result; exportSheet = result != nil
                    } } label: {
                        Image(systemName: "square.and.arrow.up").frame(minWidth: 44, minHeight: 44)
                    }.accessibilityLabel(l10n("Export application receipts"))
                }
            }
            if model.displayAttempts.isEmpty {
                empty(icon: "checkmark.seal", title: "No receipts yet",
                      detail: "A confirmed application includes a provider receipt. Opening a job link or preparing a draft never counts as a submission.")
            }
            ForEach(model.displayAttempts.reversed().compactMap { NativeApplicationRow($0) }) { row in
                NativeApplicationReceipt(attempt: row.value, onStop: model.showingSavedApplicationHistory ? nil : { planID, attemptID in
                    Task { await model.stopAndCheckReceipt(planID: planID, attemptID: attemptID) }
                })
            }
        }
    }
    private var coverage: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(l10n("Job links and applications"), systemImage: "globe").font(.subheadline.weight(.semibold))
            Text(l10n("Save job links from any country or profession and prepare applications. Open employer links to apply manually."))
                .font(.caption).foregroundStyle(.secondary).lineSpacing(3)
            Text(l10n("Live automatic submissions are currently disabled on the hosted preview. A custom application service requires an activated, authorized employer integration and your approval of the reviewed details."))
                .font(.caption).foregroundStyle(.secondary).lineSpacing(3)
            if dynamicTypeSize.isAccessibilitySize {
                Text(l10n("Confirmed submissions include a provider receipt."))
                    .font(.caption2).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            if !model.connected {
                Text(l10n("Your phone workspace remains available while it is disconnected."))
                    .font(.caption).foregroundStyle(.secondary).lineSpacing(3)
            }
        }.padding(.vertical, 6)
    }
    private var submissionAvailability: some View {
        let heading = model.liveSubmissionEnabled == false ? "Auto Apply is not activated" : "Submission availability is unverified"
        return VStack(alignment: .leading, spacing: 10) {
            Label(l10n(heading), systemImage: "info.circle").font(.subheadline.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("applications.availability.heading")
            Button(l10n("Refresh availability")) { Task { await model.refresh() } }
                .font(.subheadline).frame(minHeight: 44).disabled(model.busy)
                .accessibilityIdentifier("applications.availability.refresh")
            Text(l10n(model.liveSubmissionEnabled == false
                 ? "Your workspace is connected. Keep saving opportunities and preparing your profile. Automatic submission needs an activated employer integration; you can apply through employer links."
                 : "Your workspace is connected, but the service has not confirmed that live submission is available. Keep preparing your profile and checking employer links."))
                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(ApplyDesign.card, in: RoundedRectangle(cornerRadius: 16))
            .onAppear {
                UIAccessibility.post(notification: .announcement, argument: l10n(heading))
            }
            .onChange(of: model.liveSubmissionEnabled) { enabled in
                guard enabled != true else { return }
                UIAccessibility.post(notification: .announcement, argument: l10n(enabled == false ? "Auto Apply is not activated" : "Submission availability is unverified"))
            }
    }
    private func empty(icon: String, title: String, detail: String) -> some View {
        VStack(spacing: 15) {
            Image(systemName: icon).font(.system(size: 31, weight: .light)).foregroundStyle(ApplyDesign.accent)
                .frame(width: 72, height: 72).background(ApplyDesign.accentSurface, in: RoundedRectangle(cornerRadius: 23))
            Text(l10n(title)).font(.headline).multilineTextAlignment(.center)
            Text(l10n(detail)).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center).lineSpacing(3)
        }.frame(maxWidth: .infinity).padding(.horizontal, 24).padding(.vertical, 30)
            .background(ApplyDesign.card, in: RoundedRectangle(cornerRadius: 20))
    }
}

/// Keep a field's purpose visible while its saved value replaces the placeholder.
private struct NativeLabeledInput<Content: View>: View {
    let title: String
    let fieldID: String
    private let content: Content
    init(_ title: String, fieldID: String, @ViewBuilder content: () -> Content) {
        self.title = title; self.fieldID = fieldID; self.content = content()
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline.weight(.semibold)).foregroundStyle(Color.primary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier(fieldID + ".label")
            content.accessibilityLabel(title)
        }
    }
}

struct NativeApplicationProfileEditor: View {
    @NativeLocalization private var l10n
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
    @State private var emailFieldFocused = false
    @State private var reuseExpanded = false
    @State private var contactCopied = false
    private var layoutDirection: LayoutDirection {
        l10n.locale.language.languageCode?.identifier == "ar" ? .rightToLeft : .leftToRight
    }

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
            NativeForm {
                Section {
                    Text(l10n("Use your own experience and the CV you want employers to receive. Saving this profile does not submit an application."))
                        .font(.subheadline).foregroundStyle(.primary)
                }
                if let issue { Section { Text(l10n.message(issue)).foregroundStyle(NativeDesign.danger).accessibilityAddTraits(.updatesFrequently) } }
                if model.hasHistoricalRecovery {
                    Section {
                        NativeHistoricalRecovery(model: model)
                        if model.profileNeedsHistoricalRepair {
                            Text(l10n("Repair replaces unreadable characters with � in this draft. Review every field before saving. Choose a new PDF or remove the current one if its filename is affected."))
                                .font(.footnote).fixedSize(horizontal: false, vertical: true)
                            Button(l10n("Repair displayed text in this draft")) {
                                draft = model.repairedHistoricalProfileDraft(draft)
                            }.disabled(occupied).accessibilityIdentifier("profile.repairHistoricalText")
                        }
                    }
                }
                if conflicts {
                    Section {
                        Text(l10n("Your phone draft is kept. The service has a different version, so choose which details to keep before saving."))
                            .font(.subheadline).fixedSize(horizontal: false, vertical: true)
                        if let remote = model.latestServerProfile, let version = model.latestServerRevision {
                            DisclosureGroup(l10n("Compare the service profile")) { serverProfile(remote) }
                            Button(l10n("Keep my phone draft against this version")) {
                                if model.keepDraftAfterReview(draft, context: context, serverRevision: version) { resetFromModel() }
                                else { issue = model.message }
                            }
                            Button(l10n("Replace phone draft with service version"), role: .destructive) { replaceChoice = true }
                        } else {
                            Button(l10n("Refresh service profile")) { Task { await model.refresh() } }
                        }
                    } header: { Text(l10n("Resolve profile changes")) } footer: {
                        Text(l10n("Keeping your draft does not upload it. Review the CV and then tap Save. An unchanged CV will use the current service file."))
                    }
                }
                Section(l10n("About you")) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(l10n("First or single name"))
                            .font(.subheadline.weight(.semibold)).foregroundStyle(Color.primary)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("application.firstName.label")
                        TextField(l10n("First or single name"), text: $draft.firstName).textContentType(.givenName)
                            .accessibilityLabel(l10n("First or single name"))
                            .accessibilityIdentifier("application.firstName").focused($focusedField, equals: "firstName")
                    }
                    NativeLabeledInput(l10n("Last name (optional)"), fieldID: "application.lastName") {
                        TextField(l10n("Last name (optional)"), text: $draft.lastName).textContentType(.familyName)
                            .focused($focusedField, equals: "lastName").accessibilityIdentifier("application.lastName")
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Text(l10n("Email"))
                            .font(.subheadline.weight(.semibold)).foregroundStyle(Color.primary)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("application.email.label")
                        TextField(l10n("Email"), text: $draft.email).textContentType(.emailAddress).keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                            .accessibilityLabel(l10n("Email"))
                            .accessibilityIdentifier("application.email").focused($focusedField, equals: "email")
                    }
                    if ApplicationProfileReadiness(profile: draft).emailNeedsCorrection {
                        Text(l10n("Enter an email address employers can reply to."))
                            .font(.footnote).foregroundStyle(NativeDesign.danger).fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("application.email.issue")
                    }
                    NativeLabeledInput(l10n("Phone (optional)"), fieldID: "application.phone") {
                        TextField(l10n("Phone (optional)"), text: $draft.phone).textContentType(.telephoneNumber).keyboardType(.phonePad)
                            .focused($focusedField, equals: "phone").accessibilityIdentifier("application.phone")
                    }
                    NativeLabeledInput(l10n("City (optional)"), fieldID: "application.city") {
                        TextField(l10n("City (optional)"), text: $draft.city).textContentType(.addressCity)
                            .focused($focusedField, equals: "city").accessibilityIdentifier("application.city")
                    }
                    Picker(l10n("Country or region"), selection: $draft.country) {
                        Text(l10n("Choose (optional)")).tag("")
                        ForEach(Locale.Region.isoRegions.map(\.identifier).sorted { countryName($0) < countryName($1) }, id: \.self) { code in
                            Text(l10n(countryName(code))).tag(code)
                        }
                    }
                }
                if !contactReuseFields.isEmpty { contactReuseSection }
                Section {
                    Button { pickingPDF = true } label: {
                        Label(draft.resumeName.isEmpty ? l10n("Choose your PDF CV") : draft.resumeName, systemImage: "doc.badge.plus")
                            .fixedSize(horizontal: false, vertical: true).padding(.vertical, 8)
                    }
                    if readingPDF { ProgressView(l10n("Reading your selected PDF")) }
                    if !draft.resumeName.isEmpty {
                        if let size = draft.resumeSize { Text(l10n(ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file))).font(.caption).foregroundStyle(.secondary) }
                        Text(l10n(draft.resumeData == nil ? "CV stored in this application workspace." : "Exact file bytes saved with your phone draft."))
                            .font(.caption).foregroundStyle(.secondary)
                        if let hash = draft.resumeSHA256 {
                            DisclosureGroup(l10n("CV fingerprint")) {
                                Text(hash).environment(\.layoutDirection, .leftToRight).font(.caption.monospaced()).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        Button(l10n("Remove CV"), role: .destructive) { draft.removeResume() }
                    }
                } header: { Text(l10n("Your CV")) } footer: {
                    Text(l10n("PDF · up to 5 MB. A copied snapshot of the selected file is retained; changes to the original file do not change your saved selection."))
                }
                Section(l10n("Your experience")) {
                    NativeLabeledInput(l10n("Professional headline (optional)"), fieldID: "application.headline") {
                        TextField(l10n("Professional headline (optional)"), text: $draft.headline, axis: .vertical)
                            .focused($focusedField, equals: "headline").accessibilityIdentifier("application.headline")
                    }
                    NativeLabeledInput(l10n("Skills, separated by commas"), fieldID: "application.skills") {
                        TextField(l10n("Skills, separated by commas"), text: $draft.skills, axis: .vertical)
                            .focused($focusedField, equals: "skills").accessibilityIdentifier("application.skills")
                    }
                    NativeLabeledInput(l10n("Portfolio HTTPS link (optional)"), fieldID: "application.website") {
                        TextField(l10n("Portfolio HTTPS link (optional)"), text: $draft.website)
                            .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                            .focused($focusedField, equals: "website").accessibilityIdentifier("application.website")
                    }
                    Picker(l10n("Career stage"), selection: $draft.experienceLevel) {
                        Text(l10n("Any / not specified")).tag("any"); Text(l10n("Entry level")).tag("entry")
                        Text(l10n("Mid level")).tag("mid"); Text(l10n("Senior")).tag("senior")
                    }
                }
                Section {
                    NativeLabeledInput(l10n("LinkedIn profile (optional)"), fieldID: "application.linkedin") {
                        TextField(l10n("LinkedIn profile (optional)"), text: $draft.linkedin)
                            .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                            .focused($focusedField, equals: "linkedin").accessibilityIdentifier("application.linkedin")
                    }
                    if let url = MobileApplicationPolicy.linkedInProfileURL(draft.linkedin) {
                        Link(destination: url) { Label(l10n("Open LinkedIn profile"), systemImage: "arrow.up.right.square") }
                            .accessibilityIdentifier("application.openLinkedIn")
                    }
                } header: { Text(l10n("LinkedIn")) } footer: {
                    Text(l10n("Save your public profile link and review it before sharing it with an employer. This does not connect or verify your LinkedIn account. Opening LinkedIn uses its website or app."))
                        .foregroundStyle(Color.primary).fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("application.linkedinExplanation")
                }
                Section {
                    NativeLabeledInput(l10n("Target roles, separated by commas"), fieldID: "application.targetRoles") {
                        TextField(l10n("Target roles, separated by commas"), text: $draft.targetRoles, axis: .vertical)
                            .focused($focusedField, equals: "roles").accessibilityIdentifier("application.targetRoles")
                    }
                    NativeLabeledInput(l10n("Target country codes (optional)"), fieldID: "application.targetCountries") {
                        TextField(l10n("Target country codes (optional)"), text: $draft.targetCountries)
                            .textInputAutocapitalization(.characters).autocorrectionDisabled()
                            .focused($focusedField, equals: "countries").accessibilityIdentifier("application.targetCountries")
                    }
                    Toggle(l10n("Remote"), isOn: $draft.remote); Toggle(l10n("Hybrid"), isOn: $draft.hybrid); Toggle(l10n("On site"), isOn: $draft.onsite)
                } header: { Text(l10n("Job preferences")) } footer: {
                    Text(l10n("Enter two-letter country codes separated by commas, or leave them blank. Only a role you choose on Search fills the job-title field. Other preferences do not filter results or establish work authorization."))
                }
                Section {
                    Text(l10n(model.connected ? "Save synchronizes these details with your connected application service." :
                            "Your draft is stored privately on this phone. You can copy these details when applying on an employer’s website."))
                        .font(.caption).foregroundStyle(.secondary)
                    if changed {
                        Text(l10n("Use Cancel to save a phone draft, keep editing, or discard changes. Backgrounding the app keeps a local draft without uploading it."))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .disabled(occupied)
            .onChange(of: draft) { _ in contactCopied = false }
            .navigationTitle(l10n("Application profile")).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(l10n("Cancel")) {
                        focusedField = nil
                        if changed { dismissalChoice = true }
                        else { closingIntentionally = true; dismiss() }
                    }.disabled(occupied)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(l10n("Save")) {
                        Task {
                            if await model.saveProfile(draft, context: context) { closingIntentionally = true; dismiss() }
                            else { issue = model.message }
                        }
                    }.disabled(occupied || conflicts)
                }
                ToolbarItemGroup(placement: .keyboard) { Spacer(); Button(l10n("Done typing")) { focusedField = nil } }
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
            .confirmationDialog(l10n("Keep your profile changes?"), isPresented: $dismissalChoice, titleVisibility: .visible) {
                Button(l10n("Save draft on this phone")) {
                    if model.keepProfileDraft(draft, context: context) { closingIntentionally = true; dismiss() }
                    else { issue = model.message }
                }
                Button(l10n("Discard changes"), role: .destructive) {
                    if !checkpointed || model.discardCheckpoint(restoring: original, wasDirty: originallyDirty, context: context) {
                        closingIntentionally = true; dismiss()
                    } else { issue = model.message }
                }
                Button(l10n("Keep editing")) { dismissalChoice = false }
            } message: { Text(l10n("Saving a phone draft does not upload details or submit an application.")) }
            .confirmationDialog(l10n("Replace this phone draft?"), isPresented: $replaceChoice, titleVisibility: .visible) {
                Button(l10n("Use service version"), role: .destructive) {
                    if model.useLatestProfile(context: context) { resetFromModel() }
                    else { issue = model.message }
                }
                Button(l10n("Keep editing")) { replaceChoice = false }
            } message: { Text(l10n("This replaces the phone draft and any PDF selected only on this phone.")) }
        }
        .environment(\.layoutDirection, layoutDirection)
        .tint(ApplyDesign.accent).interactiveDismissDisabled(occupied || changed)
        .onAppear {
            model.profileEditing = true
            if conflicts {
                UIAccessibility.post(notification: .announcement, argument: l10n("Your phone draft is kept. The service has a different version, so choose which details to keep before saving."))
            }
        }
        .onChange(of: conflicts) { value in
            if value {
                UIAccessibility.post(notification: .announcement, argument: l10n("Your phone draft is kept. The service has a different version, so choose which details to keep before saving."))
            }
        }
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
        .onChange(of: focusedField) { field in
            if emailFieldFocused, field != "email", ApplicationProfileReadiness(profile: draft).emailNeedsCorrection {
                UIAccessibility.post(notification: .announcement, argument: l10n("Enter an email address employers can reply to."))
            }
            emailFieldFocused = field == "email"
        }
        .onChange(of: issue) { value in
            if let value { UIAccessibility.post(notification: .announcement, argument: l10n.message(value)) }
        }
    }
    private var contactReuseFields: [(id: String, label: String, value: String, leftToRight: Bool)] {
        [
            ("firstName", "First or single name", draft.firstName, false),
            ("lastName", "Last name", draft.lastName, false),
            ("email", "Email", draft.email, true),
            ("phone", "Phone", draft.phone, true),
            ("city", "City", draft.city, false),
            ("website", "Website or portfolio", draft.website, true),
            ("linkedin", "LinkedIn profile", draft.linkedin, true)
        ].filter { !$0.2.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }
    private var contactReuseSection: some View {
        Section {
            Button { focusedField = nil; reuseExpanded.toggle() } label: {
                Label(l10n("Reuse your contact details"), systemImage: reuseExpanded ? "chevron.up" : "chevron.down")
                    .fixedSize(horizontal: false, vertical: true).frame(minHeight: 44)
            }.accessibilityIdentifier("profile.reuse")
                .accessibilityValue(l10n(reuseExpanded ? "Expanded" : "Collapsed"))
            if reuseExpanded {
                ForEach(contactReuseFields, id: \.id) { field in
                    Button {
                        // The chosen field only; no account, form or network operation.
                        UIPasteboard.general.setItems([[UTType.utf8PlainText.identifier: field.value]],
                            options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(300)])
                        contactCopied = true
                        UIAccessibility.post(notification: .announcement,
                            argument: l10n("Copied. Paste it into the employer’s form and check it before submitting."))
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(l10n.format("Copy {0}", [l10n(field.label)]))
                            Text(field.value).font(.caption).foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                                .environment(\.layoutDirection, field.leftToRight ? .leftToRight : layoutDirection)
                        }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }.accessibilityIdentifier("profile.copy.\(field.id)")
                        .accessibilityLabel(l10n.format("Copy {0}", [l10n(field.label)]))
                        .accessibilityValue(field.value)
                }
                if contactCopied {
                    Text(l10n("Copied. Paste it into the employer’s form and check it before submitting."))
                        .font(.footnote).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("profile.copy.confirmation")
                }
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
            profileField("Career stage", displayedExperience(profile.experienceLevel))
            profileField("Target roles", profile.targetRoles); profileField("Target countries", profile.targetCountries)
            profileField("Work preferences", displayedWorkPreferences(profile))
            profileField("CV", profile.resumeName)
            if let hash = profile.resumeSHA256 { profileField("CV fingerprint", hash) }
        }.padding(.vertical, 8)
    }
    private func profileField(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(l10n(title)).font(.caption).foregroundStyle(.secondary)
            Text(value.isEmpty ? l10n("Not provided") : value).font(.subheadline).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
        }.accessibilityElement(children: .combine)
    }
    private func displayedExperience(_ stored: String) -> String {
        if let label = PhoneProfileDisplay.experienceLabel(for: stored) { return l10n(label) }
        return stored
    }
    private func displayedWorkPreferences(_ profile: PhoneApplicationProfile) -> String {
        PhoneProfileDisplay.workPreferenceLabels(remote: profile.remote, hybrid: profile.hybrid, onsite: profile.onsite)
            .map { l10n($0) }.joined(separator: ", ")
    }
    private func countryName(_ code: String) -> String { l10n.locale.localizedString(forRegionCode: code) ?? code }
}

struct NativeOpportunityEditor: View {
    @NativeLocalization private var l10n
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
            NativeForm {
                Section {
                    TextField("https://…", text: $draft.url).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .accessibilityLabel(l10n("Public HTTPS job link")).accessibilityIdentifier("opportunity.url")
                        .focused($focusedField, equals: "url").submitLabel(.next).onSubmit { focusedField = "title" }
                } header: { Text(l10n("Job link")) } footer: {
                    Text(l10n("Use the employer's public HTTPS posting. Connected Lever postings can import their published details. Drafts stay on this phone until you add the opportunity."))
                }
                Section(l10n("Opportunity details")) {
                    NativeLabeledInput(l10n("Role title"), fieldID: "opportunity.title") {
                        TextField(l10n("Role title"), text: $draft.title).accessibilityIdentifier("opportunity.title")
                            .focused($focusedField, equals: "title").submitLabel(.next).onSubmit { focusedField = "company" }
                    }
                    NativeLabeledInput(l10n("Employer"), fieldID: "opportunity.company") {
                        TextField(l10n("Employer"), text: $draft.company).accessibilityIdentifier("opportunity.company")
                            .focused($focusedField, equals: "company").submitLabel(.next).onSubmit { focusedField = "location" }
                    }
                    NativeLabeledInput(l10n("Location or remote"), fieldID: "opportunity.location") {
                        TextField(l10n("Location or remote"), text: $draft.location).focused($focusedField, equals: "location")
                            .accessibilityIdentifier("opportunity.location")
                    }
                    Picker(l10n("Country or region"), selection: $draft.country) {
                        Text(l10n("Not specified")).tag("")
                        ForEach(Locale.Region.isoRegions.map(\.identifier).sorted {
                            (l10n.locale.localizedString(forRegionCode: $0) ?? $0) < (l10n.locale.localizedString(forRegionCode: $1) ?? $1)
                        }, id: \.self) { code in
                            Text(l10n(l10n.locale.localizedString(forRegionCode: code) ?? code)).tag(code)
                        }
                    }
                }
                if let issue { Section { Text(l10n.message(issue)).foregroundStyle(NativeDesign.danger).accessibilityIdentifier("opportunity.error") } }
                Section {
                    Text(l10n("Saving a job does not apply to it. Automatic submission eligibility is checked when you review your selection."))
                        .font(.caption).foregroundStyle(.secondary)
                }
            }.disabled(model.busy).navigationTitle(l10n("Add opportunity")).navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(l10n("Cancel")) {
                            focusedField = nil
                            if changed { dismissalChoice = true }
                            else { closingIntentionally = true; dismiss() }
                        }.disabled(model.busy)
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(l10n("Add")) { Task {
                            guard model.keepOpportunityDraft(draft) else { issue = model.message; return }
                            if await model.addJob(url: draft.url, title: draft.title, company: draft.company, location: draft.location, country: draft.country) {
                                closingIntentionally = true; dismiss()
                            }
                            else { issue = model.message }
                        } }.disabled(model.busy || draft.url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            .accessibilityIdentifier("opportunity.save")
                    }
                    ToolbarItemGroup(placement: .keyboard) { Spacer(); Button(l10n("Done typing")) { focusedField = nil } }
                }
                .confirmationDialog(l10n("Keep this opportunity draft?"), isPresented: $dismissalChoice, titleVisibility: .visible) {
                    Button(l10n("Save draft on this phone")) {
                        if model.keepOpportunityDraft(draft) { closingIntentionally = true; dismiss() }
                        else { issue = model.message }
                    }
                    Button(l10n("Discard draft"), role: .destructive) {
                        if model.keepOpportunityDraft(PhoneOpportunityDraft()) { closingIntentionally = true; dismiss() }
                        else { issue = model.message }
                    }
                    Button(l10n("Keep editing")) { dismissalChoice = false }
                        .accessibilityIdentifier("opportunity.keepEditing")
                } message: { Text(l10n("Saving a draft does not add it to the service or submit an application.")) }
        }.tint(ApplyDesign.accent).interactiveDismissDisabled(model.busy || changed)
            .onChange(of: scenePhase) { phase in
                if phase != .active && changed { if !model.keepOpportunityDraft(draft) { issue = model.message } }
            }
            .onDisappear {
                if changed && !closingIntentionally { model.keepOpportunityDraft(draft) }
            }
            .onChange(of: issue) { value in
                if let value { UIAccessibility.post(notification: .announcement, argument: l10n.message(value)) }
            }
    }
}

/// Shared entry from Apply and Settings; connection fields remain private view state.
struct NativeApplicationConnection: View {
    @NativeLocalization private var l10n
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
            NativeForm {
                Section {
                    Image(systemName: "lock.shield").font(.largeTitle).foregroundStyle(ApplyDesign.accent).padding(.vertical, 8)
                    Text(l10n(model.connected ? "Your application workspace is connected." : "Connect your phone in two steps."))
                        .font(.title3.weight(.semibold))
                    Text(l10n("Your phone draft is uploaded only when you choose to save it to the connected service."))
                        .font(.subheadline).foregroundStyle(.primary)
                }
                if model.connected {
                    Section(l10n("Connected service")) {
                        Text(l10n(MobileApplicationPolicy.isHostedService(model.serviceAddress) ? "Career Finder" : "Your custom service")).font(.headline)
                        Button(l10n("Refresh applications")) { Task { await model.refresh() } }
                        Button(l10n("Disconnect this phone"), role: .destructive) { disconnectContext = model.editContext; disconnecting = true }
                        DisclosureGroup(l10n("Connection details")) {
                            Text(model.serviceAddress).environment(\.layoutDirection, .leftToRight).font(.footnote).textSelection(.enabled)
                            Text(l10n("The connection token stays in this phone's Keychain. Disconnecting keeps your phone draft and service history."))
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                } else {
                    if MobileApplicationPolicy.isHostedService(address),
                       let setup = MobileApplicationPolicy.servicePageURL(.connect, address: address) {
                        Section(l10n("1. Sign in and get a code")) {
                            Text(l10n("Career Finder")).font(.headline)
                            NativeHostedServiceLink(url: setup, prepare: { focusedField = nil }) {
                                Label(l10n("Sign in and get a code"), systemImage: "safari")
                            }
                                .accessibilityIdentifier("connection.signIn")
                                .disabled(model.busy)
                            Text(l10n("Choose an available sign-in method, or use Google through ChatGPT. Return to your existing account before connecting another provider; matching emails do not merge workspaces. Create a code, then return here."))
                                .font(.footnote).foregroundStyle(.primary)
                        }
                    } else {
                        Section(l10n("1. Get a code")) {
                            Text(l10n("Ask your custom service operator for a one-time connection code."))
                            Text(l10n("Check the address under Use another service before connecting.")).font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    Section {
                        SecureField(l10n("One-time connection code"), text: $code).keyboardType(.asciiCapable)
                            .textInputAutocapitalization(.characters).autocorrectionDisabled()
                            .focused($focusedField, equals: "code").submitLabel(.done).onSubmit { focusedField = nil }
                            .accessibilityIdentifier("connection.code")
                        Button {
                            Task {
                                if await model.connect(address: address, code: code) { code = ""; dismiss() }
                                else { code = ""; issue = model.message }
                            }
                        } label: {
                            HStack { if model.busy { ProgressView() }; Text(l10n("Connect this phone")) }
                        }.disabled(model.busy || address.isEmpty || code.isEmpty)
                            .accessibilityIdentifier("connection.connect")
                    } header: { Text(l10n("2. Paste your code")) } footer: {
                        Text(l10n("Enter the code you just created. Connecting alone does not upload your profile or apply for a job."))
                    }
                    Section {
                        DisclosureGroup(l10n("Use another service"), isExpanded: $advanced) {
                            HStack(spacing: 8) {
                                TextField("https://service.example", text: $address).keyboardType(.URL)
                                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                                    .focused($focusedField, equals: "address").submitLabel(.done).onSubmit { focusedField = nil }
                                    .accessibilityLabel(l10n("Application service HTTPS address")).accessibilityIdentifier("connection.address")
                                if !address.isEmpty {
                                    Button {
                                        address = ""
                                        focusedField = "address"
                                    } label: {
                                        Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                                            .frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                                    }.buttonStyle(.plain).disabled(model.busy)
                                        .accessibilityLabel(l10n("Clear service address"))
                                        .accessibilityIdentifier("connection.clearAddress")
                                }
                            }
                            Text(l10n("Advanced: use the HTTPS address from your own service operator. Its account, privacy and submission features may differ."))
                                .font(.footnote).foregroundStyle(.secondary)
                            if !MobileApplicationPolicy.isHostedService(address) {
                                Button(l10n("Use Career Finder")) { address = MobileApplicationPolicy.hostedServiceOrigin; advanced = false }
                            }
                        }
                    }
                }
                if let issue {
                    Section {
                        Text(l10n.message(issue)).foregroundStyle(NativeDesign.danger).fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("connection.issue")
                    }
                } else if let notice = model.message {
                    Section { Text(l10n(notice)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
                }
                Section(l10n("Account and privacy")) {
                    NativeApplicationServiceLinks(address: model.connected ? model.serviceAddress : address,
                                                  includeConnection: model.connected)
                    DisclosureGroup(l10n("How your data is kept")) {
                        Text(l10n("The service keeps application attempts and provider receipts. Auto Apply needs an activated employer integration; other jobs still open on the employer website."))
                        Text(l10n("Disconnecting keeps your phone draft and does not delete service data. Manage account opens the separate deletion option. Employer copies are governed by that employer."))
                    }.font(.footnote).foregroundStyle(.secondary)
                }
            }.navigationTitle(l10n("Application connection")).navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button(l10n("Done")) { dismiss() } }
                    ToolbarItemGroup(placement: .keyboard) { Spacer(); Button(l10n("Done typing")) { focusedField = nil } }
                }
        }.tint(ApplyDesign.accent).interactiveDismissDisabled(model.busy)
            .onChange(of: address) { _ in code = ""; issue = nil }
            .onChange(of: issue) { value in
                if let value { UIAccessibility.post(notification: .announcement, argument: l10n.message(value)) }
            }
            .confirmationDialog(l10n("Disconnect this phone?"), isPresented: $disconnecting, titleVisibility: .visible) {
                Button(l10n("Disconnect this phone"), role: .destructive) {
                    guard let captured = disconnectContext,
                          captured.workspaceID == model.editContext.workspaceID,
                          captured.serviceAddress == model.editContext.serviceAddress else { issue = "The connection changed. It has been kept."; return }
                    Task { await model.disconnect(); if !model.connected { dismiss() } }
                }
                Button(l10n("Keep connected"), role: .cancel) { disconnectContext = nil }
            } message: { Text(l10n("Your phone draft and service application history will be kept. You can reconnect with a new code.")) }
    }
}

struct NativeApplicationServiceLinks: View {
    @NativeLocalization private var l10n
    let address: String
    var includeConnection = true
    var body: some View {
        if MobileApplicationPolicy.isHostedService(address) {
            if includeConnection, let url = MobileApplicationPolicy.servicePageURL(.connect, address: address) {
                NativeHostedServiceLink(url: url) { Text(l10n("Set up or recover workspace access")) }
            }
            if let url = MobileApplicationPolicy.servicePageURL(.privacy, address: address) {
                Link(l10n("Hosted service privacy policy"), destination: url)
            }
            if let url = MobileApplicationPolicy.servicePageURL(.support, address: address) {
                Link(l10n("Get application-service support"), destination: url)
            }
            if let url = MobileApplicationPolicy.servicePageURL(.account, address: address) {
                NativeHostedServiceLink(url: url) { Text(l10n("Manage account and delete hosted data")) }
            }
        } else {
            Text(l10n("For this custom service, ask its operator for a new workspace invitation, its privacy policy, support and account deletion. Its connection and data practices are separate from the hosted Career Finder service."))
                .font(.footnote).foregroundStyle(.secondary)
        }
    }
}

/// The hosted service still creates a code that the person copies and pastes.
/// This presentation does not receive an authentication callback or read web data.
@MainActor
private struct NativeHostedServiceLink<Label: View>: View {
    let url: URL
    private let prepare: () -> Void
    private let label: Label
    @State private var presented = false

    init(url: URL, prepare: @escaping () -> Void = {}, @ViewBuilder label: () -> Label) {
        self.url = url
        self.prepare = prepare
        self.label = label()
    }

    var body: some View {
        Button {
            prepare()
            presented = true
        } label: {
            label
        }
        .disabled(presented)
        .background {
            NativeHostedServicePresenter(url: url, isPresented: $presented)
                .frame(width: 0, height: 0)
        }
    }
}

/// An empty, attached presentation anchor. Safari is presented directly with
/// UIKit's default Safari transition; it is never embedded as a child controller.
@MainActor
private struct NativeHostedServicePresenter: UIViewControllerRepresentable {
    let url: URL
    @Binding var isPresented: Bool

    func makeUIViewController(context: Context) -> Presenter {
        let controller = Presenter()
        controller.view.backgroundColor = .clear
        controller.view.isUserInteractionEnabled = false
        return controller
    }

    func updateUIViewController(_ controller: Presenter, context: Context) {
        controller.update(requestedURL: isPresented ? url : nil) {
            isPresented = false
            #if DEBUG
            CareerAppEnvironment.recordBrowserLifecycle(.bindingAssignedFalse, flags: [.bindingPresented: isPresented])
            #endif
        }
    }

    static func dismantleUIViewController(_ controller: Presenter, coordinator: ()) {
        controller.dismantle()
    }

    @MainActor
    final class Presenter: UIViewController, @MainActor SFSafariViewControllerDelegate, UIAdaptivePresentationControllerDelegate {
        private var requestedURL: URL?
        private var browser: SFSafariViewController?
        private var onDismiss: (() -> Void)?
        private var dismissalReported = false
        private var dismantled = false

        func update(requestedURL: URL?, onDismiss: @escaping () -> Void) {
            self.requestedURL = requestedURL
            self.onDismiss = onDismiss
            #if DEBUG
            traceBrowserLifecycle(.bindingUpdate)
            #endif
            presentIfReady()
        }

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            #if DEBUG
            traceBrowserLifecycle(.presenterDidAppear)
            #endif
            presentIfReady()
        }

        private func presentIfReady() {
            // UIKit can retain a dismissed controller briefly. Reopening is
            // allowed only once that exact controller has left presentation.
            if let current = browser, current.presentingViewController == nil,
               !current.isBeingPresented, !current.isBeingDismissed {
                #if DEBUG
                traceBrowserLifecycle(.detachedBrowserObserved, controller: current)
                #endif
                reportDismissal(of: current)
                browser = nil
            }
            guard !dismantled, let url = requestedURL, viewIfLoaded?.window != nil,
                  browser == nil, presentedViewController == nil,
                  !isBeingPresented, !isBeingDismissed else { return }
            let controller = SFSafariViewController(url: url)
            controller.delegate = self
            controller.dismissButtonStyle = .done
            controller.view.accessibilityIdentifier = "hostedService.browser"
            browser = controller
            dismissalReported = false
            // Keep Safari's default modal presentation and transitioning delegate.
            #if DEBUG
            traceBrowserLifecycle(.presentRequested, controller: controller)
            present(controller, animated: true) { [weak self, weak controller] in
                guard let self, let controller else { return }
                self.traceBrowserLifecycle(.presentCompleted, controller: controller)
            }
            #else
            present(controller, animated: true)
            #endif
            controller.presentationController?.delegate = self
        }

        func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
            #if DEBUG
            traceBrowserLifecycle(.delegateDidFinish, controller: controller)
            #endif
            reportDismissal(of: controller)
            // Safari dismisses itself after this callback. Do not begin a
            // competing dismiss transition when the binding becomes false.
        }

        func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
            guard let controller = presentationController.presentedViewController as? SFSafariViewController else { return }
            #if DEBUG
            traceBrowserLifecycle(.presentationDidDismiss, controller: controller)
            #endif
            reportDismissal(of: controller)
        }

        private func reportDismissal(of controller: SFSafariViewController) {
            #if DEBUG
            traceBrowserLifecycle(.reportDismissalEntered, controller: controller)
            #endif
            guard browser === controller, !dismissalReported else { return }
            dismissalReported = true
            requestedURL = nil
            onDismiss?()
            #if DEBUG
            traceBrowserLifecycle(.reportDismissalApplied, controller: controller)
            #endif
        }

        #if DEBUG
        private func traceBrowserLifecycle(_ event: CareerAppEnvironment.BrowserLifecycleEvent,
                                           controller: SFSafariViewController? = nil) {
            guard CareerAppEnvironment.isUIAcceptance else { return }
            let observed = controller ?? browser
            CareerAppEnvironment.recordBrowserLifecycle(event, flags: [
                .requestedPresentation: requestedURL != nil,
                .hasTrackedBrowser: browser != nil,
                .hasObservedController: observed != nil,
                .matchesTrackedBrowser: observed != nil && browser === observed,
                .dismissalReported: dismissalReported,
                .dismantled: dismantled,
                .hasDismissCallback: onDismiss != nil,
                .presenterInWindow: viewIfLoaded?.window != nil,
                .presenterIsBeingPresented: isBeingPresented,
                .presenterIsBeingDismissed: isBeingDismissed,
                .presentedControllerIsObserved: observed != nil && presentedViewController === observed,
                .observedHasPresenter: observed?.presentingViewController != nil,
                .observedIsBeingPresented: observed?.isBeingPresented ?? false,
                .observedIsBeingDismissed: observed?.isBeingDismissed ?? false,
                .observedViewInWindow: observed?.viewIfLoaded?.window != nil
            ])
        }
        #endif

        func dismantle() {
            #if DEBUG
            traceBrowserLifecycle(.dismantleEntered)
            #endif
            dismantled = true
            requestedURL = nil
            onDismiss = nil
            // Teardown only the exact browser this anchor created. Never
            // dismiss a different controller or a parent connection sheet.
            if let current = browser, current.presentingViewController != nil,
               !current.isBeingDismissed {
                #if DEBUG
                traceBrowserLifecycle(.teardownDismissRequested, controller: current)
                current.dismiss(animated: false) { [weak current] in
                    CareerAppEnvironment.recordBrowserLifecycle(.teardownDismissCompleted, flags: [
                        .hasObservedController: current != nil,
                        .observedHasPresenter: current?.presentingViewController != nil,
                        .observedIsBeingPresented: current?.isBeingPresented ?? false,
                        .observedIsBeingDismissed: current?.isBeingDismissed ?? false,
                        .observedViewInWindow: current?.viewIfLoaded?.window != nil
                    ])
                }
                #else
                current.dismiss(animated: false)
                #endif
            }
            browser = nil
            #if DEBUG
            traceBrowserLifecycle(.dismantleFinished)
            #endif
        }
    }
}

private struct NativeApplicationReview: View {
    @NativeLocalization private var l10n
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
            NativeList {
                Section {
                    Text(l10n("Review application details")).font(.largeTitle.weight(.bold))
                    Text(l10n("Review the exact details below. Only eligible applications in this review will be sent."))
                        .font(.subheadline).foregroundStyle(.secondary)
                    if model.mode == "test" {
                        Label(l10n("Test workspace — no real employer application"), systemImage: "testtube.2").foregroundStyle(.orange)
                    }
                }
                if model.reviewNeedsHistoricalRepair || model.reconciliationRequired { Section { NativeHistoricalRecovery(model: model) } }
                ForEach(items.compactMap { NativeApplicationRow($0, idKey: "jobId") }) { row in
                    let item = row.value
                    let job = item["job"]?.object ?? [:]
                    let jobID = item["jobId"]?.string ?? ""
                    Section {
                        Text(job["title"]?.string ?? l10n("Opportunity")).font(.headline)
                        Text(job["company"]?.string ?? "").foregroundStyle(.secondary)
                        if eligible(item) {
                            Label(l10n("Ready for your approval"), systemImage: "checkmark.circle").foregroundStyle(ApplyDesign.accent)
                        } else {
                            Label(l10n.message(item["reason"]?.string ?? "Complete this application on the employer's website."), systemImage: "exclamationmark.circle")
                                .font(.subheadline).foregroundStyle(.orange)
                        }
                        let summary = item["payloadSummary"]?.object ?? [:]
                        ForEach(summary.keys.sorted(), id: \.self) { key in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(l10n(fieldLabels[key] ?? key)).font(.caption).foregroundStyle(.secondary)
                                Text(l10n.displayValue(summary[key])).font(.subheadline)
                                    .textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                            }.accessibilityElement(children: .combine)
                        }
                        let cvDetails = ApplicationCVDetails(reviewItem: item, plan: model.plan ?? [:])
                        NativeApplicationDetails(resumeName: cvDetails.resumeName, profileRevision: cvDetails.profileRevision,
                            contextID: "review." + (model.plan?["id"]?.string ?? "") + "." + jobID)
                        if cvDetails.resumeName != nil {
                            if let size = item["resume"]?.object["size"]?.integer {
                                Text(l10n(ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file))).font(.caption).foregroundStyle(.secondary)
                            }
                            if let hash = item["resume"]?.object["sha256"]?.string {
                                DisclosureGroup(l10n("CV fingerprint")) {
                                    Text(hash).environment(\.layoutDirection, .leftToRight).font(.caption.monospaced()).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                        if let raw = item["privacyPolicyUrl"]?.string, let url = MobileApplicationPolicy.jobURL(raw) {
                            Link(l10n("Read this employer's privacy policy"), destination: url)
                        }
                        if !previouslyApproved { DisclosureGroup(l10n("Application choices")) {
                            TextField(l10n("Message to this employer (optional)"), text: Binding(
                                get: { model.answers[jobID]?["comments"]?.string ?? "" },
                                set: { model.answers[jobID, default: [:]]["comments"] = .string($0); changed = true; approved = false }
                            ), axis: .vertical)
                            Picker(l10n("Store and process this application"), selection: consentBinding(jobID, "consentStore")) {
                                Text(l10n("Not answered")).tag("")
                                Text(l10n("I agree")).tag("yes")
                                Text(l10n("I do not agree")).tag("no")
                            }
                            Picker(l10n("Contact me about future roles"), selection: consentBinding(jobID, "consentMarketing")) {
                                Text(l10n("Not answered")).tag("")
                                Text(l10n("Yes")).tag("yes")
                                Text(l10n("No")).tag("no")
                            }
                            Text(l10n("Review this employer's policy before choosing. You can explicitly decline future-role contact. Changed choices are included only after you update the review."))
                                .font(.caption).foregroundStyle(.secondary)
                        } }
                        if item["state"]?.string == "rate_limited", let retry = ApplicationReviewPolicy.date(item["retryAt"]?.string) {
                            Text(l10n.format("Retry becomes available after {0}. Refresh this review when the waiting period ends.", [String(describing: l10n.date(retry, includeTime: true))]))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                if changed {
                    Section {
                        Button(l10n("Update review with my choices")) {
                            Task {
                                let previous = model.plan?["digest"]?.string
                                await model.prepare(manualAppliedURLs: manualAppliedURLs, replacingUnapprovedReview: true)
                                if let current = model.plan?["digest"]?.string, current != previous { changed = false; approved = false }
                            }
                        }.disabled(model.busy)
                        if let message = model.message { Text(l10n(message)).font(.caption).foregroundStyle(.secondary) }
                    }
                }
                Section {
                    if !model.submissionAvailable {
                        Text(l10n("Automatic submission is unavailable for this connection. Return to the application workspace to refresh availability, or use the employer's website."))
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    Toggle(l10n("I approve sending these details and my selected CV to the listed eligible employers."), isOn: $approved)
                        .font(.subheadline)
                        .disabled(!model.submissionAvailable)
                    if model.profileNeedsSync {
                        Text(l10n("Save your current application details before approving this review."))
                            .font(.caption).foregroundStyle(.orange)
                    }
                    Text(l10n("An uncertain result will stay paused for verification. Opening an employer link does not count as a submission."))
                        .font(.caption).foregroundStyle(.secondary)
                    if previouslyApproved {
                        Text(l10n("This restores the same reviewed details. Stop this review first if you need to change them."))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                Section {
                    Button {
                        Task { if await model.submitReviewed() { dismiss() } }
                    } label: {
                        Label(l10n.format("Auto Apply · jobs: {0}", [String(describing: ready)]), systemImage: "paperplane.fill")
                            .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 10)
                    }.buttonStyle(.borderedProminent).tint(ApplyDesign.actionFill)
                        .disabled(!approved || changed || ready == 0 || model.busy || model.profileNeedsSync || !model.submissionAvailable
                            || model.reviewNeedsHistoricalRepair || model.profileNeedsHistoricalRepair || model.reconciliationRequired || model.recoveryIntegrityFailed)
                }
                if let id = model.plan?["id"]?.string {
                    Section {
                        Button(l10n("Stop this review"), role: .destructive) {
                            Task { await model.stopReview(id); if model.plan == nil { dismiss() } }
                        }.disabled(model.busy)
                    }
                }
            }.accessibilityIdentifier("application.review.content").disabled(model.busy).navigationTitle(l10n("Review applications")).navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(l10n("Back")) { if changed { discardChoices = true } else { dismiss() } }.disabled(model.busy)
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(l10n("Refresh")) {
                            Task {
                                await model.refresh()
                            }
                        }.disabled(model.busy)
                    }
                }
            .confirmationDialog(l10n("Discard changes to this review?"), isPresented: $discardChoices, titleVisibility: .visible) {
                Button(l10n("Discard changes and go back"), role: .destructive) {
                    if let current = model.plan { _ = model.resumeReview(current) }
                    dismiss()
                }
                Button(l10n("Keep editing")) { discardChoices = false }
            } message: { Text(l10n("The saved review remains available. Your unreviewed message and permission changes will be discarded.")) }
        }.tint(ApplyDesign.accent).interactiveDismissDisabled(model.busy || changed)
            .onChange(of: model.plan?["digest"]?.string) { _ in approved = false }
            .onChange(of: model.plan?["approvedAt"]?.string) { _ in approved = false; changed = false }
            .onChange(of: model.plan?["id"]?.string) { id in if id == nil { dismiss() } }
            .onAppear {
                if !model.submissionAvailable {
                    UIAccessibility.post(notification: .announcement, argument: l10n("Automatic submission is unavailable for this connection. Return to the application workspace to refresh availability, or use the employer's website."))
                } else if model.profileNeedsSync {
                    UIAccessibility.post(notification: .announcement, argument: l10n("Save your current application details before approving this review."))
                }
            }
            .onChange(of: model.submissionAvailable) { available in
                if !available {
                    UIAccessibility.post(notification: .announcement, argument: l10n("Automatic submission is unavailable for this connection. Return to the application workspace to refresh availability, or use the employer's website."))
                }
            }
            .onChange(of: model.profileNeedsSync) { needsSync in
                if needsSync, model.submissionAvailable {
                    UIAccessibility.post(notification: .announcement, argument: l10n("Save your current application details before approving this review."))
                }
            }
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

/// A filename is historical context, not proof that an employer received an application.
struct NativeApplicationDetails: View {
    @NativeLocalization private var l10n
    let resumeName: String?
    let profileRevision: Int?
    let contextID: String
    var manual = false
    var body: some View {
        DisclosureGroup {
            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(l10n(manual ? "Filename you recorded" : "Reviewed CV")).foregroundStyle(.secondary)
                    if let name = resumeName, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text(verbatim: "\u{2068}" + name + "\u{2069}")
                            .textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                    } else { Text(l10n("CV not recorded")) }
                }.accessibilityElement(children: .combine)
                    .accessibilityIdentifier("application.details." + contextID + ".resume")
                if !manual, let revision = profileRevision {
                    LabeledContent(l10n("Profile version"), value: revision.formatted(.number.locale(l10n.locale)))
                        .accessibilityIdentifier("application.details." + contextID + ".revision")
                }
                if manual {
                    Text(l10n("Self-entered information. This is not a submission receipt."))
                        .foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }.font(.caption).padding(.top, 6)
        } label: {
            Text(l10n("Application details")).accessibilityIdentifier("application.details." + contextID)
        }.font(.subheadline)
    }
}

private struct NativeApplicationReceipt: View {
    @NativeLocalization private var l10n
    let attempt: [String: ApplicationValue]
    var onStop: ((_ planID: String, _ attemptID: String) -> Void)? = nil
    private var test: Bool { attempt["evidenceMode"]?.string == "test" }
    private var verified: Bool { MobileApplicationPolicy.isVerified(attempt) }
    private var contextID: String { "attempt." + (attempt["id"]?.string ?? attempt["attemptId"]?.string ?? "") }
    private var state: String { MobileApplicationPolicy.displayState(attempt) }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(attempt["title"]?.string ?? attempt["job"]?.object["title"]?.string ?? l10n("Application")).font(.headline)
                    Text(attempt["company"]?.string ?? attempt["job"]?.object["company"]?.string ?? "").font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                Image(systemName: verified ? "checkmark.seal.fill" : state == "uncertain" ? "clock.badge.questionmark" : "paperplane")
                    .foregroundStyle(verified && !test ? ApplyDesign.accent : NativeDesign.muted)
            }
            Text(l10n(MobileApplicationPolicy.stateTitle(state, test: test))).font(.caption.weight(.semibold))
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(verified && !test ? ApplyDesign.accentSurface : Color.secondary.opacity(0.09), in: Capsule())
                .accessibilityIdentifier("application.state." + contextID)
            if state == "uncertain" {
                Text(l10n("The service could not establish whether the employer accepted this application. It will not be sent again automatically."))
                    .font(.caption).foregroundStyle(.secondary)
            }
            if state == "dispatching", let onStop,
               let planID = attempt["planId"]?.string, !planID.isEmpty, planID.utf16.count <= 200,
               let attemptID = attempt["attemptId"]?.string ?? attempt["id"]?.string, !attemptID.isEmpty, attemptID.utf16.count <= 200 {
                Button(l10n("Stop")) { onStop(planID, attemptID) }.frame(minHeight: 44)
            }
            if let message = attempt["error"]?.object["message"]?.string ?? attempt["reason"]?.string, !message.isEmpty {
                Text(l10n(message)).font(.caption).foregroundStyle(.secondary)
            }
            let cvDetails = ApplicationCVDetails(attempt: attempt)
            NativeApplicationDetails(resumeName: cvDetails.resumeName, profileRevision: cvDetails.profileRevision, contextID: contextID)
            DisclosureGroup(l10n(verified ? "Receipt details" : state == "ready" ? "Draft details" : "Attempt details")) {
                VStack(alignment: .leading, spacing: 10) {
                    if let id = attempt["applicationId"]?.string, verified {
                        LabeledContent(l10n("Provider application ID"), value: id).textSelection(.enabled)
                    }
                    if let at = attempt["confirmedAt"]?.string ?? attempt["dispatchedAt"]?.string {
                        LabeledContent(l10n("Recorded at"), value: ApplicationReviewPolicy.date(at).map { l10n.date($0, includeTime: true) } ?? at).textSelection(.enabled)
                    }
                    ForEach(["attemptId", "resumeSHA256", "payloadSHA256", "requirementsRevision"], id: \.self) { key in
                        if let value = attempt[key]?.string {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(l10n(key == "resumeSHA256" ? "CV fingerprint" : key == "payloadSHA256" ? "Application fingerprint" :
                                        key == "attemptId" ? "Attempt ID" : "Employer requirements version")).foregroundStyle(.secondary)
                                Text(value).font(.caption.monospaced()).textSelection(.enabled)
                            }
                        }
                    }
                    if test { Text(l10n("Synthetic test evidence. This is not a real employer receipt.")).foregroundStyle(.orange) }
                }.font(.caption).padding(.top, 10)
            }.font(.caption)
        }.padding(17).background(ApplyDesign.card, in: RoundedRectangle(cornerRadius: 18))
    }
}

struct NativePhoneDataScreen: View {
    @NativeLocalization private var l10n
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
        model.workspaceScope.isLocal ? l10n("Unpaired phone workspace") : model.workspaceScope.origin + " · " + String(model.workspaceScope.workspaceID.suffix(8))
    }
    var body: some View {
        NativeList {
            Section(l10n("Current phone workspace")) {
                Text(target).font(.subheadline).textSelection(.enabled)
                Text(l10n("Your local profile, selected PDF, saved links, private records, their history and unfinished record drafts are kept separately for each workspace."))
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if let issue { Section { Text(l10n.message(issue)).foregroundStyle(NativeDesign.danger).fixedSize(horizontal: false, vertical: true) } }
            if let notice = model.message { Section { Text(l10n(notice)).font(.footnote).fixedSize(horizontal: false, vertical: true) } }
            if model.hasHistoricalRecovery || model.reconciliationRequired { Section { NativeHistoricalRecovery(model: model) } }
            Section(l10n("Export and recovery")) {
                Button(l10n("Export this phone workspace")) {
                    do {
                        if let file = model.exportWorkspace(context: model.workspaceActionContext, discoverySnapshot: try discovery.exportSnapshot()) { exported = file; sharing = true; issue = nil }
                        else { issue = model.message }
                    } catch { issue = error.localizedDescription }
                }.accessibilityIdentifier("phoneData.export")
                Button(l10n(reading ? "Reading backup…" : "Import a phone workspace backup")) {
                    context = model.workspaceActionContext; selecting = true
                }.disabled(reading).accessibilityIdentifier("phoneData.import")
                Text(l10n("The JSON backup contains readable personal information, including your selected PDF when it is on this phone and this workspace's search draft/results. Keep it private. It does not contain connection credentials, online application approvals, provider receipts, or the separate planning notes."))
                    .font(.footnote).foregroundStyle(.secondary)
                Text(l10n("Import replaces this phone's profile draft and merges saved links and private record history. Existing record versions are retained for comparison. It does not upload data or approve applications."))
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if !model.unfinishedRecordDrafts.isEmpty || !model.recoveredRecordDrafts.isEmpty {
                Section(l10n("Unfinished record edits")) {
                    ForEach(Array(model.unfinishedRecordDrafts.enumerated()), id: \.offset) { _, draft in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(draft.job.title).font(.subheadline)
                            Text(draft.draft.note.isEmpty ? l10n("No private note") : draft.draft.note)
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    if !model.recoveredRecordDrafts.isEmpty {
                        Text(l10n("Other recovered edit versions")).font(.subheadline.weight(.semibold))
                        ForEach(Array(model.recoveredRecordDrafts.enumerated()), id: \.offset) { _, draft in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(draft.job.title).font(.subheadline)
                                Text(draft.draft.note.isEmpty ? l10n("No private note") : draft.draft.note)
                                    .font(.footnote).foregroundStyle(.secondary)
                                Button(l10n("Use this unfinished edit")) {
                                    if model.useRecoveredRecordDraft(draft) { issue = nil } else { issue = model.message }
                                }.frame(minHeight: 44)
                            }
                        }
                    }
                }
            }
            if !model.recoveredOpportunityDrafts.isEmpty {
                Section(l10n("Recovered opportunity drafts")) {
                    ForEach(Array(model.recoveredOpportunityDrafts.enumerated()), id: \.offset) { _, draft in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(draft.title.isEmpty ? l10n("Unfinished opportunity") : draft.title).font(.subheadline)
                            if !draft.company.isEmpty { Text(draft.company).font(.footnote).foregroundStyle(.secondary) }
                            if !draft.url.isEmpty { Text(draft.url).font(.footnote).foregroundStyle(.secondary).textSelection(.enabled) }
                            Button(l10n("Continue this opportunity")) {
                                if model.restoreRecoveredOpportunityDraft(draft) { issue = nil } else { issue = model.message }
                            }.frame(minHeight: 44)
                        }
                    }
                }
            }
            Section(l10n("Earlier local planning records")) {
                NavigationLink { NativeLegacyBackupScreen() } label: {
                    Label(l10n("Review earlier records and backups"),systemImage:"archivebox")
                }.accessibilityIdentifier("phoneData.legacyPlanning")
                Text(l10n("Separate planning notes and older backup files stay local. They are never adopted by a connected account automatically."))
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if model.hasUnpairedDraft {
                Section(l10n("Separate unpaired draft")) {
                    Button(l10n("Review copying my unpaired draft here")) { context = model.workspaceActionContext; copyingUnpaired = true }
                    Text(l10n("Connecting kept your earlier phone draft separate. Copy it only if it belongs to the person using this workspace; the original remains available."))
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            if !model.savedWorkspaceScopes.isEmpty {
                Section(l10n("Other workspaces on this phone")) {
                    ForEach(Array(model.savedWorkspaceScopes.enumerated()), id: \.offset) { _, scope in
                        Button(scope.isLocal ? l10n("Open unpaired phone workspace") : l10n.format("Open saved workspace · {0}", [String(scope.workspaceID.suffix(8))])) {
                            if !model.openPhoneWorkspace(scope, context: model.workspaceActionContext) { issue = model.message }
                            else { issue = nil }
                        }
                    }
                    Text(l10n("Opening another saved workspace disconnects this phone first. It does not move a profile, CV or note into another account."))
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            Section {
                Button(l10n("Clear this workspace from this phone"), role: .destructive) { context = model.workspaceActionContext; clearing = true }
                    .accessibilityIdentifier("phoneData.clear")
            } header: { Text(l10n("Local data")) } footer: {
                Text(l10n("Export first if you need a copy. Clearing removes this workspace's local profile, PDF, saved links and private notes/history, and disables this phone connection. Other workspaces and cloud/employer records remain. Restrictive Stop holds remain so an old approved plan cannot silently resume."))
            }
        }.navigationTitle(l10n("Phone data")).navigationBarTitleDisplayMode(.inline).tint(ApplyDesign.accent)
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
            .alert(l10n("Import into this phone workspace?"), isPresented: $importing) {
                Button(l10n("Replace draft and merge records")) {
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
                Button(l10n("Keep current data"), role: .cancel) { pending = nil }
            } message: {
                Text(l10n.format("Destination: {0}. The backup's profile replaces the local draft; links and history are merged. A cloud-only PDF must be selected again. Nothing is uploaded or submitted.", [String(describing: target)]))
            }
            .alert(l10n("Copy your unpaired draft here?"), isPresented: $copyingUnpaired) {
                Button(l10n("Copy draft and merge records")) {
                    if let context, !model.importUnpairedDraft(context: context) { issue = model.message }
                }
                Button(l10n("Keep separate"), role: .cancel) {}
            } message: { Text(l10n.format("Destination: {0}. Review whose information this is. The local profile will be replaced, saved records merged, and the original unpaired draft kept. Nothing will be uploaded.", [String(describing: target)])) }
            .alert(l10n("Clear this phone workspace?"), isPresented: $clearing) {
                Button(l10n("Clear phone data"), role: .destructive) {
                    if let context {
                        if model.clearWorkspaceOnPhone(context: context) {
                            do { try discovery.clearCurrentScope() }
                            catch { issue = "The profile and records were cleared, but the search file could not be cleared: " + error.localizedDescription }
                        } else { issue = model.message }
                    }
                }
                Button(l10n("Keep phone data"), role: .cancel) {}
            } message: { Text(l10n.format("This removes the local profile, PDF, links, search and private notes/history for {0}. An exported backup can restore them. Cloud/employer records and safety holds remain.", [String(describing: target)])) }
            .onChange(of: issue) { value in
                if let value { UIAccessibility.post(notification: .announcement, argument: l10n.message(value)) }
            }
    }
}

private struct NativeApplicationShare: UIViewControllerRepresentable {
    let items: [Any]
    var onCompletion: (() -> Void)? = nil
    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
        controller.completionWithItemsHandler = { _, _, _, _ in onCompletion?() }
        return controller
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
#endif
