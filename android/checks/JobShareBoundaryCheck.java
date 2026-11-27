package com.saleh.careerfinder;

/** Runs the actual share payload policy without Android, a device or a network. */
public final class JobShareBoundaryCheck {
    private static int checks;
    private static void check(boolean passed, String description) {
        checks++;
        if (!passed) throw new AssertionError(description);
    }
    private static void rejects(String url) {
        checks++;
        try { BoundaryPolicy.jobShareText("Role", "Employer", "Board", url); }
        catch (IllegalArgumentException expected) { return; }
        throw new AssertionError("Private or nonpublic link was shareable: " + url);
    }
    public static void main(String[] args) {
        String url = "https://jobs.example.com/posting/123#section";
        String payload = BoundaryPolicy.jobShareText("مهندس برمجيات", "Synthetic employer", "Synthetic board", url);
        check(payload.equals("مهندس برمجيات\nSynthetic employer\nSynthetic board\nhttps://jobs.example.com/posting/123"),
            "Only public title, employer, board and fragment-free link are included in order");
        check(BoundaryPolicy.jobShareText("Role", "Employer", null, url).equals("Role\nEmployer\nhttps://jobs.example.com/posting/123"),
            "Absent board adds no empty line");
        check(BoundaryPolicy.jobShareText("One\nTwo\tThree", "Employer", "Board", url).startsWith("One Two Three\nEmployer\nBoard\n"),
            "Stored line breaks cannot add apparent payload fields");
        check(!payload.contains("PRIVATE_NOTE") && !payload.contains("PRIVATE_CV.pdf") && !payload.contains("private@example.com"),
            "Application note, CV and applicant email have no share payload input");
        for (String invalid : new String[] {
            "http://jobs.example.com/123", "https://user:pass@jobs.example.com/123", "https://localhost/job",
            "https://jobs.internal/posting", "https://127.0.0.1/job", "https://[::1]/job",
            "https://jobs.example.com/jobs/../secret", "https://jobs.example.com/jobs/%2e%2e/secret",
            "https://jobs.internal./posting", "https://127.0.0.1./job", "https://jobs.example.com./posting",
            "https://jobs.example.com:8443/posting", "javascript:alert(1)",
            "https://jobs.example.com/invite/secret", "https://jobs.example.com/%69nvitation/secret",
            "https://jobs.example.com/invitations/secret", "https://jobs.example.com/candidate-dashboard/secret",
            "https://jobs.example.com/candidates/secret", "https://jobs.example.com/applicants/secret",
            "https://jobs.example.com/password-reset/secret", "https://jobs.example.com/password_reset/secret",
            "https://jobs.example.com/posting/private%40example.com", "https://jobs.example.com/posting/%2569nvite",
            "https://jobs.example.com/posting?access_token=secret", "https://jobs.example.com/posting?candidateId=123",
            "https://jobs.example.com/posting?email=private%40example.com", "https://jobs.example.com/posting?X-Amz-Signature=secret",
            "https://jobs.example.com/posting?invite=abc", "https://jobs.example.com/posting?%61uth%5Fcode=secret",
            "https://jobs.example.com/posting?session_id=secret", "https://jobs.example.com/posting?apiKey=abc",
            "https://jobs.example.com/posting?redirect=https%3A%2F%2Fexample.com%2Finvite%2Fsecret",
            "https://jobs.example.com/posting?contact=private%40example.com",
            "https://jobs.example.com/posting?jobId=private%40example.com",
            "https://jobs.example.com/posting?jobId=https%3A%2F%2Fexample.com%2Fsecret",
            "https://jobs.example.com/posting?jobId=123&unknown=abc",
            "https://jobs.example.com/posting?utm_token=secret", "https://jobs.example.com/posting?utm_session=abc123",
            "https://jobs.example.com/posting?utm_candidate=person123", "https://jobs.example.com/posting?utm_email=person.example.com",
            "https://jobs.example.com/posting?utm_custom=abc"
        }) rejects(invalid);
        for (String publicLink : new String[] {
            "https://jobs.example.com/jobs/123",
            "https://jobs.example.com/posting?jobId=123&gh_jid=456",
            "https://jobs.example.com/posting?reqId=AB-123&utm_source=board",
            "https://jobs.example.com/posting?jobId=123&gh_jid=456&utm_source=board&utm_medium=organic&utm_campaign=roles&utm_id=launch2026",
            "https://jobs.example.com/jobs/123?utm_term=engineer&utm_content=listing"
        }) check(BoundaryPolicy.jobShareText("Role", "Employer", null, publicLink).endsWith(publicLink),
            "Public posting identity and attribution are preserved exactly: " + publicLink);
        System.out.println("PASS: " + checks + " Android job-share boundary assertions");
    }
}
