package com.saleh.careerfinder;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.Locale;
import java.util.Set;

/** Shared, executable boundary policy; no Android classes or network side effects. */
public final class BoundaryPolicy {
    public static final int MAX_PDF_BYTES = 5 * 1024 * 1024;
    public static final int MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
    // Private workspace responses include bounded review payloads and receipts.
    // Keep the smaller public-discovery limit separate. Never trust a header as a cap.
    public static final int MAX_APPLICATION_RESPONSE_BYTES = 12 * 1024 * 1024;
    public static final int MAX_PRIVATE_BYTES = 9 * 1024 * 1024;
    private BoundaryPolicy() { }

    public static boolean validUnicode(String value) {
        for (int index = 0; index < value.length(); index++) {
            char next = value.charAt(index);
            if (Character.isHighSurrogate(next)) {
                if (++index >= value.length() || !Character.isLowSurrogate(value.charAt(index))) return false;
            } else if (Character.isLowSurrogate(next)) return false;
        }
        return true;
    }

    public static String serviceOrigin(String input) {
        URI uri = httpsURI(input);
        String path = uri.getRawPath();
        if (uri.getRawQuery() != null || uri.getRawFragment() != null ||
            (path != null && !path.isEmpty() && !path.equals("/"))) {
            throw new IllegalArgumentException("Enter the HTTPS service address without a path, query or fragment.");
        }
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        int port = uri.getPort();
        return "https://" + host + (port == -1 || port == 443 ? "" : ":" + port);
    }

    /** Only for finding existing encrypted files; never used for a new namespace or request. */
    public static String legacyServiceOrigin(String input) {
        serviceOrigin(input);
        return "https://" + httpsURI(input).getRawAuthority().toLowerCase(Locale.ROOT);
    }

    public static String legacyWorkspaceKey(String origin, String workspaceId) {
        return sha256((legacyServiceOrigin(origin) + "\n" + workspaceId).getBytes(StandardCharsets.UTF_8));
    }

    public static String opportunityURL(String input) {
        URI uri = httpsURI(input, 4096);
        String normalized = uri.toASCIIString();
        return uri.getRawFragment() == null ? normalized : normalized.substring(0, normalized.indexOf('#'));
    }

    /** Only the public posting fields may cross the Android share sheet boundary. */
    public static String jobShareText(String title, String employer, String board, String link) {
        String role = shareLine(title), company = shareLine(employer), source = shareLine(board);
        if (role.isEmpty() || company.isEmpty()) throw new IllegalArgumentException("A public job title and employer are required.");
        return role + "\n" + company + (source.isEmpty() ? "" : "\n" + source) + "\n" + shareableJobURL(link);
    }

    private static String shareLine(String value) {
        if (value == null) return "";
        if (!validUnicode(value) || value.codePoints().anyMatch(c -> Character.isISOControl(c) && c != '\r' && c != '\n' && c != '\t'))
            throw new IllegalArgumentException("The posting contains unsupported text.");
        return value.replaceAll("[\\r\\n\\t]+", " ").trim();
    }

    /** A conservative share filter: never remove an unknown query field and guess its destination. */
    public static String shareableJobURL(String input) {
        if (input == null || input.length() > 2048) throw new IllegalArgumentException("Use a public job posting link.");
        String link = opportunityURL(input);
        if (link.length() > 2048) throw new IllegalArgumentException("Use a shorter public job posting link.");
        URI uri = URI.create(link);
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        if (!host.contains(".") || host.endsWith(".") || host.contains(":") || host.matches("[0-9.]+") ||
            host.matches("(?:.*\\.)?(?:localhost|local|internal|test|invalid)") ||
            (uri.getPort() != -1 && uri.getPort() != 443))
            throw new IllegalArgumentException("Use a public HTTPS posting without a custom port.");
        String path = uri.getRawPath();
        if (path != null) for (String rawSegment : path.split("/", -1)) {
            String segment = decodeURLPart(rawSegment);
            if (segment.equals(".") || segment.equals("..") ||
                segment.matches("(?i)(?:invites?|invitations?|candidates?|applicants?|auth|session|reset|verify|magic-link|personal-invite|password[-_]reset)(?:[-_].*)?") ||
                segment.contains("@") || segment.contains("%") || segment.contains("\\") || segment.contains("/") ||
                segment.matches("(?i).*https?:.*") || segment.codePoints().anyMatch(c -> c <= 0x20 || c == 0x7f))
                throw new IllegalArgumentException("The job link may contain private access details.");
        }
        Set<String> jobKeys = Set.of("jobid", "ghjid", "job", "postingid", "requisitionid", "reqid", "positionid", "vacancyid", "jobreqid", "source", "leversource", "leverorigin");
        Set<String> attributionKeys = Set.of("utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id");
        String query = uri.getRawQuery();
        if (query != null) for (String pair : query.split("&", -1)) {
            int equals = pair.indexOf('=');
            String key = decodeURLPart(equals < 0 ? pair : pair.substring(0, equals)).toLowerCase(Locale.ROOT);
            String value = decodeURLPart(equals < 0 ? "" : pair.substring(equals + 1));
            if ((!jobKeys.contains(key.replaceAll("[^a-z0-9]", "")) && !attributionKeys.contains(key)) ||
                !value.matches("[A-Za-z0-9._~-]{1,150}"))
                throw new IllegalArgumentException("The job link may contain private query details.");
        }
        return link;
    }

    /** A saved public profile link is not an OAuth session or proof of account ownership. */
    public static String linkedinProfileURL(String input) {
        if (input == null || input.codePoints().anyMatch(c -> Character.isWhitespace(c) || Character.isSpaceChar(c) || Character.isISOControl(c) || Character.getType(c) == Character.FORMAT))
            throw new IllegalArgumentException("Enter a LinkedIn profile link without spaces or control characters.");
        URI uri = httpsURI(input);
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        if (!(host.equals("linkedin.com") || host.equals("www.linkedin.com") ||
              host.matches("[a-z]{2,3}\\.linkedin\\.com")) ||
            (uri.getPort() != -1 && uri.getPort() != 443)) {
            throw new IllegalArgumentException("Use an HTTPS LinkedIn personal profile link, such as https://www.linkedin.com/in/your-name.");
        }
        // URI.toASCIIString() applies NFC normalization. Preserve the user's exact
        // Unicode spelling so raw and already escaped URLs match every client.
        if (decodeURLPart(input).codePoints().anyMatch(c -> Character.isISOControl(c) || Character.getType(c) == Character.FORMAT))
            throw new IllegalArgumentException("The LinkedIn link must not contain control characters.");
        String path = uri.getRawPath();
        if (path == null || !path.startsWith("/in/"))
            throw new IllegalArgumentException("Use a LinkedIn personal profile link beginning with /in/.");
        String slug = path.substring(4);
        if (slug.endsWith("/")) slug = slug.substring(0, slug.length() - 1);
        slug = decodeURLPart(slug);
        if (slug.isEmpty() || slug.equals(".") || slug.equals("..") || slug.indexOf('/') >= 0 ||
            slug.indexOf('\\') >= 0 || slug.indexOf('%') >= 0 ||
            slug.codePoints().anyMatch(c -> Character.isWhitespace(c) || Character.isSpaceChar(c) || Character.isISOControl(c))) {
            throw new IllegalArgumentException("Use one LinkedIn profile name after /in/, without spaces or extra path segments.");
        }
        String canonical = "https://www.linkedin.com/in/" + encodeProfileSlug(slug);
        if (canonical.length() > 2048) throw new IllegalArgumentException("Use a shorter LinkedIn personal profile link.");
        return canonical;
    }

    private static String encodeProfileSlug(String value) {
        final char[] hex = "0123456789ABCDEF".toCharArray();
        StringBuilder encoded = new StringBuilder();
        for (byte octet : value.getBytes(StandardCharsets.UTF_8)) {
            int c = octet & 0xff;
            if (c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' || c == '.' || c == '_' || c == '~')
                encoded.append((char)c);
            else encoded.append('%').append(hex[c >> 4]).append(hex[c & 15]);
        }
        return encoded.toString();
    }

    private static String decodeURLPart(String value) {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '%') {
                if (i + 2 >= value.length()) throw new IllegalArgumentException("The LinkedIn link has invalid encoding.");
                int high = Character.digit(value.charAt(++i), 16), low = Character.digit(value.charAt(++i), 16);
                if (high < 0 || low < 0) throw new IllegalArgumentException("The LinkedIn link has invalid encoding.");
                bytes.write(high * 16 + low);
            } else {
                if (Character.isHighSurrogate(c)) {
                    if (i + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(i + 1)))
                        throw new IllegalArgumentException("The link has invalid Unicode encoding.");
                    byte[] encoded = value.substring(i, i + 2).getBytes(StandardCharsets.UTF_8);
                    bytes.write(encoded, 0, encoded.length); i++;
                } else if (Character.isLowSurrogate(c)) throw new IllegalArgumentException("The link has invalid Unicode encoding.");
                else {
                    byte[] encoded = String.valueOf(c).getBytes(StandardCharsets.UTF_8);
                    bytes.write(encoded, 0, encoded.length);
                }
            }
        }
        try {
            return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
        } catch (CharacterCodingException error) { throw new IllegalArgumentException("The LinkedIn link has invalid encoding."); }
    }

    /** A stable private-record identity; never changes the original link opened for the user. */
    public static String jobIdentity(String input) {
        URI uri = httpsURI(input, 4096);
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        String path = uri.getRawPath() == null ? "" : asciiPreservingUnicode(uri.getRawPath());
        if ((host.equals("jobs.lever.co") || host.equals("jobs.eu.lever.co")) && (uri.getPort() == -1 || uri.getPort() == 443)) {
            String[] pieces = uri.getPath().split("/");
            if (pieces.length >= 3 && pieces[1].matches("[A-Za-z0-9_-]{1,80}") &&
                pieces[2].matches("[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}"))
                return host + "/" + pieces[1].toLowerCase(Locale.ROOT) + "/" + pieces[2].toLowerCase(Locale.ROOT);
        }
        while (path.endsWith("/")) path = path.substring(0, path.length() - 1);
        StringBuilder query = new StringBuilder();
        if (uri.getRawQuery() != null) for (String pair : uri.getRawQuery().split("&", -1)) {
            String rawName = pair.contains("=") ? pair.substring(0, pair.indexOf('=')) : pair;
            String name;
            try { name = decodeURLPart(rawName).toLowerCase(Locale.ROOT); }
            catch (IllegalArgumentException error) { name = rawName.toLowerCase(Locale.ROOT); }
            if (name.startsWith("utm_") || name.equals("gclid") || name.equals("fbclid")) continue;
            if (query.length() > 0) query.append('&');
            query.append(asciiPreservingUnicode(pair));
        }
        return "https://" + host + (uri.getPort() == -1 || uri.getPort() == 443 ? "" : ":" + uri.getPort()) + path +
            (query.length() == 0 ? "" : "?" + query);
    }

    private static String asciiPreservingUnicode(String value) {
        StringBuilder result = new StringBuilder();
        for (int i = 0; i < value.length();) {
            int point = value.codePointAt(i);
            if (point <= 127) result.append((char)point);
            else result.append(encodeProfileSlug(new String(Character.toChars(point))));
            i += Character.charCount(point);
        }
        return result.toString();
    }

    /** A user-selected calendar date, intentionally independent of time zones. */
    public static String civilDate(String input) {
        if (input == null || input.isEmpty()) return "";
        if (!input.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}"))
            throw new IllegalArgumentException("Use a calendar date in YYYY-MM-DD format.");
        try {
            LocalDate date = LocalDate.parse(input);
            if (date.getYear() < 1 || date.getYear() > 9999) throw new IllegalArgumentException("Choose a valid calendar year.");
            return input;
        } catch (java.time.DateTimeException error) { throw new IllegalArgumentException("Choose a valid calendar date."); }
    }

    /** Encodes only the public search terms supplied by the user; no profile or account fields. */
    public static String linkedinJobSearchURL(String keywords, String location) {
        String terms = keywords == null ? "" : keywords.trim();
        String place = location == null ? "" : location.trim();
        if (terms.length() > 120 || place.length() > 100)
            throw new IllegalArgumentException("Shorten the job-search terms or location.");
        try {
            String query = terms.isEmpty() ? "" : "keywords=" + URLEncoder.encode(terms, "UTF-8");
            if (!place.isEmpty()) query += (query.isEmpty() ? "" : "&") + "location=" + URLEncoder.encode(place, "UTF-8");
            return "https://www.linkedin.com/jobs/search/" + (query.isEmpty() ? "" : "?" + query);
        } catch (java.io.UnsupportedEncodingException impossible) { throw new IllegalStateException(impossible); }
    }

    private static URI httpsURI(String input) { return httpsURI(input, 2048); }

    private static URI httpsURI(String input, int maximumLength) {
        if (input == null || input.length() > maximumLength || !validUnicode(input) || input.chars().anyMatch(c -> c <= 0x20 || c == 0x7f))
            throw new IllegalArgumentException("Enter a valid HTTPS address without spaces.");
        try {
            URI uri = new URI(input);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null ||
                uri.getHost().trim().isEmpty() || uri.getRawUserInfo() != null || uri.isOpaque() ||
                uri.getPort() == 0 || uri.getPort() > 65535 || input.indexOf('\\') >= 0) {
                throw new IllegalArgumentException("A secure HTTPS address without embedded credentials is required.");
            }
            return uri;
        } catch (URISyntaxException exception) {
            throw new IllegalArgumentException("Enter a valid HTTPS address.");
        }
    }

    public static byte[] readPDF(InputStream stream) throws IOException {
        byte[] bytes = readBounded(stream, MAX_PDF_BYTES);
        if (bytes.length < 8 || bytes[0] != '%' || bytes[1] != 'P' || bytes[2] != 'D' || bytes[3] != 'F' || bytes[4] != '-')
            throw new IllegalArgumentException("Choose a PDF document. Renaming another file does not make it a PDF.");
        return bytes;
    }

    public static byte[] readBounded(InputStream stream, int limit) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(Math.min(limit, 8192));
        byte[] buffer = new byte[8192];
        int length;
        while ((length = stream.read(buffer)) != -1) {
            if (length > limit - out.size()) throw new IllegalArgumentException("The file or response is larger than the allowed size.");
            out.write(buffer, 0, length);
        }
        return out.toByteArray();
    }

    public static String sha256(byte[] bytes) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder result = new StringBuilder();
            for (byte b : hash) result.append(String.format(Locale.ROOT, "%02x", b & 0xff));
            return result.toString();
        } catch (NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }

    public static String workspaceKey(String origin, String workspaceId) {
        if (workspaceId == null || workspaceId.trim().isEmpty()) throw new IllegalArgumentException("Missing workspace identity.");
        return sha256((serviceOrigin(origin) + "\n" + workspaceId).getBytes(StandardCharsets.UTF_8));
    }

    public static String pdfName(String input) {
        if (input == null || input.trim().isEmpty()) return "Resume.pdf";
        String name = input.replaceAll("[\\x00-\\x1f\\x7f/\\\\:]", "_").trim();
        while (name.startsWith(".")) name = name.substring(1);
        if (name.trim().isEmpty()) name = "Resume";
        if (name.length() > 175) name = name.substring(0, 175);
        if (!name.isEmpty() && Character.isHighSurrogate(name.charAt(name.length() - 1))) name = name.substring(0, name.length() - 1);
        if (!name.toLowerCase(Locale.ROOT).endsWith(".pdf")) name += ".pdf";
        return name;
    }

    public static boolean isConfirmed(String state, String applicationId) {
        return "confirmed".equals(state) && applicationId != null && !applicationId.trim().isEmpty() &&
            applicationId.length() <= 200 && applicationId.chars().noneMatch(c -> c < 0x20 || c == 0x7f);
    }

    public static boolean isLiveReceipt(String evidenceMode, String provider, String state, String applicationId) {
        return "live".equals(evidenceMode) && "lever".equals(provider) && isConfirmed(state, applicationId);
    }

    public static boolean blocksResubmission(String state) {
        return "confirmed".equals(state) || "uncertain".equals(state) || "dispatching".equals(state);
    }
}
