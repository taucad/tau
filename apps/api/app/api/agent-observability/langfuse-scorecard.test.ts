import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Evidence } from '@taucad/agent-observability/contract';
import type { ProjectedRun, ProjectionContext } from '@taucad/agent-observability/projection';
import { projectRun } from '@taucad/agent-observability/projection';
import type { FeedbackGrants, RunScore } from '@taucad/agent-observability/scorecard';
import { scorecard } from '@taucad/agent-observability/scorecard';
import type { OtlpSpan } from '#api/agent-observability/langfuse-observation.js';
import { langfuseObservation, pseudonymKey } from '#api/agent-observability/langfuse-observation.js';
import type { LangfuseObservationRow } from '#api/agent-observability/langfuse-scorecard.js';
import { pseudonymGrants, scoreObservations } from '#api/agent-observability/langfuse-scorecard.js';
import type { ObservedAttempt } from '#api/agent-observability/model-invocation-evidence.js';
import { providerAttemptEvidence } from '#api/agent-observability/model-invocation-evidence.js';
import type { ObservedSettlement } from '#api/agent-observability/settlement-evidence.js';
import { settlementEvidence } from '#api/agent-observability/settlement-evidence.js';

const at = Date.parse('2026-10-29T00:00:00.000Z');
const pseudonym = pseudonymKey(Uint8Array.from(randomBytes(32)));
const metadataPrefix = 'langfuse.observation.metadata.';

const row = (sequence: number, leaderEpoch = 'epoch-a') => ({ chatId: 'chat-1', leaderEpoch, sequence });

const tool = (
  call: string,
  sequence: number,
  [start, end]: readonly [number, number],
): ProjectedRun['tools'][number] => ({
  call,
  toolName: 'SYNTHETIC_TOOL',
  outcome: 'completed',
  input: row(sequence),
  output: row(sequence + 1),
  startedAt: at + start,
  settledAt: at + end,
});

const run = (change: Partial<ProjectedRun> = {}): ProjectedRun => ({
  chatId: 'chat-1',
  runId: 'run-1',
  termination: 'completed',
  tools: [tool('call-1', 3, [3000, 5000]), tool('call-2', 5, [4000, 6000])],
  intervals: [{ phase: 'admission', start: at, end: at + 1000 }],
  ending: { source: row(8), at: at + 8000 },
  ...change,
});

const context = (change: Partial<ProjectionContext> = {}): ProjectionContext => ({
  principal: 'user-a',
  project: 'project-a',
  policyEpoch: 'epoch-1',
  protection: 'free',
  uploader: 'device-a',
  ownsEpoch: () => true,
  grantedAt: at,
  hostBuild: 'build-1',
  ...change,
});

const project = async (projected: ProjectedRun, change: Partial<ProjectionContext> = {}): Promise<Evidence[]> => {
  const { evidence } = await projectRun(projected, context(change));
  return [...evidence];
};

/* What Langfuse's v2 observations API returns for a span, as read back from the synthetic project (T15). */
const rowOf = (span: OtlpSpan): LangfuseObservationRow => {
  const metadata: Record<string, unknown> = {};
  for (const { key, value } of span.attributes) {
    const scalar = Object.values(value)[0] as unknown;
    /* Langfuse returns an integer as a number, and a string holding JSON as the value it encodes. */
    const read =
      'intValue' in value
        ? Number(scalar)
        : key.endsWith('.intervals')
          ? (JSON.parse(String(scalar)) as unknown)
          : scalar;
    if (key.startsWith(metadataPrefix)) {
      metadata[key.slice(metadataPrefix.length)] = read;
    } else if (key.startsWith('langfuse.')) {
      metadata[`attributes.${key}`] = read;
    }
  }
  return {
    id: span.spanId,
    startTime: new Date(Number(BigInt(span.startTimeUnixNano) / 1_000_000n)).toISOString(),
    metadata,
  };
};

let receipts = 0;
const delivered = (evidence: readonly Evidence[], protection: 'free' | 'pro' = 'free'): LangfuseObservationRow[] =>
  evidence.map((item) => {
    receipts++;
    return rowOf(
      langfuseObservation(item, { environment: 'synthetic', receipt: `evr_${receipts}`, protection }, pseudonym).span,
    );
  });

const attempt = (change: Partial<ObservedAttempt> = {}): ObservedAttempt => ({
  principal: 'user-a',
  project: 'project-a',
  attemptKey: 'attempt-1',
  chat: 'chat-1',
  surface: 'gateway',
  wire: 'openai-responses',
  requestedModel: 'model-a',
  provider: 'provider-a',
  operation: 'op-1',
  startedAt: at,
  duration: 900,
  stream: {
    stop: 'stop',
    usage: { input: 120, output: 40, cacheRead: 100, cacheWrite: null, reasoning: 8, missing: 'none' },
    resolvedModel: 'model-a',
    response: 'response-1',
    firstChunk: 150,
    firstText: 210,
  },
  ended: 'completed',
  ...change,
});

const settlement = (
  operation: string,
  chargedAtoms: bigint,
  supplierCostPicoUsd: ObservedSettlement['receipt']['supplierCostPicoUsd'],
): ObservedSettlement => ({
  operation: {
    id: operation,
    accountId: 'account-a',
    environment: 'synthetic',
    attemptKey: 'attempt-1',
    projectHint: 'project-a',
    chatHint: 'chat-1',
    admittedAt: new Date(at),
    activationId: 'activation-1',
  },
  receipt: { terminalRevision: 1n, chargedAtoms, supplierCostPicoUsd, resolvedAt: new Date(at + 1000) },
  normalization: 'openai-responses-v1',
});

const forAttempt = (attemptKey: string, observed: ObservedSettlement): ObservedSettlement => ({
  ...observed,
  operation: { ...observed.operation, attemptKey },
});

const withoutIds = ({ run: _run, chat: _chat, ...score }: RunScore) => score;

describe('scoreObservations', () => {
  it('scores runs from Langfuse exactly as from the evidence, with no Tau id or tool name', async () => {
    const rated = run({ presentedAt: at + 2000, rating: { value: 'negative', at: at + 9000 } });
    const pro = run({ runId: 'run-2', tools: [], intervals: [], ending: { source: row(20), at: at + 20_000 } });
    const evidence = [
      ...(await project(rated)),
      ...(await project(rated, { plane: 'feedback' })),
      ...(await project(pro, { protection: 'pro', hostBuild: 'build-2' })),
    ];
    const rows = [
      ...delivered(evidence.filter((item) => item.versions.hostBuild === 'build-1')),
      ...delivered(
        evidence.filter((item) => item.versions.hostBuild === 'build-2'),
        'pro',
      ),
    ];

    const fromLangfuse = scoreObservations(rows);
    const fromEvidence = scorecard(evidence);

    expect(fromLangfuse.runs.map(withoutIds)).toEqual(fromEvidence.runs.map(withoutIds));
    expect(fromLangfuse.overall).toEqual(fromEvidence.overall);
    expect(fromLangfuse.byRelease).toEqual(fromEvidence.byRelease);
    expect(fromLangfuse.byProtection).toEqual(fromEvidence.byProtection);
    expect(fromLangfuse.runs[0]?.phases).toEqual({ 'admission@host-recorded': 1000, 'tool@host-recorded': 3000 });
    const read = JSON.stringify(fromLangfuse);
    for (const id of ['run-1', 'run-2', 'chat-1', 'user-a', 'project-a', 'SYNTHETIC_TOOL']) {
      expect(read).not.toContain(id);
    }
  });

  it('scores supplier attempts and settlements from Langfuse exactly as from the evidence', async () => {
    const authority = { policyEpoch: 'epoch-1', protection: 'free' } as const;
    const evidence = [
      await providerAttemptEvidence(attempt({ ended: 'failed', stream: undefined }), authority),
      await providerAttemptEvidence(attempt({ attemptKey: 'attempt-2', operation: 'op-2' }), authority),
      await providerAttemptEvidence(
        attempt({ attemptKey: 'attempt-3', surface: 'commit_name', requestedModel: undefined, provider: undefined }),
        authority,
      ),
      await settlementEvidence(settlement('op-1', 2_500_000n, 750_000_000_000n), 'user-a', {
        ...authority,
        project: 'project-a',
      }),
      await settlementEvidence(settlement('op-2', 1_000_000n, null), 'user-a', { ...authority, project: 'project-a' }),
    ];

    const fromLangfuse = scoreObservations(delivered(evidence));
    const fromEvidence = scorecard(evidence);

    expect(fromLangfuse.attempts).toEqual(fromEvidence.attempts);
    expect(fromEvidence.attempts.overall).toMatchObject({
      attempts: 3,
      stops: { error: 1, stop: 2 },
      usage: { input: 240, output: 80, cacheRead: 200, cacheWrite: 0, reasoning: 16 },
      usageCoverage: { unreported: 1, none: 2 },
    });
    expect(fromEvidence.attempts.cost).toMatchObject({ settlements: 2, credits: 3.5, supplierCostUnknown: 1 });
    expect(fromLangfuse.reconciliation).toMatchObject({ read: 5, unscorable: 0 });
    const read = JSON.stringify(fromLangfuse);
    for (const id of ['attempt-1', 'chat-1', 'user-a', 'project-a', 'op-1']) {
      expect(read).not.toContain(id);
    }
  });

  it('joins each run to the attempts and settlements its host attempt keys name, exactly as the evidence does', async () => {
    const authority = { policyEpoch: 'epoch-1', protection: 'free' } as const;
    const evidence = [
      ...(await project(run())),
      ...(await project(run({ runId: 'run-2', tools: [], ending: { source: row(20), at: at + 20_000 } }))),
      await providerAttemptEvidence(attempt({ attemptKey: 'run-1:1:0', operation: 'op-1' }), authority),
      await providerAttemptEvidence(attempt({ attemptKey: 'run-1:1:1', operation: 'op-2' }), authority),
      await providerAttemptEvidence(attempt({ attemptKey: 'helper-1', operation: 'op-3' }), authority),
      await settlementEvidence(forAttempt('run-1:1:0', settlement('op-1', 2_000_000n, null)), 'user-a', {
        ...authority,
        project: 'project-a',
      }),
    ];

    const fromLangfuse = scoreObservations(delivered(evidence));
    const fromEvidence = scorecard(evidence);

    expect(fromLangfuse.runs.map(withoutIds)).toEqual(fromEvidence.runs.map(withoutIds));
    expect(fromLangfuse.overall.credits).toEqual(fromEvidence.overall.credits);
    expect(fromLangfuse.attempts.joined).toEqual(fromEvidence.attempts.joined);
    expect(fromEvidence.runs.map((score) => score.model)).toEqual([
      { attempts: 2, calls: 2, settlements: 1, credits: 2, supplierCost: 0, supplierCostUnknown: 1 },
      { attempts: 0, calls: 0, settlements: 0, credits: 0, supplierCost: 0, supplierCostUnknown: 0 },
    ]);
    expect(fromEvidence.attempts.joined).toEqual({ attempts: 2, settlements: 1 });
  });

  it('splits runs by feedback grant from Langfuse exactly as from the evidence, keyed by the account pseudonym', async () => {
    const evidence = [
      ...(await project(run({ rating: { value: 'positive', at: at + 9000 } }), { plane: 'feedback' })),
      ...(await project(run())),
      ...(await project(
        run({ runId: 'run-2', tools: [], intervals: [], ending: { source: row(20), at: at + 20_000 } }),
        {
          principal: 'user-b',
        },
      )),
    ];
    const grants: FeedbackGrants = (account) => (account === 'user-a' ? 'granted' : 'withheld');

    const fromLangfuse = scoreObservations(
      delivered(evidence),
      pseudonymGrants(grants, { userIds: ['user-a', 'user-b'], environment: 'synthetic', pseudonym }),
    );
    const fromEvidence = scorecard(evidence, grants);

    expect(fromLangfuse.runs.map(withoutIds)).toEqual(fromEvidence.runs.map(withoutIds));
    expect(fromLangfuse.overall).toEqual(fromEvidence.overall);
    expect(fromEvidence.overall).toMatchObject({
      feedback: { granted: 1, withheld: 1 },
      granted: { runs: 1, rating: { positive: 1 } },
    });
    expect(scoreObservations(delivered(evidence)).overall.feedback).toEqual({ unknown: 2 });
  });

  it('counts a fact once across uploaders and replays, and never reads content or another mapper', async () => {
    const first = await project(run());
    const rows = [
      ...delivered(first),
      ...delivered(await project(run(), { uploader: 'device-b' })),
      ...delivered(await project(run({ ending: { source: row(8, 'epoch-b'), at: at + 8000 } }))),
    ];
    const replayed = rows[0]!;
    const content = { ...replayed, id: 'content', metadata: { ...replayed.metadata, plane: 'content' } };
    const older = { ...replayed, id: 'older', metadata: { ...replayed.metadata, mapper: 'langfuse-v4.1' } };

    const card = scoreObservations([...rows, replayed, content, older]);

    expect(card.reconciliation).toEqual({ read: 12, duplicates: 6, replicas: 1, content: 1, unscorable: 1 });
    expect(card.runs).toHaveLength(1);
    expect(card.runs[0]).toMatchObject({ termination: 'completed', tools: { total: 2 } });
  });

  it('keeps an observation with malformed intervals untimed rather than guessing', async () => {
    const rows = delivered(await project(run({ tools: [] })));
    const broken = rows.map((item) => ({ ...item, metadata: { ...item.metadata, intervals: '[["admission"' } }));

    expect(scoreObservations(broken).runs[0]?.phases).toEqual({});
  });
});
