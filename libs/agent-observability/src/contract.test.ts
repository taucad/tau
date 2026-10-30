import { describe, it, expect } from 'vitest';
import { evidenceSchema, parseEvidence, evidenceLimits } from '#contract.js';
import type { Evidence } from '#contract.js';
import { authorizeEvidence, operationalEvidence } from '#authority.js';
import type { EvidenceAuthority } from '#authority.js';
import { evidenceKeys, evidenceDigest, compareEvidence, verifyEvidenceDigest } from '#identity.js';

const digest = 'a'.repeat(64);
const window = 180 * 86_400_000;
const fixture = (): Evidence => ({
  version: 1,
  source: { kind: 'row', chat: 'chat-1', leaderEpoch: 'device-a', sequence: 7, digest },
  semantic: { kind: 'instruction', id: 'original-user-message' },
  projection: { version: 'v1', redactor: 'r1', digest },
  delivery: { uploader: 'device-a', attempt: 'send-1', cursor: { view: 'own', origin: 'device-a', position: '7' } },
  scope: { principal: 'account-a', project: 'project-a', policyEpoch: 'epoch-a', destination: 'langfuse' },
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
  task: { id: 'task-a', basis: 'explicit', method: 'user-boundary-v1', confidence: 1 },
  authority: 'host-reported',
  clocks: {
    occurredAt: 1000,
    sourceOrder: 'future-hlc',
    intervals: [{ phase: 'provider-wait', domain: 'device-a-boot-1', start: 1, end: 10 }],
  },
  retention: { originalAt: 1000, expiresAt: 1000 + window, proof: 'retention-proof' },
  lineage: [
    {
      source: 'original-source',
      digest,
      protection: 'free',
      rights: 'verified',
      expiresAt: 1000 + window,
      proof: 'source-proof',
    },
  ],
  coverage: {
    events: 'complete',
    input: 'omitted',
    output: 'omitted',
    usage: 'missing',
    artifacts: 'unsupported',
    permission: 'complete',
  },
  payload: { plane: 'summary', fact: { kind: 'instruction', mode: 'initial', message: 'original-user-message' } },
});
const authority = (evidence: Evidence): EvidenceAuthority => ({
  ...evidence.scope,
  producer: evidence.authority,
  sourceFacts: new Map([
    [
      evidenceKeys(evidence).source,
      {
        digest: evidence.source.digest,
        lineage: evidence.lineage.map((source) => source.source),
        retentionProof: evidence.retention.proof,
      },
    ],
  ]),
  diagnosisSources: new Set(evidence.lineage.map((source) => source.source)),
  purposes: { summary: true, feedback: true, content: true, diagnosis: true, evaluation: true, training: true },
  projectRights: 'verified',
  now: 2000,
  sourceProofs: new Map(evidence.lineage.map((source) => [source.source, { ...source, proof: source.proof! }])),
  retentionProofs: new Map([[evidence.retention.proof, { ...evidence.retention }]]),
});
const content = (evidence: Evidence): Evidence => ({
  ...evidence,
  payload: {
    plane: 'content',
    family: 'instruction',
    stage: 'admitted',
    blocks: [
      {
        kind: 'text',
        role: 'system',
        format: 'text',
        text: 'PRIVATE_CONTENT',
        source: digest,
        originalBytes: 15,
        retainedBytes: 15,
        redaction: 'none',
      },
    ],
  },
});
const parse = (value: unknown) => parseEvidence(new TextEncoder().encode(JSON.stringify(value)));

describe('shared evidence boundary', () => {
  it('should parse bounded facts and refuse unversioned, unknown or arbitrary fields without echoing content', () => {
    expect(parse(fixture()).ok).toBe(true);
    for (const value of [
      { ...fixture(), version: 2 },
      { ...fixture(), secret: 'PRIVATE' },
      {
        ...fixture(),
        payload: { plane: 'summary', fact: { kind: 'instruction', mode: 'initial', message: 'm', text: 'PRIVATE' } },
      },
    ]) {
      expect(parse(value)).toEqual({ ok: false, code: 'EVIDENCE_INVALID' });
    }
    expect(parseEvidence(new Uint8Array([0xff]))).toEqual({ ok: false, code: 'EVIDENCE_INVALID' });
    expect(parseEvidence(new Uint8Array(evidenceLimits.bytes + 1))).toEqual({ ok: false, code: 'EVIDENCE_SIZE' });
  });
  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])('should preserve independent summary=%s and content=%s purposes', (summary, full) => {
    const evidence = fixture();
    const current = authority(evidence);
    const purposes = { ...current.purposes, summary, content: full };
    expect(authorizeEvidence({ evidence, authority: { ...current, purposes }, purpose: 'summary' }).allowed).toBe(
      summary,
    );
    expect(
      authorizeEvidence({ evidence: content(evidence), authority: { ...current, purposes }, purpose: 'content' })
        .allowed,
    ).toBe(full);
    expect(
      authorizeEvidence({ evidence: content(evidence), authority: { ...current, purposes }, purpose: 'summary' })
        .allowed,
    ).toBe(false);
  });
  it('should keep ratings and explicit judgements on their own plane, without an explanation', () => {
    const rating = {
      ...fixture(),
      semantic: { kind: 'rating', id: 'rating-1' },
      payload: {
        plane: 'feedback',
        fact: { kind: 'rating', scale: 'thumbs.1', value: 'negative', evidence: 'presented-1' },
      },
    };
    const accepted = {
      ...fixture(),
      semantic: { kind: 'response', id: 'accepted-1' },
      payload: { plane: 'feedback', fact: { kind: 'response', action: 'accepted', evidence: 'presented-1' } },
    };
    expect(parse(rating).ok).toBe(true);
    expect(parse(accepted).ok).toBe(true);
    for (const value of [
      { ...rating, payload: { ...rating.payload, plane: 'summary' } },
      { ...accepted, payload: { ...accepted.payload, plane: 'summary' } },
      { ...rating, payload: { plane: 'feedback', fact: { ...rating.payload.fact, explanation: 'PRIVATE' } } },
      { ...rating, payload: { plane: 'feedback', fact: { ...rating.payload.fact, value: 4 } } },
      {
        ...accepted,
        payload: { plane: 'feedback', fact: { kind: 'response', action: 'presented', evidence: 'presented-1' } },
      },
    ]) {
      expect(parse(value)).toEqual({ ok: false, code: 'EVIDENCE_INVALID' });
    }
  });
  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])('should answer feedback=%s independently of summary=%s', (feedback, summary) => {
    const evidence = fixture();
    const rating: Evidence = {
      ...evidence,
      semantic: { kind: 'rating', id: 'rating-1' },
      payload: {
        plane: 'feedback',
        fact: { kind: 'rating', scale: 'thumbs.1', value: 'positive', evidence: 'presented-1' },
      },
    };
    const current = authority(evidence);
    const purposes = { ...current.purposes, feedback, summary };
    expect(
      authorizeEvidence({ evidence: rating, authority: { ...current, purposes }, purpose: 'feedback' }).allowed,
    ).toBe(feedback);
    expect(
      authorizeEvidence({ evidence: rating, authority: { ...current, purposes }, purpose: 'summary' }).allowed,
    ).toBe(false);
    expect(authorizeEvidence({ evidence, authority: { ...current, purposes }, purpose: 'feedback' }).allowed).toBe(
      false,
    );
  });
  it('should deny stale accounts, project grants, policy epochs and missing rights', () => {
    const evidence = fixture();
    const current = authority(evidence);
    for (const change of [
      { principal: 'b' },
      { project: 'b' },
      { policyEpoch: 'b' },
      { projectRights: 'unknown' },
      { projectRights: 'denied' },
    ] satisfies Array<Partial<EvidenceAuthority>>) {
      expect(authorizeEvidence({ evidence, authority: { ...current, ...change }, purpose: 'summary' }).allowed).toBe(
        false,
      );
    }
  });
  it('should permanently deny Pro and mixed/unknown lineage for training and reusable evaluation', () => {
    for (const protection of ['pro', 'unknown'] as const) {
      const evidence = content(fixture());
      evidence.lineage[0]!.protection = protection;
      const current = authority(evidence);
      expect(authorizeEvidence({ evidence, authority: current, purpose: 'training' }).allowed).toBe(false);
      expect(authorizeEvidence({ evidence, authority: current, purpose: 'evaluation' }).allowed).toBe(false);
      expect(authorizeEvidence({ evidence, authority: current, purpose: 'diagnosis' }).allowed).toBe(
        protection === 'pro',
      );
      evidence.lineage.push({ ...evidence.lineage[0]!, source: 'new-free-output', protection: 'free' });
      expect(authorizeEvidence({ evidence, authority: authority(evidence), purpose: 'training' }).allowed).toBe(false);
    }
  });
  it('should refuse forged Free provenance and deleted lineage despite a current grant', () => {
    const evidence = fixture();
    const current = authority(evidence);
    const pro = new Map(current.sourceProofs);
    pro.set('original-source', { ...pro.get('original-source')!, protection: 'pro' });
    expect(authorizeEvidence({ evidence, authority: { ...current, sourceProofs: pro }, purpose: 'training' })).toEqual({
      allowed: false,
      code: 'PROVENANCE',
    });
    expect(
      authorizeEvidence({ evidence, authority: { ...current, sourceProofs: new Map() }, purpose: 'summary' }).allowed,
    ).toBe(false);
  });
  it('should expire at original day 180 and reject replay-renewed retention or HLC wall time', () => {
    const evidence = fixture();
    const current = authority(evidence);
    expect(
      authorizeEvidence({ evidence, authority: { ...current, now: evidence.retention.expiresAt }, purpose: 'summary' }),
    ).toEqual({ allowed: false, code: 'EXPIRED' });
    const copied = structuredClone(evidence);
    copied.retention.originalAt += 1;
    copied.retention.expiresAt += 1;
    expect(authorizeEvidence({ evidence: copied, authority: current, purpose: 'summary' }).allowed).toBe(false);
    expect(
      parse({ ...evidence, retention: { ...evidence.retention, expiresAt: evidence.retention.expiresAt + 1 } }).ok,
    ).toBe(false);
    expect(parse({ ...evidence, clocks: { ...evidence.clocks, occurredAt: 9_999_999_999_999 } }).ok).toBe(true);
    expect(evidence.retention.originalAt).toBe(1000);
  });
  it('should keep source/semantic identity distinct from copies, projection upgrades and changed bytes', async () => {
    const evidence = fixture();
    const copy = structuredClone(evidence);
    copy.delivery = {
      uploader: 'device-b',
      attempt: 'send-2',
      cursor: { view: 'merged', origin: 'device-b', position: '99' },
    };
    copy.scope.policyEpoch = 'renewed';
    expect(evidenceKeys(copy)).toEqual(evidenceKeys(evidence));
    expect(await evidenceDigest(copy)).toBe(await evidenceDigest(evidence));
    expect(compareEvidence(copy, evidence)).toBe('duplicate');
    copy.projection.version = 'v2';
    expect(compareEvidence(copy, evidence)).toBe('projection');
    copy.source.digest = 'b'.repeat(64);
    expect(compareEvidence(copy, evidence)).toBe('conflict');
    const branch = structuredClone(evidence);
    branch.run = 'branched-run';
    expect(evidenceKeys(branch).semantic).toBe(evidenceKeys(evidence).semantic);
    branch.semantic.id = 'genuinely-new-message';
    expect(compareEvidence(branch, evidence)).toBe('conflict');
  });
  it('should preserve missing usage, phase clock domains and undecided CAD evidence', () => {
    const evidence = fixture();
    expect(
      evidenceSchema.safeParse({
        ...evidence,
        clocks: { ...evidence.clocks, intervals: [{ phase: 'tool', domain: 'boot-a', start: 5, end: 4 }] },
      }).success,
    ).toBe(false);
    const cad = {
      ...evidence,
      semantic: { kind: 'cad', id: 'req' },
      payload: {
        plane: 'summary',
        fact: {
          kind: 'cad',
          sourceRevision: digest,
          requirement: 'req',
          result: 'inconclusive',
          exportRequested: false,
          artifact: null,
        },
      },
    };
    expect(parse(cad).ok).toBe(true);
    const fabricated = {
      ...evidence,
      semantic: { kind: 'outcome', id: 'task' },
      payload: {
        plane: 'summary',
        fact: { kind: 'outcome', termination: 'completed', success: 'verified', assessment: null },
      },
    };
    expect(parse(fabricated).ok).toBe(false);
  });
  it('should keep all identities, content and lineage out of the operational projection', () => {
    const evidence = content(fixture());
    evidence.scope.principal = 'PRIVATE_ACCOUNT';
    expect(operationalEvidence(evidence)).toEqual({ plane: 'content', family: 'instruction', coverage: 'complete' });
    expect(JSON.stringify(operationalEvidence(evidence))).not.toContain('PRIVATE');
  });
});

it('should reject mutated semantic bytes even when the sender reuses a valid digest', async () => {
  const evidence = fixture();
  evidence.projection.digest = await evidenceDigest(evidence);
  expect(await verifyEvidenceDigest(evidence)).toBe(true);
  evidence.run = 'changed';
  expect(await verifyEvidenceDigest(evidence)).toBe(false);
});

it('should reject omitted protected ancestors, unscoped diagnosis and host financial authority', () => {
  const evidence = fixture();
  evidence.lineage.push({ ...evidence.lineage[0]!, source: 'protected-parent', protection: 'pro' });
  const current = authority(evidence);
  evidence.lineage.pop();
  expect(authorizeEvidence({ evidence, authority: current, purpose: 'training' })).toEqual({
    allowed: false,
    code: 'PROVENANCE',
  });
  const diagnosis = authority(evidence);
  expect(
    authorizeEvidence({ evidence, authority: { ...diagnosis, diagnosisSources: new Set() }, purpose: 'diagnosis' })
      .allowed,
  ).toBe(false);
  const financial: Evidence = {
    ...evidence,
    semantic: { kind: 'financial', id: 'charge' },
    payload: {
      plane: 'summary',
      fact: {
        kind: 'financial',
        ledger: 'ledger',
        attempt: 'attempt',
        credits: 1,
        tariff: 'v1',
        supplierCost: null,
        currency: 'USD',
        normalization: 'v1',
        adjustment: false,
      },
    },
  };
  expect(authorizeEvidence({ evidence: financial, authority: authority(financial), purpose: 'summary' })).toEqual({
    allowed: false,
    code: 'SCOPE',
  });
});

it('should reject dishonest content lengths, duplicate lineage and unbound media', () => {
  const evidence = content(fixture());
  expect(parse(evidence).ok).toBe(true);
  if (evidence.payload.plane !== 'content') {
    throw new Error('fixture');
  }
  const text = evidence.payload.blocks[0]!;
  if (text.kind !== 'text') {
    throw new Error('fixture');
  }
  text.text = 'é';
  expect(parse(evidence).ok).toBe(false);
  text.originalBytes = 2;
  text.retainedBytes = 2;
  expect(parse(evidence).ok).toBe(true);
  evidence.payload.blocks.push({
    kind: 'media',
    artifact: 'media',
    digest,
    source: 'b'.repeat(64),
    mime: 'image/png',
    bytes: 42,
  });
  expect(parse(evidence).ok).toBe(false);
  evidence.payload.blocks.pop();
  evidence.lineage.push({ ...evidence.lineage[0]! });
  expect(parse(evidence).ok).toBe(false);
});

it('should represent direct, funded and compaction calls without inventing a billing link or missing usage', () => {
  for (const purpose of ['generation', 'compaction', 'helper'] as const) {
    for (const billing of [null, 'funded-ledger']) {
      const evidence: Evidence = {
        ...fixture(),
        source: { kind: 'invocation', invocation: 'call-1', digest },
        semantic: { kind: 'provider', id: 'call-1' },
        payload: {
          plane: 'summary',
          fact: {
            kind: 'provider',
            logicalCall: 'logical-1',
            attempt: 'attempt-1',
            billing,
            purpose,
            requestedModel: null,
            resolvedModel: null,
            provider: null,
            response: null,
            firstOutput: null,
            stop: 'error',
            usage: {
              input: null,
              output: null,
              cacheRead: null,
              cacheWrite: null,
              reasoning: null,
              missing: 'unreported',
            },
          },
        },
      };
      expect(parse(evidence).ok).toBe(true);
      const replay = structuredClone(evidence);
      replay.delivery.uploader = 'other-device';
      expect(compareEvidence(evidence, replay)).toBe('duplicate');
    }
  }
});

it('should refuse a valid retention proof borrowed from a different source fact', () => {
  const evidence = fixture();
  const current = authority(evidence);
  const proofs = new Map(current.retentionProofs);
  proofs.set('unrelated-proof', { originalAt: evidence.retention.originalAt, expiresAt: evidence.retention.expiresAt });
  evidence.retention.proof = 'unrelated-proof';
  expect(
    authorizeEvidence({ evidence, authority: { ...current, retentionProofs: proofs }, purpose: 'summary' }),
  ).toEqual({ allowed: false, code: 'PROVENANCE' });
});

it('should reject inherited purpose names at the runtime boundary', () => {
  const evidence = fixture();
  const current = authority(evidence);
  // @ts-expect-error JavaScript callers can bypass the compile-time closed purpose vocabulary.
  expect(authorizeEvidence({ evidence, authority: current, purpose: 'toString' })).toEqual({
    allowed: false,
    code: 'PURPOSE',
  });
});
