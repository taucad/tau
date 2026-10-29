import type { Evidence } from '#contract.js';
import { canonicalEvidence, contractId, evidenceDigest, sha256Hex } from '#identity.js';

/*
 * Host turn projection (blueprint T09).
 *
 * Turns what a chat's committed rows say about a run into summary evidence the
 * API admits: one `tool` fact per settled tool call, one `cad` fact per settled
 * `test_model` check (T12) and one `outcome` fact per ended run. It reads facts only, never message content, and every value it
 * writes is derived from committed rows, so any device or replay that reads
 * the same rows writes byte-identical evidence and the API counts it once.
 *
 * One fact is not from rows: a `response` fact for the moment this device's
 * UI first showed a run's model text (T10). It is an interaction of this
 * device's, sourced as one, and is kept apart from the model-text time the
 * API reports for the provider call: the two are different clocks.
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
      /** A settled `test_model` call's check: its decided status and the file keys of what it checked. */
      check?:
        | Readonly<{
            result: 'passed' | 'failed' | 'inconclusive' | 'unsupported' | 'not-run';
            revision: readonly string[];
            requirements: readonly string[];
          }>
        | undefined;
    }>
  >;
  intervals: ReadonlyArray<
    Readonly<{ phase: 'admission' | 'tool' | 'approval'; start: number; end: number | undefined }>
  >;
  ending: Readonly<{ source: ProjectedSource; at: number }> | undefined;
  /** Every row the observation was built from, in log order; it locates a run's tail. */
  sources?: readonly ProjectedSource[];
  /** When this device's UI first showed the run's model text, if it was watching while the run streamed. */
  presentedAt?: number;
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

/**
 * A leader epoch this device did not hold but read rows from. Its facts are
 * that device's to report; this device cannot see whether it did, so the host
 * reports the gap instead of a fact. @public
 */
export type ForeignTail = Readonly<{
  /** The epoch's contract id, as evidence names it. */
  epoch: string;
  /** Settled facts in that epoch this device left to it. */
  facts: number;
  /** The newest sequence this device read in that epoch. */
  through: number;
  /**
   * Whether the run is still unended here and its newest row is in that epoch,
   * so the rest of the run happened where this device cannot read it.
   */
  open: boolean;
}>;

/** The evidence one run yields, and what was left out and why. @public */
export type RunProjection = Readonly<{
  evidence: readonly Evidence[];
  /** Facts whose rows another device led; that device reports them. */
  foreign: number;
  /** The foreign epochs behind `foreign`, and an unended run's foreign tail, sorted by epoch id. */
  foreignTails: readonly ForeignTail[];
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
      /** An interaction on this device, rather than `source`, is what the fact is about. */
      interaction?: string;
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
    canonicalEvidence(
      item.interaction === undefined
        ? ['host-row', run.chatId, item.source.leaderEpoch, item.source.sequence, item.fact]
        : ['host-interaction', run.chatId, item.interaction, item.occurredAt, item.fact],
    ),
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
    source:
      item.interaction === undefined
        ? { kind: 'row', chat, leaderEpoch, sequence: item.source.sequence, digest: sourceDigest }
        : { kind: 'interaction', interaction: item.interaction, digest: sourceDigest },
    semantic: { kind: item.fact.kind, id: item.semantic },
    projection: { version: hostTurnMapper, redactor: 'summary-only', digest: '0'.repeat(64) },
    delivery: {
      uploader: context.uploader,
      attempt: 'host-1',
      cursor:
        item.interaction === undefined
          ? { view: 'own', origin: context.uploader, position: await contractId('pos', rowPosition(item.source)) }
          : { view: 'interaction', origin: context.uploader, position: item.interaction },
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

const foreignTailsOf = async (
  run: ProjectedRun,
  context: ProjectionContext,
  candidates: readonly Candidate[],
): Promise<ForeignTail[]> => {
  const tails = new Map<string, { facts: number; through: number }>();
  const tailOf = (leaderEpoch: string): { facts: number; through: number } => {
    let tail = tails.get(leaderEpoch);
    if (tail === undefined) {
      tail = { facts: 0, through: 0 };
      tails.set(leaderEpoch, tail);
    }
    return tail;
  };
  const seen = (source: ProjectedSource): void => {
    if (!context.ownsEpoch(source.leaderEpoch)) {
      const tail = tailOf(source.leaderEpoch);
      tail.through = Math.max(tail.through, source.sequence);
    }
  };
  for (const candidate of candidates) {
    if (candidate !== 'pending') {
      for (const source of candidate.lineage) {
        seen(source);
      }
      if (!context.ownsEpoch(candidate.source.leaderEpoch)) {
        tailOf(candidate.source.leaderEpoch).facts += 1;
      }
    }
  }
  for (const source of run.sources ?? []) {
    seen(source);
  }
  const newest = run.sources?.at(-1);
  const openEpoch = run.ending === undefined && newest !== undefined ? newest.leaderEpoch : undefined;
  const reported = await Promise.all(
    [...tails].map(
      async ([leaderEpoch, tail]): Promise<ForeignTail> => ({
        epoch: await contractId('epoch', leaderEpoch),
        facts: tail.facts,
        through: tail.through,
        open: leaderEpoch === openEpoch,
      }),
    ),
  );
  return reported.toSorted((left, right) => left.epoch.localeCompare(right.epoch));
};

/**
 * Project one run's settled facts for this device.
 *
 * - A tool call is written once its output row landed, or once the run ended
 *   without one (then `unknown`); before that it is pending, never `failed`.
 * - A `test_model` check is written once its output row landed, as a `cad`
 *   fact whose revision and requirements are digests; only `passed` and
 *   `failed` are decided, and a check is never a run's success.
 * - An outcome is written once the run has an ending row.
 * - A fact whose row another device led is left to that device (`foreign`),
 *   and one that happened before the grant is never sent (`beforeGrant`).
 * - Each foreign epoch this device read is reported in `foreignTails`, with
 *   `open` when an unended run's newest row is there: what that device sends
 *   is not visible here, so the host reports a gap, never a guessed fact.
 * - Host times are the rows' recorded times, labelled `host-recorded`: they
 *   order and bound phases, and are not a duration clock.
 * - A presentation is written once the run has ended, as an interaction of
 *   this device's at the time its UI showed the run's text.
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
  /*
   * A check is anchored to its output row, which no other fact uses. It names what was checked only by digest: the
   * revision's file digests, and the requirement set within that revision, so neither a path nor a requirement's text
   * leaves the device. A check that named no revision cannot say what it decided about, and writes nothing.
   */
  const checkCandidates = run.tools.flatMap((tool) => {
    const { check, output } = tool;
    if (check === undefined || output === undefined || check.revision.length === 0) {
      return [];
    }
    return [
      (async (): Promise<Candidate> => {
        const [semantic, sourceRevision, requirements] = await Promise.all([
          contractId('check', `${run.chatId}:${tool.call}`),
          sha256Hex(canonicalEvidence(['cad-revision', check.revision])),
          sha256Hex(canonicalEvidence(['cad-requirements', check.revision, check.requirements])),
        ]);
        return {
          source: output,
          lineage: [tool.input, output],
          semantic,
          fact: {
            kind: 'cad',
            sourceRevision,
            requirement: `req-${requirements.slice(0, 48)}`,
            result: check.result,
            exportRequested: false,
            artifact: null,
          },
          occurredAt: tool.settledAt ?? tool.startedAt,
          events: 'complete',
          intervals: [],
        };
      })(),
    ];
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
  /* Anchored to the run's ending row: the run whose text was shown, and the host that led it reports it. */
  const presentationCandidate = async (): Promise<Candidate | undefined> => {
    if (run.presentedAt === undefined) {
      return undefined;
    }
    if (run.ending === undefined) {
      return 'pending';
    }
    const [interaction, presented] = await Promise.all([
      contractId('presented', `${run.chatId}:${run.runId}`),
      contractId('run', run.runId),
    ]);
    return {
      source: run.ending.source,
      interaction,
      lineage: [run.ending.source],
      semantic: interaction,
      fact: { kind: 'response', action: 'presented', evidence: presented },
      occurredAt: run.presentedAt,
      events: 'complete',
      intervals: [],
    };
  };
  const settled = await Promise.all([
    ...toolCandidates,
    ...checkCandidates,
    outcomeCandidate(),
    presentationCandidate(),
  ]);
  const candidates = settled.filter((candidate) => candidate !== undefined);

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
  return {
    evidence: await Promise.all(projected),
    foreign,
    foreignTails: await foreignTailsOf(run, context, candidates),
    beforeGrant,
    pending,
  };
};
