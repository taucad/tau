import { randomBytes } from 'node:crypto';
import { HttpException, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import type { DatabaseService } from '#database/database.service.js';
import type { MetricsService } from '#telemetry/metrics.js';
import type { TelemetryPurposeService } from '#api/telemetry-purposes/telemetry-purpose.service.js';
import type { TelemetryPurpose, TelemetryPurposeState } from '#api/telemetry-purposes/telemetry-purpose.schema.js';
import { admitEvidence } from '#api/agent-observability/evidence-admission.js';
import type { EvidenceAdmissionInput, EvidenceReceipt } from '#api/agent-observability/evidence-admission.js';
import {
  evidenceConcurrencyPerPrincipal,
  EvidenceIngressService,
} from '#api/agent-observability/evidence-ingress.service.js';
import { openEvidence } from '#api/agent-observability/evidence-seal.js';
import { encodeEvidence, evidenceFixture, privateMarker } from '#api/agent-observability/evidence.test-fixture.js';

vi.mock(import('#api/agent-observability/evidence-admission.js'), async (original) => ({
  ...(await original()),
  admitEvidence: vi.fn(),
}));

const key = randomBytes(32);
const receipt: EvidenceReceipt = {
  receipt: 'evr_1',
  disposition: 'accepted',
  duplicate: false,
  receivedAt: '2026-10-29T00:00:00.000Z',
  expiresAt: '2027-04-27T00:00:00.000Z',
};

const createService = (
  options: Readonly<{ key?: boolean; allowed?: readonly TelemetryPurpose[]; epoch?: string }> = {},
) => {
  const config = mock<ConfigService>();
  /* eslint-disable @typescript-eslint/naming-convention -- environment variables are UPPER_CASED */
  const values: Record<string, unknown> = {
    TAU_OBSERVABILITY_PAYLOAD_KEY: options.key === false ? undefined : key.toString('base64url'),
    TAU_OBSERVABILITY_PAYLOAD_KEY_VERSION: 2,
    TAU_OBSERVABILITY_BACKLOG_BYTES: 1000,
    TAU_OBSERVABILITY_PRINCIPAL_BACKLOG_BYTES: 100,
    BILLING_ENVIRONMENT: 'staging',
    NODE_ENV: 'production',
  };
  /* eslint-enable @typescript-eslint/naming-convention -- end of the environment table */
  config.get.mockImplementation((name: string) => values[name]);
  const purposes = mock<TelemetryPurposeService>();
  const allowed = new Set(options.allowed ?? ['summary', 'content']);
  purposes.getAdmissionAuthority.mockResolvedValue({
    effective: {
      epoch: options.epoch ?? 'epoch-a',
      purposes: (['summary', 'feedback', 'content', 'diagnosis', 'reuse', 'training'] as const).map(
        (purpose): TelemetryPurposeState => ({
          purpose,
          allowed: allowed.has(purpose),
          decided: true,
          granted: allowed.has(purpose),
          ...(allowed.has(purpose) ? {} : { refusal: 'withdrawn' }),
        }),
      ),
    },
    protection: 'pro',
  });
  const metrics = mockDeep<MetricsService>();
  const service = new EvidenceIngressService(
    mockDeep<DatabaseService>(),
    config as unknown as ConstructorParameters<typeof EvidenceIngressService>[1],
    purposes,
    metrics,
  );
  return { service, purposes, metrics };
};

const admitted = vi.mocked(admitEvidence);

/** The response body a refusal is answered with, which is all a client or log sees. */
const refusal = async (promise: Promise<unknown>): Promise<{ status: number; body: unknown }> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpException) {
      return { status: error.getStatus(), body: error.getResponse() };
    }
    throw error;
  }
  throw new Error('Expected a refusal');
};

describe('EvidenceIngressService', () => {
  beforeEach(() => {
    admitted.mockReset();
    admitted.mockResolvedValue({ kind: 'receipt', receipt });
  });

  it('admits under the session principal, the current epoch and the server protection, sealing what it stores', async () => {
    const { service } = createService();
    const evidence = await evidenceFixture({ principal: 'user-a', plane: 'content' });

    await expect(service.admit('user-a', encodeEvidence(evidence))).resolves.toEqual(receipt);

    const input = admitted.mock.calls[0]![0];
    expect(input).toMatchObject({
      allowed: { replay: true, admit: true },
      protection: 'pro',
      budgets: { total: 1000, principal: 100 },
    });
    const sealed = input.seal('evr_9');
    expect(sealed.keyVersion).toBe(2);
    expect(sealed.payload).not.toContain(privateMarker);
    const opened = openEvidence(
      sealed.payload,
      { environment: 'staging', principal: 'user-a', project: 'project-a', receipt: 'evr_9', plane: 'content' },
      new Map([[2, Uint8Array.from(key)]]),
    );
    expect(new TextDecoder().decode(opened)).toContain(privateMarker);
  });

  it.each<{ name: string; body: () => Promise<Uint8Array<ArrayBuffer>>; status: number; code: string }>([
    {
      name: 'malformed bytes',
      body: async () => encodeEvidence({ privateMarker }),
      status: 400,
      code: 'EVIDENCE_INVALID',
    },
    { name: 'an oversized envelope', body: async () => new Uint8Array(262_145), status: 413, code: 'EVIDENCE_SIZE' },
    {
      name: 'another principal',
      body: async () => encodeEvidence(await evidenceFixture({ principal: 'user-b' })),
      status: 403,
      code: 'EVIDENCE_SCOPE',
    },
    {
      name: 'an API-reported fact over HTTP',
      body: async () => encodeEvidence(await evidenceFixture({ authority: 'api-reported' })),
      status: 403,
      code: 'EVIDENCE_SCOPE',
    },
    {
      name: 'a digest that does not match',
      body: async () => encodeEvidence({ ...(await evidenceFixture()), run: 'run-b' }),
      status: 400,
      code: 'EVIDENCE_DIGEST',
    },
    {
      name: 'an original time in the future',
      body: async () => encodeEvidence(await evidenceFixture({ now: Date.now() + 3_600_000 })),
      status: 422,
      code: 'EVIDENCE_EXPIRED',
    },
    {
      name: 'an expired retention window',
      body: async () => encodeEvidence(await evidenceFixture({ now: Date.now() - 181 * 86_400_000 })),
      status: 422,
      code: 'EVIDENCE_EXPIRED',
    },
  ])('refuses $name before any database work, without echoing it', async ({ body, status, code }) => {
    const { service, purposes } = createService();

    const answer = await refusal(service.admit('user-a', await body()));

    expect(answer).toMatchObject({ status, body: { code } });
    expect(JSON.stringify(answer)).not.toContain(privateMarker);
    expect(purposes.getAdmissionAuthority).not.toHaveBeenCalled();
    expect(admitted).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'another project', overrides: { project: 'project-b' } },
    { name: 'another uploader', overrides: { uploader: 'device-b' } },
  ])('refuses a cloud host reporting for $name before any database work', async ({ overrides }) => {
    const { service, purposes } = createService();
    const host = { deviceId: 'device-a', projectId: 'project-a' };

    const answer = await refusal(service.admit('user-a', encodeEvidence(await evidenceFixture(overrides)), host));

    expect(answer).toMatchObject({ status: 403, body: { code: 'EVIDENCE_SCOPE' } });
    expect(purposes.getAdmissionAuthority).not.toHaveBeenCalled();
    expect(admitted).not.toHaveBeenCalled();
  });

  it('admits a cloud host’s own project under its owner’s grant', async () => {
    const { service, purposes } = createService();

    await expect(
      service.admit('user-a', encodeEvidence(await evidenceFixture()), {
        deviceId: 'device-a',
        projectId: 'project-a',
      }),
    ).resolves.toEqual(receipt);
    expect(purposes.getAdmissionAuthority).toHaveBeenCalledWith('user-a', 'project-a');
  });

  it('refuses every admission while no payload key is configured', async () => {
    const { service } = createService({ key: false });

    expect(await refusal(service.admit('user-a', encodeEvidence(await evidenceFixture())))).toMatchObject({
      status: 503,
      body: { code: 'EVIDENCE_UNAVAILABLE' },
    });
  });

  it('tells a withdrawn purpose from a stale epoch, and answers replay with the purpose alone', async () => {
    admitted.mockResolvedValue({ kind: 'refused' });
    const withdrawn = createService({ allowed: ['content'] });
    const stale = createService({ epoch: 'epoch-b' });
    const evidence = encodeEvidence(await evidenceFixture());

    expect(await refusal(withdrawn.service.admit('user-a', evidence))).toMatchObject({
      status: 403,
      body: { code: 'EVIDENCE_PURPOSE' },
    });
    expect(admitted.mock.calls[0]![0].allowed).toEqual({ replay: false, admit: false });
    expect(await refusal(stale.service.admit('user-a', evidence))).toMatchObject({
      status: 409,
      body: { code: 'EVIDENCE_POLICY_STALE' },
    });
    expect(admitted.mock.calls[1]![0].allowed).toEqual({ replay: true, admit: false });
    expect(withdrawn.metrics.agentEvidenceAdmissions.add).toHaveBeenCalledExactlyOnceWith(1, {
      'tau.agent_evidence.authority': 'host',
      'tau.agent_evidence.plane': 'summary',
      outcome: 'refused',
    });
    expect(stale.metrics.agentEvidenceAdmissions.add).toHaveBeenCalledExactlyOnceWith(
      1,
      expect.objectContaining({ outcome: 'policy_stale' }),
    );
  });

  it.each<{ allowed: readonly TelemetryPurpose[]; admit: boolean }>([
    { allowed: ['summary', 'content'], admit: false },
    { allowed: ['feedback'], admit: true },
  ])('admits a rating under the feedback purpose alone: $allowed', async ({ allowed, admit }) => {
    const { service, metrics } = createService({ allowed });

    await service.admit('user-a', encodeEvidence(await evidenceFixture({ plane: 'feedback' })));

    expect(admitted.mock.calls[0]![0].allowed).toEqual({ replay: admit, admit });
    expect(metrics.agentEvidenceAdmissions.add).toHaveBeenCalledExactlyOnceWith(
      1,
      expect.objectContaining({ 'tau.agent_evidence.plane': 'feedback' }),
    );
  });

  it.each([
    [{ ...receipt }, 'accepted'],
    [{ ...receipt, duplicate: true }, 'duplicate'],
    [{ ...receipt, duplicate: true, disposition: 'revoked' }, 'revoked'],
    [{ ...receipt, duplicate: true, disposition: 'expired' }, 'expired'],
  ] as const)('counts a receipt by its disposition, never by its id', async (answer, outcome) => {
    admitted.mockResolvedValue({ kind: 'receipt', receipt: answer });
    const { service, metrics } = createService();

    await service.admit('user-a', encodeEvidence(await evidenceFixture()));

    expect(metrics.agentEvidenceAdmissions.add).toHaveBeenCalledExactlyOnceWith(1, {
      'tau.agent_evidence.authority': 'host',
      'tau.agent_evidence.plane': 'summary',
      outcome,
    });
  });

  it.each([
    ['conflict', 409, 'EVIDENCE_CONFLICT'],
    ['fenced', 410, 'PROJECT_DELETED'],
    ['capacity', 503, 'EVIDENCE_CAPACITY'],
  ] as const)('answers %s with a bounded refusal', async (kind, status, code) => {
    admitted.mockResolvedValue({ kind });
    const { service, metrics } = createService();

    expect(await refusal(service.admit('user-a', encodeEvidence(await evidenceFixture())))).toMatchObject({
      status,
      body: { code },
    });
    expect(metrics.agentEvidenceAdmissions.add).toHaveBeenCalledExactlyOnceWith(
      1,
      expect.objectContaining({ outcome: kind }),
    );
  });

  it('reports a database failure by name and SQLSTATE only', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    admitted.mockRejectedValue(Object.assign(new Error(`insert failed: ${privateMarker}`), { code: '23505' }));
    const { service, metrics } = createService();

    const answer = await refusal(service.admit('user-a', encodeEvidence(await evidenceFixture({ plane: 'content' }))));

    expect(metrics.agentEvidenceAdmissions.add).toHaveBeenCalledExactlyOnceWith(1, {
      'tau.agent_evidence.authority': 'host',
      'tau.agent_evidence.plane': 'content',
      outcome: 'error',
    });
    expect(answer).toMatchObject({ status: 503, body: { code: 'EVIDENCE_UNAVAILABLE' } });
    expect(warn).toHaveBeenCalledWith({ name: 'Error', sqlState: '23505' }, 'Evidence admission failed');
    expect(JSON.stringify([answer, warn.mock.calls])).not.toContain(privateMarker);
    warn.mockRestore();
  });

  it('bounds submissions in flight per principal and releases the slot afterwards', async () => {
    const pending: Array<() => void> = [];
    admitted.mockImplementation(
      async (_input: EvidenceAdmissionInput) =>
        new Promise((resolve) => {
          pending.push(() => {
            resolve({ kind: 'receipt', receipt });
          });
        }),
    );
    const { service } = createService();
    const body = encodeEvidence(await evidenceFixture());

    const inFlight = Array.from({ length: evidenceConcurrencyPerPrincipal }, async () => service.admit('user-a', body));
    await vi.waitFor(() => {
      expect(pending).toHaveLength(evidenceConcurrencyPerPrincipal);
    });
    expect(await refusal(service.admit('user-a', body))).toMatchObject({
      status: 429,
      body: { code: 'EVIDENCE_BUSY' },
    });
    for (const release of pending) {
      release();
    }
    await Promise.all(inFlight);
    admitted.mockResolvedValue({ kind: 'receipt', receipt });
    await expect(service.admit('user-a', body)).resolves.toEqual(receipt);
  });
});
