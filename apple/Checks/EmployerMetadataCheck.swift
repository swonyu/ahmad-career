import Foundation

@main struct EmployerMetadataCheck {
    static func expect(_ condition:Bool,_ message:String="Employer metadata assertion failed",file:StaticString=#file,line:UInt=#line) {precondition(condition,message,file:file,line:line)}
    @MainActor static func main() throws {
        let fixtures=try JSONSerialization.jsonObject(with:Data(contentsOf:URL(fileURLWithPath:CommandLine.arguments[1]))) as! [[String:Any]]
        expect(CareerFeed.publicSources.count==7 && fixtures.count==7)
        let ashby=CareerFeed.publicSources[4],ashbyRow=((fixtures[4]["data"] as! [String:Any])["jobs"] as! [[String:Any]])[0]
        func ash(_ changes:[String:Any])throws->CareerFeed.SourceResult {try CareerFeed.parsePublicBoard(["jobs":[ashbyRow.merging(changes){_,new in new}]],source:ashby)}
        for (mode,expected) in [("Remote","Remote"),("Hybrid","Hybrid"),("OnSite","On-site")] {
            let parsed=try ash(["workplaceType":mode,"isRemote":true])
            expect(parsed.jobs[0]["mode"] as? String==expected && parsed.jobs[0]["postedKind"] as? String=="last-published")
        }
        for (flag,expected) in [(true,"Remote or hybrid"),(false,"Not stated")] {expect(try ash(["isRemote":flag]).jobs[0]["mode"] as? String==expected)}
        expect(CareerFeed.employerMode("ashby",row:["isRemote":1])=="Not stated")
        expect(CareerFeed.employerMode("workable",row:["telecommuting":true])=="Remote arrangement: confirm details")
        let foreignPrimary:[String:Any]=["location":"Riyadh","address":["postalAddress":["addressCountry":"US"]]]
        let foreignDirect:[String:Any]=["location":"Riyadh","address":["addressCountry":"GB"]]
        var primary=foreignPrimary;primary["secondaryLocations"]=[foreignDirect]
        expect(try ash(primary).jobs.isEmpty,"Foreign direct secondary country overrides a Saudi city label")
        primary["secondaryLocations"]=[["location":"Tabuk","address":["addressCountry":"SA"]]]
        let secondary=try ash(primary)
        expect(secondary.jobs[0]["location"] as? String=="Tabuk, Saudi Arabia")
        primary["secondaryLocations"]=[["location":"Riyadh","address":["postalAddress":["addressCountry":"US"],"addressCountry":"SA"]]]
        expect(try ash(primary).jobs.isEmpty,"Nested country wins when both representations exist")
        primary["secondaryLocations"]=[["location":"Riyadh","address":["addressCountry":123]]]
        expect(try ash(primary).status["ok"] as? Bool==false)
        let html="<style>degree concealed</style><script>paid concealed</script><p>Bachelor&rsquo;s degree preferred, or equivalent practical experience.</p><li>Current university students may apply.</li><li>2+ years professional experience required.</li><p>Paid role, confirm compensation with the employer.</p><p>Saudi nationals are welcome to apply.</p>"
        let snippets=CareerFeed.requirementNotes(html)
        let encoded="&lt;p&gt;Bachelor degree required.&lt;/p&gt;&lt;p&gt;Minimum 3 years of professional experience.&lt;/p&gt;&lt;script&gt;paid hidden script&lt;/script&gt;"
        expect(CareerFeed.requirementNotes(encoded)==["Bachelor degree required.","Minimum 3 years of professional experience."])
        expect(!CareerFeed.plainEmployerText(encoded).contains("<") && !CareerFeed.plainEmployerText(encoded).contains("hidden script"))
        expect(snippets.count==4 && !snippets.joined().contains("concealed") && snippets[0].contains("equivalent practical experience"))
        expect(CareerFeed.requirementNotes("Paid leave for new parents. With more than 25 years of conversational AI research, we serve over 5,000 enterprises.").isEmpty)
        expect(CareerFeed.requirementNotes("This is a paid internship for university graduates. Minimum 3 years of professional experience.").count==2)
        expect(CareerFeed.requirementNotes("Unpaid internships are not suitable for this search.").count==1)
        expect(CareerFeed.requirementNotes("No requirements stated.").isEmpty)
        expect(CareerFeed.requirementNotes(String(repeating:"x",count:120001)).isEmpty)
        expect(CareerFeed.requirementNotes("Bachelor degree "+String(repeating:"x",count:400))[0].utf16.count==258)
        expect(CareerFeed.requirementNotes("A bachelor degree is preferred. A bachelor degree is preferred.").count==1)
        expect(CareerFeed.plainEmployerText("&amp; &#x1f337; &#65; &#0; &#xD800; &#1114112;")=="& 🌷 A")
        let ashNotes=try ash(["descriptionPlain":"","descriptionHtml":html,"employmentType":"Intern"])
        expect(ashNotes.jobs[0]["requirementNotes"] as? [String]==snippets && ashNotes.jobs[0]["employmentType"] as? String=="Internship")
        let greenhouse=CareerFeed.publicSources[5],ghRow=((fixtures[5]["data"] as! [String:Any])["jobs"] as! [[String:Any]])[0]
        var gh=ghRow;gh["content"]=html
        let ghParsed=try CareerFeed.parsePublicBoard(["jobs":[gh]],source:greenhouse)
        expect(ghParsed.jobs[0]["requirementNotes"] as? [String]==snippets && ghParsed.jobs[0]["posted"] as? String=="" && ghParsed.jobs[0]["postedKind"] as? String=="published")
        for value in ["Full-time","Full time","full_time","fulltime"] {expect(CareerFeed.employmentLabel(value)=="Full time")}
        for value in ["Part-time","part time","part_time","parttime"] {expect(CareerFeed.employmentLabel(value)=="Part time")}
        for (raw,label) in [("internship","Internship"),("CONTRACT","Contract"),("temporary","Temporary"),("Full time (permanent)","Full time (permanent)"),("Part time (fixed term)","Part time (fixed term)")] {expect(CareerFeed.employmentLabel(raw)==label)}
        let workable=CareerFeed.publicSources[0]
        var workableRow=((fixtures[0]["data"] as! [String:Any])["jobs"] as! [[String:Any]])[0]
        workableRow["employment_type"]="Full-time"
        expect(try CareerFeed.parsePublicBoard(["jobs":[workableRow]],source:workable).jobs[0]["employmentType"] as? String=="Full time")
        let source=CareerFeed.publicSources[6],row=((fixtures[6]["data"] as! [String:Any])["offers"] as! [[String:Any]])[0]
        func parse(_ changes:[String:Any]=[:])throws->CareerFeed.SourceResult {try CareerFeed.parsePublicBoard(["offers":[row.merging(changes){_,new in new}]],source:source)}
        let result=try parse(),job=result.jobs[0]
        expect(source.url.absoluteString=="https://unifonic.recruitee.com/api/offers/" && result.status["ok"] as? Bool==true)
        expect(job["id"] as? String=="unifonic-12345" && job["posted"] as? String=="2026-01-01T00:00:00Z" && job["postedKind"] as? String=="last-published")
        expect(job["employmentType"] as? String=="Full time (permanent)" && (job["requirementNotes"] as? [String])?.first?.contains("equivalent practical experience")==true)
        expect(try parse(["remote":true]).jobs[0]["mode"] as? String=="On-site / Remote")
        expect(try parse(["remote":true,"hybrid":true]).jobs[0]["mode"] as? String=="On-site / Hybrid / Remote")
        expect(try parse(["on_site":false]).jobs[0]["mode"] as? String=="Not stated")
        expect(try parse(["employment_type_code":"unusual"]).jobs[0]["employmentType"] as? String=="Employer code: unusual")
        for changes:[String:Any] in [["status":"draft"],["title":"Senior Software Engineer"],["published_at":"2099-01-01 00:00:00 UTC"],["close_at":"2000-01-01 00:00:00 UTC"],["locations":[["country_code":"US","country":"Saudi Arabia","city":"Riyadh"]]],["locations":[["country_code":"","country":"Saudi Arabia","city":"Riyadh"]]],["locations":[],"location":"Remote, Riyadh"]] {
            let excluded=try parse(changes)
            expect(excluded.jobs.isEmpty && excluded.status["ok"] as? Bool==true && excluded.status["excludedIds"] as? [String]==["unifonic-12345"])
        }
        expect(try parse(["locations":[["country":"Saudi Arabia","city":"Tabuk"]]]).jobs[0]["location"] as? String=="Tabuk, Saudi Arabia")
        for changes:[String:Any] in [["id":true],["id":1.2],["id":"12345"],["id":9007199254740992.0],["status":NSNull()],["slug":"../other"],["careers_url":"https://jobs.unifonic.com/o/other"],["careers_url":"https://evil.example/o/junior-software-developer"],["remote":1],["locations":[["country_code":1]]],["locations":[NSNull()]],["published_at":"2026-02-30 00:00:00 UTC"],["published_at":"2026-01-01 25:00:00 UTC"],["published_at":"2026-01-01T00:00:00Z"],["close_at":"tomorrow"]] {
            let invalid=try parse(changes);expect(invalid.jobs.isEmpty && invalid.status["ok"] as? Bool==false,"Malformed Recruitee rows must not establish absence")
        }
        for badRoot:[String:Any] in [["jobs":[row]],["offers":NSNull()],["offers":Array(repeating:row,count:5001)]] {
            do {_ = try CareerFeed.parsePublicBoard(badRoot,source:source);preconditionFailure("Invalid root accepted")} catch {}
        }
        let empty=try CareerFeed.parsePublicBoard(["offers":[]],source:source);expect(empty.jobs.isEmpty && empty.status["ok"] as? Bool==true)
        let limited=try CareerFeed.parsePublicBoard(["offers":Array(repeating:row,count:501)],source:source);expect(limited.jobs.count==1 && limited.status["limited"] as? Bool==true && limited.status["scanned"] as? Int==500)
        expect(CareerJob.safeURL("https://jobs.unifonic.com/o/junior-software-developer") != nil)
        expect(CareerJob.safeURL("https://jobs.unifonic.com/o/../private")==nil)
        // Exclusions from a partially malformed board remove discovery only; manually tracked history survives.
        let root=FileManager.default.temporaryDirectory.appendingPathComponent("career-recruitee-check-"+UUID().uuidString)
        defer {try? FileManager.default.removeItem(at:root)}
        let store=NativeCareerStore(researchURL:URL(fileURLWithPath:CommandLine.arguments[2]),storageURL:root.appendingPathComponent("state.json"))
        let old="2026-10-09T12:00:00Z",new="2026-10-09T12:01:00Z"
        store.acceptLive(["checkedAt":old,"jobs":result.jobs,"sources":[result.status]])
        expect(store.liveJobs.count==1)
        let stored=store.liveJobs[0];store.setStatus("Submission uncertain",for:stored);store.toggleSaved(stored)
        var excluded=row;excluded["status"]="draft"
        let partial=try CareerFeed.parsePublicBoard(["offers":[excluded,[:]]],source:source)
        store.acceptLive(["checkedAt":new,"jobs":partial.jobs,"sources":[partial.status]])
        expect(store.liveJobs.isEmpty && store.isSaved(stored) && store.status(for:stored)=="Submission uncertain")
        let reload=NativeCareerStore(researchURL:URL(fileURLWithPath:CommandLine.arguments[2]),storageURL:root.appendingPathComponent("state.json"))
        expect(reload.liveJobs.isEmpty && reload.status(for:stored)=="Submission uncertain" && reload.isSaved(stored))
        print("Employer metadata checks passed: authoritative Ashby work modes and countries, bounded snippets, missing-date honesty, seventh-board schema, URL/date/boolean/geography validation, compound modes, exact exclusions, and preserved local history.")
    }
}
