import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Evidence } from '@taucad/agent-observability/contract';
import type { ProjectedRun, ProjectionContext } from '@taucad/agent-observability/projection';
import { projectRun } from '@taucad/agent-observability/projection';
import type { RunScore } from '@taucad/agent-observability/scorecard';
import { scorecard } from '@taucad/agent-observability/scorecard';
import type { OtlpSpan } from '#api/agent-observability/langfuse-observation.js';
import { langfuseObservation, pseudonymKey } from '#api/agent-observability/langfuse-observation.js';
import type { LangfuseObservationRow } from '#api/agent-observability/langfuse-scorecard.js';
import { scoreObservations } from '#api/agent-observability/langfuse-scorecard.js';

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
