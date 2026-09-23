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
  startGatewayFixture,
} from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
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
      { name: 'get_kernel_result', input: { targetFile: 'main.ts' } },
      { name: 'get_kernel_result', input: { targetFile: 'drawing.ts' } },
      { name: 'export_geometry', input: { targetFile: 'main.ts', format: 'glb' } },
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
    const screenshotActivities = page.getByRole('button', { name: 'Explored 1 screenshot', exact: true });
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
    await page.getByRole('button', { name: 'Explored 2 tests', exact: true }).click();
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
      throw new Error('export_geometry did not persist a GLB under .tau/artifacts.');
    }
    validateGlbData(new Uint8Array(await readFile(join(projectRoot, exportedGlb))));
    const offeredToolNames = fixture.gatewayRequests.flatMap((request) => {
      const tools = (request as { readonly tools?: ReadonlyArray<{ readonly name?: unknown }> }).tools ?? [];
      return tools.flatMap((tool) => (typeof tool.name === 'string' ? [tool.name] : []));
    });
    expect(offeredToolNames).toEqual(
      expect.arrayContaining(['get_kernel_result', 'export_geometry', 'screenshot', 'test_model']),
    );
    const gatewayRequestCount = fixture.gatewayRequests.length;

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 120_000);
    const replayedScreenshotActivities = page.getByRole('button', { name: 'Explored 1 screenshot', exact: true });
    for (const activity of await replayedScreenshotActivities.all()) {
      // oxlint-disable-next-line no-await-in-loop -- Each disclosure must open before its child result is queried.
      await activity.click();
    }
    await expectVisible(page.getByRole('button', { name: /Captured 1 screenshot of main\.ts/u }));
    await expectVisible(page.getByRole('button', { name: /Captured 1 screenshot of drawing\.ts/u }));
    await page.getByRole('button', { name: 'Explored 2 tests', exact: true }).click();
    const replayedResults = page.locator('[data-target-file="checks.geospec.ts"]');
    await expectVisible(replayedResults.getByText(/keeps the cylinder watertight$/u));
    await expectVisible(replayedResults.getByText(/reports an intentionally impossible volume$/u));
    expect(fixture.gatewayRequests).toHaveLength(gatewayRequestCount);
  } catch (error) {
    await session.capture('image-geospec-packaged-failure');
    throw error;
  }
});

const canonicalChatReport = (report: GeoSpecCanonicalClaimReport): NativeGeoSpecReport => {
  const encode = (bytes: Uint8Array<ArrayBuffer>): string => Buffer.from(bytes).toString('base64');
  return {
    claimId: report.claimId,
    status: report.status,
    polarity: report.polarity,
    claim: { ...report.claim },
    result: { ...report.result },
    diagnostics: [...report.diagnostics],
    ...(report.evidence === undefined ? {} : { evidence: report.evidence }),
    canonicalClaimBase64: encode(report.canonicalClaim),
    canonicalPlanBase64: encode(report.canonicalPlan),
    canonicalResultBase64: encode(report.canonicalResult),
  };
};

// Reuse the accepted 10 × 20 × 30 mm C2 box bytes in the actual chat VM.
const nativeFixtureHash = '1321806f5b10c87126bece80cee96cf867c6c131db655a9f28558a39a086616d';

test('[native-geospec] compares fixed-fixture reports through packaged chat and the native API', async () => {
  const fixtureBytes = await readFile(
    new URL(`../../../packages/geospec/host-tests/fixtures/data/${nativeFixtureHash}`, import.meta.url),
  );
  expect(createHash('sha256').update(fixtureBytes).digest('hex')).toBe(nativeFixtureHash);
  const nativeSource = `import { it, expectNativeGeo } from 'geospec';
import { loadNativeModel } from 'geospec/runner/native';
const bytes = new Uint8Array(${JSON.stringify([...fixtureBytes])});
it('accepts the fixed box volume', async () => {
  const model = await loadNativeModel({ source: bytes, format: 'glb', sourceUnit: 'mm' });
  await expectNativeGeo(model).toHaveVolume({ value: 6000, tolerance: 0.000001 });
});
it('rejects the impossible fixed box volume', async () => {
  const model = await loadNativeModel({ source: bytes, format: 'glb', sourceUnit: 'mm' });
  await expectNativeGeo(model).toHaveVolume({ value: 1, tolerance: 0 });
});
it('accepts the project Runtime mesh', async () => {
  const model = await loadNativeModel({ file: 'main.ts', format: 'glb' });
  await expectNativeGeo(model).toBeWatertight();
});
`;
  const evidenceRoot = new URL(
    `../../../out/test-results/desktop-e2e/native-geospec-${randomUUID()}/`,
    import.meta.url,
  );
  await mkdir(evidenceRoot, { recursive: true });
  const apiReports: NativeGeoSpecReport[] = [];
  let apiSubjectHash: string | undefined;
  let apiReleased = false;
  let apiClosed = false;
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
    await session.page.addInitScript(() => {
      localStorage.setItem('tau:flags', JSON.stringify({ nativeGeoSpec: true }));
    });
    await session.page.reload({ waitUntil: 'domcontentloaded' });
    await fixture.routeThrough(session.page);
    const { page } = session;
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await authenticatePackagedDesktop(session, token);
    await expectSignedIn(page);
    expect(await page.evaluate(() => localStorage.getItem('tau:flags'))).toBe(JSON.stringify({ nativeGeoSpec: true }));
    await selectKernel(page, 'Replicad');
    await connectPickedFolder(session);
    await selectChatModel(page, gatewayFixtureModelName);
    await submitPrompt(page, 'Run the native GeoSpec checks and report both the valid and impossible volumes.');
    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 600_000);
    const results = gatewayToolResults(fixture.gatewayRequests.slice(-1));
    expect(results).toHaveLength(3);
    expect(results.some((result) => result.is_error === true)).toBe(false);
    const outputs = results.flatMap(({ content }) => {
      const wire = z
        .union([z.string(), z.array(z.object({ type: z.literal('text'), text: z.string() }))])
        .parse(content);
      const text = typeof wire === 'string' ? wire : wire.map((part) => part.text).join('');
      const parsed = testModelOutputSchema.safeParse(JSON.parse(text));
      return parsed.success ? [parsed.data] : [];
    });
    expect(outputs).toHaveLength(1);
    const output = outputs[0]!;
    expect(output).toMatchObject({ passed: 2, total: 3 });
    expect(output.passes.map((row) => row.requirement)).toEqual([
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
      const client = createGeoSpecAssertionClient({ engine, canonicalize: native.canonicalize });
      apiReports.push(
        canonicalChatReport(await client.expectGeo(subject).toHaveVolume({ value: 6000, tolerance: 0.000001 })),
      );
      try {
        await client.expectGeo(subject).toHaveVolume({ value: 1, tolerance: 0 });
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
    const rows = [output.passes[0]!, output.failures[0]!, output.passes[1]!];
    const subjects: string[] = [];
    for (const [index, row] of rows.entries()) {
      expect(row.targetFile).toBe('native.geospec.ts');
      expect(row.reports).toHaveLength(1);
      const report = row.reports![0]!;
      expect(report.claimId).toBe(`geospec-claim-${index + 1}`);
      expect(report.status).toBe(index === 1 ? 'failed' : 'passed');
      expect(report.polarity).toBe('positive');
      const decode = (value: string): unknown => JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
      expect(decode(report.canonicalClaimBase64)).toEqual(report.claim);
      expect(decode(report.canonicalResultBase64)).toMatchObject({ results: [report.result] });
      expect(report.result).toMatchObject({ claimId: report.claimId, status: report.status });
      const plan = z
        .object({
          plan: z.object({
            subjects: z
              .array(z.object({ slot: z.literal('subject'), subjectHash: z.string().regex(/^[0-9a-f]{64}$/u) }))
              .length(1),
            claims: z.array(z.unknown()).length(1),
          }),
        })
        .parse(decode(report.canonicalPlanBase64));
      expect(plan.plan.claims).toEqual([report.claim]);
      subjects.push(plan.plan.subjects[0]!.subjectHash);
    }
    expect(subjects.slice(0, 2)).toEqual([apiSubjectHash, apiSubjectHash]);
    expect(rows.slice(0, 2).map((row) => row.reports![0])).toEqual(apiReports);
    await page.getByRole('button', { name: /^(?:Edited files, )?ran tests$/iu }).click();
    await expectVisible(page.getByText('Tested 3 requirements', { exact: true }));
    await expectVisible(page.getByText('1. rejects the impossible fixed box volume', { exact: true }));
    const requestCount = fixture.gatewayRequests.length;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 120_000);
    expect(fixture.gatewayRequests).toHaveLength(requestCount);
  } catch (error) {
    await session?.capture('native-geospec-failure');
    throw error;
  } finally {
    await writeFile(
      new URL('native-chat-native.json', evidenceRoot),
      JSON.stringify(
        {
          profile: 'native',
          fixtureSha256: nativeFixtureHash,
          fixtureBase64: fixtureBytes.toString('base64'),
          nativeSource,
          runtimeSource: solidSource,
          requests: fixture?.gatewayRequests ?? [],
          apiSubjectHash,
          apiReports,
          apiReleased,
          apiClosed,
          limitations: [
            'Runtime row has independent verdict coverage; finalized export bytes are not exposed. Fixed fixture rows require exact same-profile API report equality.',
          ],
        },
        null,
        2,
      ),
    );
  }
});
