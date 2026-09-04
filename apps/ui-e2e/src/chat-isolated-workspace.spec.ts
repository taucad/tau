import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import {
  cubeCylinderCutoutScript,
  cubeCylinderSuccessSentence,
  gatedCubeCylinderCutoutScript,
} from '#support/agent-host-gateway-script.js';
import type { GatewayScriptTurn } from '#support/agent-host-gateway-script.js';

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
    const search = selectors.getByPlaceholder('Search projects, chats, and actions...');
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
const prepare = async (script: readonly GatewayScriptTurn[]): Promise<void> => {
  await target.installAgentHostGatewayFixture(script);
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
  /* Isolation is opt-in since the revision-mode ruling: `local` is the default
   * and writes straight into the project folder, so only `branch` mode has an
   * isolated tree to discard (chat-revision-mode-local-default-blueprint.md,
   * "Revision mode vocabulary"). Selecting it is what keeps this a test of
   * cancellation rather than of the default path. */
  await target.click(selectors.getByCss('[data-slot="chat-revision-selector"]'));
  await target.click(selectors.getByText('New branch', { exact: true }));
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
