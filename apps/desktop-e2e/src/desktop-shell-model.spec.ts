import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { validateGlbData, readCoordinateEvidence } from '@taucad/runtime-testing';
import { testModelOutputSchema } from '@taucad/chat/schemas/tools/test-model';
import { shellOutputSchema } from '@taucad/chat/schemas/tools/shell';
import { exportModelOutputSchema } from '@taucad/chat/schemas/tools/export-model';
import { z } from 'zod';
import { launchDesktopApp } from '#support/desktop-app.js';
import { reportShellDiagnostics } from '#support/shell-qualification.js';
import type { DesktopSession } from '#support/desktop-app.js';
import {
  failedGatewayToolResults,
  gatewayFixtureFinalText,
  gatewayFixtureModelName,
  gatewayToolResults,
  startGatewayFixture,
} from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  activeChatId,
  connectPickedFolder,
  expectLauncher2Turn,
  expectSignedIn,
  expectVisible,
  selectChatModel,
  selectKernel,
  submitPrompt,
} from '#support/scenario.js';

const modelSource = 'cube([10, 10, 10]);\n';
const execFileAsync = promisify(execFile);
const finalizedSchema = z
  .object({
    type: z.literal('turn.finalized'),
    turnId: z.string().min(1),
    runId: z.string().min(1),
    revisionId: z.string().regex(/^[a-f0-9]{40}$/u),
    treeId: z.string().regex(/^[a-f0-9]{40}$/u),
    changedPaths: z.array(z.string()),
  })
  .loose();

/** Parse identities from the durable event records, never from a generic visible success label. */
const finalizedTurns = async (path: string): Promise<Array<z.infer<typeof finalizedSchema>>> => {
  const events = await readFile(path, 'utf8');
  return events
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      const event = z.object({ type: z.string() }).loose().parse(JSON.parse(line));
      return event.type === 'turn.finalized' ? [finalizedSchema.parse(event)] : [];
    });
};
const checksSource = `import { it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';
it('matches the shell-authored cube volume', async () => {
  const model = await loadModel({ file: 'main.scad', format: 'glb' });
  expectGeo(model).toHaveVolume({ value: 1000, tolerance: 0.001 });
});
`;

/** The last step the row reached, printed with the turn diagnostics on failure. */
let phase = 'launch';

/**
 * On a failed turn, print how far the scripted model got: the gateway's tool results so far, any typed tool failure,
 * and the desktop log's last warnings and errors. Reporting only; it never changes a verdict.
 */
const reportTurnDiagnostics = async (desktop: DesktopSession, gateway: GatewayFixture | undefined): Promise<void> => {
  const requests = gateway?.gatewayRequests ?? [];
  const log = await readFile(desktop.logPath, 'utf8').catch((error: unknown) => `unreadable: ${String(error)}`);
  const problems = log
    .split('\n')
    .filter((line) => /\b(?:WARN|ERROR|FATAL)\b/u.test(line))
    .slice(-40)
    .map((line) => line.slice(0, 600));
  console.info(
    'TURN DIAGNOSTICS',
    JSON.stringify({
      phase,
      finalTextShown: await desktop.page
        .getByText(gatewayFixtureFinalText, { exact: true })
        .count()
        .catch(() => -1),
      gatewayRequests: requests.length,
      toolResults: gatewayToolResults(requests.slice(-1)).map(({ name, text }) => ({ name, text: text.slice(0, 400) })),
      failedToolResults: failedGatewayToolResults(requests.slice(-1)),
      problems,
    }),
  );
};

let session: DesktopSession | undefined;
let fixture: GatewayFixture | undefined;
let seededEmail: string | undefined;

afterEach(async (context) => {
  if (context.task.result?.state === 'fail' && session) {
    await reportShellDiagnostics(session);
    await reportTurnDiagnostics(session, fixture);
  }
  await session?.close();
  session = undefined;
  await fixture?.close();
  fixture = undefined;
  if (seededEmail) {
    await deleteTauTestUser(seededEmail);
    seededEmail = undefined;
  }
});

it('should evaluate, test, capture and export shell-authored bytes through one real desktop turn', async () => {
  const account = tauTestAccount('shell-model');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  fixture = await startGatewayFixture({
    toolCalls: [
      { name: 'create_file', input: { targetFile: 'main.scad', content: 'cube([5, 5, 5]);\n' } },
      { name: 'create_file', input: { targetFile: 'checks.geospec.ts', content: checksSource } },
      {
        name: 'shell',
        input: { command: "cat > main.scad <<'MODEL'\ncube([10, 10, 10]);\nMODEL\nprintf shell-authored" },
      },
      { name: 'evaluate_model', input: { targetFile: 'main.scad' } },
      { name: 'test_model', input: { files: ['checks.geospec.ts'] } },
      { name: 'screenshot', input: { targetFile: 'main.scad', mode: 'single' } },
      { name: 'export_model', input: { targetFile: 'main.scad', to: 'glb' } },
    ],
  });
  phase = 'launch';
  session = await launchDesktopApp({ token });
  const { page } = session;
  await fixture.routeThrough(page);
  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await expectSignedIn(page);
    await selectKernel(page, 'OpenSCAD');
    await connectPickedFolder(session);
    await selectChatModel(page, gatewayFixtureModelName);
    phase = 'tool results';
    const slug = await submitPrompt(
      page,
      'Use shell to change the cube to 10 mm, evaluate it, test its volume, capture it and export GLB.',
    );
    // Report typed tool failures even when an unavailable result prevents the renderer from showing final text.
    await expect
      .poll(() => gatewayToolResults(fixture!.gatewayRequests.slice(-1)).length, { timeout: 600_000 })
      .toBe(7);
    phase = 'final text';
    expect(failedGatewayToolResults(fixture.gatewayRequests.slice(-1))).toEqual([]);
    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 600_000);
    const root = join(session.pickedDirectory, slug);
    expect(await readFile(join(root, 'main.scad'), 'utf8')).toBe(modelSource);
    await expectLauncher2Turn(session.logPath, root, activeChatId(page));
    expect(failedGatewayToolResults(fixture.gatewayRequests.slice(-1))).toEqual([]);
    const results = gatewayToolResults(fixture.gatewayRequests.slice(-1));
    expect(results.map(({ name }) => name)).toEqual([
      'create_file',
      'create_file',
      'shell',
      'evaluate_model',
      'test_model',
      'screenshot',
      'export_model',
    ]);
    const shell = shellOutputSchema.parse(JSON.parse(results[2]!.text));
    expect(shell).toMatchObject({ status: 'completed', exitCode: 0 });
    expect(results[2]!.text).toContain('shell-authored');
    const tested = testModelOutputSchema.omit({ passes: true }).parse(JSON.parse(results[4]!.text));
    expect(tested).toMatchObject({ passed: 1, total: 1 });
    const exported = exportModelOutputSchema.parse(JSON.parse(results[6]!.text));
    expect(exported.to).toBe('glb');
    expect(exported.files).toHaveLength(1);
    const artifact = exported.files[0]!;
    expect(artifact.artifactPath).toMatch(/^\.tau\/artifacts\/.+\.glb$/u);
    const exportedBytes = new Uint8Array(await readFile(join(root, artifact.artifactPath)));
    expect(exportedBytes.byteLength).toBe(artifact.byteLength);
    validateGlbData(exportedBytes);
    expect(exported.sourceRevision?.files['main.scad']).toBe(
      `sha256:${createHash('sha256').update(modelSource).digest('hex')}`,
    );
    // Decode the named deliverable's geometry independently, not a different GLB found somewhere in the project.
    const geometry = await readCoordinateEvidence({ bytes: exportedBytes });
    // The decoder visits TRIANGLES primitives and records one winding observation per indexed triangle.
    expect(geometry.flatMap(({ winding }) => winding).length).toBeGreaterThan(0);
    const vertices = geometry.flatMap(({ positions }) => positions);
    expect(vertices.length).toBeGreaterThan(0);
    // GLB coordinates are physical metres. The shared decoder applies every node's world transform.
    const sizes = [0, 1, 2].map((axis) => {
      const values = vertices.map((point) => point[axis]!);
      return Math.max(...values) - Math.min(...values);
    });
    for (const size of sizes) {
      expect(size).toBeCloseTo(0.01, 6);
    }
    phase = 'captured image';
    await page.getByRole('button', { name: 'Captured images', exact: true }).click();
    await page.getByRole('button', { name: /Captured 1 screenshot of main\.scad/u }).click();
    const image = page.getByRole('img', { name: 'isometric view', exact: true });
    await expectVisible(image);
    await expect
      .poll(async () =>
        image.evaluate((element) => {
          if (!(element instanceof HTMLImageElement) || !element.complete || element.naturalWidth < 32) {
            return 0;
          }
          const canvas = document.createElement('canvas');
          canvas.width = 32;
          canvas.height = 32;
          const context = canvas.getContext('2d');
          if (!context) {
            return 0;
          }
          context.drawImage(element, 0, 0, 32, 32);
          const pixels = context.getImageData(0, 0, 32, 32).data;
          const colors = new Set<string>();
          for (let index = 0; index < pixels.length; index += 4) {
            colors.add(`${String(pixels[index])},${String(pixels[index + 1])},${String(pixels[index + 2])}`);
          }
          return colors.size;
        }),
      )
      .toBeGreaterThan(4);
    phase = 'revision marker';
    const marker = page.locator('[role="status"][aria-label="Turn revision status"]');
    await expect.poll(async () => marker.allTextContents()).toEqual([expect.stringMatching(/^Rev \d+ saved/u)]);
    const eventsPath = join(root, '.tau/chats', activeChatId(page), 'events.jsonl');
    phase = 'durable settlement';
    const settlements = await finalizedTurns(eventsPath);
    expect(settlements).toHaveLength(1);
    const settlement = settlements[0]!;
    expect(settlement.changedPaths).toContain('main.scad');
    const recordedTree = await execFileAsync('git', ['-C', root, 'rev-parse', `${settlement.revisionId}^{tree}`]);
    expect(recordedTree.stdout.trim()).toBe(settlement.treeId);
    const recordedSource = await execFileAsync('git', ['-C', root, 'show', `${settlement.treeId}:main.scad`]);
    expect(recordedSource.stdout).toBe(modelSource);
    const requests = fixture.gatewayRequests.length;
    await page.reload();
    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }));
    expect(await readFile(join(root, 'main.scad'), 'utf8')).toBe(modelSource);
    expect(await finalizedTurns(eventsPath)).toEqual(settlements);
    const retainedSource = await execFileAsync('git', ['-C', root, 'show', `${settlement.revisionId}:main.scad`]);
    expect(retainedSource.stdout).toBe(modelSource);
    expect(fixture.gatewayRequests).toHaveLength(requests);
  } catch (error) {
    await session.capture('shell-model-failure');
    throw error;
  }
});
