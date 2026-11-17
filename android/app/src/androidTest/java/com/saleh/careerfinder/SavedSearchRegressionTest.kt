package com.saleh.careerfinder

import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

/** Actual comparison code and typed record selection. No store, provider or network mutation. */
class SavedSearchRegressionTest {
    @Test fun sharedUnicodeCases_matchAcrossNotesAndMetadata_withoutRewritingOriginals() {
        val fixture = JSONObject(InstrumentationRegistry.getInstrumentation().context.assets
            .open("native-saved-search-v1.json").bufferedReader().use { it.readText() })
        assertEquals(1, fixture.getInt("schema"))
        val cases = fixture.getJSONArray("cases")
        for (index in 0 until cases.length()) {
            val item = cases.getJSONObject(index)
            val input = item.getJSONArray("fields")
            val fields = (0 until input.length()).map(input::getString)
            val original = fields.toList()
            val query = item.getString("query")
            assertEquals(item.getString("id"), item.getBoolean("matches"), SavedSearch.matches(fields, query))
            assertEquals(original, fields)
            assertEquals(item.getString("query"), query)
        }
    }

    @Test fun savedRow_indexesOnlyItsActiveNotes_keepsOpaqueIdentifiersAndHistoryOut() {
        val job = Opportunity("opaque-record-id", "https://jobs.example.invalid/opaque-link-id", "Engineer", "Élan", "Riyadh", "SA", true)
        val other = job.copy(id = "unrelated-record", url = "https://jobs.example.invalid/unrelated")
        val record = ApplicationRecordBundle.create(job, ApplicationRecord(note = "تَوَاصُل CaseTracker"))
            .copy(alternatives = listOf(ApplicationRecordVersion.create(ApplicationRecord(note = "ActiveAlternative"))),
                history = listOf(ApplicationRecordVersion.create(ApplicationRecord(note = "ArchivedOnly"))))
        val unrelated = ApplicationRecordBundle.create(other, ApplicationRecord(note = "OtherWorkspaceToken"))
        val original = record.json().toString()
        assertTrue(savedOpportunityMatches(job, record, "élan casetracker تواصل"))
        assertTrue(savedOpportunityMatches(job, record, "activealternative"))
        assertFalse(savedOpportunityMatches(job, record, "archivedonly"))
        assertFalse(savedOpportunityMatches(job, record, "opaque-record-id"))
        assertFalse(savedOpportunityMatches(job, record, "opaque-link-id"))
        assertFalse(savedOpportunityMatches(job, unrelated, "otherworkspacetoken"))
        assertEquals(original, record.json().toString())
        val unbookmarked = CareerUiState(applicationRecords = mapOf(record.identity to record)).unbookmarkedRecords.single()
        assertTrue(savedOpportunityMatches(unbookmarked.job, unbookmarked, "تواصل"))
        assertEquals("تَوَاصُل CaseTracker", unbookmarked.current.record.note)
    }
}
