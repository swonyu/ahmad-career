package com.saleh.careerfinder;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** Runs the app's actual policy class on the JVM, without a device or network. */
public final class BoundaryPolicyCheck {
    private static int checks;
    private static void check(boolean value, String label) {
        checks++;
        if (!value) throw new AssertionError(label);
    }
    private static void rejects(Runnable block, String label) {
        checks++;
        try { block.run(); } catch (IllegalArgumentException expected) { return; }
        throw new AssertionError(label);
    }
    public static void main(String[] args) throws Exception {
        check(BoundaryPolicy.serviceOrigin("https://apply.example.org/").equals("https://apply.example.org"), "origin strips only root slash");
        check(BoundaryPolicy.serviceOrigin("HTTPS://APPLY.EXAMPLE.ORG:8443").equals("https://apply.example.org:8443"), "normalizes scheme/host and preserves port");
        rejects(() -> BoundaryPolicy.serviceOrigin("http://apply.example.org"), "cleartext refused");
        rejects(() -> BoundaryPolicy.serviceOrigin("https://name:password@apply.example.org"), "credentials refused");
        rejects(() -> BoundaryPolicy.serviceOrigin("https://apply.example.org/api"), "origin path refused");
        rejects(() -> BoundaryPolicy.serviceOrigin("https://apply.example.org?token=secret"), "origin query refused");
        rejects(() -> BoundaryPolicy.serviceOrigin("https://apply.example.org#route"), "origin fragment refused");
        rejects(() -> BoundaryPolicy.serviceOrigin("https://apply.example.org:0"), "zero port refused");
        rejects(() -> BoundaryPolicy.serviceOrigin("https://apply.example.org:99999"), "invalid port refused");
        rejects(() -> BoundaryPolicy.serviceOrigin("https://apply.example.org\n"), "control character refused");
        rejects(() -> BoundaryPolicy.serviceOrigin("https://apply.example.org\\other"), "backslash refused");
        rejects(() -> BoundaryPolicy.opportunityURL("javascript:alert(1)"), "script links refused");
        rejects(() -> BoundaryPolicy.opportunityURL("file:///private/profile"), "file links refused");
        check(BoundaryPolicy.opportunityURL("https://jobs.example.org/a%2Fb?ref=a%20b#apply").equals("https://jobs.example.org/a%2Fb?ref=a%20b"), "fragment cleanup preserves encoded path/query");
        check(BoundaryPolicy.linkedinProfileURL("HTTPS://SA.LINKEDIN.COM:443/in/Jos%C3%A9-42/?trk=x#about").equals("https://www.linkedin.com/in/Jos%C3%A9-42"), "LinkedIn region, port, tracking and UTF8 canonicalized");
        check(BoundaryPolicy.linkedinProfileURL("https://linkedin.com/in/سلام").equals("https://www.linkedin.com/in/%D8%B3%D9%84%D8%A7%D9%85"), "LinkedIn Arabic profile preserved");
        check(BoundaryPolicy.linkedinProfileURL("https://www.linkedin.com/in/a+b").equals("https://www.linkedin.com/in/a%2Bb"), "LinkedIn plus uses exact unreserved-only encoding");
        check(BoundaryPolicy.linkedinProfileURL("https://www.linkedin.com/in/a%3Fb").equals("https://www.linkedin.com/in/a%3Fb"), "LinkedIn encoded slug punctuation stays in the path");
        check(BoundaryPolicy.linkedinProfileURL("https://www.linkedin.com/in/alice%2Dsmith").equals("https://www.linkedin.com/in/alice-smith"), "LinkedIn unreserved encoding normalized");
        check(BoundaryPolicy.linkedinProfileURL("https://abc.linkedin.com/in/a~._-0").equals("https://www.linkedin.com/in/a~._-0"), "LinkedIn three-letter region and unreserved slug allowed");
        String internationalLink = BoundaryPolicy.linkedinProfileURL("https://linkedin.com/in/" + "م".repeat(300));
        check(BoundaryPolicy.linkedinProfileURL(internationalLink).equals(internationalLink), "LinkedIn canonical UTF8 profile can be read back exactly");
        rejects(() -> BoundaryPolicy.linkedinProfileURL("https://linkedin.com/in/" + "م".repeat(400)), "LinkedIn encoded output remains within the response length limit");
        for (String url : new String[] {
            "http://www.linkedin.com/in/a", "https://user@www.linkedin.com/in/a", "https://www.linkedin.com:444/in/a",
            "https://www.linkedin.com.evil.example/in/a", "https://evil-linkedin.com/in/a", "https://abcd.linkedin.com/in/a",
            "https://www.linkedin.com/company/a", "https://www.linkedin.com/in/", "https://www.linkedin.com/in/a/b",
            "https://www.linkedin.com/in/a%2Fb", "https://www.linkedin.com/in/a%5Cb", "https://www.linkedin.com/in/a%252Fb",
            "https://www.linkedin.com/in/a%20b", "https://www.linkedin.com/in/a%C2%A0b", "https://www.linkedin.com/in/%2E",
            "https://www.linkedin.com/in/..", "https://www.linkedin.com/in/a%FF", "https://www.linkedin.com/in/a?x=%0A",
            "https://www.linkedin.com/in/a?x=%C2%85", "https://www.linkedin.com/in/a b", "https://www.linkedin.com/in/a\u00a0b",
            "https://www.linkedin.com/in/a?x=\u00a0", "https://www.linkedin.com/in/a\\b", " https://www.linkedin.com/in/a",
            "https://www.linkedin.com/in/a\u202eb", "https://www.linkedin.com/in/a?x=\u200b", "https://www.linkedin.com/in/a#\u200d",
            "https://www.linkedin.com/in/a%E2%80%AEb", "https://www.linkedin.com/in/a%E2%80%8Bb", "https://www.linkedin.com/in/a?x=%E2%80%8D"
        }) rejects(() -> BoundaryPolicy.linkedinProfileURL(url), "unsafe LinkedIn profile refused: " + url);
        check(BoundaryPolicy.linkedinJobSearchURL("Data & science", "Riyadh, SA").equals("https://www.linkedin.com/jobs/search/?keywords=Data+%26+science&location=Riyadh%2C+SA"), "LinkedIn search encodes only public terms");
        check(BoundaryPolicy.linkedinJobSearchURL("", "").equals("https://www.linkedin.com/jobs/search/"), "empty LinkedIn search opens the public jobs page");
        rejects(() -> BoundaryPolicy.linkedinJobSearchURL("x".repeat(121), ""), "LinkedIn search terms stay bounded");
        check(!BoundaryPolicy.workspaceKey("https://apply.example.org", "one").equals(BoundaryPolicy.workspaceKey("https://apply.example.org", "two")), "workspace identities isolated");
        check(!BoundaryPolicy.workspaceKey("https://apply.example.org", "one").equals(BoundaryPolicy.workspaceKey("https://other.example.org", "one")), "different services isolated");
        check(BoundaryPolicy.workspaceKey("https://apply.example.org/", "one").equals(BoundaryPolicy.workspaceKey("https://apply.example.org", "one")), "same service normalized");
        check(BoundaryPolicy.pdfName("../CV:current\\version").equals("_CV_current_version.pdf"), "safe plain PDF filename");
        check(BoundaryPolicy.pdfName("..").equals("Resume.pdf"), "dot filename cannot create hidden files");
        check(BoundaryPolicy.pdfName("Profile.PDF").equals("Profile.PDF"), "valid name preserved");
        byte[] document = "%PDF-1.7\nsample bytes".getBytes(StandardCharsets.US_ASCII);
        check(Arrays.equals(document, BoundaryPolicy.readPDF(new ByteArrayInputStream(document))), "PDF bytes preserved exactly");
        checks++;
        try { BoundaryPolicy.readPDF(new ByteArrayInputStream("not a pdf".getBytes(StandardCharsets.US_ASCII))); throw new AssertionError("non-PDF accepted"); }
        catch (IllegalArgumentException expected) { }
        checks++;
        try { BoundaryPolicy.readPDF(new ByteArrayInputStream("%PDF-".getBytes(StandardCharsets.US_ASCII))); throw new AssertionError("truncated PDF accepted"); }
        catch (IllegalArgumentException expected) { }
        byte[] oversized = new byte[BoundaryPolicy.MAX_PDF_BYTES + 1];
        checks++;
        try { BoundaryPolicy.readPDF(new ByteArrayInputStream(oversized)); throw new AssertionError("oversized PDF accepted"); }
        catch (IllegalArgumentException expected) { }
        check(BoundaryPolicy.sha256("abc".getBytes(StandardCharsets.US_ASCII)).equals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"), "real SHA256 digest");
        check(BoundaryPolicy.isLiveReceipt("live", "lever", "confirmed", "provider-id"), "confirmed live receipt counted");
        check(!BoundaryPolicy.isLiveReceipt("test", "lever", "confirmed", "test-id"), "test receipt excluded");
        check(!BoundaryPolicy.isLiveReceipt("", "lever", "confirmed", "provider-id"), "missing evidence mode fails closed");
        check(!BoundaryPolicy.isLiveReceipt("live", "", "confirmed", "provider-id"), "missing provider fails closed");
        check(!BoundaryPolicy.isLiveReceipt("live", "other", "confirmed", "provider-id"), "unknown provider fails closed");
        check(!BoundaryPolicy.isLiveReceipt("live", "lever", "confirmed", ""), "missing provider receipt fails closed");
        check(!BoundaryPolicy.isLiveReceipt("live", "lever", "uncertain", "provider-id"), "uncertain excluded");
        check(!BoundaryPolicy.isLiveReceipt("live", "lever", "confirmed", "id\n"), "control-bearing receipt excluded");
        check(BoundaryPolicy.blocksResubmission("dispatching"), "in-flight application blocks duplicate");
        check(BoundaryPolicy.blocksResubmission("uncertain"), "uncertain application blocks duplicate");
        check(BoundaryPolicy.blocksResubmission("confirmed"), "confirmed application blocks duplicate");
        System.out.println("PASS: " + checks + " executable Android boundary-policy checks (no network, no device claims).");
    }
}
