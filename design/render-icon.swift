import AppKit
import Foundation
let output=URL(fileURLWithPath:CommandLine.arguments[1],isDirectory:true)
try FileManager.default.createDirectory(at:output,withIntermediateDirectories:true)
let svg="""
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#173f36"/><path d="M406 360v-68c0-28 22-50 50-50h112c28 0 50 22 50 50v68" fill="none" stroke="#f5f4e9" stroke-width="48" stroke-linecap="round"/><rect x="236" y="350" width="552" height="428" rx="88" fill="#f5f4e9"/><path d="M337 643l128-127 92 91 134-135m-117 0h117v117" fill="none" stroke="#173f36" stroke-width="45" stroke-linecap="round" stroke-linejoin="round"/><circle cx="337" cy="643" r="29" fill="#d5af67"/></svg>
"""
try svg.write(to:output.appendingPathComponent("icon.svg"),atomically:true,encoding:.utf8)
for size in [16,32,64,128,256,512,1024] {
 let c=CGContext(data:nil,width:size,height:size,bitsPerComponent:8,bytesPerRow:size*4,space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.noneSkipLast.rawValue)!
 c.scaleBy(x:CGFloat(size)/1024,y:CGFloat(size)/1024);c.translateBy(x:0,y:1024);c.scaleBy(x:1,y:-1)
 let green=NSColor(srgbRed:23/255,green:63/255,blue:54/255,alpha:1).cgColor,cream=NSColor(srgbRed:245/255,green:244/255,blue:233/255,alpha:1).cgColor,gold=NSColor(srgbRed:213/255,green:175/255,blue:103/255,alpha:1).cgColor
 c.setFillColor(green);c.fill(CGRect(x:0,y:0,width:1024,height:1024));c.setStrokeColor(cream);c.setLineWidth(48);c.setLineCap(.round)
 c.move(to:CGPoint(x:406,y:360));c.addLine(to:CGPoint(x:406,y:292));c.addQuadCurve(to:CGPoint(x:456,y:242),control:CGPoint(x:406,y:242));c.addLine(to:CGPoint(x:568,y:242));c.addQuadCurve(to:CGPoint(x:618,y:292),control:CGPoint(x:618,y:242));c.addLine(to:CGPoint(x:618,y:360));c.strokePath()
 c.setFillColor(cream);c.addPath(CGPath(roundedRect:CGRect(x:236,y:350,width:552,height:428),cornerWidth:88,cornerHeight:88,transform:nil));c.fillPath()
 c.setStrokeColor(green);c.setLineWidth(45);c.setLineCap(.round);c.setLineJoin(.round);c.move(to:CGPoint(x:337,y:643));c.addLine(to:CGPoint(x:465,y:516));c.addLine(to:CGPoint(x:557,y:607));c.addLine(to:CGPoint(x:691,y:472));c.move(to:CGPoint(x:574,y:472));c.addLine(to:CGPoint(x:691,y:472));c.addLine(to:CGPoint(x:691,y:589));c.strokePath();c.setFillColor(gold);c.fillEllipse(in:CGRect(x:308,y:614,width:58,height:58))
 let bitmap=NSBitmapImageRep(cgImage:c.makeImage()!)
 let data=bitmap.representation(using:.png,properties:[:])!;try data.write(to:output.appendingPathComponent("AppIcon-macOS-\(size).png"))
 if size==1024 {try data.write(to:output.appendingPathComponent("AppIcon-iOS-1024.png"))}
}
print("Rendered opaque RGB iOS1024 and macOS16–1024 icons from original vector geometry.")
