import Foundation

@main struct NativeUpgradeCheck {
    @MainActor static func main() throws {
        let researchURL=URL(fileURLWithPath:CommandLine.arguments[1])
        let root=FileManager.default.temporaryDirectory.appendingPathComponent("career-upgrade-check-"+UUID().uuidString)
        defer {try? FileManager.default.removeItem(at:root)}
        #if CAREER_PREVIEW
        precondition(NativeCareerStore.storageDirectoryName=="CareerFinderPreview")
        #else
        precondition(NativeCareerStore.storageDirectoryName=="AhmadCareer")
        #endif
        let store=NativeCareerStore(researchURL:researchURL,storageURL:root.appendingPathComponent("workspace.json"))
        var job=store.research.jobs[0]
        let legacy=try JSONSerialization.jsonObject(with:JSONEncoder().encode(job)) as! [String:Any]
        precondition(legacy["requirementNotes"]==nil && legacy["employmentType"]==nil && job.validEmployerMetadata)
        job.postedKind="last-published";job.employmentType="Internship";job.experienceLevel="Entry level"
        job.requirementNotes=["Currently enrolled university students may apply."]
        precondition(job.publicationLabel=="Last published" && job.validEmployerMetadata)
        let roundTrip=try JSONDecoder().decode(CareerJob.self,from:JSONEncoder().encode(job))
        precondition(roundTrip==job)
        let now=CareerFeed.isoDate("2026-10-09T21:00:00Z")! // Oct 10 in Riyadh.
        for (date,expected) in [("2026-10-10",0),("2026-10-09",1),("2026-10-03",7),("2026-10-09T20:59:59Z",1),("2026-10-09T21:00:00Z",0),("2026-10-10T01:00:00+04:00",0)] {
            precondition(NativeDiscoveryOptions.ageInSaudiDays(date,now:now)==expected,date)
        }
        for invalid in ["", "2026-02-30", "2026-10-09 21:00:00", "2026-10-09T21:00:00Zbad"] {precondition(NativeDiscoveryOptions.ageInSaudiDays(invalid,now:now)==nil)}
        precondition(!NativeDiscoveryOptions().isActive && !NativeDiscoveryOptions().hideTracked)
        var options=NativeDiscoveryOptions(company:job.company,days:7,employmentType:"Internship")
        job.posted="2026-10-04";precondition(options.includes(job,now:now))
        job.posted="2026-10-03";precondition(!options.includes(job,now:now))
        job.posted="2026-10-11";precondition(!options.includes(job,now:now))
        job.posted="";precondition(!options.includes(job,now:now))
        options.days=0;precondition(options.includes(job,now:now))
        options.company="Other";precondition(!options.includes(job,now:now));options.company=job.company
        options.employmentType="Full time";precondition(!options.includes(job,now:now));options.employmentType="Internship"
        options.hideTracked=true;precondition(!options.includes(job,tracked:true,now:now) && options.includes(job,tracked:false,now:now))
        for days in [7,30,90] {
            options.days=days;options.hideTracked=false
            let day=Calendar(identifier:.gregorian).date(byAdding:.day,value:-(days-1),to:now)!
            job.posted=CareerFeed.saudiDay(day);precondition(options.includes(job,now:now))
            job.posted=CareerFeed.saudiDay(day.addingTimeInterval(-86400));precondition(!options.includes(job,now:now))
        }
        var invalid=job;invalid.requirementNotes=Array(repeating:"x",count:7);precondition(!invalid.validEmployerMetadata)
        invalid=job;invalid.requirementNotes=[String(repeating:"x",count:301)];precondition(!invalid.validEmployerMetadata)
        invalid=job;invalid.requirementNotes=[String(repeating:"🌷",count:150)];precondition(invalid.validEmployerMetadata)
        invalid.requirementNotes=[String(repeating:"🌷",count:151)];precondition(!invalid.validEmployerMetadata)
        invalid=job;invalid.employmentType=String(repeating:"x",count:101);precondition(!invalid.validEmployerMetadata)
        invalid=job;invalid.experienceLevel=String(repeating:"x",count:101);precondition(!invalid.validEmployerMetadata)
        invalid=job;invalid.postedKind="updated";precondition(!invalid.validEmployerMetadata)
        // Invalid new optional metadata rejects the incoming row without destroying the previous snapshot.
        let liveStore=NativeCareerStore(researchURL:researchURL,storageURL:root.appendingPathComponent("live.json"))
        var lead=job;lead.id="upgrade-live";lead.title="Junior Software Developer";lead.company="Mozn";lead.url="https://apply.workable.com/mozn-ai/j/UPGRADE1/";lead.applyUrl=nil;lead.sourceUrl=nil;lead.rank=nil;lead.kind="live";lead.posted="2026-01-01";lead.closes=nil
        func payload(_ job:CareerJob,_ stamp:String)throws->[String:Any] { ["checkedAt":stamp,"jobs":[try JSONSerialization.jsonObject(with:JSONEncoder().encode(job))],"sources":[["name":"Mozn","ok":true,"count":1]]] }
        liveStore.acceptLive(try payload(lead,"2026-10-09T10:00:00Z"),now:now)
        precondition(liveStore.liveJobs.count==1 && liveStore.liveJobs[0].requirementNotes==lead.requirementNotes)
        invalid=lead;invalid.requirementNotes=[String(repeating:"x",count:301)]
        liveStore.acceptLive(try payload(invalid,"2026-10-09T11:00:00Z"),now:now)
        precondition(liveStore.workspace.live?.checkedAt=="2026-10-09T10:00:00Z" && liveStore.searchError != nil)
        // Self-reported uncertainty is its own state, not application success.
        store.setStatus("Submission uncertain",for:job)
        precondition(store.status(for:job)=="Submission uncertain")
        precondition(store.applicationGroups.first?.status=="Submission uncertain" && store.applicationGroups.first?.jobs.count==1)
        let prompts=NativeCareerStore.attentionFor([job],statuses:[job.id:"Submission uncertain"],records:[:],now:now)
        precondition(prompts.count==1 && prompts[0].kind=="uncertain" && prompts[0].title.contains("before retrying"))
        precondition(store.applicationWarnings(for:job).count==1 && store.applicationWarnings(for:job)[0].contains("Submission is uncertain"))
        var other=job;other.id="other-role-same-company"
        store.setStatus("Preparing",for:other)
        precondition(store.applicationWarnings(for:job).count==2 && store.applicationWarnings(for:job)[1].contains("1 other role") && store.applicationWarnings(for:job)[1].contains("not automatically duplicates"))
        var notTracked=job;notTracked.id="untracked-same-company"
        precondition(store.applicationWarnings(for:notTracked).count==1 && store.applicationWarnings(for:notTracked)[0].contains("2 other roles"))
        notTracked.company="Different Employer";precondition(store.applicationWarnings(for:notTracked).isEmpty)
        var noteOnly=job;noteOnly.id="note-only";noteOnly.company="Notes Employer"
        store.beginApplicationRecord(noteOnly);store.editApplicationRecord(noteOnly,appliedAt:"",receiptNote:"Check receipt, no success assumed")
        precondition(store.saveApplicationRecord(noteOnly) && store.status(for:noteOnly)=="Not started" && store.hasApplicationRecord(noteOnly))
        precondition(store.applicationGroups.contains{$0.status=="Not started" && $0.jobs.map(\.id)==[noteOnly.id]})
        let restored=NativeCareerStore(researchURL:researchURL,storageURL:root.appendingPathComponent("workspace.json"))
        precondition(restored.status(for:job)=="Submission uncertain" && restored.hasApplicationRecord(noteOnly))
        precondition(restored.applicationGroups.map(\.status)==["Submission uncertain","Preparing","Not started"])
        precondition(restored.applicationGroups.flatMap(\.jobs).count==3)
        precondition(restored.note(for:job).contains("not proof of eligibility") && restored.note(for:job).contains("Last published") && !restored.note(for:noteOnly).contains("Check receipt, no success assumed"))
        var legacyNote=job;legacyNote.requirementNotes=nil;precondition(store.note(for:legacyNote).contains("excerpts unavailable"))
        for old in ["Preparing","Applied","Interviewing","Offer received","Closed / not pursuing","Not started"] {
            restored.setStatus(old,for:other);precondition(restored.status(for:other)==old)
        }
        print("Native upgrade checks passed: optional metadata, strict bounds, Riyadh date edges, composable filters, uncertain-state persistence, grouped counts, exact/same-company advisories, and isolated storage configuration.")
    }
}
