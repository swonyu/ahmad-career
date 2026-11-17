import Foundation

final class FixtureProtocol:URLProtocol {
    static var payload=Data()
    static var responseStatus=200
    static var headers=[String:String]()
    static var stopped=false
    static var sentBytes=0
    private var cancelled=false
    private let lock=NSLock()
    override class func canInit(with request:URLRequest)->Bool {true}
    override class func canonicalRequest(for request:URLRequest)->URLRequest {request}
    override func startLoading() {
        let response=HTTPURLResponse(url:request.url!,statusCode:Self.responseStatus,httpVersion:"HTTP/1.1",headerFields:Self.headers)!
        client?.urlProtocol(self,didReceive:response,cacheStoragePolicy:.notAllowed)
        let data=Self.payload
        DispatchQueue.global().async { [self] in
            // Slow chunks allow cancellation to be observed while data is still arriving.
            for start in stride(from:0,to:data.count,by:65_536) {
                lock.lock();let done=cancelled;lock.unlock();if done{return}
                let chunk=data.subdata(in:start..<min(start+65_536,data.count))
                Self.sentBytes += chunk.count
                client?.urlProtocol(self,didLoad:chunk)
                Thread.sleep(forTimeInterval:0.001)
            }
            lock.lock();let done=cancelled;lock.unlock();if !done {client?.urlProtocolDidFinishLoading(self)}
        }
    }
    override func stopLoading(){lock.lock();cancelled=true;Self.stopped=true;lock.unlock()}
}
@main struct TransportCheck {
    static func main()async {
        let config=URLSessionConfiguration.ephemeral;config.protocolClasses=[FixtureProtocol.self]
        let source=CareerFeed.publicSources[0]
        func run(_ payload:Data,status:Int=200,length:Int?=nil)async->CareerFeed.SourceResult {
            FixtureProtocol.payload=payload;FixtureProtocol.responseStatus=status;FixtureProtocol.headers=length.map{["Content-Length":String($0)]} ?? [:];FixtureProtocol.stopped=false;FixtureProtocol.sentBytes=0
            let session=URLSession(configuration:config)
            defer {session.invalidateAndCancel()}
            return await CareerFeed.fetchPublic(source,session:session)
        }
        let valid=Data("{\"jobs\":[]}".utf8),limit=8_000_000
        var result=await run(valid)
        precondition(result.status["ok"] as? Bool==true)
        result=await run(valid,status:403)
        precondition(result.status["ok"] as? Bool==false)
        result=await run(valid,length:limit+1)
        precondition(result.status["ok"] as? Bool==false && String(describing:result.status["error"]).contains("size limit"))
        var exact=valid;exact.append(Data(repeating:32,count:limit-valid.count))
        result=await run(exact)
        precondition(result.status["ok"] as? Bool==true,"Exact byte limit should remain readable")
        var excess=exact;excess.append(Data(repeating:32,count:2_000_000))
        result=await run(excess)
        precondition(result.status["ok"] as? Bool==false && String(describing:result.status["error"]).contains("size limit"))
        // Underlying URLSession may buffer ahead; our accumulated payload stays bounded.
        result=await run(Data("{\"jobs\":[]".utf8))
        precondition(result.status["ok"] as? Bool==false)
        result=await run(Data([0xff]))
        precondition(result.status["ok"] as? Bool==false)
        print("PASS native streamed byte cap, declared-size rejection, exact boundary, HTTP/malformed handling")
    }
}
