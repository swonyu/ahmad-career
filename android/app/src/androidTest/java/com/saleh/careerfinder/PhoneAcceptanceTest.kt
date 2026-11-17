package com.saleh.careerfinder

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.hasTestTag
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

    // Run the actual app in the runner's Arabic locale; only UI selectors are localized.
    // User-entered profile values and all visibility/persistence assertions stay unchanged.
    private fun display(text: String) = CareerStrings(compose.activity)(text)
    @Before fun waitForPrivateWorkspace() {
        compose.waitUntil(5_000) {
            compose.onAllNodes(hasTestTag("discovery-list")).fetchSemanticsNodes().isNotEmpty()
        }
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
        compose.onNodeWithText(display("Find your next role.")).assertIsDisplayed()
        compose.onNodeWithTag("jobs-saved-tab").performClick()
        compose.onNodeWithTag("jobs-list").performScrollToNode(hasText(display("Start with one good opportunity.")))
        compose.onNodeWithText(display("Start with one good opportunity.")).assertIsDisplayed()
        compose.onNodeWithText(display("Apply")).performClick()
        compose.onNodeWithTag("apply-list").performScrollToNode(hasText(display("Connect when you’re ready.")))
        compose.onNodeWithText(display("Connect when you’re ready.")).assertIsDisplayed()
        compose.onNodeWithText(display("Receipts")).performClick()
        compose.onNodeWithTag("receipts-list").performScrollToNode(hasText(display("Your first receipt belongs here.")))
        compose.onNodeWithText(display("Your first receipt belongs here.")).assertIsDisplayed()
    }

    @Test fun phoneProfile_survivesActivityRecreation_withoutAnyService() {
        compose.onNodeWithText(display("Profile")).performClick()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText(display("First or single name")) and hasSetTextAction())
        compose.onNode(hasText(display("First or single name")) and hasSetTextAction()).performTextInput("Acceptance")
        closeSoftKeyboard()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText(display("Last name (optional)")) and hasSetTextAction())
        compose.onNode(hasText(display("Last name (optional)")) and hasSetTextAction()).performTextInput("Fixture")
        closeSoftKeyboard()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText(display("Save profile on this phone")))
        compose.onNodeWithText(display("Save profile on this phone")).performClick()
        compose.waitUntil(timeoutMillis = 5000) {
            compose.onAllNodes(hasText(display("Profile saved privately on this phone."))).fetchSemanticsNodes().isNotEmpty()
        }
        compose.activityRule.scenario.recreate()
        compose.onNodeWithText(display("Profile")).performClick()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText(display("First or single name")))
        compose.waitUntil(timeoutMillis = 5000) {
            compose.onAllNodes(hasText("Acceptance")).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText("Acceptance").assertIsDisplayed()
    }
}
