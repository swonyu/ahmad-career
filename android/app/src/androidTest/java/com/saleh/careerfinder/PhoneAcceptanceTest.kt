package com.saleh.careerfinder

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import org.junit.Rule
import org.junit.Test
import org.junit.Before

/** Run only on the dedicated, blank acceptance emulator. No employer or service traffic. */
class PhoneAcceptanceTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private lateinit var strings: CareerStrings

    @Before fun awaitArabicPhone() {
        compose.activityRule.scenario.onActivity { strings = phoneAcceptanceStrings(it) }
        compose.waitUntil(5_000) {
            compose.onAllNodes(hasTestTag("discovery-list")).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithTag("navigation-profile").assertTextContains(strings("Profile"))
    }

    private fun closeSoftKeyboard() {
        compose.runOnIdle {
            val activity = compose.activity
            (activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager)
                .hideSoftInputFromWindow(activity.window.decorView.windowToken, 0)
        }
        compose.waitForIdle()
    }

    @Test fun blankWorkspace_hasHonestEmptyState_andConnectionRequirement() {
        val searchHeading = hasText(strings("Search jobs")) and SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading)
        compose.onNodeWithTag("discovery-list").performScrollToNode(searchHeading)
        compose.onNode(searchHeading).assertIsDisplayed()
        compose.onNodeWithTag("jobs-saved-tab").performClick()
        compose.onNodeWithTag("jobs-list").performScrollToNode(hasText(strings("No saved jobs yet")))
        compose.onNodeWithText(strings("No saved jobs yet")).assertIsDisplayed()
        compose.onNodeWithTag("navigation-apply").revealNavigationTab().performClick()
        compose.onNodeWithTag("apply-list").performScrollToNode(hasText(strings("Apply on the employer’s website")))
        compose.onNodeWithText(strings("Apply on the employer’s website")).assertIsDisplayed()
        compose.onNodeWithTag("apply-list").performScrollToNode(hasTestTag("apply.manual"))
        compose.onNodeWithTag("apply.manual").performClick()
        compose.onNodeWithTag("jobs-list").performScrollToNode(hasText(strings("No saved jobs yet")))
        compose.onNodeWithText(strings("No saved jobs yet")).assertIsDisplayed()
        compose.onNodeWithTag("navigation-apply").revealNavigationTab().performClick()
        compose.onNodeWithTag("apply-list").performScrollToNode(hasTestTag("apply.connect"))
        compose.onNodeWithTag("apply.connect").assertIsDisplayed()
        compose.onNodeWithTag("navigation-receipts").revealNavigationTab().performClick()
        compose.onNodeWithTag("receipts-list").performScrollToNode(hasText(strings("No receipts yet")))
        compose.onNodeWithText(strings("No receipts yet")).assertIsDisplayed()
    }

    @Test fun phoneProfile_survivesActivityRecreation_withoutAnyService() {
        compose.onNodeWithTag("navigation-profile").revealNavigationTab().performClick()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText(strings("First or single name")) and hasSetTextAction())
        compose.onNode(hasText(strings("First or single name")) and hasSetTextAction()).performTextInput("Acceptance")
        closeSoftKeyboard()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText(strings("Last name (optional)")) and hasSetTextAction())
        compose.onNode(hasText(strings("Last name (optional)")) and hasSetTextAction()).performTextInput("Fixture")
        closeSoftKeyboard()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText(strings("Save profile on this phone")))
        compose.onNodeWithText(strings("Save profile on this phone")).performClick()
        compose.waitUntil(timeoutMillis = 5000) {
            compose.onAllNodes(hasText(strings("Profile saved privately on this phone."))).fetchSemanticsNodes().isNotEmpty()
        }
        compose.activityRule.scenario.recreate()
        compose.onNodeWithTag("navigation-profile").revealNavigationTab().performClick()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText(strings("First or single name")))
        compose.waitUntil(timeoutMillis = 5000) {
            compose.onAllNodes(hasText("Acceptance")).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText("Acceptance").assertIsDisplayed()
    }
}
