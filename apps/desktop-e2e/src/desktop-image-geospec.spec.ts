import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { afterEach, expect, test } from 'vitest';
import { validateGlbData } from '@taucad/runtime-testing';
import { z } from 'zod';
import { testModelOutputSchema } from '@taucad/chat/schemas/tools/test-model';
import type { NativeGeoSpecReport } from '@taucad/chat/schemas/tools/test-model';
import { createGeoSpecAssertionClient, GeoSpecAssertionError } from 'geospec/assertion-client';
import type { GeoSpecCanonicalClaimReport } from 'geospec/assertion-client';
import { createGeoSpecNativeModelLoader } from 'geospec/runner/native';

import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import {
  failedGatewayToolResults,
  gatewayFixtureFinalText,
  gatewayFixtureModelName,
  gatewayToolResults,
  startGatewayFixture,
} from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { geometryHostEvents, observeGeometryHost, restoreGeometryHost } from '#support/geometry-host-observation.js';
import type { GeometryHostEvent } from '#support/geometry-host-observation.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  connectPickedFolder,
  expectCount,
  expectSignedIn,
  expectVisible,
  selectChatModel,
  selectKernel,
  submitPrompt,
} from '#support/scenario.js';

const solidSource = `import { drawCircle } from 'replicad';
export default function main() {
  return drawCircle(10).sketchOnPlane().extrude(10);
}
`;
const disableCredentialPersistenceVariable = 'TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE';
const drawingSource = `import { draw } from 'replicad';
export default function main() {
  return draw().hLine(24).vLine(18).hLine(-24).close();
}
`;
const geoSpecSource = `import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('packaged desktop geometry', () => {
  it('keeps the cylinder watertight', async () => {
    const model = await loadModel({ file: 'main.ts', format: 'glb' });
    expectGeo(model).toBeWatertight();
  });

  it('reports an intentionally impossible volume', async () => {
    const model = await loadModel({ file: 'main.ts', format: 'glb' });
    expectGeo(model).toHaveVolume({ value: 1, tolerance: 0 });
  });
});
`;

let session: DesktopSession | undefined;
let fixture: GatewayFixture | undefined;
let seededEmail: string | undefined;

afterEach(async () => {
  await session?.close();
  session = undefined;
  await fixture?.close();
  fixture = undefined;
  if (seededEmail) {
    await deleteTauTestUser(seededEmail);
    seededEmail = undefined;
  }
});

test('[completed-artifact] captures SVG and GLB geometry and reports GeoSpec pass and failure evidence', async () => {
  const account = tauTestAccount('image-geospec');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  fixture = await startGatewayFixture({
    toolCalls: [
      { name: 'create_file', input: { targetFile: 'main.ts', content: solidSource } },
      { name: 'create_file', input: { targetFile: 'drawing.ts', content: drawingSource } },
      { name: 'create_file', input: { targetFile: 'checks.geospec.ts', content: geoSpecSource } },
      { name: 'evaluate_model', input: { targetFile: 'main.ts' } },
      { name: 'evaluate_model', input: { targetFile: 'drawing.ts' } },
      { name: 'export_model', input: { targetFile: 'main.ts', to: 'glb' } },
      { name: 'screenshot', input: { targetFile: 'main.ts', mode: 'single' } },
      { name: 'screenshot', input: { targetFile: 'drawing.ts', mode: 'single' } },
      { name: 'test_model', input: { files: ['checks.geospec.ts'] } },
    ],
  });
  session = await launchDesktopApp({
    packaged: true,
    token,
    env: {
      [disableCredentialPersistenceVariable]: '1',
    },
  });
  await session.page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
  });
  await session.page.reload({ waitUntil: 'domcontentloaded' });
  await fixture.routeThrough(session.page);

  const { page } = session;
  try {
    expect(await page.evaluate(() => (navigator as Navigator & { gpu?: unknown }).gpu)).toBeUndefined();
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await authenticatePackagedDesktop(session, token);
    await expectSignedIn(page);
    await selectKernel(page, 'Replicad');
    await connectPickedFolder(session);
    await selectChatModel(page, gatewayFixtureModelName);
    const slug = await submitPrompt(page, 'Create and verify the packaged image capture fixtures.');

    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 600_000);
    const failedTools = failedGatewayToolResults(fixture.gatewayRequests.slice(-1));
    if (failedTools.length > 0) {
      throw new Error(`Packaged agent tools failed: ${failedTools.join('\n')}`);
    }
    const screenshotActivities = page.getByRole('button', { name: 'Captured images', exact: true });
    for (const activity of await screenshotActivities.all()) {
      // oxlint-disable-next-line no-await-in-loop -- Each disclosure must open before its child result is queried.
      await activity.click();
    }
    const glbCapture = page.getByRole('button', { name: /Captured 1 screenshot of main\.ts/u });
    const svgCapture = page.getByRole('button', { name: /Captured 1 screenshot of drawing\.ts/u });
    await expectVisible(glbCapture);
    await expectVisible(svgCapture);
    await glbCapture.click();
    await svgCapture.click();
    const isometricCapture = page.getByRole('img', { name: 'isometric view' });
    const drawingCapture = page.getByRole('img', { name: 'drawing view' });
    await expectCount(isometricCapture, 1);
    await expectCount(drawingCapture, 1);
    expect(
      await isometricCapture.or(drawingCapture).evaluateAll((images) =>
        images.every((image) => {
          const element = image as HTMLImageElement;
          return (
            element.complete &&
            element.naturalWidth >= 32 &&
            element.naturalHeight >= 32 &&
            element.currentSrc.length > 100
          );
        }),
      ),
    ).toBe(true);
    await page.getByRole('button', { name: 'Ran tests', exact: true }).click();
    await expectVisible(page.getByText('Tested 2 requirements', { exact: true }), 300_000);
    const results = page.locator('[data-target-file="checks.geospec.ts"]');
    const passingRequirement = results.getByText(/keeps the cylinder watertight$/u);
    const failingRequirement = results.getByText(/reports an intentionally impossible volume$/u);
    await expectVisible(passingRequirement);
    await expectVisible(failingRequirement);
    await expectCount(
      passingRequirement.locator('xpath=ancestor::div[contains(@class, "items-start")][1]').locator('.lucide-check'),
      1,
    );
    await expectCount(
      failingRequirement.locator('xpath=ancestor::div[contains(@class, "items-start")][1]').locator('.lucide-x'),
      1,
    );
    await expectCount(page.getByText(/Volume is .*does not satisfy 1 within 0\./u), 1);
    expect(fixture.gatewayRequests.length).toBeGreaterThanOrEqual(10);
    const projectRoot = join(session.pickedDirectory, slug);
    const projectEntries = await readdir(projectRoot, { recursive: true });
    const exportedGlb = projectEntries.map(String).find((entry) => /^\.tau\/artifacts\/.+\.glb$/u.test(entry));
    if (!exportedGlb) {
      throw new Error('export_model did not persist a GLB under .tau/artifacts.');
    }
    validateGlbData(new Uint8Array(await readFile(join(projectRoot, exportedGlb))));
    const offeredToolNames = fixture.gatewayRequests.flatMap((request) => {
      const tools = (request as { readonly tools?: ReadonlyArray<{ readonly name?: unknown }> }).tools ?? [];
      return tools.flatMap((tool) => (typeof tool.name === 'string' ? [tool.name] : []));
    });
    expect(offeredToolNames).toEqual(
      expect.arrayContaining(['evaluate_model', 'export_model', 'screenshot', 'test_model']),
    );
    const gatewayRequestCount = fixture.gatewayRequests.length;

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 120_000);
    const replayedScreenshotActivities = page.getByRole('button', { name: 'Captured images', exact: true });
    for (const activity of await replayedScreenshotActivities.all()) {
      // oxlint-disable-next-line no-await-in-loop -- Each disclosure must open before its child result is queried.
      await activity.click();
    }
    await expectVisible(page.getByRole('button', { name: /Captured 1 screenshot of main\.ts/u }));
    await expectVisible(page.getByRole('button', { name: /Captured 1 screenshot of drawing\.ts/u }));
    await page.getByRole('button', { name: 'Ran tests', exact: true }).click();
    const replayedResults = page.locator('[data-target-file="checks.geospec.ts"]');
    await expectVisible(replayedResults.getByText(/keeps the cylinder watertight$/u));
    await expectVisible(replayedResults.getByText(/reports an intentionally impossible volume$/u));
    expect(fixture.gatewayRequests).toHaveLength(gatewayRequestCount);
  } catch (error) {
    await session.capture('image-geospec-packaged-failure');
    throw error;
  }
});

const canonicalChatReport = (report: GeoSpecCanonicalClaimReport): NativeGeoSpecReport => ({
  claimId: report.claimId,
  status: report.status,
  polarity: report.polarity,
  claim: { ...report.claim },
  result: { ...report.result },
  diagnostics: [...report.diagnostics],
  canonical: {
    claim: [...report.canonicalClaim],
    plan: [...report.canonicalPlan],
    result: [...report.canonicalResult],
  },
  ...(report.evidence === undefined ? {} : { evidence: report.evidence }),
});

// Reuse the accepted 10 × 20 × 30 mm C2 box bytes in the actual chat VM.
const nativeFixtureHash = '1321806f5b10c87126bece80cee96cf867c6c131db655a9f28558a39a086616d';

test('[native-geospec] compares fixed-fixture reports through packaged chat and the native API', async () => {
  const fixtureBytes = await readFile(
    new URL(`../../../packages/geospec/host-tests/fixtures/data/${nativeFixtureHash}`, import.meta.url),
  );
  expect(createHash('sha256').update(fixtureBytes).digest('hex')).toBe(nativeFixtureHash);
  const nativeSource = `import { it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';
const bytes = new Uint8Array(${JSON.stringify([...fixtureBytes])});
it('accepts the fixed box volume', async () => {
  const model = await loadModel({ source: bytes, format: 'glb', sourceUnit: 'mm' });
  expectGeo(model).toHaveVolume({ value: 6000, tolerance: 0.000001 });
});
it('rejects the impossible fixed box volume', async () => {
  const model = await loadModel({ source: bytes, format: 'glb', sourceUnit: 'mm' });
  expectGeo(model).toHaveVolume({ value: 1, tolerance: 0 });
});
it('accepts the project Runtime mesh', async () => {
  const model = await loadModel({ file: 'main.ts', format: 'glb' });
  expectGeo(model).toBeWatertight();
});
`;
  const evidenceRoot = new URL(
    `../../../out/test-results/desktop-e2e/native-geospec-${randomUUID()}/`,
    import.meta.url,
  );
  await mkdir(evidenceRoot, { recursive: true });
  const apiReports: NativeGeoSpecReport[] = [];
  let apiSubjectHash: string | undefined;
  let fullTestModelOutput: z.infer<typeof testModelOutputSchema> | undefined;
  let testModelCallId: string | undefined;
  let durableEventsPath: string | undefined;
  let apiReleased = false;
  let apiClosed = false;
  let observationAttempted = false;
  let bodyFailure: PromiseRejectedResult | undefined;
  let observation: PromiseSettledResult<readonly GeometryHostEvent[]> | undefined;
  let evidenceWrite: PromiseSettledResult<void> | undefined;
  let observationCleanup: PromiseSettledResult<void> | undefined;
  try {
    const account = tauTestAccount('native-geospec');
    seededEmail = account.email;
    const token = await seedTauTestUser(account);
    fixture = await startGatewayFixture({
      toolCalls: [
        { name: 'create_file', input: { targetFile: 'main.ts', content: solidSource } },
        { name: 'create_file', input: { targetFile: 'native.geospec.ts', content: nativeSource } },
        { name: 'test_model', input: { files: ['native.geospec.ts'] } },
      ],
    });
    session = await launchDesktopApp({ packaged: true, token, env: { [disableCredentialPersistenceVariable]: '1' } });
    observationAttempted = true;
    await observeGeometryHost(session);
    await session.page.addInitScript(() => {
      localStorage.setItem('tau:flags', JSON.stringify({ nativeGeoSpec: false }));
    });
    await session.page.reload({ waitUntil: 'domcontentloaded' });
    await fixture.routeThrough(session.page);
    const { page } = session;
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await authenticatePackagedDesktop(session, token);
    await expectSignedIn(page);
    expect(await page.evaluate(() => localStorage.getItem('tau:flags'))).toBe(JSON.stringify({ nativeGeoSpec: false }));
    await selectKernel(page, 'Replicad');
    await connectPickedFolder(session);
    await selectChatModel(page, gatewayFixtureModelName);
    const slug = await submitPrompt(
      page,
      'Run the native GeoSpec checks and report both the valid and impossible volumes.',
    );
    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 600_000);
    const results = gatewayToolResults(fixture.gatewayRequests.slice(-1));
    expect(results).toHaveLength(3);
    expect(results.some((result) => result.isError)).toBe(false);
    const outputs = results.flatMap(({ text }) => {
      const parsed = testModelOutputSchema.omit({ passes: true }).safeParse(JSON.parse(text));
      return parsed.success ? [parsed.data] : [];
    });
    expect(outputs).toHaveLength(1);
    const output = outputs[0]!;
    expect(output.fullResult).toBeDefined();
    const artifact = output.fullResult!;
    const retainedBytes = await readFile(join(session.pickedDirectory, slug, artifact.path));
    expect(retainedBytes.byteLength).toBe(artifact.byteLength);
    expect(createHash('sha256').update(retainedBytes).digest('hex')).toBe(artifact.sha256);
    const retained = testModelOutputSchema.parse(JSON.parse(retainedBytes.toString('utf8')));
    expect(retained).toMatchObject({ passed: 2, total: 3 });
    expect(output).toMatchObject({ passed: 2, total: 3 });
    expect(output.accounting).toEqual(retained.accounting);
    expect(retained.accounting).toEqual({
      discovered: 3,
      selected: 3,
      completed: 3,
      passed: 2,
      failed: 1,
      unsupported: 0,
      inconclusive: 0,
      skipped: 0,
      notRun: 0,
      requestedFiles: ['native.geospec.ts'],
      completedFiles: ['native.geospec.ts'],
      notRunFiles: [],
      discoveryComplete: true,
      cancelled: false,
      bailed: false,
    });
    expect(retained).toMatchObject({ runStatus: 'failed', lineageStatus: 'complete' });
    expect(output).toMatchObject({ runStatus: 'failed', lineageStatus: 'complete' });
    expect(retained.passes.map((row) => row.requirement)).toEqual([
      'accepts the fixed box volume',
      'accepts the project Runtime mesh',
    ]);
    expect(output.failures.map((row) => row.requirement)).toEqual(['rejects the impossible fixed box volume']);
    const native = await import('@taucad/geospec-engine-native/node');
    const engine = new native.Engine();
    const load = createGeoSpecNativeModelLoader({ engine });
    try {
      const subject = await load({ source: Uint8Array.from(fixtureBytes), format: 'glb', sourceUnit: 'mm' });
      apiSubjectHash = subject.subjectHash;
      // The chat's runner selects bounded success evidence, so the API reports compare in that profile.
      const client = createGeoSpecAssertionClient({ engine, evidenceProfile: 'bounded' });
      apiReports.push(
        canonicalChatReport(client.expectGeo(subject).toHaveVolume({ value: 6000, tolerance: 0.000001 })),
      );
      try {
        client.expectGeo(subject).toHaveVolume({ value: 1, tolerance: 0 });
        expect.fail('The independent 6000 mm^3 box must fail a 1 mm^3 volume assertion.');
      } catch (error) {
        if (!(error instanceof GeoSpecAssertionError)) {
          throw error;
        }
        expect(error.name).toBe('GeoSpecAssertionError');
        apiReports.push(canonicalChatReport(error.report));
      }
      expect(apiReports.map((report) => report.status)).toEqual(['passed', 'failed']);
    } finally {
      try {
        await load.releaseAll();
        apiReleased = true;
      } finally {
        engine.close();
        apiClosed = true;
      }
    }
    const rows = [retained.passes[0]!, retained.failures[0]!, retained.passes[1]!];
    expect(output.failures.map((row) => row.reports![0])).toEqual(
      retained.failures.map((row) => {
        const { canonical: _canonical, ...report } = row.reports![0]!;
        return report;
      }),
    );
    const { loads } = retained.lineage!.find((file) => file.file === 'native.geospec.ts')!.lineage;
    const reportLoadIds = rows.map((row) => row.reports![0]!.loadId);
    expect(reportLoadIds.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(reportLoadIds).size).toBe(3);
    for (const [index, id] of reportLoadIds.entries()) {
      const matching = loads.filter((load) => load.loadId === id);
      expect(matching).toHaveLength(1);
      expect(matching[0]!.subject?.subjectHash).toMatch(/^[\da-f]{64}$/u);
      const { artifacts } = matching[0]!.evidence!;
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0]!.sha256).toMatch(/^[\da-f]{64}$/u);
      expect(artifacts[0]!.byteLength).toBeGreaterThan(0);
      if (index < 2) {
        expect(matching[0]!.subject?.subjectHash).toBe(apiSubjectHash);
        expect(artifacts[0]!.sha256).toBe(nativeFixtureHash);
        expect(artifacts[0]!.byteLength).toBe(fixtureBytes.byteLength);
      } else {
        expect(matching[0]!.subject?.subjectHash).not.toBe(apiSubjectHash);
        expect(artifacts[0]!.sha256).not.toBe(nativeFixtureHash);
      }
    }
    for (const [index, row] of rows.entries()) {
      expect(row.targetFile).toBe('native.geospec.ts');
      expect(row.reports).toHaveLength(1);
      const report = row.reports![0]!;
      expect(report.claimId).toBe(`geospec-claim-${index + 1}`);
      expect(report.status).toBe(index === 1 ? 'failed' : 'passed');
      expect(report.polarity).toBe('positive');
      expect(report.result).toMatchObject({ claimId: report.claimId, status: report.status });
    }
    expect(
      rows.slice(0, 2).map((row) => {
        const { loadId: _loadId, ...report } = row.reports![0]!;
        return report;
      }),
    ).toEqual(apiReports);
    // Equal verdicts on another subject must not pass: each report names the source bytes it measured.
    const measuredSubjects = rows.map(
      (row) =>
        z.object({ evidence: z.object({ subjectContentHash: z.string() }) }).parse(row.reports![0]!.result).evidence
          .subjectContentHash,
    );
    expect(measuredSubjects.slice(0, 2)).toEqual([nativeFixtureHash, nativeFixtureHash]);
    expect(measuredSubjects[2]).not.toBe(nativeFixtureHash);
    expect(reportLoadIds.map((id) => loads.find((load) => load.loadId === id)!.evidence!.artifacts[0]!.sha256)).toEqual(
      measuredSubjects,
    );
    await page.getByRole('button', { name: /^(?:Edited files, )?ran tests$/iu }).click();
    await expectVisible(page.getByText('Tested 3 requirements', { exact: true }));
    await expectVisible(page.getByText('1. rejects the impossible fixed box volume', { exact: true }));
    await expectVisible(page.getByText('1. accepts the fixed box volume', { exact: true }));
    await expectVisible(page.getByText('2. accepts the project Runtime mesh', { exact: true }));
    const requestCount = fixture.gatewayRequests.length;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 120_000);
    expect(fixture.gatewayRequests).toHaveLength(requestCount);
  } catch (error) {
    bodyFailure = { status: 'rejected', reason: error };
    await Promise.allSettled([session?.capture('native-geospec-failure')]);
  } finally {
    if (observationAttempted && session) {
      [observation] = await Promise.allSettled([geometryHostEvents(session)]);
    }
    [evidenceWrite] = await Promise.allSettled([
      Promise.resolve().then(async () =>
        writeFile(
          new URL('native-chat-native.json', evidenceRoot),
          JSON.stringify(
            {
              profile: 'native',
              fixtureSha256: nativeFixtureHash,
              fixtureBase64: fixtureBytes.toString('base64'),
              nativeSource,
              runtimeSource: solidSource,
              requests: fixture?.gatewayRequests ?? [],
              fullTestModelOutput,
              testModelCallId,
              durableEventsPath,
              apiSubjectHash,
              apiReports,
              apiReleased,
              apiClosed,
              geometryEvents: observation?.status === 'fulfilled' ? observation.value : [],
              geometryObservationReadFailed: observation?.status === 'rejected',
              limitations: [
                'Runtime row has independent verdict coverage; finalized export bytes are not exposed. Fixed fixture rows require exact report equality with a bounded-profile API client, the profile the chat runner selects.',
              ],
            },
            null,
            2,
          ),
        ),
      ),
    ]);
    if (observationAttempted && session) {
      [observationCleanup] = await Promise.allSettled([restoreGeometryHost(session)]);
    }
  }
  if (bodyFailure?.status === 'rejected') {
    const error: unknown = bodyFailure.reason;
    throw error;
  }
  if (observation?.status === 'rejected') {
    const error: unknown = observation.reason;
    throw error;
  }
  if (evidenceWrite.status === 'rejected') {
    const error: unknown = evidenceWrite.reason;
    throw error;
  }
  if (observationCleanup?.status === 'rejected') {
    const error: unknown = observationCleanup.reason;
    throw error;
  }
});
