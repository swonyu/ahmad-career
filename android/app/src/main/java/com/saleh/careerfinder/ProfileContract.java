package com.saleh.careerfinder;

import java.net.URI;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** Pure JVM checks matching the profile service limits; unfinished drafts may remain invalid. */
public final class ProfileContract {
    public static final int MAX_ITEMS = 30;
    public static final Set<String> COUNTRIES = java.util.Collections.unmodifiableSet(new HashSet<>(Arrays.asList((
        "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW"
    ).split(" "))));
    private ProfileContract() { }
    public static String textError(String value, String label, int maximum) {
        if (!BoundaryPolicy.validUnicode(value)) return "Check the characters in " + label.toLowerCase(Locale.ROOT) + ".";
        String text = value.trim();
        if (text.length() > maximum) return label + " must contain no more than " + maximum + " characters.";
        if (text.chars().anyMatch(c -> c < 32 || c == 127)) return label + " must be on one line without control characters.";
        return null;
    }
    public static String emailError(String value) {
        String error = textError(value, "Email", 254);
        if (error != null) return error;
        String email = value.trim().toLowerCase(Locale.ROOT);
        if (!email.isEmpty() && (email.codePoints().anyMatch(c -> Character.isWhitespace(c) || Character.isSpaceChar(c)) || !email.matches("^[^\\s@<>]{1,64}@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\\.[a-z]{2,63}$")))
            return "Enter an email address employers can reply to.";
        return null;
    }
    public static String countryError(String value) {
        String country = value.trim().toUpperCase(Locale.ROOT);
        return country.isEmpty() || COUNTRIES.contains(country) ? null : "Choose a recognized country or region.";
    }
    public static String listError(String value, String label, boolean countries) {
        Set<String> seen = new HashSet<>();
        for (String part : value.split(",", -1)) {
            String item = part.trim();
            if (item.isEmpty()) continue;
            String error = textError(item, "Each " + label.toLowerCase(Locale.ROOT) + " entry", 100);
            if (error != null) return error;
            if (countries && countryError(item) != null) return "Choose recognized target countries or regions.";
            seen.add(item);
        }
        return seen.size() > MAX_ITEMS ? "Choose no more than 30 " + label.toLowerCase(Locale.ROOT) + "." : null;
    }
    public static String websiteError(String value) {
        if (value.trim().isEmpty()) return null;
        if (value.trim().codePoints().anyMatch(c -> Character.isWhitespace(c) || Character.isSpaceChar(c))) return "Use a website address without spaces.";
        String error = textError(value, "Website", 2048);
        if (error != null) return error;
        try {
            URI uri = new URI(BoundaryPolicy.opportunityURL(value.trim()));
            String host = uri.getHost().toLowerCase(Locale.ROOT);
            if ((uri.getPort() != -1 && uri.getPort() != 443) || !host.contains(".") || host.contains(":") ||
                host.matches("[0-9.]+") || host.matches("(?:.*\\.)?(localhost|local|internal|test|invalid)"))
                return "Use a public HTTPS website without a custom port.";
            return null;
        } catch (Exception ignored) { return "Use a complete public HTTPS website address."; }
    }
}
