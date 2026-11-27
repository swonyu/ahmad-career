package com.saleh.careerfinder

import org.junit.Assert.*
import org.junit.Test

class ExperienceModelRegressionTest {
    @Test fun applicationEssentials_supportSingleNames_andKeepIncompleteDraftsHonest() {
        assertEquals(0, ProfileDraft().essentialCount)
        val single = ProfileDraft(firstName = "Single", email = "single@example.invalid", resume = Resume("Own.pdf", 30, "a".repeat(64)))
        assertTrue(single.essentialsComplete)
        assertEquals("", single.lastName)
        assertFalse(single.copy(email = "wrong address").hasApplicationEmail)
        assertFalse(single.copy(resume = null).essentialsComplete)
        assertFalse(single.copy(resume = Resume("Wrong.pdf", 0, "unknown")).hasApplicationPDF)
    }

    @Test fun receiptFilters_neverTreatTestOrUnknownEvidenceAsVerified() {
        val confirmed = ApplicationReceipt("synthetic", "Synthetic fixture", "Fixture", "confirmed", "fixture-id", "2026-11-16T00:00:00Z", "", "live", "", "lever")
        val test = confirmed.copy(evidenceMode = "test")
        val unknown = confirmed.copy(evidenceMode = "unknown")
        val uncertain = confirmed.copy(state = "uncertain", applicationId = "")
        assertTrue(ReceiptFilter.CONFIRMED.includes(confirmed))
        assertFalse(ReceiptFilter.CONFIRMED.includes(test))
        assertFalse(ReceiptFilter.CONFIRMED.includes(unknown))
        assertFalse(ReceiptFilter.CONFIRMED.includes(uncertain))
        assertTrue(ReceiptFilter.TEST.includes(test))
        assertFalse(ReceiptFilter.ATTENTION.includes(test))
        assertTrue(ReceiptFilter.ATTENTION.includes(unknown))
        assertTrue(ReceiptFilter.ATTENTION.includes(uncertain))
        assertTrue(ReceiptFilter.PENDING.includes(confirmed.copy(state = "dispatching")))
        assertTrue(ReceiptFilter.STOPPED.includes(confirmed.copy(state = "cancelled")))
    }
}
