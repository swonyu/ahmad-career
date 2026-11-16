package com.saleh.careerfinder

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import org.junit.Rule
import org.junit.Test

/** Run only on the dedicated, blank acceptance emulator. No employer or service traffic. */
class PhoneAcceptanceTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun blankWorkspace_hasHonestEmptyState_andConnectionRequirement() {
        compose.onNodeWithText("Start with one good opportunity.").assertIsDisplayed()
        compose.onNodeWithText("Auto Apply").performClick()
        compose.onNodeWithText("Connect when you’re ready.").assertIsDisplayed()
        compose.onNodeWithText("Receipts").performClick()
        compose.onNodeWithTag("receipts-list").performScrollToNode(hasText("Your first receipt belongs here."))
        compose.onNodeWithText("Your first receipt belongs here.").assertIsDisplayed()
    }

    @Test fun phoneProfile_survivesActivityRecreation_withoutAnyService() {
        compose.onNodeWithText("Profile").performClick()
        compose.onNode(hasText("First or single name") and hasSetTextAction()).performScrollTo().performTextInput("Acceptance")
        compose.onNode(hasText("Last name (optional)") and hasSetTextAction()).performScrollTo().performTextInput("Fixture")
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText("Save profile on this phone"))
        compose.onNodeWithText("Save profile on this phone").performClick()
        compose.waitUntil(timeoutMillis = 5000) {
            compose.onAllNodes(hasText("Profile saved privately on this phone.")).fetchSemanticsNodes().isNotEmpty()
        }
        compose.activityRule.scenario.recreate()
        compose.onNodeWithText("Profile").performClick()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText("First or single name"))
        compose.waitUntil(timeoutMillis = 5000) {
            compose.onAllNodes(hasText("Acceptance")).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText("Acceptance").assertIsDisplayed()
    }
}
