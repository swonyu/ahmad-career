import com.saleh.careerfinder.BoundaryPolicy;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.zip.GZIPInputStream;

/** Standalone JVM regression over the actual production reader; no Android SDK or network. */
public final class ApplicationResponseBoundaryCheck {
    private static final int MIB = 1024 * 1024;
    private static final int FIXTURE_BYTES = 2_735_817;
    private static final String FIXTURE_SHA = "e585a049b2f07822e8b8b0dc664aa6b381ab11282c85bc8dba9189d8a1ab6391";
    private static int assertions;

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        assertions++;
    }

    private static final class GeneratedStream extends InputStream {
        private final long size;
        long consumed;
        boolean closed;
        GeneratedStream(long size) { this.size = size; }
        @Override public int read() {
            if (consumed == size) return -1;
            consumed++; return 0;
        }
        @Override public int read(byte[] bytes, int offset, int length) {
            if (consumed == size) return -1;
            int count = (int)Math.min(length, size - consumed);
            Arrays.fill(bytes, offset, offset + count, (byte)0);
            consumed += count;
            return count;
        }
        @Override public void close() { closed = true; }
    }

    private static void accepts(int limit) throws IOException {
        GeneratedStream source = new GeneratedStream(limit);
        try (InputStream input = source) {
            check(BoundaryPolicy.readBounded(input, limit).length == limit, "Exact limit must pass");
        }
        check(source.closed, "Accepted body must close");
    }

    private static void refuses(int limit, long sourceSize) throws IOException {
        GeneratedStream source = new GeneratedStream(sourceSize);
        boolean refused = false;
        try (InputStream input = source) {
            BoundaryPolicy.readBounded(input, limit);
        } catch (IllegalArgumentException expected) {
            refused = true;
        }
        check(refused, "Oversized body must be refused");
        check(source.closed, "Refused body must close (Kotlin use equivalent)");
        check(source.consumed <= (long)limit + 8192, "Reader must stop after first over-limit chunk");
        check(source.consumed <= sourceSize, "Reader must not invent bytes");
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 3) throw new IllegalArgumentException("Pass fixture.json.gz, CareerApi.kt and Discovery.kt paths");
        // Reflection allows the same regression to expose the old production
        // failure before the candidate constant exists; no implementation is copied.
        int applicationLimit;
        try { applicationLimit = BoundaryPolicy.class.getField("MAX_APPLICATION_RESPONSE_BYTES").getInt(null); }
        catch (NoSuchFieldException beforeFix) { applicationLimit = BoundaryPolicy.MAX_RESPONSE_BYTES; }
        byte[] received;
        try (InputStream input = new GZIPInputStream(Files.newInputStream(Path.of(args[0])))) {
            received = BoundaryPolicy.readBounded(input, applicationLimit);
        }
        check(received.length == FIXTURE_BYTES, "Exact valid service fixture byte count");
        check(BoundaryPolicy.sha256(received).equals(FIXTURE_SHA), "Exact actual-handler synthetic fixture hash");
        check(applicationLimit == 12 * MIB, "Application cap must be fixed at 12 MiB");
        check(BoundaryPolicy.MAX_RESPONSE_BYTES == 2 * MIB, "Discovery cap must remain 2 MiB");
        check(BoundaryPolicy.MAX_PDF_BYTES == 5 * MIB, "PDF cap must remain 5 MiB");
        check(BoundaryPolicy.MAX_PRIVATE_BYTES == 9 * MIB, "Private file cap must remain 9 MiB");
        received = null;
        accepts(applicationLimit);
        refuses(applicationLimit, (long)applicationLimit + 1);
        refuses(applicationLimit, 1L << 40);
        accepts(BoundaryPolicy.MAX_RESPONSE_BYTES);
        refuses(BoundaryPolicy.MAX_RESPONSE_BYTES, (long)BoundaryPolicy.MAX_RESPONSE_BYTES + 1);
        String api = Files.readString(Path.of(args[1]));
        String discovery = Files.readString(Path.of(args[2]));
        check(api.contains("BoundaryPolicy.readBounded(it, BoundaryPolicy.MAX_APPLICATION_RESPONSE_BYTES)"), "Application API must use its fixed cap");
        check(!api.contains("BoundaryPolicy.readBounded(it, BoundaryPolicy.MAX_RESPONSE_BYTES)"), "Application API must stop using the discovery cap");
        check(discovery.contains("BoundaryPolicy.readBounded(it, BoundaryPolicy.MAX_RESPONSE_BYTES)"), "Discovery must retain its own cap");
        check(!discovery.contains("MAX_APPLICATION_RESPONSE_BYTES"), "Application cap must not expand public discovery");
        System.out.println("{\"status\":\"passed\",\"assertions\":" + assertions + ",\"fixtureBytes\":" + FIXTURE_BYTES + ",\"applicationCap\":" + applicationLimit + ",\"discoveryCap\":" + BoundaryPolicy.MAX_RESPONSE_BYTES + ",\"fixtureSHA256\":\"" + FIXTURE_SHA + "\",\"androidDeviceRun\":false,\"networkRequests\":0}");
    }
}
