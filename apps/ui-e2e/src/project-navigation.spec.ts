import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

const projectNames = {
  a: 'Project Navigation A',
  b: 'Project Navigation B',
} as const;

type CameraInput = Readonly<{
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  fov: number;
  zoom: number;
  rollRadians: number;
}>;

type CameraEvidence = Readonly<{
  projection: 'orthographic' | 'perspective';
  requestedFov: number;
  verticalSpan: number;
  position: readonly [number, number, number];
  quaternion: readonly [number, number, number, number];
  target: readonly [number, number, number];
  zoom: number;
  aspect: number;
}>;

type CameraBridge = Readonly<{
  getCamera(): CameraEvidence;
  setCamera(camera: CameraInput): void;
}>;

const waitForCameraBridge = async (): Promise<void> => {
  await target.waitFor(() =>
    Boolean((globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: CameraBridge }).__TAU_SECTION_VIEW_TEST__),
  );
};

const waitForTwoFrames = async (): Promise<void> => {
  await target.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
};

const setCamera = async (camera: CameraInput): Promise<CameraEvidence> => {
  await waitForCameraBridge();
  await target.evaluate((nextCamera) => {
    const bridge = (globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: CameraBridge })
      .__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Graphics e2e bridge is unavailable.');
    }
    bridge.setCamera(nextCamera);
  }, camera);
  await waitForTwoFrames();
  return readCamera();
};

const readCamera = async (): Promise<CameraEvidence> =>
  target.evaluate(() => {
    const bridge = (globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: CameraBridge })
      .__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Graphics e2e bridge is unavailable.');
    }
    return bridge.getCamera();
  });

const startCameraRestoreObservation = async (entryPath: string): Promise<void> => {
  await target.evaluate((observedEntryPath) => {
    const scope = globalThis as typeof globalThis & {
      __TAU_SECTION_VIEW_TEST__?: CameraBridge;
      __tauCameraRestoreSamples?: CameraEvidence[];
      __tauStopCameraRestoreObservation?: boolean;
    };
    scope.__tauCameraRestoreSamples = [];
    scope.__tauStopCameraRestoreObservation = false;
    const sample = (): void => {
      if (scope.__tauStopCameraRestoreObservation) {
        return;
      }
      const isEntryActive = [...document.querySelectorAll<HTMLElement>('.dv-tab.dv-active-tab')].some(
        (tab) => tab.ariaLabel === observedEntryPath,
      );
      const cameraBridge = scope.__TAU_SECTION_VIEW_TEST__;
      const samples = scope.__tauCameraRestoreSamples;
      if (isEntryActive && cameraBridge && samples) {
        samples.push(cameraBridge.getCamera());
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, entryPath);
};

const stopCameraRestoreObservation = async (): Promise<CameraEvidence[]> => {
  await waitForTwoFrames();
  return target.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __tauCameraRestoreSamples?: CameraEvidence[];
      __tauStopCameraRestoreObservation?: boolean;
    };
    scope.__tauStopCameraRestoreObservation = true;
    return scope.__tauCameraRestoreSamples ?? [];
  });
};

const expectVectorClose = (actual: readonly number[], expected: readonly number[], precision = 7): void => {
  expect(actual).toHaveLength(expected.length);
  for (const [index, value] of expected.entries()) {
    expect(actual[index]).toBeCloseTo(value, precision);
  }
};

const expectCameraFrameRestored = (actual: CameraEvidence, expected: CameraEvidence): void => {
  expect(actual.projection).toBe(expected.projection);
  expect(actual.requestedFov).toBeCloseTo(expected.requestedFov, 8);
  expect(actual.verticalSpan).toBeCloseTo(expected.verticalSpan, 7);
  expect(actual.zoom).toBeCloseTo(expected.zoom, 8);
  expect(actual.aspect).toBeCloseTo(expected.aspect, 7);
  const quaternionDot = Math.abs(
    actual.quaternion.reduce((sum, value, index) => sum + value * expected.quaternion[index]!, 0),
  );
  expect(quaternionDot).toBeCloseTo(1, 7);

  if (expected.projection === 'perspective') {
    expectVectorClose(actual.position, expected.position);
    return;
  }

  // Orthographic depth along the viewing axis is bounds-derived and does not
  // affect the image. Its lateral camera position must still be exact.
  const [x, y, z, w] = expected.quaternion;
  const backward = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)] as const;
  const delta = actual.position.map((value, index) => value - expected.position[index]!) as [number, number, number];
  const axialDistance = delta.reduce((sum, value, index) => sum + value * backward[index]!, 0);
  const lateralDistance = Math.hypot(...delta.map((value, index) => value - axialDistance * backward[index]!));
  expect(lateralDistance).toBeCloseTo(0, 7);
};

const expectCameraRestored = (actual: CameraEvidence, expected: CameraEvidence): void => {
  expectCameraFrameRestored(actual, expected);
  expectVectorClose(actual.position, expected.position);
  expectVectorClose(actual.target, expected.target);
};

async function expectProject(options: { name: string; entryPath: string }): Promise<void> {
  await target.expectVisible(selectors.getByText(options.name, { exact: true }).first(), 60_000);
  await target.expectVisible(selectors.getByCss(`.dv-tab[aria-label="${options.entryPath}"]`), 60_000);
  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 60_000);
  await target.expectVisible(selectors.getByCss('.tiptap[contenteditable="true"]').first(), 60_000);
  await target.expectCount(selectors.getByText(/doesn't exist|may have been deleted|project not found/i), 0);
}

async function openRecentProject(name: string): Promise<void> {
  const link = selectors.getByRole('link', { name }).first();
  await target.expectVisible(link, 60_000);
  await target.click(link);
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);
}

async function observeProjectShellContinuity(): Promise<void> {
  await target.expectVisible(selectors.getByCss('[data-slot="sidebar-wrapper"]'));
  await target.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __tauProjectShellObserver?: MutationObserver;
    };
    scope.__tauProjectShellObserver?.disconnect();
    delete document.documentElement.dataset['projectShellMissing'];
    scope.__tauProjectShellObserver = new MutationObserver(() => {
      if (!document.querySelector('[data-slot="sidebar-wrapper"]')) {
        document.documentElement.dataset['projectShellMissing'] = 'true';
      }
    });
    scope.__tauProjectShellObserver.observe(document.body, { childList: true, subtree: true });
  });
}

async function stopObservingProjectShell(): Promise<string | undefined> {
  return target.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __tauProjectShellObserver?: MutationObserver;
      __tauStopCameraRestoreObservation?: boolean;
    };
    scope.__tauProjectShellObserver?.disconnect();
    scope.__tauStopCameraRestoreObservation = true;
    delete scope.__tauProjectShellObserver;
    return document.documentElement.dataset['projectShellMissing'];
  });
}

test('client navigation keeps every project-scoped resource on one logical project ID', async () => {
  await target.addInitScript(() => {
    (globalThis as typeof globalThis & { __tauDocumentIdentity?: string }).__tauDocumentIdentity = crypto.randomUUID();
  });

  await target.navigate('/__e2e/project-navigation');
  await target.delay(5000);
  const initialState = await target.evaluate(() => ({ href: location.href, text: document.body.textContent }));
  if (!/\/w\/[^/]+\/[^/]+$/u.test(new URL(initialState.href).pathname)) {
    const diagnostics = await target.events();
    throw new Error(`Project-navigation seed did not open: ${JSON.stringify({ ...initialState, diagnostics })}`);
  }
  const documentIdentity = await target.evaluate(
    () => (globalThis as typeof globalThis & { __tauDocumentIdentity?: string }).__tauDocumentIdentity,
  );
  await expectProject({ name: projectNames.a, entryPath: 'alpha.ts' });
  await waitForCameraBridge();
  const legacyDefaultCamera = await readCamera();
  expect(legacyDefaultCamera.projection).toBe('perspective');
  expect(legacyDefaultCamera.requestedFov).toBe(60);
  await observeProjectShellContinuity();

  try {
    const perspectiveCamera = await setCamera({
      position: [43, -31, 27],
      target: [3, -4, 5],
      fov: 42,
      zoom: 1,
      rollRadians: 0.37,
    });
    await openRecentProject(projectNames.b);
    await expectProject({ name: projectNames.b, entryPath: 'beta.ts' });
    await waitForCameraBridge();
    await waitForTwoFrames();
    const projectBetaCamera = await readCamera();
    expect(projectBetaCamera.projection).toBe('perspective');
    expect(projectBetaCamera.requestedFov).toBe(60);
    await startCameraRestoreObservation('alpha.ts');
    await openRecentProject(projectNames.a);
    await expectProject({ name: projectNames.a, entryPath: 'alpha.ts' });
    await waitForCameraBridge();
    expectCameraRestored(await readCamera(), perspectiveCamera);
    const perspectiveFrames = await stopCameraRestoreObservation();
    expect(perspectiveFrames.length).toBeGreaterThan(0);
    for (const frame of perspectiveFrames) {
      expectCameraFrameRestored(frame, perspectiveCamera);
    }

    const orthographicCamera = await setCamera({
      position: [-29, 37, 24],
      target: [-6, 2, 4],
      fov: 0,
      zoom: 2,
      rollRadians: -0.22,
    });
    await openRecentProject(projectNames.b);
    await expectProject({ name: projectNames.b, entryPath: 'beta.ts' });
    await startCameraRestoreObservation('alpha.ts');
    await openRecentProject(projectNames.a);
    await expectProject({ name: projectNames.a, entryPath: 'alpha.ts' });
    await waitForCameraBridge();
    expectCameraRestored(await readCamera(), orthographicCamera);
    const orthographicFrames = await stopCameraRestoreObservation();
    expect(orthographicFrames.length).toBeGreaterThan(0);
    for (const frame of orthographicFrames) {
      expectCameraFrameRestored(frame, orthographicCamera);
    }
    await openRecentProject(projectNames.b);
    await expectProject({ name: projectNames.b, entryPath: 'beta.ts' });
    await waitForCameraBridge();
    expectCameraRestored(await readCamera(), projectBetaCamera);
  } finally {
    expect(await stopObservingProjectShell()).toBeUndefined();
  }

  await expect
    .poll(async () =>
      target.evaluate(
        () => (globalThis as typeof globalThis & { __tauDocumentIdentity?: string }).__tauDocumentIdentity,
      ),
    )
    .toBe(documentIdentity);
  const events = await target.events();
  const lifecycleFailures = [...events.pageErrors, ...events.consoleMessages.map(({ text }) => text)].filter(
    (message) => /modelInteraction actor is not available|null.*addEventListener/iu.test(message),
  );
  expect(lifecycleFailures).toEqual([]);
});
