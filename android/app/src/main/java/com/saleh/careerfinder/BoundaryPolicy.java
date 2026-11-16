package com.saleh.careerfinder;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;

/** Shared, executable boundary policy; no Android classes or network side effects. */
public final class BoundaryPolicy {
    public static final int MAX_PDF_BYTES = 5 * 1024 * 1024;
    public static final int MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
    private BoundaryPolicy() { }

    public static String serviceOrigin(String input) {
        URI uri = httpsURI(input);
        String path = uri.getRawPath();
        if (uri.getRawQuery() != null || uri.getRawFragment() != null ||
            (path != null && !path.isEmpty() && !path.equals("/"))) {
            throw new IllegalArgumentException("Enter the HTTPS service address without a path, query or fragment.");
        }
        return uri.getScheme().toLowerCase(Locale.ROOT) + "://" +
            uri.getRawAuthority().toLowerCase(Locale.ROOT);
    }

    public static String opportunityURL(String input) {
        URI uri = httpsURI(input);
        String normalized = uri.toASCIIString();
        return uri.getRawFragment() == null ? normalized : normalized.substring(0, normalized.indexOf('#'));
    }

    private static URI httpsURI(String input) {
        if (input == null || input.length() > 2048 || input.chars().anyMatch(c -> c <= 0x20 || c == 0x7f))
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
