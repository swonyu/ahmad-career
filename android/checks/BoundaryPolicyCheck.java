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
