#if os(iOS)
import SwiftUI

struct NativeDiscoveryScreen: View {
    @NativeLocalization private var l10n
    @EnvironmentObject private var discovery: CareerDiscoveryStore
    @EnvironmentObject private var applications: NativeApplicationsStore
    @State private var choosingBoards = false
    @State private var profileRolesExpanded = false
    @State private var searchClock = Date()
    @State private var linkedInOpenable = true
    private enum SearchField: Hashable { case keywords, location }
    @FocusState private var focusedField: SearchField?
    var body: some View {
        NativeList {
            Section {
                Text(l10n("Search jobs")).font(.title2.weight(.bold)).fixedSize(horizontal: false, vertical: true)
                Text(l10n("Search selected public employer boards across locations and professions. You choose which boards and search words to use."))
                    .font(.subheadline).foregroundStyle(.secondary)
                TextField(l10n("Job title or keyword"), text: $discovery.query.keywords)
                    .focused($focusedField, equals: .keywords).submitLabel(.search).onSubmit { beginSearch() }
                    .accessibilityIdentifier("discovery.keywords")
                Text(l10n("Searches titles, employers and available summaries."))
                    .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                if !profileRoleShortcuts.isEmpty {
                    Button { focusedField = nil; profileRolesExpanded.toggle() } label: {
                        Label(l10n("Choose a job title from your saved profile"), systemImage: profileRolesExpanded ? "chevron.up" : "chevron.down")
                            .fixedSize(horizontal: false, vertical: true).frame(minHeight: 44)
                    }.accessibilityIdentifier("discovery.profileRoles")
                        .accessibilityValue(l10n(profileRolesExpanded ? "Expanded" : "Collapsed"))
                    if profileRolesExpanded {
                        ForEach(Array(profileRoleShortcuts.enumerated()), id: \.offset) { index, role in
                            Button(role) { discovery.query.keywords = role; focusedField = nil }
                                .frame(minHeight: 44).accessibilityIdentifier("discovery.profileRole.\(index)")
                        }
                        Text(l10n("This fills the job title only. Choose Search jobs to run the search."))
                            .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                }
                TextField(l10n("Location text (optional)"), text: $discovery.query.location)
                    .focused($focusedField, equals: .location).submitLabel(.search).onSubmit { beginSearch() }
                    .accessibilityIdentifier("discovery.location")
                Toggle(l10n("Remote roles only"), isOn: $discovery.query.remoteOnly)
                    .accessibilityIdentifier("discovery.remote")
                Button { focusedField = nil; choosingBoards = true } label: {
                    Label(l10n(boardLabel), systemImage: "building.2")
                }.accessibilityIdentifier("discovery.chooseBoards")
                if discovery.isSearching {
                    ProgressView(l10n("Checking your employer boards…"))
                    Button(l10n("Cancel search"), role: .cancel) { discovery.cancelSearch() }
                        .accessibilityIdentifier("discovery.cancel")
                } else {
                    Button(action: beginSearch) {
                        Label(l10n("Search jobs"), systemImage: "magnifyingglass").font(.headline).padding(.vertical, 6)
                    }.accessibilityIdentifier("discovery.search")
                }
            } footer: {
                Text(l10n("Search sends only these words and board choices to the public discovery service. No account, application profile or CV is sent. Remote wording does not establish where you can legally work."))
            }
            Section {
                if let url = MobileApplicationPolicy.linkedInJobSearchURL(keywords: discovery.query.keywords, location: discovery.query.location) {
                    Link(destination: url) { Label(l10n("Search LinkedIn"), systemImage: "arrow.up.right.square") }
                        .accessibilityIdentifier("discovery.linkedin")
                } else {
                    Text(l10n("Shorten your search to 120 characters and location to 100 characters to open LinkedIn."))
                        .font(.footnote).foregroundStyle(NativeDesign.danger).fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("discovery.linkedinIssue")
                }
            } footer: {
                Text(l10n("Opens LinkedIn with only your keyword and location text. LinkedIn manages its own sign-in and applications. Career Finder does not read your LinkedIn account or verify applications submitted there."))
            }
            if let error = discovery.error {
                Section {
                    Label(l10n.message(error), systemImage: "exclamationmark.circle")
                        .font(.subheadline).fixedSize(horizontal: false, vertical: true)
                        .accessibilityElement(children: .ignore).accessibilityLabel(l10n.message(error))
                        .accessibilityAddTraits(.isStaticText).accessibilityIdentifier("discovery.error")
                    Button(l10n("Search again"), action: beginSearch)
                        .frame(minHeight: 44)
                        .disabled(waitingForRetry)
                        .accessibilityIdentifier("discovery.retrySearch")
                    if let retry = discovery.retryAfter {
                        Text(l10n.format("Try again after {0}.", [String(describing: l10n.time(retry))])).font(.footnote)
                    }
                    if discovery.catalog == nil && !discovery.loadingCatalog && discovery.catalogError == nil {
                        Button(l10n("Retry employer directory")) { Task { await discovery.loadCatalog() } }
                    }
                    if discovery.canRetrySubmittedSearch {
                        Button(l10n("Retry this search")) { Task { await discovery.retrySubmittedSearch() } }
                            .disabled(waitingForRetry)
                            .accessibilityIdentifier("discovery.retry")
                    }
                    if discovery.page == nil {
                        ForEach(discovery.recoveryBoardFallbacks) { identity in
                            boardFallback(identity, label: l10n("Open the employer board"))
                        }
                    }
                }
            }
            if let issue = discovery.catalogError {
                Section {
                    Label(l10n(issue), systemImage: "exclamationmark.circle")
                        .font(.subheadline).foregroundStyle(NativeDesign.danger).fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("discovery.catalogError")
                    Button(l10n("Retry employer directory")) { Task { await discovery.loadCatalog() } }
                        .frame(minHeight: 44)
                        .disabled(discovery.loadingCatalog)
                        .accessibilityIdentifier("discovery.retryCatalog")
                }
            }
            if let notice = discovery.storageNotice {
                Section {
                    Label(l10n(notice), systemImage: "exclamationmark.triangle")
                        .font(.footnote).fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("discovery.storageNotice")
                    Button(l10n(discovery.savedSearchRestoreBlocked ? "Retry previous search" : "Retry saving search"),
                           action: discovery.retrySavedSearch)
                        .frame(minHeight: 44)
                        .accessibilityIdentifier("discovery.retrySavedSearch")
                }
            }
            if let page = discovery.page {
                Section {
                    if discovery.restoredResults || discovery.criteriaChanged {
                        Label(l10n(discovery.criteriaChanged ? "Previous search — update the search to use your current fields." : "Previous results — search again to check availability."), systemImage: "clock.arrow.circlepath")
                            .font(.footnote).foregroundStyle(Color.primary)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("discovery.previousSearchScope")
                    }
                    if let criteria = discovery.lastQuery { Text(l10n(criteria.summary)).font(.subheadline).fixedSize(horizontal: false, vertical: true) }
                    DisclosureGroup(l10n("Employer coverage and freshness")) {
                        ForEach(page.sources) { source in
                            VStack(alignment: .leading, spacing: 5) {
                                Label(source.name, systemImage: source.status == "unavailable" ? "exclamationmark.circle" : source.status == "stale" ? "clock" : "building.2")
                                    .font(.subheadline.weight(.semibold))
                                Text(sourceLine(source)).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                                if let message = source.error?.message { Text(l10n(message)).font(.caption).fixedSize(horizontal: false, vertical: true) }
                                if let identity = DiscoveryPolicy.canonicalBoard(source.boardUrl) {
                                    boardFallback(identity, label: l10n.format("Open employer board for {0}", [source.name]))
                                }
                            }.padding(.vertical, 4).accessibilityElement(children: .combine)
                        }
                        if discovery.error == nil && discovery.canRetrySubmittedSearch && (page.status == "partial" || page.status == "unavailable") {
                            Button(l10n("Retry this search")) { Task { await discovery.retrySubmittedSearch() } }
                                .disabled(waitingForRetry)
                                .accessibilityIdentifier("discovery.retry")
                        }
                        Text(l10n(page.notice)).font(.footnote).foregroundStyle(.secondary)
                    }
                } header: { Text(l10n.format("{0} opportunities to review", [String(describing: discovery.jobs.count)])) }
            }
            Section {
                if discovery.jobs.isEmpty {
                    emptyState
                } else {
                    ForEach(discovery.jobs) { job in
                        NavigationLink { NativeDiscoveryJobDetail(job: job) } label: {
                            VStack(alignment: .leading, spacing: 7) {
                                Text(job.title).font(.headline).fixedSize(horizontal: false, vertical: true)
                                Text(job.company).font(.subheadline).foregroundStyle(.secondary)
                                Text(job.location.isEmpty ? l10n("Location not specified") : job.location).font(.caption).foregroundStyle(.secondary)
                                if job.remote == true { Label(l10n("Remote wording found"), systemImage: "globe").font(.caption) }
                                if job.stale || discovery.restoredResults { Label(l10n("Previous result · check employer"), systemImage: "clock").font(.caption).foregroundStyle(.secondary) }
                            }.padding(.vertical, 6)
                        }.accessibilityIdentifier("discovery.job.\(job.id)")
                    }
                    if discovery.canLoadMore {
                        Button(l10n("Load more results")) { Task { await discovery.search(more: true) } }
                            .accessibilityIdentifier("discovery.loadMore")
                    }
                }
            }
        }
        .listStyle(.insetGrouped).scrollDismissesKeyboard(.interactively)
        .navigationTitle(l10n("Search jobs")).navigationBarTitleDisplayMode(.inline)
        .task { await discovery.loadCatalog() }
        .sheet(isPresented: $choosingBoards) { NativeDiscoveryBoards() }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Button(l10n("Search jobs"), action: beginSearch)
                    .disabled(discovery.isSearching).accessibilityIdentifier("discovery.keyboardSearch")
                Spacer()
                Button(l10n("Done typing")) { focusedField = nil }
            }
        }
        .onChange(of: discovery.error) { issue in
            if let issue { UIAccessibility.post(notification: .announcement, argument: l10n.message(issue)) }
        }
        .onChange(of: discovery.storageNotice) { notice in
            if let notice { UIAccessibility.post(notification: .announcement, argument: l10n(notice)) }
        }
        .onChange(of: discovery.catalogError) { issue in
            if let issue { UIAccessibility.post(notification: .announcement, argument: l10n(issue)) }
        }
        .onChange(of: discovery.query.keywords) { _ in announceLinkedInLimit() }
        .onChange(of: discovery.query.location) { _ in announceLinkedInLimit() }
        .onAppear {
            linkedInOpenable = MobileApplicationPolicy.linkedInJobSearchURL(keywords: discovery.query.keywords, location: discovery.query.location) != nil
        }
        .task(id: discovery.retryAfter) {
            searchClock = Date()
            guard let retry = discovery.retryAfter else { return }
            let remaining = retry.timeIntervalSince(searchClock)
            guard remaining > 0 else { return }
            do { try await Task.sleep(nanoseconds: UInt64(remaining * 1_000_000_000)) }
            catch { return }
            searchClock = retry
        }
    }
    private var profileRoleShortcuts: [String] {
        var seen = Set<String>()
        return applications.profile.targetRoles.split(separator: ",")
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty && seen.insert($0).inserted }
    }
    private var waitingForRetry: Bool {
        (discovery.retryAfter ?? .distantPast) > searchClock
    }
    private var boardLabel: String {
        discovery.query.sources.isEmpty ? "Employer boards · suggested selection" : "Employer boards · \(discovery.query.sources.count) selected"
    }
    private func beginSearch() { focusedField = nil; Task { await discovery.search() } }
    private var displayedEmptyStatus: String? {
        if let status = discovery.page?.status { return status }
        if discovery.page == nil, discovery.error != nil, discovery.canRetrySubmittedSearch { return "unavailable" }
        return nil
    }
    private func sourceLine(_ source: DiscoverySourceStatus) -> String {
        let availability = DiscoveryPresentation.sourceAvailabilityKey(status: source.status, restored: discovery.restoredResults)
        var line = l10n(availability) + l10n.format(" · {0} matched", [String(source.matchedCount)])
        if source.limited { line += l10n(" · bounded sample") }
        let stamp = source.checkedAt ?? (discovery.restoredResults ? discovery.page?.generatedAt : nil)
        if let stamp, let parsed = ApplicationReviewPolicy.date(stamp) {
            line += "\n" + l10n.format("Last checked: {0}", [l10n.date(parsed, includeTime: true)])
        }
        return line
    }
    @ViewBuilder private func boardFallback(_ identity: DiscoveryBoardIdentity, label: String) -> some View {
        if let url = URL(string: identity.boardUrl) {
            Link(destination: url) { Label(label, systemImage: "arrow.up.right.square") }
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("discovery.board.\(identity.id)")
            Text(identity.boardUrl).font(.caption).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
            Text(l10n("Opening this public board in your browser does not submit an application or confirm the listings are still open."))
                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
    }
    private func announceLinkedInLimit() {
        let openable = MobileApplicationPolicy.linkedInJobSearchURL(keywords: discovery.query.keywords, location: discovery.query.location) != nil
        if linkedInOpenable && !openable {
            UIAccessibility.post(notification: .announcement, argument: l10n("Shorten your search to 120 characters and location to 100 characters to open LinkedIn."))
        }
        linkedInOpenable = openable
    }
    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: "magnifyingglass").font(.title).accessibilityHidden(true)
            Text(l10n(DiscoveryPresentation.emptyTitle(searching: discovery.isSearching, pageStatus: displayedEmptyStatus)))
                .font(.headline).fixedSize(horizontal: false, vertical: true)
            Text(l10n(DiscoveryPresentation.emptyDetail(pageStatus: displayedEmptyStatus)))
                .font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }.padding(.vertical, 16).accessibilityElement(children: .combine).accessibilityIdentifier("discovery.empty")
    }
}

private struct NativeDiscoveryBoards: View {
    @NativeLocalization private var l10n
    @EnvironmentObject private var discovery: CareerDiscoveryStore
    @Environment(\.dismiss) private var dismiss
    @State private var boardURL = ""
    var body: some View {
        NavigationStack {
            NativeForm {
                Section {
                    Button { discovery.useDefaultSources() } label: {
                        Label(l10n("Use suggested boards"), systemImage: discovery.query.sources.isEmpty ? "checkmark.circle.fill" : "circle")
                    }
                    Text(l10n("Select up to four boards to replace the suggestions."))
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if let catalog = discovery.catalog {
                    Section(l10n("Choose employers")) {
                        ForEach(catalog.sources) { source in
                            Button { discovery.toggleSource(source.id) } label: {
                                HStack(alignment: .top) {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(source.name).foregroundStyle(.primary)
                                        Text(l10n(source.provider == "greenhouse" ? "Greenhouse board" : "Lever board")).font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer(minLength: 8)
                                    Image(systemName: discovery.boardSelected(source.id) ? "checkmark.circle.fill" : "circle")
                                }.padding(.vertical, 4)
                            }.accessibilityValue(l10n(discovery.boardSelected(source.id) ? "Selected" : "Not selected"))
                        }
                    }
                } else if discovery.loadingCatalog { ProgressView(l10n("Loading employer directory")) }
                let known = Set(discovery.catalog?.sources.map(\.id) ?? [])
                let custom = discovery.query.sources.filter { !known.contains($0) }
                if !custom.isEmpty {
                    Section(l10n("Your added boards")) {
                        ForEach(custom, id: \.self) { source in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(discovery.boardDisplay(source)).font(.footnote).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                                Button(l10n("Remove board"), role: .destructive) { discovery.toggleSource(source) }
                            }
                        }
                    }
                }
                Section {
                    TextField(l10n("Public employer board URL"), text: $boardURL).keyboardType(.URL)
                        .textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("discovery.boardURL")
                    Button(l10n("Add this board")) { if discovery.addBoard(boardURL) { boardURL = "" } }
                        .disabled(boardURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                } header: { Text(l10n("Add an employer board")) } footer: {
                    Text(l10n("Supports boards.greenhouse.io, job-boards.greenhouse.io, jobs.lever.co and jobs.eu.lever.co. You can paste a board or a posting on one of those hosts. Adding it does not search until you tap Search jobs."))
                }
                if let issue = discovery.catalogError, discovery.catalog == nil {
                    Section {
                        Text(l10n(issue)).font(.footnote).foregroundStyle(NativeDesign.danger).fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("discovery.catalogError")
                        Button(l10n("Retry employer directory")) { Task { await discovery.loadCatalog() } }
                            .frame(minHeight: 44)
                            .disabled(discovery.loadingCatalog)
                            .accessibilityIdentifier("discovery.retryCatalog")
                    }
                }
                if let issue = discovery.error {
                    Section {
                        Text(l10n.message(issue)).font(.footnote).foregroundStyle(NativeDesign.danger).fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("discovery.boardIssue")
                    }
                }
            }.navigationTitle(l10n("Employer boards")).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button(l10n("Done")) { dismiss() } } }
        }
    }
}

private struct NativeDiscoveryJobDetail: View {
    @NativeLocalization private var l10n
    @EnvironmentObject private var applications: NativeApplicationsStore
    @EnvironmentObject private var navigation: NativeCareerNavigation
    let job: DiscoveryJob
    @State private var saveMessage: String?
    private var saved: Bool { applications.containsOpportunity(url: job.url) }
    var body: some View {
        NativeList {
            Section {
                Text(job.title).font(.title2.weight(.bold)).fixedSize(horizontal: false, vertical: true)
                Text(job.company).font(.headline)
                Label(job.location.isEmpty ? l10n("Location not specified") : job.location, systemImage: "mappin")
                if job.remote == true { Label(l10n("Remote wording found · confirm eligible locations"), systemImage: "globe") }
                if job.stale { Label(l10n("Earlier result · confirm the posting is still open"), systemImage: "clock") }
            }
            if !job.summary.isEmpty { Section(l10n("From the employer posting")) { Text(job.summary).textSelection(.enabled) } }
            Section {
                if saved {
                    Label(l10n("Saved for application review"), systemImage: "checkmark.circle").accessibilityIdentifier("discovery.saved")
                    if let saved = applications.jobs.first(where: { MobileApplicationPolicy.jobIdentity($0["url"]?.string ?? "") == MobileApplicationPolicy.jobIdentity(job.url) }),
                       let id = saved["id"]?.string {
                        NavigationLink(l10n("Track this opportunity")) { NativeSavedApplicationDetail(id: id) }
                            .accessibilityIdentifier("discovery.trackOpportunity")
                    }
                } else {
                    Button {
                        Task {
                            _ = await applications.addJob(url: job.url, title: job.title, company: job.company,
                                                         location: job.location, country: job.country ?? "")
                            saveMessage = applications.message
                        }
                    } label: { Label(l10n("Save opportunity"), systemImage: "bookmark") }
                        .disabled(applications.busy).accessibilityIdentifier("discovery.saveOpportunity")
                }
                if let saveMessage { Text(l10n(saveMessage)).font(.footnote).foregroundStyle(.secondary) }
                if let url = MobileApplicationPolicy.jobURL(job.url) {
                    Link(destination: url) { Label(l10n("Open employer posting"), systemImage: "arrow.up.right.square") }
                    ShareLink(item: url) { Label(l10n("Share job link"), systemImage: "square.and.arrow.up") }
                }
            } footer: {
                Text(l10n("Saving copies this public link and role details into your application workspace. It does not send your profile or submit an application. Confirm qualifications, pay, work authorization and location with the employer."))
            }
            Section(l10n("Source and freshness")) {
                LabeledContent(l10n("Employer board"), value: job.sourceName)
                LabeledContent(l10n("Provider"), value: job.provider == "greenhouse" ? "Greenhouse" : "Lever")
                if let checked = ApplicationReviewPolicy.date(job.checkedAt) {
                    LabeledContent(l10n("Checked"), value: l10n.date(checked, includeTime: true))
                }
                if let published = job.publishedAt.flatMap(ApplicationReviewPolicy.date) {
                    LabeledContent(l10n("Published"), value: l10n.date(published))
                }
                Text(l10n("This is a public lead, not a verified personal fit score. A listing may change or close after it was checked."))
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }.listStyle(.insetGrouped).navigationTitle(l10n("Opportunity")).navigationBarTitleDisplayMode(.inline)
    }
}
#endif
