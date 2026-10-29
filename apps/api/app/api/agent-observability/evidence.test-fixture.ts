import type { Evidence } from '@taucad/agent-observability/contract';
import { evidenceDigest } from '@taucad/agent-observability/identity';

const day = 86_400_000;
/** One clock for every fixture in a run, so two fixtures differ only where a test says. */
const loadedAt = Date.now();

/** A marker that must never appear outside the sealed payload. */
export const privateMarker = 'PRIVATE_DESIGN_MARKER_7f3a';

type Overrides = Readonly<{
  principal?: string;
  project?: string;
  policyEpoch?: string;
  sequence?: number;
  sourceDigest?: string;
  projectionVersion?: string;
  uploader?: string;
  plane?: 'summary' | 'content';
  text?: string;
  protection?: 'pro' | 'free' | 'unknown';
  lineageDigest?: string;
  now?: number;
  authority?: Evidence['authority'];
}>;

/**
 * A valid host-reported envelope whose projection digest is computed, so a
 * test changes one claim at a time and keeps every other check passing.
 */
export const evidenceFixture = async (overrides: Overrides = {}): Promise<Evidence> => {
  const now = overrides.now ?? loadedAt;
  const sourceDigest = overrides.sourceDigest ?? 'a'.repeat(64);
  const lineageDigest = overrides.lineageDigest ?? sourceDigest;
  const plane = overrides.plane ?? 'summary';
  const text = overrides.text ?? privateMarker;
  const textBytes = new TextEncoder().encode(text).byteLength;
  const evidence: Evidence = {
    version: 1,
    source: {
      kind: 'row',
      chat: 'chat-1',
      leaderEpoch: 'device-a',
      sequence: overrides.sequence ?? 7,
      digest: sourceDigest,
    },
    semantic: { kind: 'instruction', id: 'message-1' },
    projection: { version: overrides.projectionVersion ?? 'v1', redactor: 'r1', digest: '0'.repeat(64) },
    delivery: {
      uploader: overrides.uploader ?? 'device-a',
      attempt: 'send-1',
      cursor: { view: 'own', origin: overrides.uploader ?? 'device-a', position: '7' },
    },
    scope: {
      principal: overrides.principal ?? 'user-a',
      project: overrides.project ?? 'project-a',
      policyEpoch: overrides.policyEpoch ?? 'epoch-a',
      destination: 'langfuse',
    },
    run: 'run-a',
    execution: { attempt: 'attempt-a', resumedFrom: null, branchedFrom: null },
    versions: {
      hostBuild: 'synthetic',
      apiBuild: null,
      harness: null,
      compaction: null,
      prompts: [],
      skills: [],
      tools: [],
      kernels: [],
      mapper: 'v1',
      policy: 'v1',
    },
    task: null,
    authority: overrides.authority ?? 'host-reported',
    clocks: { occurredAt: now - 1000, sourceOrder: '7', intervals: [] },
    retention: { originalAt: now - 1000, expiresAt: now - 1000 + 180 * day, proof: 'retention-1' },
    lineage: [
      {
        source: `row-${String(overrides.sequence ?? 7)}`,
        digest: lineageDigest,
        protection: overrides.protection ?? 'free',
        rights: 'verified',
        expiresAt: now - 1000 + 180 * day,
        proof: 'source-proof-1',
      },
    ],
    coverage: {
      events: 'complete',
      input: plane === 'content' ? 'complete' : 'omitted',
      output: 'omitted',
      usage: 'missing',
      artifacts: 'unsupported',
      permission: 'complete',
    },
    payload:
      plane === 'summary'
        ? { plane, fact: { kind: 'instruction', mode: 'initial', message: 'message-1' } }
        : {
            plane,
            family: 'instruction',
            stage: 'admitted',
            blocks: [
              {
                kind: 'text',
                role: 'user',
                format: 'text',
                text,
                source: lineageDigest,
                originalBytes: textBytes,
                retainedBytes: textBytes,
                redaction: 'none',
              },
            ],
          },
  };
  return { ...evidence, projection: { ...evidence.projection, digest: await evidenceDigest(evidence) } };
};

/** The envelope as the host sends it. */
export const encodeEvidence = (evidence: unknown): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(new TextEncoder().encode(JSON.stringify(evidence)));
