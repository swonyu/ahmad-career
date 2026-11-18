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
        check(BoundaryPolicy.serviceOrigin("https://APPLY.EXAMPLE.ORG:443/").equals("https://apply.example.org"), "default HTTPS port has one origin");
        check(BoundaryPolicy.serviceOrigin("https://apply.example.org:00443").equals("https://apply.example.org"), "zero-padded default port has one origin");
        check(BoundaryPolicy.workspaceKey("https://apply.example.org:443", "one").equals(BoundaryPolicy.workspaceKey("https://apply.example.org", "one")), "equivalent default-port workspace is isolated by account, not spelling");
        check(!BoundaryPolicy.legacyWorkspaceKey("https://apply.example.org:00443", "one").equals(BoundaryPolicy.workspaceKey("https://apply.example.org", "one")), "old default-port alias stays discoverable without overwriting its file");
        check(BoundaryPolicy.serviceOrigin("https://[2001:db8::1]:443").equals("https://[2001:db8::1]"), "IPv6 default HTTPS port canonicalized");
        check(ProfileContract.textError("a".repeat(150), "Name", 150) == null, "150-character name accepted");
        check(ProfileContract.textError("a".repeat(151), "Name", 150) != null, "151-character name reports an error");
        check(ProfileContract.textError("First\nLast", "Name", 150) != null, "multiline name rejected before sharing");
        check(ProfileContract.emailError("") == null, "blank unfinished profile is valid");
        check(ProfileContract.emailError("person+jobs@EXAMPLE.ORG") == null, "service-compatible email accepted");
        check(ProfileContract.emailError("person<name>@example.org") != null, "unsupported email punctuation rejected");
        check(ProfileContract.emailError("x".repeat(65) + "@example.org") != null, "oversized email local part rejected");
        check("Enter an email address employers can reply to.".equals(ProfileContract.emailError("invalid-email")), "typed invalid email explains the correction");
        check("Email needed".equals(ProfileContract.emailEssentialLabel("")), "empty email is needed");
        check("Check your email".equals(ProfileContract.emailEssentialLabel("invalid-email")), "typed invalid email asks for a check");
        check("Check your email".equals(ProfileContract.emailEssentialLabel("   ")), "whitespace-only email asks for a check");
        check("Email added".equals(ProfileContract.emailEssentialLabel("person+jobs@example.org")), "usable email is added");
        check(ProfileContract.countryError("XK") == null, "supported region beyond Java ISO list accepted");
        check(ProfileContract.countryError("ZZ") != null, "unknown country rejected");
        check(ProfileContract.listError(java.util.stream.IntStream.range(0,30).mapToObj(i -> "Role " + i).collect(java.util.stream.Collectors.joining(",")), "Roles", false) == null, "30 role entries accepted");
        check(ProfileContract.listError(java.util.stream.IntStream.range(0,31).mapToObj(i -> "Role " + i).collect(java.util.stream.Collectors.joining(",")), "Roles", false) != null, "31 role entries report an error without truncation");
        check(ProfileContract.listError("x".repeat(101), "Skills", false) != null, "oversized list item rejected");
        check(ProfileContract.listError("US, ZZ", "Target countries", true) != null, "invalid target country rejected");
        check(ProfileContract.websiteError("https://portfolio.example.org/") == null, "public portfolio accepted");
        for (String invalid : new String[]{"https://127.0.0.1/", "https://[::1]/", "https://example.local", "https://example.invalid", "https://example.org:8443/", "http://example.org"})
            check(ProfileContract.websiteError(invalid) != null, "service-incompatible portfolio rejected: " + invalid);
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
        check(BoundaryPolicy.linkedinProfileURL("https://linkedin.com/in/Jose\u0301").equals("https://www.linkedin.com/in/Jose%CC%81"), "raw decomposed LinkedIn Unicode spelling preserved");
        check(BoundaryPolicy.linkedinProfileURL("https://linkedin.com/in/Jose%CC%81").equals("https://www.linkedin.com/in/Jose%CC%81"), "escaped decomposed LinkedIn Unicode spelling preserved");
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
        check(BoundaryPolicy.jobIdentity("HTTPS://JOBS.LEVER.CO:443/Example/00000000-0000-4000-8000-000000000001/apply?source=phone#apply")
            .equals("jobs.lever.co/example/00000000-0000-4000-8000-000000000001"), "same Lever posting keeps one private identity");
        check(BoundaryPolicy.jobIdentity("https://JOBS.EXAMPLE.ORG:443/opening/?id=42&utm_source=mail&gclid=sample#apply")
            .equals("https://jobs.example.org/opening?id=42"), "generic identity preserves job parameter and removes tracking");
        check(!BoundaryPolicy.jobIdentity("https://jobs.example.org/opening?id=42").equals(BoundaryPolicy.jobIdentity("https://jobs.example.org/opening?id=43")), "different job parameters remain distinct");
        check(!BoundaryPolicy.jobIdentity("https://jobs.example.org:8443/opening").equals(BoundaryPolicy.jobIdentity("https://jobs.example.org/opening")), "custom job origins remain distinct");
        check(BoundaryPolicy.civilDate("2024-02-29").equals("2024-02-29"), "leap day retained as a civil date");
        check(BoundaryPolicy.civilDate("").isEmpty(), "optional calendar date stays empty");
        for (String invalid : new String[]{"2025-02-29", "2026-13-01", "2026-04-31", "2026-1-01", "0000-01-01", "2026-11-17T00:00:00Z"})
            rejects(() -> BoundaryPolicy.civilDate(invalid), "invalid or instant-like civil date refused");
        check(!BoundaryPolicy.workspaceKey("https://apply.example.org", "one").equals(BoundaryPolicy.workspaceKey("https://apply.example.org", "two")), "workspace identities isolated");
        check(!BoundaryPolicy.workspaceKey("https://apply.example.org", "one").equals(BoundaryPolicy.workspaceKey("https://other.example.org", "one")), "different services isolated");
        check(BoundaryPolicy.workspaceKey("https://apply.example.org/", "one").equals(BoundaryPolicy.workspaceKey("https://apply.example.org", "one")), "same service normalized");
        check(BoundaryPolicy.pdfName("../CV:current\\version").equals("_CV_current_version.pdf"), "safe plain PDF filename");
        check(BoundaryPolicy.pdfName("..").equals("Resume.pdf"), "dot filename cannot create hidden files");
        check(BoundaryPolicy.pdfName("Profile.PDF").equals("Profile.PDF"), "valid name preserved");
        check(BoundaryPolicy.validUnicode("Name \uD83D\uDE00"), "complete non-BMP character preserved");
        check(!BoundaryPolicy.validUnicode("Name \uD800"), "unpaired surrogate cannot be saved lossily");
        check(BoundaryPolicy.validUnicode(BoundaryPolicy.pdfName("x".repeat(174) + "\uD83D\uDE00")), "long PDF filename never splits a Unicode scalar");
        check(ProfileContract.emailError("first\u00a0last@example.org") != null, "Unicode-space email rejected consistently with service");
        check(ProfileContract.websiteError("https://example.org/a\u00a0b") != null, "Unicode-space public URL rejected consistently with service");
        check(BoundaryPolicy.opportunityURL("https://example.org/" + "x".repeat(4076)).length() == 4096, "portable local job URL can retain 4096 characters");

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
