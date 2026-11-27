package com.saleh.careerfinder;

import java.net.URI;

/** Historical URLs stay readable while new entries keep their canonical length limits. */
public final class HistoricalURLBoundaryCheck {
    private static int assertions;
    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }
    private static void rejects(Runnable operation, String message) {
        boolean rejected = false;
        try { operation.run(); } catch (IllegalArgumentException expected) { rejected = true; }
        check(rejected, message);
    }
    public static void main(String[] arguments) throws Exception {
        String root = "https://example.com/";
        String original = root + "界".repeat(2048 - root.length());
        String historical = new URI(original).toASCIIString();
        check(original.length() == 2048 && historical.length() == 18272,
            "fixture must be admitted by the old input limit and expand to the recorded 18,272 units");
        check(BoundaryPolicy.historicalOpportunityURL(historical).equals(historical), "historical spelling stays exact");
        String withContext = historical + "?job=one&utm_source=history#apply";
        check(BoundaryPolicy.historicalOpportunityURL(withContext).equals(withContext), "stored query and fragment stay exact");
        check(BoundaryPolicy.jobIdentity(withContext).equals(historical + "?job=one"), "identity retains meaningful parameters and drops tracking");
        check(!BoundaryPolicy.jobIdentity(withContext).equals(BoundaryPolicy.jobIdentity(historical + "?job=two")), "distinct old jobs stay distinct");
        check(BoundaryPolicy.jobIdentity(original).equals(BoundaryPolicy.jobIdentity(historical)), "Unicode and encoded historical identity agree");
        rejects(() -> BoundaryPolicy.opportunityURL(historical), "new saved link cannot bypass raw length limit");
        rejects(() -> BoundaryPolicy.opportunityURL(original), "new saved link cannot expand past its canonical limit");
        check(ProfileContract.websiteError(original) != null, "profile website cannot expand past canonical service limit");
        check(ProfileContract.websiteError(root + "界".repeat(300)) != null, "profile limit stays stricter than local link limit");
        String accepted = root + "x".repeat(2048 - root.length());
        check(ProfileContract.websiteError(accepted) == null, "exact canonical profile boundary remains usable");
        check(BoundaryPolicy.opportunityURL(root + "x".repeat(4096 - root.length())).length() == 4096,
            "exact local canonical boundary remains usable");
        check(BoundaryPolicy.historicalOpportunityURL("https://example.com/وظائف/😀").equals("https://example.com/وظائف/😀"),
            "Arabic and astral historical spelling stays exact");
        String decomposed = root + "e\u0301".repeat(300);
        check(new URI(decomposed).toASCIIString().length() == 1820, "fixture exposes Java NFC length undercount");
        check(ProfileContract.websiteError(decomposed) != null, "profile counts the original decomposed URL, 2120 canonical units");
        rejects(() -> BoundaryPolicy.serviceOpportunityURL(decomposed), "service sync blocks decomposed overflow before POST");
        check(BoundaryPolicy.opportunityURL(root + "e\u0301").equals(root + "e%CC%81"), "new links retain decomposed code points");
        check(BoundaryPolicy.serviceOpportunityURL("HTTPS://EXAMPLE.COM:443").equals(root), "service canonical authority and slash");
        check(BoundaryPolicy.serviceOpportunityURL(root + "a/%2E%2e/b/./c#ignored").equals(root + "b/c"), "encoded dot segments match service path semantics");
        check(BoundaryPolicy.serviceOpportunityURL(root + "a//../b/").equals(root + "a/b/"), "empty path segment shortening retains trailing slash");
        check(BoundaryPolicy.serviceOpportunityURL(root + "job?q='x'").equals(root + "job?q=%27x%27"), "special query apostrophes are encoded");
        rejects(() -> BoundaryPolicy.serviceOpportunityURL(root + "?q=" + "'".repeat(680)), "query encoding cannot bypass the service bound");
        check(BoundaryPolicy.historicalOpportunityURL(decomposed).equals(decomposed), "historical decomposed spelling remains exact");
        for (String invalid : new String[]{"javascript:alert(1)", "file:///private/profile", "http://example.com/job",
                "https://name:secret@example.com/job", "https://example.com/a\\b", "https://example.com/a\n",
                "https://example.com/\uD800", "https://example.com:0/job", "https://example.com:70000/job"}) {
            rejects(() -> BoundaryPolicy.historicalOpportunityURL(invalid), "historical read must retain URL security checks");
            rejects(() -> BoundaryPolicy.jobIdentity(invalid), "identity must retain URL security checks");
        }
        System.out.println("Historical URL boundary: " + assertions + " assertions passed.");
    }
}
