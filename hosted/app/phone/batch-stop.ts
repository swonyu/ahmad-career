import { planSchema, type Workspace } from "./model";

export type BatchContext = {
  readonly generation: number;
  readonly scope: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly planId: string;
  stopAttempted: boolean;
  stopConfirmed?: boolean;
};
export type BatchStopState = {
  generation: number;
  workspace: Pick<Workspace, "accountId" | "workspaceId"> | null;
  identityUnverified: boolean;
};
export type BatchStopBody = { expectedWorkspaceId: string; planId: string; onlyIfUnapproved: false };
export type BatchStopControls = {
  readState(): BatchStopState;
  persistHold(): Promise<void>;
  confirmHold(): Promise<void>;
  post(body: BatchStopBody): Promise<Record<string, unknown>>;
  accept(response: Record<string, unknown>): Promise<Workspace>;
  deferRefresh(): void;
};

// A batch context belongs to one explicit approve/continue action. Sharing its
// promise protects both a concurrent Stop callback and the action's finally.
const attempts = new WeakMap<BatchContext, Promise<Workspace>>();

function requireTarget(batch: BatchContext, state: BatchStopState) {
  if (batch.generation !== state.generation || !state.workspace || state.workspace.accountId !== batch.accountId || state.workspace.workspaceId !== batch.workspaceId) {
    throw Error("Your account or workspace changed before Stop could be confirmed. Reload to check its applications.");
  }
}
function requireWorkspace(batch: BatchContext, workspace: Workspace) {
  if (workspace.accountId !== batch.accountId || workspace.workspaceId !== batch.workspaceId) {
    throw Error("The Stop result belongs to a different workspace. Reload before continuing.");
  }
}

/** Send at most one captured Stop. A failed or lost response is never retried. */
export function stopBatchOnce(batch: BatchContext, current: Workspace, controls: BatchStopControls): Promise<Workspace> {
  const previous = attempts.get(batch);
  if (previous) return previous.then(result => {
    const state = controls.readState(); requireTarget(batch, state); requireWorkspace(batch, current);
    if (state.identityUnverified) { controls.deferRefresh(); return current; }
    return result;
  });
  const attempt = (async () => {
    requireTarget(batch, controls.readState()); requireWorkspace(batch, current);
    if (batch.stopAttempted) throw Error("Stop was already attempted. Refresh the receipts before taking another action.");
    // This flag is set before calling any asynchronous transport, including a
    // transport that rejects synchronously or loses the eventual response.
    batch.stopAttempted = true; batch.stopConfirmed = false;
    await controls.persistHold();
    requireTarget(batch, controls.readState());
    const response = await controls.post({ expectedWorkspaceId: batch.workspaceId, planId: batch.planId, onlyIfUnapproved: false });
    const stopped = planSchema.parse(response.plan);
    if (stopped.id !== batch.planId || !stopped.stopped) throw Error("Stop could not be confirmed. Refresh the receipts before taking another action.");
    batch.stopConfirmed = true;
    await controls.confirmHold();
    const state = controls.readState(); requireTarget(batch, state);
    if (state.identityUnverified) { controls.deferRefresh(); return current; }
    const accepted = await controls.accept(response);
    const afterReadback = controls.readState(); requireTarget(batch, afterReadback); requireWorkspace(batch, accepted);
    if (afterReadback.identityUnverified) { controls.deferRefresh(); return current; }
    return accepted;
  })();
  attempts.set(batch, attempt);
  return attempt;
}
