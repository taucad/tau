import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { Evidence } from '@taucad/agent-observability/contract';
import { evidenceSchema } from '@taucad/agent-observability/contract';
import { verifyEvidenceDigest } from '@taucad/agent-observability/identity';
import type { DatabaseService } from '#database/database.service.js';
import { ShutdownService } from '#lifecycle/shutdown.service.js';
import type { TelemetryPurposeService } from '#api/telemetry-purposes/telemetry-purpose.service.js';
import type { EvidenceIngressService } from '#api/agent-observability/evidence-ingress.service.js';
import { ModelInvocationEvidenceRecorder } from '#api/agent-observability/model-invocation-recorder.service.js';
import { providerAttemptEvidence } from '#api/agent-observability/model-invocation-evidence.js';
import type { ObservedSettlement } from '#api/agent-observability/settlement-evidence.js';

const settlement = (change: Partial<ObservedSettlement['operation']> = {}): ObservedSettlement => ({
  operation: {
    id: 'op-1',
    accountId: 'account-a',
    environment: 'test',
    attemptKey: 'attempt with spaces',
    projectHint: 'project-a',
    chatHint: 'chat-a',
    admittedAt: new Date(),
    activationId: 'activation-1',
    ...change,
  },
  receipt: { terminalRevision: 1n, chargedAtoms: 2_500_000n, supplierCostPicoUsd: null, resolvedAt: new Date() },
  normalization: 'openai-responses-v1',
});

/** The owner lookup as drizzle chains it, answering `owners`. */
const ownerDatabase = (owners: ReadonlyArray<{ authUserId: string | undefined }>) => {
  const chain = { from: () => chain, where: () => chain, limit: async () => owners };
  return { database: { select: () => chain } } as unknown as DatabaseService;
};

const setup = (input: { owners?: ReadonlyArray<{ authUserId: string | undefined }>; allowed?: boolean } = {}) => {
  const config = mock<ConfigService>();
  config.get.mockImplementation((name: string) =>
    name === 'TAU_OBSERVABILITY_PAYLOAD_KEY' || name === 'TAU_OBSERVABILITY_NOTICE_VERSION' ? 'set' : undefined,
  );
  const purposes = mock<TelemetryPurposeService>();
  purposes.getAdmissionAuthority.mockResolvedValue({
    effective: {
      epoch: 'epoch-a',
      purposes: [{ purpose: 'summary', allowed: input.allowed ?? true, decided: true, granted: true }],
    },
    protection: 'pro',
  });
  const admitted: Evidence[] = [];
  const ingress = mock<EvidenceIngressService>();
  ingress.admitApiReported.mockImplementation(async (evidence) => {
    admitted.push(evidence);
    return { refused: 'recorded-by-test' };
  });
  const shutdown = new ShutdownService();
  const recorder = new ModelInvocationEvidenceRecorder(
    config,
    purposes,
    ingress,
    shutdown,
    ownerDatabase(input.owners ?? [{ authUserId: 'user-a' }]),
  );
  return { recorder, admitted, purposes, settled: async () => shutdown.settled(Date.now() + 1000) };
};

describe('ModelInvocationEvidenceRecorder settlements', () => {
  it("should admit one valid financial fact for the account's owner that joins the provider attempt", async () => {
    const { recorder, admitted, purposes, settled } = setup();

    recorder.recordSettlement(settlement());
    await settled();

    expect(purposes.getAdmissionAuthority).toHaveBeenCalledWith('user-a', 'project-a');
    expect(admitted).toHaveLength(1);
    const [evidence] = admitted;
    expect(evidenceSchema.safeParse(evidence).success).toBe(true);
    await expect(verifyEvidenceDigest(evidence!)).resolves.toBe(true);
    expect(evidence).toMatchObject({
      authority: 'api-reported',
      scope: { principal: 'user-a', project: 'project-a', policyEpoch: 'epoch-a' },
      lineage: [{ protection: 'pro' }],
      payload: {
        plane: 'summary',
        fact: { kind: 'financial', attempt: 'op-1', credits: 2.5, supplierCost: null, currency: 'USD' },
      },
    });
    const provider = await providerAttemptEvidence(
      {
        principal: 'user-a',
        project: 'project-a',
        attemptKey: 'attempt with spaces',
        chat: 'chat-a',
        surface: 'gateway',
        wire: 'anthropic',
        requestedModel: undefined,
        provider: undefined,
        operation: 'op-1',
        startedAt: Date.now(),
        duration: 1,
        stream: undefined,
        ended: 'completed',
      },
      { policyEpoch: 'epoch-a', protection: 'pro' },
    );
    expect(evidence!.run).toBe(provider.run);
    expect(evidence!.execution.attempt).toBe(provider.execution.attempt);
    expect(provider.payload.plane === 'summary' && provider.payload.fact.kind === 'provider').toBe(true);
    expect(provider.payload.plane === 'summary' ? Reflect.get(provider.payload.fact, 'billing') : undefined).toBe(
      'op-1',
    );
  });

  it('should admit nothing without a project, an active owner or the summary purpose', async () => {
    const unscoped = setup();
    const unbound = setup({ owners: [] });
    const refused = setup({ allowed: false });

    unscoped.recorder.recordSettlement(settlement({ projectHint: null }));
    unbound.recorder.recordSettlement(settlement());
    refused.recorder.recordSettlement(settlement());
    await Promise.all([unscoped.settled(), unbound.settled(), refused.settled()]);

    expect([...unscoped.admitted, ...unbound.admitted, ...refused.admitted]).toEqual([]);
    expect(unscoped.recorder.outcomes()).toEqual({ unscoped: 1 });
    expect(unbound.recorder.outcomes()).toEqual({ unbound: 1 });
    expect(refused.recorder.outcomes()).toEqual({ 'not-permitted': 1 });
  });
});
