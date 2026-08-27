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

test('project and chat rows expose full-width Codex-style hover actions', async () => {
  await target.setViewport({ width: 1024, height: 900 });
  await target.navigate('/__e2e/project-navigation');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);

  const projectTrigger = selectors.getByCss('[data-slot="project-trigger"]').first();
  const chatTrigger = selectors.getByCss('[data-slot="chat-trigger"]').first();
  await target.expectVisible(projectTrigger, 60_000);
  await target.expectVisible(chatTrigger, 60_000);

  const searchButton = selectors.getByRole('button', { name: 'Search', exact: true });
  const newProjectButton = selectors.getByRole('link', { name: /New Project/u });
  await target.expectVisible(searchButton);
  await target.expectVisible(newProjectButton);
  const headerControlMetrics = await target.evaluate(() => {
    const search = [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent.trim().startsWith('Search'),
    );
    const newProject = [...document.querySelectorAll<HTMLElement>('[data-sidebar="menu-button"]')].find((button) =>
      button.textContent.includes('New Project'),
    );
    const projects = [...document.querySelectorAll<HTMLElement>('[data-slot="sidebar-group-label"]')].find(
      (label) => label.textContent === 'Projects',
    );
    const platform = [...document.querySelectorAll<HTMLElement>('[data-slot="sidebar-group-label"]')].find(
      (label) => label.textContent === 'Platform',
    );
    const project = document.querySelector<HTMLElement>('[data-slot="project-trigger"]');
    const navButtons = [...document.querySelectorAll<HTMLElement>('[data-sidebar="menu-button"]')];
    const projectLibrary = navButtons.find((button) => button.textContent.includes('Project Library'));
    const files = navButtons.find((button) => button.textContent.includes('Files'));
    if (!search || !newProject || !projects || !platform || !project || !projectLibrary || !files) {
      throw new Error('Sidebar controls were not ready.');
    }
    const searchBounds = search.getBoundingClientRect();
    const newProjectBounds = newProject.getBoundingClientRect();
    const searchIconBounds = search.querySelector('svg')?.getBoundingClientRect();
    const newProjectIconBounds = newProject.querySelector('svg')?.getBoundingClientRect();
    const searchShortcutBounds = search.lastElementChild?.getBoundingClientRect();
    const newProjectShortcutBounds = newProject.lastElementChild?.getBoundingClientRect();
    if (!searchIconBounds || !newProjectIconBounds || !searchShortcutBounds || !newProjectShortcutBounds) {
      throw new Error('Sidebar control adornments were not ready.');
    }
    return {
      fontSizes: [getComputedStyle(search).fontSize, getComputedStyle(newProject).fontSize],
      heightDelta: Math.abs(searchBounds.height - newProjectBounds.height),
      horizontalEdges: [search, newProject, project, projectLibrary, files].map((element) => {
        const bounds = element.getBoundingClientRect();
        return [bounds.left, bounds.right];
      }),
      iconCenterDelta: Math.abs(
        searchIconBounds.top +
          searchIconBounds.height / 2 -
          searchBounds.top -
          (newProjectIconBounds.top + newProjectIconBounds.height / 2 - newProjectBounds.top),
      ),
      leftDelta: Math.abs(searchBounds.left - newProjectBounds.left),
      labelColors: [getComputedStyle(projects).color, getComputedStyle(platform).color],
      rightDelta: Math.abs(searchBounds.right - newProjectBounds.right),
      shortcutCenterDelta: Math.abs(
        searchShortcutBounds.top +
          searchShortcutBounds.height / 2 -
          searchBounds.top -
          (newProjectShortcutBounds.top + newProjectShortcutBounds.height / 2 - newProjectBounds.top),
      ),
    };
  });
  expect(headerControlMetrics.fontSizes[0]).toBe(headerControlMetrics.fontSizes[1]);
  expect(headerControlMetrics.heightDelta).toBeLessThanOrEqual(0.5);
  expect(headerControlMetrics.iconCenterDelta).toBeLessThanOrEqual(0.5);
  expect(headerControlMetrics.leftDelta).toBeLessThanOrEqual(0.5);
  expect(headerControlMetrics.rightDelta).toBeLessThanOrEqual(0.5);
  expect(headerControlMetrics.shortcutCenterDelta).toBeLessThanOrEqual(0.5);
  expect(headerControlMetrics.labelColors[0]).toBe(headerControlMetrics.labelColors[1]);
  for (const edges of headerControlMetrics.horizontalEdges.slice(1)) {
    expect(Math.abs(edges[0]! - headerControlMetrics.horizontalEdges[0]![0]!)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(edges[1]! - headerControlMetrics.horizontalEdges[0]![1]!)).toBeLessThanOrEqual(0.5);
  }
  await target.expectVisible(selectors.getByRole('link', { name: 'Project Library' }));

  const paneHeaderHeightDelta = await target.evaluate(() => {
    const chatHeader = document.querySelector<HTMLElement>('[data-slot="floating-panel-content-header"]');
    const tabStrip = document.querySelector<HTMLElement>('.dv-tabs-and-actions-container');
    if (!chatHeader || !tabStrip) {
      throw new Error('Pane headers were not ready.');
    }
    return Math.abs(chatHeader.getBoundingClientRect().height - tabStrip.getBoundingClientRect().height);
  });
  expect(paneHeaderHeightDelta).toBeLessThanOrEqual(0.5);

  const closeButton = selectors.getByCss('.dv-tab.dv-active-tab .dv-default-tab-action').first();
  await target.expectVisible(closeButton);
  const closeMetrics = await target.evaluateLocator(closeButton, (element) => {
    const tab = element.closest<HTMLElement>('.dv-tab');
    if (!tab) {
      throw new Error('Active tab was not ready.');
    }
    const tabBounds = tab.getBoundingClientRect();
    const closeBounds = element.getBoundingClientRect();
    const tabStyle = getComputedStyle(tab);
    return {
      background: getComputedStyle(element).backgroundColor,
      flex: [tabStyle.flexGrow, tabStyle.flexShrink, tabStyle.minWidth, tabStyle.maxWidth],
      inset: [
        closeBounds.top - tabBounds.top,
        tabBounds.bottom - closeBounds.bottom,
        tabBounds.right - closeBounds.right,
      ],
    };
  });
  expect(closeMetrics.background).toBe('rgba(0, 0, 0, 0)');
  expect(closeMetrics.flex).toEqual(['1', '1', '112px', '160px']);
  expect(Math.max(...closeMetrics.inset) - Math.min(...closeMetrics.inset)).toBeLessThanOrEqual(1);
  await target.hover(closeButton);
  expect(await target.evaluateLocator(closeButton, (element) => getComputedStyle(element).backgroundColor)).not.toBe(
    'rgba(0, 0, 0, 0)',
  );

  const projectBeforeHover = await target.evaluateLocator(projectTrigger, (element) => {
    const actionButtons = [...element.querySelectorAll<HTMLButtonElement>('button')].filter((button) =>
      /^(More actions|New chat)/u.test(button.ariaLabel ?? ''),
    );
    return {
      actionLabels: actionButtons.map((button) => button.ariaLabel),
      actionOpacity: actionButtons.map((button) => getComputedStyle(button).opacity),
      disclosureDisplay: getComputedStyle(element.querySelector('[data-slot="project-disclosure-icon"]')!).display,
      folderDisplay: getComputedStyle(element.querySelector('[data-slot="project-folder-icon"]')!).display,
    };
  });
  expect(projectBeforeHover.actionLabels).toEqual([
    `More actions for ${projectNames.a}`,
    `New chat in ${projectNames.a}`,
  ]);
  expect(projectBeforeHover.actionOpacity).toEqual(['0', '0']);
  expect(projectBeforeHover.folderDisplay).not.toBe('none');
  expect(projectBeforeHover.disclosureDisplay).toBe('none');

  await target.hover(projectTrigger);
  const projectOnHover = await target.evaluateLocator(projectTrigger, (element) => {
    const actionButtons = [...element.querySelectorAll<HTMLButtonElement>('button')].filter((button) =>
      /^(More actions|New chat)/u.test(button.ariaLabel ?? ''),
    );
    return {
      actionBackgrounds: actionButtons.map((button) => getComputedStyle(button).backgroundColor),
      actionOpacity: actionButtons.map((button) => getComputedStyle(button).opacity),
      disclosureDisplay: getComputedStyle(element.querySelector('[data-slot="project-disclosure-icon"]')!).display,
      folderDisplay: getComputedStyle(element.querySelector('[data-slot="project-folder-icon"]')!).display,
    };
  });
  expect(projectOnHover.actionOpacity).toEqual(['1', '1']);
  expect(projectOnHover.actionBackgrounds).toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);
  expect(projectOnHover.folderDisplay).toBe('none');
  expect(projectOnHover.disclosureDisplay).not.toBe('none');

  await target.mouseMove(1000, 899);
  const rowMetrics = await target.evaluate(() => {
    const projects = [...document.querySelectorAll<HTMLElement>('[data-slot="project-trigger"]')];
    const chat = document.querySelector<HTMLElement>('[data-slot="chat-trigger"]');
    if (!projects[0] || !projects[1] || !chat) {
      throw new Error('Sidebar project rows were not ready.');
    }
    const projectBounds = projects[0].getBoundingClientRect();
    const nextProjectBounds = projects[1].getBoundingClientRect();
    const chatBounds = chat.getBoundingClientRect();
    const chatList = chat.closest<HTMLElement>('[data-slot="sidebar-menu-sub"]');
    const projectLabel = projects[0].querySelector('a span');
    const chatLabel = chat.querySelector('a span');
    if (!chatList || !projectLabel || !chatLabel) {
      throw new Error('Sidebar row labels were not ready.');
    }
    return {
      chatRowGap: Number.parseFloat(getComputedStyle(chatList).rowGap),
      chatHasLeadingIcon: chat.querySelector('a svg') !== null,
      chatLabelLeft: chatLabel.getBoundingClientRect().left,
      chatTooltipState: chat.querySelector<HTMLAnchorElement>('a')?.dataset['state'] ?? null,
      chatLeft: chatBounds.left,
      chatRight: chatBounds.right,
      gapToNextProject: nextProjectBounds.top - chatBounds.bottom,
      projectToChatGap: chatBounds.top - projectBounds.bottom,
      projectLabelLeft: projectLabel.getBoundingClientRect().left,
      projectLeft: projectBounds.left,
      projectRight: projectBounds.right,
    };
  });
  expect(rowMetrics.chatHasLeadingIcon).toBe(false);
  expect(rowMetrics.chatTooltipState).toBeNull();
  expect(Math.abs(rowMetrics.chatLabelLeft - rowMetrics.projectLabelLeft)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(rowMetrics.projectToChatGap - rowMetrics.chatRowGap)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(rowMetrics.chatLeft - rowMetrics.projectLeft)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(rowMetrics.chatRight - rowMetrics.projectRight)).toBeLessThanOrEqual(0.5);
  expect(rowMetrics.gapToNextProject).toBeGreaterThanOrEqual(7.5);

  await target.hover(chatTrigger);
  const chatAction = await target.evaluateLocator(chatTrigger, (element) => {
    const button = element.querySelector<HTMLButtonElement>('button');
    if (!button) {
      throw new Error('Chat action was not ready.');
    }
    return {
      background: getComputedStyle(button).backgroundColor,
      label: button.ariaLabel,
      opacity: getComputedStyle(button).opacity,
    };
  });
  expect(chatAction).toEqual({
    background: 'rgba(0, 0, 0, 0)',
    label: 'More actions for Initial chat',
    opacity: '1',
  });
});
