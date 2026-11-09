import Foundation

@main struct PublicProviderCheck {
    static func main() throws {
        let data=try Data(contentsOf:URL(fileURLWithPath:CommandLine.arguments[1]))
        let fixtures=try JSONSerialization.jsonObject(with:data) as! [[String:Any]]
        for (index,fixture) in fixtures.prefix(6).enumerated() {
            let source=CareerFeed.publicSources[index],data=fixture["data"] as! [String:Any],row=(data["jobs"] as! [[String:Any]])[0]
            var result=try CareerFeed.parsePublicBoard(data,source:source)
            precondition(result.jobs.count==1 && result.status["ok"] as? Bool==true)
            result=try CareerFeed.parsePublicBoard(["jobs":[]],source:source);precondition(result.status["ok"] as? Bool==true)
            result=try CareerFeed.parsePublicBoard(["jobs":[row,[:]]],source:source);precondition(result.jobs.count==1 && result.status["detailErrors"] as? Int==1)
            result=try CareerFeed.parsePublicBoard(["jobs":[[:]]],source:source);precondition(result.status["ok"] as? Bool==false)
            result=try CareerFeed.parsePublicBoard(["jobs":Array(repeating:row,count:501)],source:source);precondition(result.status["limited"] as? Bool==true && result.status["scanned"] as? Int==500 && result.jobs.count==1)
            for title in ["Senior Software Engineer","Bioscience Technician","Biosafety Officer","Presales Consultant, Applied AI"] {
                var changed=row;changed["title"]=title
                result=try CareerFeed.parsePublicBoard(["jobs":[changed]],source:source);precondition(result.jobs.isEmpty,title)
            }
            let dateKey=source.kind=="workable" ? "published_on" : source.kind=="ashby" ? "publishedAt" : "first_published"
            var changed=row;changed[dateKey]="2026-02-30"
            result=try CareerFeed.parsePublicBoard(["jobs":[changed]],source:source);precondition(result.status["ok"] as? Bool==false)
            changed[dateKey]="2099-01-01";result=try CareerFeed.parsePublicBoard(["jobs":[changed]],source:source);precondition(result.jobs.isEmpty)
            if source.kind=="workable" {
                changed=row;changed["locations"]=[["countryCode":"SA","city":"Jeddah","hidden":false]]
                result=try CareerFeed.parsePublicBoard(["jobs":[changed,row,changed,row]],source:source)
                let location=result.jobs[0]["location"] as! String
                precondition(result.jobs.count==1 && location.contains("Riyadh") && location.contains("Jeddah") && location.components(separatedBy:"Riyadh").count==2)
                changed=row;changed["locations"]=[["countryCode":"JO","city":"Riyadh"]]
                result=try CareerFeed.parsePublicBoard(["jobs":[changed]],source:source);precondition(result.jobs.isEmpty)
                changed=row;changed["locations"]=[42];result=try CareerFeed.parsePublicBoard(["jobs":[changed]],source:source);precondition(result.status["ok"] as? Bool==false)
                changed=row;changed["experience"]="Director";result=try CareerFeed.parsePublicBoard(["jobs":[changed]],source:source);precondition(result.jobs.isEmpty)
            }else if source.kind=="ashby" {
                changed=row;changed["isListed"]=false;result=try CareerFeed.parsePublicBoard(["jobs":[changed]],source:source);precondition(result.jobs.isEmpty)
                for bad:Any in [1,"true",NSNull()] {changed=row;changed["isListed"]=bad;result=try CareerFeed.parsePublicBoard(["jobs":[changed]],source:source);precondition(result.status["ok"] as? Bool==false)}
                changed=row;changed["address"]=["postalAddress":["addressCountry":"US"]];result=try CareerFeed.parsePublicBoard(["jobs":[changed]],source:source);precondition(result.jobs.isEmpty)
                changed=row;changed["jobUrl"]="https://evil.example/job";result=try CareerFeed.parsePublicBoard(["jobs":[changed]],source:source);precondition(result.status["ok"] as? Bool==false)
                changed=row;changed["secondaryLocations"]=[NSNull()];result=try CareerFeed.parsePublicBoard(["jobs":[changed]],source:source);precondition(result.status["ok"] as? Bool==false)
            }else {
                result=try CareerFeed.parsePublicBoard(data,source:source);precondition(result.jobs[0]["posted"] as? String=="")
                for bad:Any in [true,1.2,"123",NSNull()] {changed=row;changed["id"]=bad;result=try CareerFeed.parsePublicBoard(["jobs":[changed]],source:source);precondition(result.status["ok"] as? Bool==false)}
            }
        }
        for title in ["iOS Engineer","Swift Developer","Software Engineering Intern","Tamara Builders Program - Data"] {precondition(CareerFeed.relevance(title)>0,title)}
        print("Public provider checks passed: six fixed sources, three schemas, Saudi geography, multi-city union, listed state, malformed/empty/partial data, date and URL validation, and title boundaries.")
    }
}
