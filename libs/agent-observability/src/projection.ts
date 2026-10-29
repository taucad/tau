import type { Evidence } from '#contract.js';
import { canonicalEvidence, contractId, evidenceDigest, sha256Hex } from '#identity.js';

/*
 * Host turn projection (blueprint T09).
 *
 * Turns what a chat's committed rows say about a run into summary evidence the
 * API admits: one `tool` fact per settled tool call and one `outcome` fact per
 * ended run. It reads facts only, never message content, and every value it
 * writes is derived from committed rows, so any device or replay that reads
 * the same rows writes byte-identical evidence and the API counts it once.
 *
 * The input types are structural so the host package keeps owning them: the
 * host's `TurnObservation` satisfies `ProjectedRun`.
 */

/** A committed row's identity. @public */
export type ProjectedSource = Readonly<{ chatId: string; leaderEpoch: string; sequence: number }>;

/** How a run or tool call ended. @public */
export type ProjectedOutcome = 'completed' | 'cancelled' | 'failed' | 'abandoned' | 'unknown';

/** What a run's committed rows say about it, as the host's turn observation reports it. @public */
export type ProjectedRun = Readonly<{
  chatId: string;
  runId: string;
  termination: ProjectedOutcome;
  tools: ReadonlyArray<
    Readonly<{
      call: string;
      toolName: string;
      outcome: ProjectedOutcome;
      input: ProjectedSource;
      output: ProjectedSource | undefined;
      startedAt: number;
      settledAt: number | undefined;
    }>
  >;
  intervals: ReadonlyArray<
    Readonly<{ phase: 'admission' | 'tool' | 'approval'; start: number; end: number | undefined }>
  >;
  ending: Readonly<{ source: ProjectedSource; at: number }> | undefined;
}>;

type ToolFact = Extract<Evidence['payload'], { plane: 'summary' }>['fact'] & { kind: 'tool' };

/** Who the evidence is for and under which grant, resolved from the server's current answer. @public */
export type ProjectionContext = Readonly<{
  principal: string;
  project: string;
  policyEpoch: string;
  /** The protection the host knows for this account; the API only ever makes it stricter. */
  protection: 'free' | 'pro' | 'unknown';
  /** This device's uploader id. */
  uploader: string;
  /** Whether this device held a leader epoch. Rows another device led are its to report. */
  ownsEpoch: (leaderEpoch: string) => boolean;
  /** When the summary grant began; nothing that happened before it is projected. */
  grantedAt: number;
  /** This host's build id, when it has one. */
  hostBuild: string | undefined;
  /** Maps a tool name to its class; the name itself never leaves the device. */
  toolClass?: (toolName: string) => ToolFact['toolClass'];
}>;

/** The evidence one run yields, and what was left out and why. @public */
export type RunProjection = Readonly<{
  evidence: readonly Evidence[];
  /** Facts whose rows another device led; that device reports them. */
  foreign: number;
  /** Facts that happened before the grant; they are never backfilled. */
  beforeGrant: number;
  /** Facts not yet settled; a later projection of the same rows writes them. */
  pending: number;
}>;

/** Bumped whenever the facts written for the same rows change. @public */
export const hostTurnMapper = 'host-turn-v1';

const retentionMilliseconds = 180 * 86_400_000;

type Fact = Extract<Evidence['payload'], { plane: 'summary' }>['fact'];

type Candidate =
  | 'pending'
  | Readonly<{
      source: ProjectedSource;
      lineage: readonly ProjectedSource[];
      semantic: string;
      fact: Fact;
      occurredAt: number;
      events: Evidence['coverage']['events'];
      intervals: Evidence['clocks']['intervals'];
    }>;

const rowPosition = (source: ProjectedSource): string => `${source.leaderEpoch}:${source.sequence}`;

const envelope = async (
  context: ProjectionContext,
  run: ProjectedRun,
  item: Exclude<Candidate, 'pending'>,
): Promise<Evidence> => {
  const [chat, leaderEpoch, runId] = await Promise.all([
    contractId('chat', run.chatId),
    contractId('epoch', item.source.leaderEpoch),
    contractId('run', run.runId),
  ]);
  const sourceDigest = await sha256Hex(
    canonicalEvidence(['host-row', run.chatId, item.source.leaderEpoch, item.source.sequence, item.fact]),
  );
  const expiresAt = item.occurredAt + retentionMilliseconds;
  const lineage = await Promise.all(
    item.lineage.map(
      async (row): Promise<Evidence['lineage'][number]> => ({
        source: await contractId('row', `${row.chatId}:${rowPosition(row)}`),
        digest: sourceDigest,
        protection: context.protection,
        rights: 'unknown',
        expiresAt,
        proof: null,
      }),
    ),
  );
  const evidence: Evidence = {
    version: 1,
    source: { kind: 'row', chat, leaderEpoch, sequence: item.source.sequence, digest: sourceDigest },
    semantic: { kind: item.fact.kind, id: item.semantic },
    projection: { version: hostTurnMapper, redactor: 'summary-only', digest: '0'.repeat(64) },
    delivery: {
      uploader: context.uploader,
      attempt: 'host-1',
      cursor: { view: 'own', origin: context.uploader, position: await contractId('pos', rowPosition(item.source)) },
    },
    scope: {
      principal: context.principal,
      project: context.project,
      policyEpoch: context.policyEpoch,
      destination: 'langfuse',
    },
    run: chat,
    execution: { attempt: runId, resumedFrom: null, branchedFrom: null },
    versions: {
      hostBuild: context.hostBuild ?? null,
      apiBuild: null,
      harness: null,
      compaction: null,
      prompts: [],
      skills: [],
      tools: [],
      kernels: [],
      mapper: hostTurnMapper,
      policy: 'purposes-v1',
    },
    task: null,
    clocks: { occurredAt: item.occurredAt, sourceOrder: rowPosition(item.source), intervals: item.intervals },
    authority: 'host-reported',
    retention: { originalAt: item.occurredAt, expiresAt, proof: 'host-retention-v1' },
    lineage,
    coverage: {
      events: item.events,
      input: 'omitted',
      output: 'omitted',
      usage: 'unsupported',
      artifacts: 'unsupported',
      permission: 'complete',
    },
    payload: { plane: 'summary', fact: item.fact },
  };
  return { ...evidence, projection: { ...evidence.projection, digest: await evidenceDigest(evidence) } };
};

/**
 * Project one run's settled facts for this device.
 *
 * - A tool call is written once its output row landed, or once the run ended
 *   without one (then `unknown`); before that it is pending, never `failed`.
 * - An outcome is written once the run has an ending row.
 * - A fact whose row another device led is left to that device (`foreign`),
 *   and one that happened before the grant is never sent (`beforeGrant`).
 * - Host times are the rows' recorded times, labelled `host-recorded`: they
 *   order and bound phases, and are not a duration clock.
 *
 * @param run - The host's observation of one run.
 * @param context - The account, project and grant the evidence is for.
 * @returns The evidence, in row order, and the counts of what was held back.
 * @public
 */
export const projectRun = async (run: ProjectedRun, context: ProjectionContext): Promise<RunProjection> => {
  const classOf = context.toolClass ?? ((): ToolFact['toolClass'] => 'other');
  const toolCandidates = run.tools.map(async (tool): Promise<Candidate> => {
    if (tool.output === undefined && run.ending === undefined) {
      return 'pending';
    }
    const [call, dispatch] = await Promise.all([
      contractId('call', `${run.chatId}:${tool.call}`),
      contractId('dispatch', `${run.chatId}:${rowPosition(tool.input)}`),
    ]);
    return {
      source: tool.input,
      lineage: tool.output === undefined ? [tool.input] : [tool.input, tool.output],
      semantic: call,
      fact: {
        kind: 'tool',
        call,
        dispatch,
        toolClass: classOf(tool.toolName),
        toolVersion: null,
        schemaVersion: null,
        modelCall: null,
        outcome: tool.output === undefined ? 'unknown' : tool.outcome,
        revisionBefore: null,
        revisionAfter: null,
      },
      occurredAt: tool.startedAt,
      events: tool.output === undefined ? 'missing' : 'complete',
      intervals:
        tool.settledAt === undefined
          ? []
          : [{ phase: 'tool', domain: 'host-recorded', start: tool.startedAt, end: tool.settledAt }],
    };
  });
  const outcomeCandidate = async (): Promise<Candidate> => {
    if (run.ending === undefined) {
      return 'pending';
    }
    return {
      source: run.ending.source,
      lineage: [run.ending.source],
      semantic: await contractId('run', run.runId),
      fact: { kind: 'outcome', termination: run.termination, success: 'unknown', assessment: null },
      occurredAt: run.ending.at,
      events: 'complete',
      intervals: run.intervals
        .filter((phaseInterval) => phaseInterval.phase !== 'tool')
        .slice(0, 32)
        .map((phaseInterval) => ({
          phase: phaseInterval.phase,
          domain: 'host-recorded',
          start: phaseInterval.start,
          end: phaseInterval.end ?? null,
        })),
    };
  };
  const candidates = await Promise.all([...toolCandidates, outcomeCandidate()]);

  const projected: Array<Promise<Evidence>> = [];
  let foreign = 0;
  let beforeGrant = 0;
  let pending = 0;
  for (const candidate of candidates) {
    if (candidate === 'pending') {
      pending += 1;
    } else if (!context.ownsEpoch(candidate.source.leaderEpoch)) {
      foreign += 1;
    } else if (candidate.occurredAt < context.grantedAt) {
      beforeGrant += 1;
    } else {
      projected.push(envelope(context, run, candidate));
    }
  }
  return { evidence: await Promise.all(projected), foreign, beforeGrant, pending };
};
