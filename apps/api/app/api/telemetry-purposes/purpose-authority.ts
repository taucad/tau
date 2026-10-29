import type { BillingTier } from '@taucad/billing';
import type {
  PurposeRefusal,
  TelemetryPurpose,
  TelemetryPurposeState,
} from '#api/telemetry-purposes/telemetry-purpose.schema.js';
import { telemetryPurposes } from '#api/telemetry-purposes/telemetry-purpose.schema.js';

/** One recorded decision, as stored: immutable, with the notice it was taken against. */
export type RecordedPurposeDecision = Readonly<{
  purpose: TelemetryPurpose;
  granted: boolean;
  noticeVersion: string;
  /** Insertion order. Two decisions can share a timestamp; they cannot share this. */
  sequence: number;
}>;

/**
 * What the server established about the project the capture belongs to.
 * Absent means an account-wide question with no project in scope.
 */
export type ProjectAuthority = Readonly<{
  /** The deletion/erasure fence has been admitted for this project. */
  fenced: boolean;
  /** The principal owns the project row. */
  ownedByPrincipal: boolean;
  /** The project carries material whose protection is another account's (a fork, an import). */
  mixedSource: boolean;
}>;

/** Everything the authority decision is allowed to depend on. */
export type PurposeAuthorityInput = Readonly<{
  /**
   * The approved production notice in force. `undefined` while no notice has
   * been approved, which keeps every purpose unavailable (blueprint T01 gate).
   */
  noticeVersion: string | undefined;
  /** The latest decision per purpose. Purposes with no row are undecided. */
  decisions: readonly RecordedPurposeDecision[];
  /** The tier the billing projection resolved. */
  tier: BillingTier;
  /**
   * Whether that tier was established affirmatively. `planToTier` falls back
   * to `free` for a plan name it does not recognise; that fallback keeps
   * billing access safe but must never become affirmative reuse authority.
   */
  tierAssured: boolean;
  project?: ProjectAuthority | undefined;
}>;

/**
 * Purposes that copy content into a corpus or a model. They need the source's
 * protection to be established, not merely unobjected-to.
 */
const reusePurposes = new Set<TelemetryPurpose>(['reuse', 'training']);

/** Purposes that carry prompts, designs or messages rather than counts and timings. */
const contentPurposes = new Set<TelemetryPurpose>(['content', 'diagnosis', 'reuse', 'training']);

const latestDecision = (
  decisions: readonly RecordedPurposeDecision[],
  purpose: TelemetryPurpose,
): RecordedPurposeDecision | undefined => {
  let newest: RecordedPurposeDecision | undefined;
  for (const decision of decisions) {
    if (decision.purpose !== purpose) {
      continue;
    }
    if (newest === undefined || decision.sequence > newest.sequence) {
      newest = decision;
    }
  }
  return newest;
};

/**
 * Resolve one purpose. Every path but the last returns a refusal, so a state
 * the rules do not describe denies rather than falls through to permission.
 */
const refuse = (
  purpose: TelemetryPurpose,
  input: PurposeAuthorityInput,
): Readonly<{ refusal: PurposeRefusal | undefined; decided: boolean; granted: boolean }> => {
  if (input.noticeVersion === undefined) {
    return { refusal: 'notice-unapproved', decided: false, granted: false };
  }
  const decision = latestDecision(input.decisions, purpose);
  /* A decision taken against a superseded notice is not a decision under this one. */
  const current = decision !== undefined && decision.noticeVersion === input.noticeVersion ? decision : undefined;
  const state = { decided: current !== undefined, granted: current?.granted ?? false };

  /* The project fence and ownership precede the account's own answer: a grant
   * cannot reach into a project the principal may not capture from. */
  if (input.project?.fenced === true) {
    return { refusal: 'project-fenced', ...state };
  }
  if (input.project !== undefined && !input.project.ownedByPrincipal) {
    return { refusal: 'project-not-owned', ...state };
  }
  if (decision === undefined) {
    return { refusal: 'no-decision', ...state };
  }
  if (current === undefined) {
    return { refusal: 'notice-superseded', ...state };
  }
  if (!current.granted) {
    return { refusal: 'withdrawn', ...state };
  }
  if (input.project?.mixedSource === true && contentPurposes.has(purpose)) {
    return { refusal: 'project-mixed-source', ...state };
  }
  if (reusePurposes.has(purpose)) {
    /* The Pro no-training ruling, and the same exclusion for reusable corpora
     * while the production purpose notice is open. Downgrade does not relabel
     * material captured on a paid tier; that is the source-side check in T06. */
    if (input.tier !== 'free') {
      return { refusal: 'tier-excluded', ...state };
    }
    if (!input.tierAssured) {
      return { refusal: 'tier-unverified', ...state };
    }
  }
  return { refusal: undefined, ...state };
};

/**
 * Project the effective purpose state for one principal, and optionally one
 * project. Default-deny: a purpose is allowed only when an explicit decision
 * under the current notice says so and every independent check passes.
 *
 * The legacy `allowsAiTraining` and `allowsUsageMetrics` booleans are not
 * inputs. Neither authorises any purpose here, whatever their value.
 *
 * @param input - Notice, recorded decisions, tier assurance and project authority.
 * @returns One state per purpose, in the declared order.
 */
export const resolvePurposeAuthority = (input: PurposeAuthorityInput): TelemetryPurposeState[] =>
  telemetryPurposes.map((purpose) => {
    const { refusal, decided, granted } = refuse(purpose, input);
    return {
      purpose,
      allowed: refusal === undefined,
      decided,
      granted,
      ...(refusal === undefined ? {} : { refusal }),
    };
  });

/**
 * An opaque binding of an answer to the subject it was computed for. A client
 * that holds a response whose epoch differs from the one it would ask for now
 * has a stale answer for a different subject and must discard it.
 *
 * @param subject - Principal, project and notice the answer was computed for, with the newest decision time.
 * @returns The epoch string.
 */
export const purposeEpoch = (
  subject: Readonly<{
    userId: string;
    projectId: string | undefined;
    noticeVersion: string | undefined;
    decisions: readonly RecordedPurposeDecision[];
  }>,
): string => {
  let newest = 0;
  for (const decision of subject.decisions) {
    newest = Math.max(newest, decision.sequence);
  }
  return [subject.userId, subject.projectId ?? '-', subject.noticeVersion ?? '-', String(newest)].join(':');
};
