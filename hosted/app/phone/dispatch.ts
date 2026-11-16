import { z } from "zod";
import { APIError } from "../components/api";
import { workspaceSchema, type Workspace } from "./model";

export type ContinuationReason = "complete" | "paused" | "waiting" | "stopped" | "limit";
export type ContinuationControls = {
  advance(current: Workspace): Promise<Workspace>;
  stop(current: Workspace): Promise<Workspace>;
  validate(current: Workspace): void;
  isVisible(): boolean;
  shouldStop(): boolean;
};

const MAX_STEPS = 20;
const PACE_MS = 1_000;
const pending = new Set(["ready", "rate_limited", "dispatching"]);

function progress(workspace: Workspace, planId: string): string {
  const plan = workspace.recoverablePlans.find(value => value.id === planId);
  return JSON.stringify({
    active: workspace.activePlanIds.includes(planId),
    plan: plan && { stopped: plan.stopped, items: plan.items.map(item => [item.jobId, item.state, item.retryAt, item.applicationId]) },
    attempts: workspace.attempts.filter(attempt => attempt.planId === planId)
      .map(attempt => [attempt.id, attempt.state, attempt.retryAt, attempt.applicationId, attempt.dispatchCount])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  });
}

/**
 * Continue an already approved, exact review. This function cannot approve work.
 * Each advance is awaited, with at most twenty calls and one second between
 * successful steps. Errors and unchanged responses are never retried here.
 * "Complete" means no queued work remains; receipt outcomes still need review.
 */
export async function continueApprovedPlan(
  initialWorkspace: Workspace,
  planId: string,
  controls: ContinuationControls,
): Promise<{ workspace: Workspace; reason: ContinuationReason }> {
  z.string().uuid().parse(planId);
  let current = workspaceSchema.parse(initialWorkspace);
  const accountId = current.accountId, workspaceId = current.workspaceId;
  if (!workspaceId) throw new APIError("Open your private workspace before continuing an application.", 409, "workspace_changed");
  const approvedReview = current.recoverablePlans.find(plan => plan.id === planId);
  const digest = approvedReview?.digest, revision = approvedReview?.profileRevision;

  function accept(value: Workspace): Workspace {
    const next = workspaceSchema.parse(value);
    if (next.accountId !== accountId) throw new APIError("Your account changed. Reload before continuing.", 409, "account_changed");
    if (next.workspaceId !== workspaceId) throw new APIError("Your workspace changed. Reload before continuing.", 409, "workspace_changed");
    const plan = next.recoverablePlans.find(item => item.id === planId);
    if (plan && digest && (plan.digest !== digest || plan.profileRevision !== revision)) {
      throw new APIError("The approved review changed. Refresh before continuing.", 409, "review_changed");
    }
    return next;
  }

  let steps = 0, needsPace = false;
  for (;;) {
    // A visible Stop action remains effective if the page becomes hidden while
    // the current request finishes. It never initiates another provider request.
    if (controls.shouldStop()) return { workspace: accept(await controls.stop(current)), reason: "stopped" };
    if (!controls.isVisible()) return { workspace: current, reason: "paused" };

    const plan = current.recoverablePlans.find(item => item.id === planId);
    const attempts = current.attempts.filter(attempt => attempt.planId === planId);
    if (plan?.stopped) return { workspace: current, reason: "stopped" };
    if (plan?.items.some(item => item.state === "dispatching") || attempts.some(attempt => attempt.state === "dispatching")) {
      return { workspace: current, reason: "waiting" };
    }
    if (!plan) {
      const unfinished = current.activePlanIds.includes(planId) || attempts.some(attempt => pending.has(attempt.state));
      return { workspace: current, reason: unfinished ? "waiting" : attempts.length ? "complete" : "paused" };
    }
    if (!plan.items.some(item => pending.has(item.state))) return { workspace: current, reason: "complete" };
    if (current.deleting || current.emailUpdateRequired || !plan.approvedAt || Date.parse(plan.expiresAt) <= Date.now() || plan.profileRevision !== current.profile.revision) {
      return { workspace: current, reason: "paused" };
    }
    if (!current.activePlanIds.includes(planId)) {
      return { workspace: current, reason: plan.items.some(item => item.state === "rate_limited") ? "waiting" : "paused" };
    }
    // Elapsed time alone never authorizes a 429 retry. The backend must also
    // report the plan in activePlanIds after an eligible explicit reapproval.
    if (!plan.items.some(item => item.state === "ready" || item.state === "rate_limited" && item.retryAt && Date.parse(item.retryAt) <= Date.now())) {
      return { workspace: current, reason: "waiting" };
    }
    if (steps >= MAX_STEPS) return { workspace: current, reason: "limit" };
    if (needsPace) {
      needsPace = false;
      await new Promise<void>(resolve => setTimeout(resolve, PACE_MS));
      continue; // Recheck Stop, visibility, expiry and current approval after pacing.
    }

    controls.validate(current);
    if (controls.shouldStop() || !controls.isVisible()) continue;
    const before = progress(current, planId);
    current = accept(await controls.advance(current));
    steps++;
    if (controls.shouldStop()) continue;
    if (!controls.isVisible()) return { workspace: current, reason: "paused" };
    if (progress(current, planId) === before) return { workspace: current, reason: "waiting" };
    needsPace = true;
  }
}
