import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';

export const meta = sqliteTable('meta', { key: text('key').primaryKey(), value: text('value').notNull() });
export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull().unique(), ownerEmail: text('owner_email').notNull(),
  createdAt: text('created_at').notNull(), profileJson: text('profile_json').notNull(), revision: integer('revision').notNull().default(0),
  deletingAt: text('deleting_at'),
});
export const sessions = sqliteTable('native_sessions', {
  tokenHash: text('token_hash').primaryKey(), id: text('id').notNull().unique(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id), createdAt: text('created_at').notNull(), expiresAt: text('expires_at').notNull(),
}, t => [index('session_workspace').on(t.workspaceId)]);
export const pairingCodes = sqliteTable('pairing_codes', {
  codeHash: text('code_hash').primaryKey(), workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  createdAt: text('created_at').notNull(), expiresAt: text('expires_at').notNull(), claimedBy: text('claimed_by'),
}, t => [index('pairing_workspace').on(t.workspaceId)]);
export const resumes = sqliteTable('resumes', {
  id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  hash: text('hash').notNull(), objectKey: text('object_key').notNull().unique(), name: text('name').notNull(), bytes: integer('bytes').notNull(),
  state: text('state').notNull(), createdAt: text('created_at').notNull(), uploadClaim: text('upload_claim'), leaseExpiresAt: text('lease_expires_at'),
}, t => [uniqueIndex('resume_workspace_hash').on(t.workspaceId,t.hash)]);
export const resumeUploads = sqliteTable('resume_uploads', {
  id: text('id').primaryKey(), resumeId: text('resume_id').notNull().references(() => resumes.id), workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  objectKey: text('object_key').notNull().unique(), createdAt: text('created_at').notNull(),
}, t => [index('upload_workspace').on(t.workspaceId),index('upload_resume').on(t.resumeId)]);
export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  jobKey: text('job_key').notNull(), dataJson: text('data_json').notNull(), createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('job_workspace_key').on(t.workspaceId,t.jobKey)]);
export const plans = sqliteTable('plans', {
  id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull().references(() => workspaces.id), digest: text('digest').notNull(),
  profileRevision: integer('profile_revision').notNull(), createdAt: text('created_at').notNull(), expiresAt: text('expires_at').notNull(),
  stopped: integer('stopped').notNull().default(0), approvedAt: text('approved_at'), lastApprovedAt: text('last_approved_at'), approvalGeneration: integer('approval_generation').notNull().default(0),
  itemsJson: text('items_json').notNull(),
}, t => [index('plan_workspace').on(t.workspaceId)]);
export const attempts = sqliteTable('attempts', {
  id: text('id').primaryKey(), planId: text('plan_id').notNull().references(() => plans.id), workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  applicantHash: text('applicant_hash').notNull(), jobKey: text('job_key').notNull(), jobId: text('job_id').notNull(), state: text('state').notNull(),
  snapshotJson: text('snapshot_json').notNull(), createdAt: text('created_at').notNull(), dispatchedAt: text('dispatched_at'), confirmedAt: text('confirmed_at'),
  applicationId: text('application_id'), responseHash: text('response_hash'), errorCode: text('error_code'), errorMessage: text('error_message'), retryAt: text('retry_at'),
  dispatchCount: integer('dispatch_count').notNull().default(0), approvalGeneration: integer('approval_generation').notNull().default(0),
  claimToken: text('claim_token'), leaseExpiresAt: text('lease_expires_at'), mode: text('mode').notNull().default('local'),
}, t => [index('attempt_plan').on(t.planId),index('attempt_workspace').on(t.workspaceId),
  uniqueIndex('active_applicant_job').on(t.applicantHash,t.jobKey).where(sql`state IN ('dispatching','confirmed','uncertain')`),
  uniqueIndex('active_workspace_job').on(t.workspaceId,t.jobKey).where(sql`state IN ('dispatching','confirmed','uncertain')`)]);
export const throttles = sqliteTable('throttles', {
  key: text('key').primaryKey(), window: integer('window').notNull(), count: integer('count').notNull(),
}, t => [index('throttle_window').on(t.window)]);
export const dispatchGates = sqliteTable('dispatch_gates', { key: text('key').primaryKey(), nextAt: integer('next_at').notNull().default(0) });

// Public employer metadata only. Search terms, account identities and applicant data never enter this cache.
export const discoveryCache = sqliteTable('discovery_cache', {
  id: text('id').primaryKey(), jobsJson: text('jobs_json').notNull().default('[]'), checkedAt: text('checked_at'),
  expiresAt: integer('expires_at').notNull().default(0), staleUntil: integer('stale_until').notNull().default(0),
  retryAt: integer('retry_at').notNull().default(0), claim: text('claim'), leaseUntil: integer('lease_until').notNull().default(0),
  limited: integer('limited').notNull().default(0), errorCode: text('error_code'), errorMessage: text('error_message'),
}, t => [index('discovery_cache_expiry').on(t.staleUntil,t.leaseUntil,t.retryAt)]);
export const discoveryRates = sqliteTable('discovery_rates', {
  key: text('key').primaryKey(), window: integer('window').notNull(), count: integer('count').notNull(),
}, t => [index('discovery_rate_window').on(t.window)]);

// Provider subjects identify an account; email addresses never merge accounts.
export const authAccounts = sqliteTable('auth_accounts', {
  ownerId:text('owner_id').primaryKey(), originMethod:text('origin_method').notNull(),
  generation:text('generation').notNull(), createdAt:integer('created_at').notNull(),
});
// Permanent HMAC-only lifecycle markers fence delayed requests after deletion.
// They contain no account identifier, email, profile or credentials.
export const accountLifecycles = sqliteTable('account_lifecycles', {
  ownerHash:text('owner_hash').primaryKey(), generation:text('generation').notNull(), deletedAt:integer('deleted_at'),
});
export const authIdentities = sqliteTable('auth_identities', {
  provider:text('provider').notNull(), subject:text('subject').notNull(), subjectHash:text('subject_hash').notNull(),
  ownerId:text('owner_id').notNull().references(() => authAccounts.ownerId),
  connectionId:text('connection_id').notNull().default(''),
  email:text('email'), displayName:text('display_name').notNull(), connectedAt:text('connected_at').notNull(), updatedAt:text('updated_at').notNull(),
}, t => [primaryKey({columns:[t.provider,t.subject]}), uniqueIndex('auth_owner_provider').on(t.ownerId,t.provider), uniqueIndex('auth_subject_hash').on(t.subjectHash)]);
export const browserSessions = sqliteTable('browser_sessions', {
  tokenHash:text('token_hash').primaryKey(), id:text('id').notNull().unique(),
  ownerId:text('owner_id').notNull().references(() => authAccounts.ownerId), accountGeneration:text('account_generation').notNull(),
  provider:text('provider').notNull(), subject:text('subject').notNull(), createdAt:integer('created_at').notNull(), expiresAt:integer('expires_at').notNull(),
}, t => [index('browser_session_owner').on(t.ownerId),index('browser_session_expiry').on(t.expiresAt)]);
export const oauthTransactions = sqliteTable('oauth_transactions', {
  stateHash:text('state_hash').primaryKey(), browserHash:text('browser_hash').notNull(), provider:text('provider').notNull(), intent:text('intent').notNull(),
  ownerId:text('owner_id'), accountGeneration:text('account_generation'), nonceHash:text('nonce_hash').notNull(), verifier:text('verifier'),
  lifecycleKey:text('lifecycle_key'), lifecycleGeneration:text('lifecycle_generation'),
  returnTo:text('return_to').notNull(), createdAt:integer('created_at').notNull(), expiresAt:integer('expires_at').notNull(), claim:text('claim'),
}, t => [index('oauth_owner').on(t.ownerId), index('oauth_expiry').on(t.expiresAt)]);
// HMAC provider-subject fences expire after the maximum pending OAuth lifetime.
export const authDeletionFences = sqliteTable('auth_deletion_fences', {
  subjectHash:text('subject_hash').primaryKey(), deletedAt:integer('deleted_at').notNull(), expiresAt:integer('expires_at').notNull(),
}, t => [index('auth_deletion_expiry').on(t.expiresAt)]);
export const authRates = sqliteTable('auth_rates', {
  key:text('key').primaryKey(), window:integer('window').notNull(), count:integer('count').notNull(),
}, t => [index('auth_rate_window').on(t.window)]);
