import { describe, expect, it, vi } from 'vitest';
import { expectGeo, geoSpecMatcherNames } from 'geospec';
import { createModelLoader } from 'geospec/model';
import { GeoSpecAssertionError } from 'geospec/assertion-client';
import { createCollector } from '#runner/collector.js';
import type { GeoSpecNativeModelEngine } from '#model/native-model-loader.js';

const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));
const engine = () => {
  const releaseSubject = vi.fn(() => encode({ result: {} }));
  const evaluateClaim = vi.fn((request: Uint8Array<ArrayBuffer>) => {
    const { plan } = JSON.parse(new TextDecoder().decode(request)) as {
      plan: {
        claims: Array<{ claimId: string; polarity: string; payload: { arguments?: Array<{ value?: number }> } }>;
      };
    };
    const claim = plan.claims[0]!;
    const positiveSatisfied = claim.payload.arguments?.[0]?.value !== 0;
    const passed = positiveSatisfied === (claim.polarity === 'positive');
    return {
      canonicalClaim: encode(claim),
      canonicalPlan: encode(plan),
      canonicalResult: encode({
        results: [
          {
            claimId: claim.claimId,
            status: passed ? 'passed' : 'failed',
            diagnostics: passed
              ? []
              : [{ code: 'VOLUME_MISMATCH', severity: 'error', message: 'Expected volume differs.' }],
            evidence: { positiveSatisfied },
          },
        ],
      }),
    };
  });
  const host: GeoSpecNativeModelEngine = {
    ingestSubject: () => encode({ result: { subject: { subjectHash: 'a'.repeat(64) } } }),
    subjectHandle: () => encode({ result: { subjectHandle: { subjectHash: 'a'.repeat(64), generation: 1 } } }),
    releaseSubject,
    evaluateClaim,
    processRequest: () =>
      encode({
        requestId: 'configuration',
        result: {
          canonicalProfile: 'geospec-jcs-v1',
          protocolVersion: 3,
          registryVersion: 5,
          configuration: { configurationProfile: 'geospec-entry-config-v1', defaultWorkUnitBudget: 10_000 },
        },
      }),
  };
  return { host, releaseSubject, evaluateClaim };
};

describe('canonical model admission', () => {
  it('should complete bare and awaited assertions, preserve polarity and reject expired or forged subjects', async () => {
    const fixture = engine();
    const loadModel = createModelLoader({ engine: fixture.host });
    const subject = await loadModel({ source: Uint8Array.of(1), format: 'glb' });
    try {
      expect(Object.keys(subject)).toEqual([]);
      expect(geoSpecMatcherNames).toHaveLength(26);
      expect(expectGeo(subject).toHaveVolume({ value: 1 })).toMatchObject({
        passed: true,
        report: { status: 'passed' },
      });
      // oxlint-disable-next-line typescript/await-thenable -- Preserve unchanged authored await syntax over the completed synchronous result.
      expect(await expectGeo(subject).not.toHaveVolume({ value: 0 })).toMatchObject({
        passed: true,
        report: { polarity: 'negative' },
      });
      expect(() => expectGeo(subject).toHaveVolume({ value: 0 })).toThrow(GeoSpecAssertionError);
      // @ts-expect-error -- Exercise the public trust boundary with forged hash identity.
      expect(() => expectGeo({ subjectHash: 'a'.repeat(64) })).toThrow('not admitted');
      const chain = expectGeo(subject);
      await loadModel.dispose();
      expect(() => chain.toBeWatertight()).toThrow('not admitted');
      expect(() => expectGeo(subject)).toThrow('not admitted');
      expect(fixture.releaseSubject).toHaveBeenCalledOnce();
    } finally {
      await loadModel.dispose();
    }
  });

  it('should retain caught VM failures, complete all assertions and project only subject identity', async () => {
    const fixture = engine();
    const loadModel = createModelLoader({ engine: fixture.host });
    const subject = await loadModel({ source: Uint8Array.of(1) });
    const collector = createCollector({ nativeAssertions: { engine: fixture.host, workUnitLimit: 10_000 } });
    try {
      collector.it('caught failure', () => {
        try {
          collector.expectGeo(subject).toHaveVolume({ value: 0 });
        } catch {
          /* The recorded geometry still fails. */
        }
      });
      collector.it('bare success', () => {
        collector.expectGeo(subject).toBeWatertight();
      });
      await collector.waitForCompletion();
      expect(collector.tests.map(({ status }) => status)).toEqual(['failed', 'passed']);
      expect(collector.tests[1]?.assertions[0]).toMatchObject({
        subject: { subjectHash: 'a'.repeat(64) },
        passed: true,
        report: { status: 'passed' },
      });
    } finally {
      await loadModel.dispose();
    }
  });

  it('should reject a subject from another admitted engine before evaluating geometry', async () => {
    const fixture = engine();
    const other = engine();
    const loadModel = createModelLoader({ engine: fixture.host });
    const subject = await loadModel({ source: Uint8Array.of(1) });
    const collector = createCollector({ nativeAssertions: { engine: other.host, workUnitLimit: 10_000 } });
    try {
      collector.it('wrong owner', () => {
        try {
          collector.expectGeo(subject).toBeWatertight();
        } catch {
          /* Intentionally caught: recorded ownership failure must remain. */
        }
      });
      await collector.waitForCompletion();
      expect(collector.tests[0]?.status).toBe('failed');
      expect(other.evaluateClaim).not.toHaveBeenCalled();
    } finally {
      await loadModel.dispose();
    }
  });

  it('should retain a caught engine exception as a failed VM assertion without changing the thrown identity', async () => {
    const fixture = engine();
    const failure = new Error('engine interrupted');
    fixture.evaluateClaim.mockImplementation(() => {
      throw failure;
    });
    const loadModel = createModelLoader({ engine: fixture.host });
    const subject = await loadModel({ source: Uint8Array.of(1) });
    const collector = createCollector({ nativeAssertions: { engine: fixture.host, workUnitLimit: 10_000 } });
    try {
      collector.it('caught infrastructure failure', () => {
        expect(() => collector.expectGeo(subject).not.toBeWatertight()).toThrow(failure);
      });
      await collector.waitForCompletion();
      expect(collector.tests[0]?.status).toBe('failed');
      expect(collector.tests[0]?.assertions[0]).toMatchObject({
        passed: false,
        subject: { subjectHash: 'a'.repeat(64) },
      });
    } finally {
      await loadModel.dispose();
    }
  });
});
