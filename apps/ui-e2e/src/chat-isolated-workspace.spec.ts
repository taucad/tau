import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import { z } from 'zod';
import { base64ToUint8Array } from 'uint8array-extras';
import { testModelOutputSchema } from '@taucad/chat/schemas/tools/test-model';
import type { NativeGeoSpecReport } from '@taucad/chat/schemas/tools/test-model';
import type { GeoSpecCanonicalClaimReport } from 'geospec/assertion-client';
import * as target from '#support/external-target.js';
import {
  cubeCylinderCutoutScript,
  cubeCylinderMainScad,
  cubeCylinderSuccessSentence,
  gatedCubeCylinderCutoutScript,
} from '#support/agent-host-gateway-script.js';
import type { GatewayScriptTurn } from '#support/agent-host-gateway-script.js';
import { placeChatOnNewBranch } from '#support/chat-branch.js';
import { readProjectStorageState, readProjectTree } from '#support/project-storage-state.js';

const prompt = 'Create a cube with a centered cylindrical cutout and verify it.';
const composer = '[aria-label="Ask Tau to build anything..."]';
const currentRevision = () => selectors.getByText('Current', { exact: true });
const filesPane = () => selectors.getByRole('region', { name: /^Files for /u }).first();
const fileTreeItem = (path: string) =>
  filesPane().getByCss(`[data-testid="file-tree-item"][data-file-tree-path="${path}"]`);
const stopButton = () => selectors.getByCss('button:has(svg.lucide-square)').last();
const cookieValue = (value: string): string => encodeURIComponent(JSON.stringify(value));
const waitForComposer = async (): Promise<void> =>
  target.waitFor(() => document.querySelector('[aria-label="Ask Tau to build anything..."]') !== null, null, {
    timeout: 60_000,
  });
const readActiveEditorText = async (): Promise<string> => {
  const lines = selectors.getByCss('.monaco-editor .view-lines').last();
  await target.expectVisible(lines, 30_000);
  const state = await target.read(lines);
  return (state.text ?? '').replaceAll('\u00A0', ' ');
};
const ensureFilesPane = async (): Promise<void> => {
  if (!(await target.isVisible(filesPane()))) {
    await target.click(selectors.getByRole('button', { name: /Search/u }));
    const search = selectors.getByPlaceholder('Search projects, chats, and actions…');
    await target.fill(search, 'Open files');
    await target.click(selectors.getByText('Open files', { exact: true }));
  }
  await target.expectVisible(filesPane(), 15_000);
};
const openAndReadSource = async (): Promise<string> => {
  await ensureFilesPane();
  await target.click(fileTreeItem('main.scad'));
  await target.expectVisible(selectors.getByCss('.dv-tab.dv-active-tab[aria-label="main.scad"]'), 30_000);
  return readActiveEditorText();
};

/**
 * The vertical runs on the browser agent host against the Anthropic-wire
 * gateway fixture, with no API in the stack: the model is the fixture's script,
 * while the kernel, GeoSpec and capture tools run for real.
 *
 * No `tau-chat-model` cookie and no sign-in: the API-side replay model that
 * cookie selected was deleted with the API-side agent loop, and the catalog's
 * own default already speaks a wire the browser host can run. Selecting the
 * replay model here refused the turn outright — `Tau cannot run the tau
 * provider wire in your browser` (`use-cad-agent-config.ts`).
 */
const prepare = async (
  script: readonly GatewayScriptTurn[],
  options?: target.AgentHostGatewayFixtureOptions,
): Promise<void> => {
  await target.installAgentHostGatewayFixture(script, options);
  await target.setViewport({ width: 1440, height: 900 });
  await target.addCookies([
    { domain: 'localhost', name: 'tau-cad-kernel', path: '/', value: cookieValue('openscad') },
    { domain: 'localhost', name: 'tau-cookie-consent', path: '/', value: cookieValue('declined') },
  ]);
};

const createProject = async (name: string): Promise<void> => {
  await target.navigate('/projects/new');
  await target.expectVisible(selectors.getByLabelText('Project Name *'), 60_000);
  await target.fill(selectors.getByLabelText('Project Name *'), name);
  await target.click(selectors.getByRole('button', { name: /Create Project/u }));
  await target.expectUrl(/\/w\/home\/[^/?]+\?chat=[^&]+$/u, 60_000);
  await waitForComposer();
};

const submitPrompt = async (): Promise<void> => {
  await target.type(composer, prompt);
  await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());
  await target.expectVisible(stopButton(), 30_000);
};

const gatewayRequestCount = async (): Promise<number> => {
  const requests = await target.readAgentHostGatewayRequests();
  return requests.length;
};

/**
 * The capture turn: both of the recorded calls, `multi_angle` and `single`, in
 * one response. On a browser with WebGPU the assertion is the pixels — the
 * views are rendered by the shared recipe (`@taucad/agent-tools/capture`)
 * inside the agent-host worker, and the data URLs the tools returned are what
 * the transcript draws. Two render-driven tools in one turn is also what
 * FIX-SCREENSHOT's single-render-slot livelock needed, and six views at once is
 * what FIX-CAPTURE-CONTENT's image-block mapping needed: this turn used to
 * stall the run forever, then to blow the context window
 * (`agent-host-transports-and-offline.md`, both addenda).
 *
 * Playwright's Firefox and WebKit builds have no WebGPU adapter, so there the
 * assertion is the other half of the same contract: a capture that cannot run
 * fails with a typed tool error the transcript shows, and never hangs.
 */
const expectCaptureTurn = async (): Promise<void> => {
  // Not `'gpu' in navigator`: Playwright's Firefox exposes `navigator.gpu` and
  // hands back no adapter, which is the same question the capture itself asks.
  const canCapture = await target.evaluate(async () => {
    const { gpu } = navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } };
    return gpu ? (await gpu.requestAdapter()) !== null : false;
  });
  if (canCapture) {
    await target.click(selectors.getByRole('button', { name: /Captured 6 screenshots/u }).last());
    await target.expectVisible(selectors.getByCss('img[alt="bottom view"]').last(), 60_000);
    await target.click(selectors.getByRole('button', { name: /Captured 1 screenshot/u }).last());
    await target.expectVisible(selectors.getByCss('img[alt="isometric view"]').last(), 60_000);
    /* The other half of the contract, on the wire the fixture recorded: all
     * seven views reached the provider as Anthropic image blocks, and no data
     * URL travelled as JSON text. Stringified they were ~165 000 tokens and the
     * run died in compaction (FIX-CAPTURE-CONTENT addendum). */
    const wire = JSON.stringify(await target.readAgentHostGatewayRequests());
    expect(wire.match(/"media_type":"image\/webp"/gu)).toHaveLength(7);
    expect(wire).not.toContain('dataUrl');
    return;
  }
  await target.expectCount(selectors.getByRole('button', { name: /Attempted screenshot/u }), 2, 60_000);
};

const expectWorkspaceSuccess = async (): Promise<void> => {
  // The whole script ran: one model call per turn, and no more — a seventh
  // would mean the loop wrapped. Polled first so a stalled tool fails here
  // naming the turn it stopped on, not as an opaque text-visibility timeout.
  await expect.poll(gatewayRequestCount, { timeout: 180_000 }).toBe(cubeCylinderCutoutScript.length);
  await target.expectVisible(selectors.getByText(cubeCylinderSuccessSentence, { exact: true }), 60_000);
  await target.expectCount(currentRevision(), 1, 30_000);
  await target.expectCount(selectors.getByText(/ROOT_UNAVAILABLE/u), 0);
  await target.expectCount(selectors.getByText('File not found', { exact: true }), 0);
  await target.expectCount(selectors.getByRole('status', { name: 'Waiting for geometry' }), 0, 60_000);
  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 60_000);

  await target.click(selectors.getByRole('button', { name: /Explored .*render.*test/u }).last());
  await target.click(selectors.getByRole('button', { name: 'Tested 1 requirement' }).last());
  const geospecResult = selectors.getByCss('[data-target-file]').last();
  await target.expectCount(geospecResult, 1);
  const geospecState = await target.read(geospecResult);
  expect(geospecState.text).toContain('should be watertight and have correct dimensions');
  await target.expectCount(geospecResult.getByCss('svg.lucide-check'), 2);

  await expectCaptureTurn();
};

const openAndAssertGeoSpec = async (): Promise<void> => {
  const file = selectors.getByText('main.geospec.ts', { exact: true }).last();
  await target.expectVisible(file, 30_000);
  await target.click(file);
  await target.expectVisible(selectors.getByCss('.dv-tab[aria-label="main.geospec.ts"]'), 30_000);
  await expect.poll(readActiveEditorText, { timeout: 30_000 }).toContain("describe('Cube with cylinder cutout'");
  await expect.poll(readActiveEditorText, { timeout: 30_000 }).toContain('expectGeo(model).toBeWatertight()');
};

test('runs the production chat vertical and publishes exactly one reload-safe revision', async () => {
  await prepare(cubeCylinderCutoutScript);
  await createProject('Tau Isolated Workspace Success');
  await submitPrompt();
  await expectWorkspaceSuccess();
  await openAndAssertGeoSpec();

  await target.reload();
  await waitForComposer();
  await expectWorkspaceSuccess();
  await openAndAssertGeoSpec();
  // A real kernel render, a real GeoSpec run and a reload, twice over: the
  // suite-wide 300 s budget is for a page interaction, not for a CAD vertical.
}, 600_000);

test('discards the isolated workspace when the production chat run is cancelled', async () => {
  // Gated at the kernel turn: both files are written and the run is provably
  // mid-flight when the cancel lands, instead of racing the tools.
  await prepare(gatedCubeCylinderCutoutScript);
  await createProject('Tau Isolated Workspace Cancel');
  const baselineSource = await openAndReadSource();
  const baselineGeoSpecState = await target.read(fileTreeItem('main.geospec.ts'));
  const baselineGeoSpecCount = baselineGeoSpecState.count;
  /* Isolation is opt-in: non-branching is the default (A3) and writes straight
   * into the project folder, so only a chat on a branch of its own has an
   * isolated tree to discard. Placing the chat on that branch from the
   * Revisions pane is what keeps this a test of cancellation rather than of
   * the default path. */
  await placeChatOnNewBranch('isolated-run');
  await submitPrompt();
  await target.expectVisible(selectors.getByText('main.geospec.ts', { exact: true }).first(), 60_000);
  await target.click(stopButton());
  await target.expectCount(stopButton(), 0, 60_000);
  await target.expectCount(currentRevision(), 0);
  expect(await readActiveEditorText()).toBe(baselineSource);
  await target.expectCount(fileTreeItem('main.geospec.ts'), baselineGeoSpecCount);

  await target.reload();
  await waitForComposer();
  await target.expectCount(currentRevision(), 0);
  expect(await openAndReadSource()).toBe(baselineSource);
  await target.expectCount(fileTreeItem('main.geospec.ts'), baselineGeoSpecCount);
  await target.expectCount(selectors.getByText(cubeCylinderSuccessSentence, { exact: true }), 0);
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

// The accepted C2 box is 10 × 20 × 30 mm. Reuse its exact GLB, not a new tessellation.
const nativeFixtureHash = '1321806f5b10c87126bece80cee96cf867c6c131db655a9f28558a39a086616d';

const runCanonicalGeoSpecChat = async (fault?: 'missing' | 'corrupt'): Promise<void> => {
  const fixtureBase64 = await target.commands.readFile(
    `../../packages/geospec/host-tests/fixtures/data/${nativeFixtureHash}`,
    'base64',
  );
  const fixtureBytes = base64ToUint8Array(fixtureBase64);
  const fixtureDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', fixtureBytes));
  expect([...fixtureDigest].map((byte) => byte.toString(16).padStart(2, '0')).join('')).toBe(nativeFixtureHash);
  const nativeSource = `import { it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';
const bytes = new Uint8Array(${JSON.stringify([...fixtureBytes])});
it('accepts the fixed box volume', async () => {
  const model = await loadModel({ source: bytes, format: 'glb', sourceUnit: 'mm' });
  await expectGeo(model).toHaveVolume({ value: 6000, tolerance: 0.000001 });
});
it('rejects the impossible fixed box volume', async () => {
  const model = await loadModel({ source: bytes, format: 'glb', sourceUnit: 'mm' });
  await expectGeo(model).toHaveVolume({ value: 1, tolerance: 0 });
});
it('accepts the project Runtime mesh', async () => {
  const model = await loadModel({ file: 'main.scad', format: 'glb' });
  await expectGeo(model).toBeWatertight();
});
`;
  const finalText = 'Native GeoSpec chat checks completed.';
  const failedText = 'GeoSpec initialization failed; project files remain available.';
  const marker = 'Persisted after failed GeoSpec initialization.\n';
  const script: readonly GatewayScriptTurn[] = [
    {
      toolCalls: [
        { name: 'create_file', args: { targetFile: 'main.scad', content: cubeCylinderMainScad } },
        { name: 'create_file', args: { targetFile: 'native.geospec.ts', content: nativeSource } },
      ],
      usage: { inputTokens: 20, outputTokens: 8 },
    },
    {
      toolCalls: [{ name: 'test_model', args: { files: ['native.geospec.ts'] } }],
      usage: { inputTokens: 20, outputTokens: 8 },
    },
    ...(fault === undefined
      ? []
      : [
          {
            toolCalls: [{ name: 'create_file', args: { targetFile: 'recovery-marker.txt', content: marker } }],
            usage: { inputTokens: 20, outputTokens: 8 },
          },
          { text: failedText, usage: { inputTokens: 20, outputTokens: 8 } },
          {
            toolCalls: [{ name: 'test_model', args: { files: ['native.geospec.ts'] } }],
            usage: { inputTokens: 20, outputTokens: 8 },
          },
        ]),
    { text: finalText, usage: { inputTokens: 20, outputTokens: 8 } },
  ];
  await prepare(script, fault === undefined ? undefined : { geospecFault: fault });
  await target.addInitScript(() => {
    localStorage.setItem('tau:flags', JSON.stringify({ nativeGeoSpec: false }));
  });
  let requests: unknown[] = [];
  const apiReports: NativeGeoSpecReport[] = [];
  let apiSubjectHash: string | undefined;
  let apiReleased = false;
  let apiClosed = false;
  let layoutBeforeClose: string | undefined;
  let acknowledgedLayout: string | undefined;
  let layoutBeforeReload: string | undefined;
  try {
    await createProject('Tau Native GeoSpec Chat');
    expect(await target.evaluate(() => localStorage.getItem('tau:flags'))).toBe(
      JSON.stringify({ nativeGeoSpec: false }),
    );
    await submitPrompt();
    if (fault !== undefined) {
      await target.expectVisible(selectors.getByText(failedText, { exact: true }), 180_000);
      const firstRequests = await target.readAgentHostGatewayRequests();
      expect(firstRequests).toHaveLength(4);
      const { geospecFault, geospecWasm } = await target.events();
      expect(geospecFault).toMatchObject({ kind: fault });
      expect(geospecFault!.requests).toBeGreaterThan(0);
      expect(Number.isInteger(geospecFault!.requests)).toBe(true);
      expect(geospecWasm).toBeUndefined();
      expect(await target.workers('geospec-runner')).toHaveLength(0);
      const firstStorage = await readProjectStorageState();
      expect(firstStorage.configs).toHaveLength(1);
      const project = firstStorage.configs[0]!;
      await expect
        .poll(
          async () => {
            const persisted = await readProjectTree(project);
            return persisted['/recovery-marker.txt'];
          },
          { timeout: 60_000 },
        )
        .toBe(marker);
      await ensureFilesPane();
      await target.click(fileTreeItem('native.geospec.ts'));
      await target.expectVisible(selectors.getByCss('.dv-tab.dv-active-tab[aria-label="native.geospec.ts"]'), 30_000);
      await expect
        .poll(
          async () => {
            const persisted = await readProjectTree(project);
            return persisted['/.tau/workbench/layout.json'];
          },
          { timeout: 60_000 },
        )
        .toContain('native.geospec.ts');
      const beforeClose = await readProjectTree(project);
      layoutBeforeClose = beforeClose['/.tau/workbench/layout.json'];
      const nativeTab = selectors.getByCss('.dv-tab[aria-label="native.geospec.ts"]');
      await target.hover(nativeTab);
      await target.click(nativeTab.getByCss('.dv-default-tab-action'), { force: true });
      await target.expectCount(nativeTab, 0, 30_000);
      await expect
        .poll(
          async () => {
            const persisted = await readProjectTree(project);
            const layout = persisted['/.tau/workbench/layout.json'];
            if (layout === undefined || layout === layoutBeforeClose || layout.includes('native.geospec.ts')) {
              return false;
            }
            acknowledgedLayout = layout;
            return true;
          },
          { timeout: 60_000 },
        )
        .toBe(true);
      await submitPrompt();
    }
    await target.expectVisible(selectors.getByText(finalText, { exact: true }), 180_000);
    requests = await target.readAgentHostGatewayRequests();
    expect(requests).toHaveLength(script.length);
    const request = z
      .object({
        messages: z.array(z.object({ content: z.union([z.string(), z.array(z.unknown())]) })),
      })
      .parse(requests.at(-1));
    const results = request.messages
      .flatMap(({ content }) => (typeof content === 'string' ? [] : content))
      .flatMap((block) => {
        const parsed = z
          .object({
            type: z.literal('tool_result'),
            // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic's tool result wire uses snake_case.
            is_error: z.boolean().optional(),
            content: z.union([z.string(), z.array(z.object({ type: z.literal('text'), text: z.string() }))]),
          })
          .safeParse(block);
        return parsed.success ? [parsed.data] : [];
      });
    expect(results).toHaveLength(fault === undefined ? 3 : 5);
    expect(results.filter((result) => result.is_error === true)).toHaveLength(fault === undefined ? 0 : 1);
    if (fault !== undefined) {
      const failed = results[2]!;
      expect(failed.is_error).toBe(true);
      const failedContent =
        typeof failed.content === 'string' ? failed.content : failed.content.map((part) => part.text).join('');
      const failure = z
        .object({ success: z.literal(false), errorCode: z.string(), message: z.string().min(1) })
        .strict();
      expect(failure.parse(JSON.parse(failedContent)).message).toMatch(/wasm|webassembly|fetch|compile|abort/iu);
      expect(testModelOutputSchema.safeParse(JSON.parse(failedContent)).success).toBe(false);
    }
    const outputs = results.flatMap(({ content }) => {
      const text = typeof content === 'string' ? content : content.map((part) => part.text).join('');
      const parsed = testModelOutputSchema.omit({ passes: true }).safeParse(JSON.parse(text));
      return parsed.success ? [parsed.data] : [];
    });
    expect(outputs).toHaveLength(1);
    const output = outputs[0]!;
    expect(output.fullResult).toBeDefined();
    const artifact = output.fullResult!;
    const storage = await readProjectStorageState();
    expect(storage.configs).toHaveLength(1);
    const tree = await readProjectTree(storage.configs[0]!);
    const retainedText = tree[`/${artifact.path}`];
    expect(retainedText).toBeDefined();
    const retainedBytes = new TextEncoder().encode(retainedText);
    expect(retainedBytes.byteLength).toBe(artifact.byteLength);
    const retainedDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', retainedBytes));
    expect([...retainedDigest].map((byte) => byte.toString(16).padStart(2, '0')).join('')).toBe(artifact.sha256);
    const retained = testModelOutputSchema.parse(JSON.parse(retainedText!));
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
    const { geospecWasm } = await target.events();
    expect(geospecWasm).toBeDefined();
    expect(geospecWasm!.status).toBe(200);
    expect(geospecWasm!.expectedSha256).toMatch(/^[\da-f]{64}$/u);
    expect(geospecWasm!.expectedByteLength).toBeGreaterThan(0);
    expect(geospecWasm!.sha256).toBe(geospecWasm!.expectedSha256);
    expect(geospecWasm!.byteLength).toBe(geospecWasm!.expectedByteLength);
    expect(geospecWasm!.sourceSha256).toBe(geospecWasm!.expectedSha256);
    expect(geospecWasm!.sourceByteLength).toBe(geospecWasm!.expectedByteLength);
    expect(await target.workers('geospec-runner')).toHaveLength(1);
    const [native, assertionApi, { createGeoSpecNativeModelLoader }] = await Promise.all([
      import('@taucad/geospec-engine-native'),
      import('geospec/assertion-client'),
      import('geospec/runner/native'),
    ]);
    await native.initialize();
    const engine = new native.Engine();
    const load = createGeoSpecNativeModelLoader({ engine });
    try {
      const subject = await load({ source: Uint8Array.from(fixtureBytes), format: 'glb', sourceUnit: 'mm' });
      apiSubjectHash = subject.subjectHash;
      // The chat's runner selects bounded success evidence, so the API reports compare in that profile.
      const client = assertionApi.createGeoSpecAssertionClient({ engine, evidenceProfile: 'bounded' });
      apiReports.push(
        canonicalChatReport(client.expectGeo(subject).toHaveVolume({ value: 6000, tolerance: 0.000001 })),
      );
      try {
        client.expectGeo(subject).toHaveVolume({ value: 1, tolerance: 0 });
        expect.fail('The independent 6000 mm^3 box must fail a 1 mm^3 volume assertion.');
      } catch (error) {
        if (!(error instanceof assertionApi.GeoSpecAssertionError)) {
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
    await target.click(selectors.getByRole('button', { name: /^(?:Edited files, )?ran tests$/iu }));
    await target.expectVisible(selectors.getByText('Tested 3 requirements', { exact: true }));
    await target.expectVisible(selectors.getByText('1. rejects the impossible fixed box volume', { exact: true }));
    if (fault !== undefined) {
      const postRetry = await readProjectTree(storage.configs[0]!);
      layoutBeforeReload = postRetry['/.tau/workbench/layout.json'];
      expect(layoutBeforeReload).toBeDefined();
      expect(layoutBeforeReload).not.toContain('native.geospec.ts');
      expect(acknowledgedLayout).not.toBe(layoutBeforeClose);
    }
    await target.reload();
    await waitForComposer();
    await target.expectVisible(selectors.getByText(finalText, { exact: true }));
    expect(await target.readAgentHostGatewayRequests()).toHaveLength(script.length);
    if (fault !== undefined) {
      const reloadedStorage = await readProjectStorageState();
      const reloadedTree = await readProjectTree(reloadedStorage.configs[0]!);
      expect(reloadedTree['/recovery-marker.txt']).toBe(marker);
      expect(reloadedTree['/.tau/workbench/layout.json']).toBe(layoutBeforeReload);
      expect(reloadedTree[`/${artifact.path}`]).toBe(retainedText);
    }
  } finally {
    requests = await target.readAgentHostGatewayRequests();
    await target.writeArtifact(
      `${crypto.randomUUID()}/native-chat-mixed.json`,
      JSON.stringify(
        {
          profile: 'mixed',
          fault,
          events: await target.events(),
          layoutBeforeClose,
          acknowledgedLayout,
          layoutBeforeReload,
          fixtureSha256: nativeFixtureHash,
          fixtureBase64,
          nativeSource,
          runtimeSource: cubeCylinderMainScad,
          requests,
          apiSubjectHash,
          apiReports,
          apiReleased,
          apiClosed,
          limitations: [
            'Runtime row has independent verdict coverage; finalized export bytes are not exposed. Fixed fixture rows require exact report equality with a bounded-profile API client, the profile the chat runner selects.',
          ],
        },
        null,
        2,
      ),
    );
  }
};

test('[native-geospec] compares fixed-fixture reports through browser chat and the mixed API', async () => {
  await runCanonicalGeoSpecChat();
}, 600_000);

test.each(['missing', 'corrupt'] as const)(
  '[native-geospec] recovers from a %s first WASM asset without resetting the project',
  async (fault) => {
    await runCanonicalGeoSpecChat(fault);
  },
  600_000,
);
