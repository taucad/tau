import type { BillingTier } from '@taucad/billing';
import type { PurposeRefusal, TelemetryPurposeState } from '#telemetry-purposes/telemetry-purpose.schema.js';
import type { TelemetryPurpose } from '@taucad/api-database/schema/telemetry-purpose.types';
import { telemetryPurposes } from '@taucad/api-database/schema/telemetry-purpose.types';

/** One recorded decision, as stored: immutable, with the notice it was taken against. */
export type RecordedPurposeDecision = Readonly<{
  purpose: TelemetryPurpose;
  granted: boolean;
  noticeVersion: string;
  /** Insertion order. Two decisions can share a timestamp; they cannot share this. */
  sequence: number;
  /** When it was taken, in milliseconds; absent where a caller did not read it. */
  decidedAt?: number | undefined;
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
  /**
   * Whether the account's "Improve Tau for everyone" switch is on. On an
   * assured Free tier it grants the improvement purposes by default until the
   * account decides them itself; it authorises nothing on any other tier.
   */
  improvementDefault?: boolean | undefined;
  /**
   * Whether the deployment's content capture mode permits this account (LD15). Absent is off: `content` is refused
   * for the Langfuse destination whatever the account granted, so the relay, the hosts' grant and ingress follow one
   * switch.
   */
  contentCapture?: boolean | undefined;
  project?: ProjectAuthority | undefined;
}>;

/** The deployment's content capture modes (LD15). Unset is `off`. */
export const contentCaptureModes = ['off', 'allowlist', 'on'] as const;

/** One content capture mode. */
export type ContentCaptureMode = (typeof contentCaptureModes)[number];

/** The deployment's content capture setting: the mode and, for `allowlist`, the staff account ids it admits. */
export type ContentCaptureSetting = Readonly<{
  mode: ContentCaptureMode | undefined;
  accounts: readonly string[];
}>;

/**
 * Whether the content capture setting permits one account. Default-deny: an unset or `off` mode permits nobody, and
 * `allowlist` permits only the accounts it names.
 *
 * @param setting - The deployment's mode and allowlist.
 * @param userId - The account asked about.
 * @returns `true` only when the mode is `on`, or `allowlist` and the account is listed.
 */
export const contentCapturePermits = (setting: ContentCaptureSetting, userId: string): boolean => {
  switch (setting.mode) {
    case 'on': {
      return true;
    }
    case 'allowlist': {
      return setting.accounts.includes(userId);
    }
    default: {
      return false;
    }
  }
};

/**
 * Purposes that copy content into a corpus or a model. They need the source's
 * protection to be established, not merely unobjected-to.
 */
const reusePurposes = new Set<TelemetryPurpose>(['reuse', 'training']);

/**
 * Purposes the Free plan grants by default: recording is the cost of the free
 * plan, with an opt-out. Ratings stay per rating and diagnosis per report.
 */
const freeDefaultPurposes = new Set<TelemetryPurpose>(['summary', 'content', 'reuse', 'training']);

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

/** Whether the Free plan's default grant answers for this purpose: no decision under this notice, and an assured Free account with the switch on. */
const freeDefaultApplies = (
  purpose: TelemetryPurpose,
  input: PurposeAuthorityInput,
  current: RecordedPurposeDecision | undefined,
): boolean =>
  current === undefined &&
  input.improvementDefault === true &&
  input.tier === 'free' &&
  input.tierAssured &&
  freeDefaultPurposes.has(purpose);

/**
 * The Free default's answer for an account with no decision under this notice.
 * An opt-out taken under an earlier notice still stands.
 */
const freeDefaultRefusal = (
  purpose: TelemetryPurpose,
  input: PurposeAuthorityInput,
  decision: RecordedPurposeDecision | undefined,
): PurposeRefusal | undefined => {
  if (decision !== undefined && !decision.granted) {
    return 'withdrawn';
  }
  return input.project?.mixedSource === true && contentPurposes.has(purpose) ? 'project-mixed-source' : undefined;
};

/**
 * The refusals that precede the account's own answer. The project fence and ownership come first: a grant cannot reach
 * into a project the principal may not capture from. The capture mode follows, ahead of the account's answer and the
 * Free default: content is built, not activated, until the deployment's mode permits the account (LF-39).
 */
const precedingRefusal = (purpose: TelemetryPurpose, input: PurposeAuthorityInput): PurposeRefusal | undefined => {
  if (input.project?.fenced === true) {
    return 'project-fenced';
  }
  if (input.project !== undefined && !input.project.ownedByPrincipal) {
    return 'project-not-owned';
  }
  return purpose === 'content' && input.contentCapture !== true ? 'capture-off' : undefined;
};

/**
 * Resolve one purpose. Every path but the last returns a refusal, so a state
 * the rules do not describe denies rather than falls through to permission.
 */
const refuse = (
  purpose: TelemetryPurpose,
  input: PurposeAuthorityInput,
): Readonly<{ refusal: PurposeRefusal | undefined; decided: boolean; granted: boolean; since?: number }> => {
  if (input.noticeVersion === undefined) {
    return { refusal: 'notice-unapproved', decided: false, granted: false };
  }
  const decision = latestDecision(input.decisions, purpose);
  /* A decision taken against a superseded notice is not a decision under this one. */
  const current = decision !== undefined && decision.noticeVersion === input.noticeVersion ? decision : undefined;
  const state = { decided: current !== undefined, granted: current?.granted ?? false };

  const precedent = precedingRefusal(purpose, input);
  if (precedent !== undefined) {
    return { refusal: precedent, ...state };
  }
  if (freeDefaultApplies(purpose, input, current)) {
    return { refusal: freeDefaultRefusal(purpose, input, decision), ...state };
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
  /* Every plan may opt in to reuse and training; the account's own current
   * grant above is that opt-in, and a paid plan has no default one. Material
   * captured while no grant was in force stays excluded whatever the tier later
   * becomes; that is the source-side check in T06. */
  if (reusePurposes.has(purpose) && !input.tierAssured) {
    return { refusal: 'tier-unverified', ...state };
  }
  /* The allowing decision's own time: nothing before it was permitted, everything since it is. */
  return { refusal: undefined, ...state, ...(current.decidedAt === undefined ? {} : { since: current.decidedAt }) };
};

/**
 * Project the effective purpose state for one principal, and optionally one
 * project. Default-deny: a purpose is allowed only when an explicit decision
 * under the current notice says so, or the Free plan's default does, and every
 * independent check passes.
 *
 * `allowsUsageMetrics` is not an input. `allowsAiTraining` is, only as the
 * Free plan's default (`improvementDefault`); it authorises nothing on a paid
 * tier or an unassured one.
 *
 * @param input - Notice, recorded decisions, tier assurance and project authority.
 * @returns One state per purpose, in the declared order.
 */
export const resolvePurposeAuthority = (input: PurposeAuthorityInput): TelemetryPurposeState[] =>
  telemetryPurposes.map((purpose) => {
    const { refusal, decided, granted, since } = refuse(purpose, input);
    return {
      purpose,
      allowed: refusal === undefined,
      decided,
      granted,
      ...(refusal === undefined ? {} : { refusal }),
      ...(refusal === undefined && since !== undefined ? { allowedSince: since } : {}),
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
    /** The Free default's switch; turning it off must make a cached answer stale. */
    improvementDefault?: boolean | undefined;
  }>,
): string => {
  let newest = 0;
  for (const decision of subject.decisions) {
    newest = Math.max(newest, decision.sequence);
  }
  const epoch = [subject.userId, subject.projectId ?? '-', subject.noticeVersion ?? '-', String(newest)];
  /* Appended only when on, so every existing epoch is unchanged. */
  return (subject.improvementDefault === true ? [...epoch, 'd'] : epoch).join(':');
};
