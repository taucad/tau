/* oxlint-disable no-await-in-loop -- Reading and expanding one transcript activity at a time is the interaction under test. */
/* oxlint-disable typescript/no-restricted-types, typescript/no-unnecessary-condition -- The live billing boundary returns explicit JSON nulls and is checked again at runtime before evidence is accepted. */
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { readProjectStorageState, readProjectTree } from '#support/project-storage-state.js';

const modelId = 'google-gemini-3.7-flash';
const providerModelId = 'gemini-3.7-flash';
const composer = '[aria-label="Ask Tau to build anything..."]';
const stopButton = () => selectors.getByCss('button:has(svg.lucide-square)').last();
const cookieValue = (value: unknown): string => encodeURIComponent(JSON.stringify(value));

type UsageReceipt = {
  readonly kind: 'base';
  readonly customerState: 'absorbed' | 'released' | 'settled';
  readonly executionStatus: string;
  readonly meteringStatus: string;
  readonly model: { readonly id: string; readonly providerId: string | null };
  readonly operationId: string;
  readonly tokens: {
    readonly output: string | null;
    readonly reasoning?: string | null;
  };
};

const createProject = async (): Promise<void> => {
  await target.navigate('/projects/new');
  await target.expectVisible(selectors.getByLabelText('Project Name *'), 60_000);
  await target.fill(selectors.getByLabelText('Project Name *'), 'Gemini Replay Acceptance');
  await target.click(selectors.getByRole('button', { name: /Create Project/u }));
  await target.expectUrl(/\/w\/home\/[^/?]+\?chat=[^&]+$/u, 60_000);
  await target.waitFor(() => document.querySelector('[aria-label="Ask Tau to build anything..."]') !== null, null, {
    timeout: 60_000,
  });
};

const submit = async (prompt: string): Promise<void> => {
  await target.type(composer, prompt);
  await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());
  await target.expectVisible(stopButton(), 30_000);
  await target.expectCount(stopButton(), 0, 600_000);
  try {
    await target.expectCount(selectors.getByText(/model provider (?:is unavailable|rejected)|HTTP 400|Try again/iu), 0);
  } catch (error) {
    const pageText = await target.evaluate(() => document.body.textContent ?? '');
    throw new Error(`The turn ended with a provider failure. Page text:\n${pageText.slice(-6000)}`, { cause: error });
  }
};

const readProjectFiles = async (): Promise<{
  readonly source: string;
  readonly spec: string;
}> => {
  const storage = await readProjectStorageState();
  const config = storage.configs.at(-1);
  if (!config) {
    throw new Error('The live project has no filesystem configuration.');
  }
  const tree = await readProjectTree(config);
  const source = tree['/main.scad'];
  const spec = Object.entries(tree).find(([path]) => path.endsWith('.geospec.ts'))?.[1];
  if (source === undefined || spec === undefined) {
    throw new Error('main.scad or its GeoSpec is absent.');
  }
  return { source, spec };
};

const testedCounts = async (): Promise<readonly number[]> => {
  const buttons = selectors.getByRole('button', {
    name: /Tested \d+ requirements?/u,
  });
  const buttonState = await target.read(buttons);
  const total = buttonState.count;
  const counts: number[] = [];
  for (let index = 0; index < total; index += 1) {
    const state = await target.read(buttons.nth(index));
    counts.push(Number(/Tested (?<count>\d+) requirements?/u.exec(state.text ?? '')?.groups?.['count'] ?? 0));
  }
  return counts;
};

const expectLatestGeoSpecPass = async (minimumRequirements: number, previousActivityCount: number): Promise<number> => {
  const activities = selectors.getByText(/\d+ tests?/u);
  try {
    await expect
      .poll(
        async () => {
          const state = await target.read(activities);
          return state.count;
        },
        { timeout: 60_000 },
      )
      .toBeGreaterThan(previousActivityCount);
  } catch (error) {
    const pageText = await target.evaluate(() => document.body.textContent ?? '');
    throw new Error(`Gemini turn did not invoke GeoSpec. Page text:\n${pageText.slice(-6000)}`, { cause: error });
  }
  const activityState = await target.read(activities);
  const activityCount = activityState.count;
  // A turn can run the spec more than once; the acceptance is that one run in it
  // covered every required GeoSpec check, so open this turn's activities until
  // such a run is readable instead of trusting whichever ran last.
  let counts = await testedCounts();
  for (let index = activityCount - 1; index >= previousActivityCount; index -= 1) {
    if (Math.max(0, ...counts) >= minimumRequirements) {
      break;
    }
    await target.click(activities.nth(index));
    counts = await testedCounts();
  }
  const best = Math.max(0, ...counts);
  if (best < minimumRequirements) {
    const pageText = await target.evaluate(() => document.body.textContent ?? '');
    throw new Error(
      `Gemini turn tested ${String(best)} of ${String(minimumRequirements)} required GeoSpec requirements. Page text:\n${pageText.slice(-6000)}`,
    );
  }
  const resultButton = selectors
    .getByRole('button', { name: /Tested \d+ requirements?/u })
    .nth(counts.lastIndexOf(best));
  await target.expectVisible(resultButton, 30_000);
  await target.click(resultButton);
  const result = selectors.getByCss('[data-target-file]').last();
  await target.expectVisible(result, 30_000);
  await target.expectVisible(result.getByCss('svg.lucide-check').first(), 30_000);
  await target.expectCount(result.getByCss('svg.lucide-x'), 0);
  return activityCount;
};

const expectGeoSpecContract = (source: string, volume: RegExp): void => {
  expect(source).toMatch(/toHaveBoundingBox/u);
  expect(source).toMatch(/toHaveConnectedComponents/u);
  expect(source).toMatch(/toBeWatertight/u);
  expect(source).toMatch(/toHaveVolume/u);
  expect(source).toMatch(volume);
};

const readGeminiUsage = async (): Promise<readonly UsageReceipt[]> => {
  const snapshot = await target.evaluate<
    {
      readonly rows?: { readonly items: readonly UsageReceipt[] };
    },
    string
  >(async (query) => {
    // The served build publishes the API origin this browser actually talks to.
    const origin = (globalThis as unknown as { ENV?: { TAU_API_URL?: string } }).ENV?.TAU_API_URL;
    if (origin === undefined) {
      throw new Error('The page did not publish TAU_API_URL.');
    }
    const response = await fetch(`${origin}${query}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`Billing usage returned HTTP ${String(response.status)}.`);
    }
    return (await response.json()) as {
      readonly rows?: { readonly items: readonly UsageReceipt[] };
    };
  }, '/v1/billing/usage?range=all_time&collection=rows&pageSize=100');
  return (snapshot.rows?.items ?? []).filter((row) => row.kind === 'base' && row.model.id === providerModelId);
};

const expectSettledGeminiUsage = async (minimumCount: number): Promise<readonly UsageReceipt[]> => {
  let receipts: readonly UsageReceipt[] = [];
  await expect
    .poll(
      async () => {
        receipts = await readGeminiUsage();
        return receipts.length;
      },
      { timeout: 120_000 },
    )
    .toBeGreaterThanOrEqual(minimumCount);
  for (const receipt of receipts) {
    expect(receipt.model.providerId).toBe('vertexai');
    expect(receipt.executionStatus).toBe('succeeded');
    expect(receipt.customerState).toBe('settled');
    expect(receipt.meteringStatus).toBe('complete');
    expect(BigInt(receipt.tokens.output!)).toBeGreaterThanOrEqual(BigInt(receipt.tokens.reasoning ?? '0'));
  }
  return receipts;
};

const expectTerminalVertexOperations = async (
  email: string,
  minimumCount: number,
): Promise<Awaited<ReturnType<typeof target.readTauVertexOperations>>> => {
  let operations: Awaited<ReturnType<typeof target.readTauVertexOperations>> = [];
  await expect
    .poll(
      async () => {
        operations = await target.readTauVertexOperations(email);
        return (
          operations.length >= minimumCount && operations.every((operation) => operation.terminalRevision !== null)
        );
      },
      { timeout: 120_000 },
    )
    .toBe(true);
  for (const operation of operations) {
    expect(operation.customerState).toBe('settled');
    expect(operation.executionStatus).toBe('succeeded');
    expect(operation.meteringStatus).toBe('complete');
    expect(BigInt(operation.outputTokens!)).toBeGreaterThanOrEqual(BigInt(operation.reasoningTokens ?? '0'));
  }
  return operations;
};

test('Gemini creates a cube, then adds a vertical cylinder cutout on the next user turn', async () => {
  const email = `gemini-live-${String(Date.now())}@e2e.tau`;
  await target.authenticateTauTestUser({
    creditAtoms: '100000000',
    email,
    name: 'Gemini Live E2E',
    password: 'Tau-test-password-7!',
  });
  await target.setViewport({ width: 1440, height: 900 });
  await target.addCookies([
    {
      domain: 'localhost',
      name: 'tau-chat-model',
      path: '/',
      value: cookieValue(modelId),
    },
    {
      domain: 'localhost',
      name: 'tau-cad-kernel',
      path: '/',
      value: cookieValue('openscad'),
    },
    {
      domain: 'localhost',
      name: 'tau-chat-testing-enabled',
      path: '/',
      value: cookieValue(true),
    },
    {
      domain: 'localhost',
      name: 'tau-cookie-consent',
      path: '/',
      value: cookieValue('declined'),
    },
  ]);
  await createProject();

  await submit(
    'Create one solid 20 mm cube centered at the origin in main.scad. Create main.geospec.ts with all four requirements: watertight, exactly one solid body, 20 x 20 x 20 mm extents, and 8000 mm^3 volume. Then invoke the test_model tool once on the whole main.geospec.ts file, without filtering to a single test. Do not add a hole yet. Finish this turn only after all four requirements pass in that one run.',
  );
  const firstActivityCount = await expectLatestGeoSpecPass(4, 0);
  const cube = await readProjectFiles();
  expect(cube.source).toMatch(/cube\s*\([^)]*20/isu);
  expect(cube.source).toMatch(/center\s*=\s*true/iu);
  expect(cube.source).not.toMatch(/cylinder\s*\(/u);
  expectGeoSpecContract(cube.spec, /8000/u);
  await target.click(selectors.getByText('Revisions', { exact: true }).last());
  // The published revisions are the graph's list items; only superseded ones
  // expose a Restore control, so the current revision is not counted by label.
  await target.expectCount(selectors.getByCss('[aria-label="Recent revision history"] > li'), 1, 60_000);
  const firstTurnUsage = await expectSettledGeminiUsage(2);
  const firstTurnOperations = await expectTerminalVertexOperations(email, 2);

  await submit(
    'Now modify that cube by subtracting one centered vertical cylindrical through-hole of radius 5 mm along the Z axis and through the full cube. Keep the 20 x 20 x 20 mm outer extents. Update main.geospec.ts so it still checks all four requirements: watertight, exactly one solid body, 20 x 20 x 20 mm extents, and volume approximately 6429.2 mm^3. Then invoke the test_model tool once on the whole main.geospec.ts file, without filtering to a single test, and finish this second turn only after all four requirements pass in that one run.',
  );
  await expectLatestGeoSpecPass(4, firstActivityCount);
  const cutout = await readProjectFiles();
  expect(cutout.source).toMatch(/difference\s*\(/u);
  expect(cutout.source).toMatch(/cylinder\s*\([^)]*(?:(?:r|radius)\s*=\s*5|d\s*=\s*10)/isu);
  expect(cutout.source).toMatch(/center\s*=\s*true/iu);
  expectGeoSpecContract(cutout.spec, /6429(?:\.2)?|8000\s*-\s*Math\.PI/iu);
  const secondTurnUsage = await expectSettledGeminiUsage(firstTurnUsage.length + 2);
  const secondTurnOperations = await expectTerminalVertexOperations(email, firstTurnOperations.length + 2);

  await target.expectCount(selectors.getByCss('[aria-label="Recent revision history"] > li'), 2, 60_000);
  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 60_000);
  await target.writeArtifact(
    'gemini-browser-agent-host-live-evidence.json',
    `${JSON.stringify({ modelId, firstTurnUsage, secondTurnUsage, firstTurnOperations, secondTurnOperations }, null, 2)}\n`,
  );
}, 1_200_000);
