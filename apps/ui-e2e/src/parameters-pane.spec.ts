import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

const seedRoute = '/__e2e/project-file-tree';
const seedProjectName = 'sgenoud/models file-tree e2e';
const mainPath = 'public/models/honeycomb.js';
const secondaryPath = 'public/models/box-corner.js';

const treeItem = (path: string): Locator =>
  selectors.getByCss(`[data-testid="file-tree-item"][data-file-tree-path="${path}"]`);

const disclosure = (path: string): Locator => selectors.getByRole('button', { name: path, exact: true });

const openCommand = async (name: string, surface?: target.TargetSurface): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }), undefined, surface);
  const commandSearch = selectors.getByPlaceholder('Search projects, chats, and actions...');
  await target.fill(commandSearch, name, surface);
  await target.click(selectors.getByText(name, { exact: true }), undefined, surface);
};

const openSeededProject = async (): Promise<void> => {
  await target.navigate(seedRoute);
  try {
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 10_000);
  } catch {
    const project = selectors.getByRole('link', { name: seedProjectName }).first();
    await target.expectVisible(project, 60_000);
    const href = await target.getAttribute(project, 'href');
    if (!href) {
      throw new Error('Seeded project link did not include an href.');
    }
    await target.navigate(href);
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  }

  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 60_000);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
};

const openSecondGeometryUnit = async (): Promise<void> => {
  await openCommand('Open files');

  for (const path of ['public', 'public/models']) {
    const folder = treeItem(path);
    // oxlint-disable-next-line no-await-in-loop -- Each nested directory exists only after its parent expands.
    await target.expectVisible(folder, 15_000);
    // oxlint-disable-next-line no-await-in-loop -- Folder expansion is intentionally sequential.
    if ((await target.getAttribute(folder, 'aria-expanded')) !== 'true') {
      // oxlint-disable-next-line no-await-in-loop -- Folder expansion is intentionally sequential.
      await target.click(folder, { position: { x: 8, y: 14 } });
    }
  }

  await target.hover(treeItem(secondaryPath));
  await target.click(selectors.getByRole('button', { name: 'Actions for box-corner.js' }));
  await target.click(selectors.getByRole('menuitem', { name: 'Open in Viewer' }));
  await target.expectVisible(selectors.getByCss(`.dv-tab[aria-label="${secondaryPath}"]`), 60_000);
};

type HeaderVisualState = {
  readonly actionSize: number;
  readonly actionsOpacity: string;
  readonly backgroundColor: string;
  readonly borderRadius: number;
  readonly frameworkTabIndex: number;
  readonly headerHeight: number;
  readonly parameterBodyOwned: boolean;
  readonly savedGroupHeight: number;
  readonly separatorColor: string;
};

type SurfaceVisualState = {
  readonly bodyBackground: string;
  readonly bodyToPaneBottomGap: number;
  readonly bottomRadius: number;
  readonly catalogBottomPadding: number;
  readonly catalogInlinePadding: number;
  readonly filterToHeaderGap: number;
  readonly filterBackground: string;
  readonly filterHeight: number;
  readonly headerBottomBorderWidth: number;
  readonly headerBottomRadius: number;
  readonly horizontalEdgeDelta: number;
  readonly panelBackground: string;
  readonly seamDelta: number;
  readonly scrollFadeEnd: string;
  readonly scrollFadeSize: string;
  readonly toolbarBorderWidth: number;
};

type ButtonVisualState = {
  readonly backgroundColor: string;
  readonly borderRadius: number;
  readonly color: string;
};

const readHeaderVisualState = async (header: Locator): Promise<HeaderVisualState> =>
  target.evaluateLocator(header, (element) => {
    const root = element.closest<HTMLElement>('[data-slot="paneview-header"]');
    const frameworkHeader = element.closest<HTMLElement>('.dv-pane-header');
    const pane = element.closest<HTMLElement>('.dv-pane');
    const action = root?.querySelector<HTMLElement>('[aria-label="Compilation unit actions"]');
    const actions = root?.querySelector<HTMLElement>('[data-testid="paneview-header-actions"]');
    const savedGroup = root?.querySelector<HTMLElement>('[aria-label="Parameter groups"]');
    if (!root || !frameworkHeader || !action || !actions || !savedGroup) {
      throw new Error('Parameters Paneview header was incomplete.');
    }

    const rootStyle = getComputedStyle(root);
    return {
      actionSize: action.getBoundingClientRect().height,
      actionsOpacity: getComputedStyle(actions).opacity,
      backgroundColor: rootStyle.backgroundColor,
      borderRadius: Number.parseFloat(rootStyle.borderRadius),
      frameworkTabIndex: frameworkHeader.tabIndex,
      headerHeight: root.getBoundingClientRect().height,
      parameterBodyOwned: Boolean(pane?.querySelector('[data-slot="parameters"]')),
      savedGroupHeight: savedGroup.getBoundingClientRect().height,
      separatorColor: getComputedStyle(frameworkHeader).getPropertyValue('--dv-paneview-header-border-color').trim(),
    };
  });

const readSurfaceVisualState = async (header: Locator): Promise<SurfaceVisualState> =>
  target.evaluateLocator(header, (element) => {
    const headerRoot = element.closest<HTMLElement>('[data-slot="paneview-header"]');
    const pane = element.closest<HTMLElement>('.dv-pane');
    const body = pane?.querySelector<HTMLElement>('[data-slot="parameters"]');
    const paneBody = body?.closest<HTMLElement>('.dv-pane-body');
    const panel = document.querySelector<HTMLElement>('[data-slot="parameters-panel-body"]');
    const toolbar = document.querySelector<HTMLElement>('[data-slot="parameters-filter"]');
    const filter = document.querySelector<HTMLInputElement>('[aria-label="Filter parameters"]');
    const catalog = body?.querySelector<HTMLElement>('[data-slot="parameter-catalog"]');
    const scroller = body?.querySelector<HTMLElement>('form');
    if (!headerRoot || !body || !paneBody || !panel || !toolbar || !filter || !catalog || !scroller) {
      throw new Error('Parameters attached surface was incomplete.');
    }

    const headerBounds = headerRoot.getBoundingClientRect();
    const headerStyle = getComputedStyle(headerRoot);
    const bodyBounds = body.getBoundingClientRect();
    const catalogStyle = getComputedStyle(catalog);
    const filterBounds = filter.getBoundingClientRect();
    const scrollerStyle = getComputedStyle(scroller);
    return {
      bodyBackground: getComputedStyle(body).backgroundColor,
      bodyToPaneBottomGap: paneBody.getBoundingClientRect().bottom - bodyBounds.bottom,
      bottomRadius: Number.parseFloat(getComputedStyle(body).borderBottomLeftRadius),
      catalogBottomPadding: Number.parseFloat(catalogStyle.paddingBottom),
      catalogInlinePadding: Number.parseFloat(catalogStyle.paddingLeft),
      filterToHeaderGap: headerBounds.top - filterBounds.bottom,
      filterBackground: getComputedStyle(filter).backgroundColor,
      filterHeight: filter.getBoundingClientRect().height,
      headerBottomBorderWidth: Number.parseFloat(headerStyle.borderBottomWidth),
      headerBottomRadius: Number.parseFloat(headerStyle.borderBottomLeftRadius),
      horizontalEdgeDelta: Math.max(
        Math.abs(headerBounds.left - bodyBounds.left),
        Math.abs(headerBounds.right - bodyBounds.right),
      ),
      panelBackground: getComputedStyle(panel).backgroundColor,
      seamDelta: Math.abs(headerBounds.bottom - bodyBounds.top),
      scrollFadeEnd: scrollerStyle.getPropertyValue('--scroll-fade-end').trim(),
      scrollFadeSize: scrollerStyle.getPropertyValue('--scroll-fade-size').trim(),
      toolbarBorderWidth: Number.parseFloat(getComputedStyle(toolbar).borderBottomWidth),
    };
  });

const readAdjacentGroupGap = async (firstGroup: Locator, secondLabel: string): Promise<number> =>
  target.evaluateLocator(
    firstGroup,
    (element, label) => {
      const first = element.closest<HTMLElement>('[data-slot="parameter-group"]');
      const parameters = element.closest<HTMLElement>('[data-slot="parameters"]');
      const secondTrigger = [...(parameters?.querySelectorAll<HTMLElement>('[aria-label]') ?? [])].find(
        (candidate) => candidate.getAttribute('aria-label') === label,
      );
      const second = secondTrigger?.closest<HTMLElement>('[data-slot="parameter-group"]');
      if (!first || !second) {
        throw new Error('Adjacent parameter groups were incomplete.');
      }
      return second.getBoundingClientRect().top - first.getBoundingClientRect().bottom;
    },
    secondLabel,
  );

const readButtonVisualState = async (button: Locator): Promise<ButtonVisualState> =>
  target.evaluateLocator(button, (element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: Number.parseFloat(style.borderRadius),
      color: style.color,
    };
  });

const expectHoverTreatment = async (button: Locator, reference: ButtonVisualState): Promise<void> => {
  await target.hover(button);
  await expect
    .poll(async () => {
      const state = await readButtonVisualState(button);
      return {
        hasBackground: state.backgroundColor !== 'rgba(0, 0, 0, 0)',
        color: state.color,
        isRounded: state.borderRadius > 0,
      };
    })
    .toEqual({ hasBackground: true, color: reference.color, isRounded: true });
};

const fieldUnit = async (input: Locator, surface?: target.TargetSurface): Promise<string> =>
  target.evaluateLocator(
    input,
    (element) => {
      const adornment = element
        .closest<HTMLElement>('[data-slot="slider-input"]')
        ?.querySelector<HTMLElement>('[data-slot="slider-input-adornment"]');
      return adornment?.textContent.trim() ?? '';
    },
    undefined,
    surface,
  );

const fieldNumber = async (input: Locator, surface?: target.TargetSurface): Promise<number> => {
  const { value } = await target.read(input, undefined, surface);
  if (value === undefined) {
    throw new Error('Expected parameter input value');
  }
  return Number(value.replaceAll(',', ''));
};

const fieldDiagnostic = async (input: Locator, surface?: target.TargetSurface): Promise<string | undefined> => {
  const description = await target.getAttribute(input, 'aria-describedby', surface);
  return description === null
    ? undefined
    : ((await target.textContent(selectors.getByCss(`#${description}`), surface)) ?? undefined);
};

const delayFirstMutationLock = async (surface: target.TargetSurface): Promise<void> =>
  target.evaluate(
    () => {
      const originalRequest = navigator.locks.request.bind(navigator.locks);
      let delayed = false;
      Object.defineProperty(navigator.locks, 'request', {
        configurable: true,
        value: async (name: string, options: LockOptions, callback: LockGrantedCallback<unknown>) => {
          if (!delayed && name.includes('/.tau/parameters/')) {
            delayed = true;
            await new Promise((resolve) => {
              setTimeout(resolve, 3000);
            });
          }
          return originalRequest(name, options, callback);
        },
      });
    },
    undefined,
    surface,
  );

test('rejects one of two stale browser-tab edits through the shared authority', async () => {
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();
  await openCommand('Open parameters');
  const projectUrl = await target.currentUrl();
  await target.openSecondary(projectUrl);
  try {
    await target.setViewport({ width: 1440, height: 900 }, 'secondary');
    await target.expectVisible(
      selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(),
      60_000,
      'secondary',
    );
    await target
      .click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }, 'secondary')
      .catch(() => undefined);
    await openCommand('Open parameters', 'secondary');

    const width = selectors.getByLabelText('Input for Width').first();
    await target.expectVisible(width, 60_000);
    await target.expectVisible(width, 60_000, 'secondary');
    await target.fill(width, '21');
    await target.fill(width, '22', 'secondary');
    await Promise.all([delayFirstMutationLock('primary'), delayFirstMutationLock('secondary')]);
    await Promise.all([target.press(width, 'Enter'), target.press(width, 'Enter', 'secondary')]);

    await expect
      .poll(
        async () =>
          Number((await fieldDiagnostic(width)) !== undefined) +
          Number((await fieldDiagnostic(width, 'secondary')) !== undefined),
        { timeout: 60_000 },
      )
      .toBe(1);
    const primaryDiagnostic = await fieldDiagnostic(width);
    const secondaryDiagnostic = await fieldDiagnostic(width, 'secondary');
    const primaryRejected = primaryDiagnostic !== undefined;
    expect(primaryDiagnostic ?? secondaryDiagnostic).toMatch(/parameter revision (?:changed|is stale)/iu);
    const losingSurface: target.TargetSurface = primaryRejected ? 'primary' : 'secondary';
    const winningSurface: target.TargetSurface = primaryRejected ? 'secondary' : 'primary';
    const winningValue = await fieldNumber(width, winningSurface);
    expect([21, 22]).toContain(winningValue);
    await target.press(width, 'Escape', losingSurface);
    await expect.poll(async () => fieldNumber(width, 'primary')).toBe(winningValue);
    await expect.poll(async () => fieldNumber(width, 'secondary')).toBe(winningValue);
  } finally {
    await target.closeSecondary();
  }
});

test('uses inferred units through checked edits, scrubbing, reopen, reset, and display conversion', async () => {
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();
  await openCommand('Open parameters');

  const lengthFields = ['Depth', 'Height', 'Width', 'Cell Size', 'Wall Thickness'] as const;
  await target.expectVisible(selectors.getByLabelText('Input for Width').first(), 60_000);
  await Promise.all(
    lengthFields.map(async (name) => {
      const input = selectors.getByLabelText(`Input for ${name}`).first();
      await target.expectVisible(input);
      expect(await fieldUnit(input)).toBe('mm');
      await target.expectVisible(selectors.getByRole('button', { name: `Inferred unit for ${name}` }).first());
    }),
  );
  const angleInput = selectors.getByLabelText('Input for Rotation Angle').first();
  expect(await fieldUnit(angleInput)).toBe('°');
  await target.expectVisible(selectors.getByRole('button', { name: 'Inferred unit for Rotation Angle' }).first());

  const depthInput = selectors.getByLabelText('Input for Depth').first();
  await target.press(depthInput, 'ArrowUp');
  await expect.poll(async () => fieldNumber(depthInput)).toBe(5);

  const heightInput = selectors.getByLabelText('Input for Height').first();
  const heightSlider = selectors.getByCss('[data-slot="slider-input"]:has([aria-label="Input for Height"])').first();
  const sliderBounds = await target.boundingBox(heightSlider);
  if (!sliderBounds) {
    throw new Error('Height slider did not expose drag geometry.');
  }
  const sliderY = sliderBounds.y + sliderBounds.height / 2;
  const sliderX = sliderBounds.x + sliderBounds.width / 2;
  await target.mouseMove(sliderX, sliderY);
  await target.mouseDown();
  await target.mouseMove(sliderX + sliderBounds.width / 4, sliderY, { steps: 4 });
  await target.mouseUp();
  await expect.poll(async () => fieldNumber(heightInput)).toBe(21);
  expect(await fieldNumber(heightInput)).toBeGreaterThanOrEqual(0);
  expect(await fieldNumber(heightInput)).toBeLessThanOrEqual(28);

  const widthInput = selectors.getByLabelText('Input for Width').first();
  await target.fill(widthInput, '2.1 cm');
  await target.press(widthInput, 'Enter');
  await expect
    .poll(
      async () =>
        target.evaluateLocator(widthInput, (element) => {
          const input = element as HTMLInputElement;
          const description = input.getAttribute('aria-describedby');
          return {
            value: input.value,
            diagnostic: description ? (document.querySelector(`#${description}`)?.textContent ?? '') : '',
          };
        }),
      { timeout: 10_000 },
    )
    .toEqual({ value: '21', diagnostic: '' });
  await target.fill(widthInput, '999');
  await target.press(widthInput, 'Escape');
  await expect.poll(async () => fieldNumber(widthInput)).toBe(21);

  const filter = selectors.getByRole('searchbox', { name: 'Filter parameters' });
  await target.fill(filter, 'width');
  await target.expectCount(selectors.getByLabelText('Input for Height'), 0);
  await target.click(selectors.getByRole('button', { name: 'Clear search' }));
  await expect.poll(async () => fieldNumber(heightInput)).toBe(21);
  const dimensions = selectors.getByRole('button', { name: 'Group: Dimensions' }).first();
  await target.click(dimensions);
  await target.expectCount(selectors.getByLabelText('Input for Width'), 0);
  await target.click(dimensions);
  await expect.poll(async () => fieldNumber(widthInput)).toBe(21);

  await target.reload();
  await target.expectVisible(selectors.getByLabelText('Input for Width').first(), 60_000);
  await expect.poll(async () => fieldNumber(selectors.getByLabelText('Input for Width').first())).toBe(21);
  await expect.poll(async () => fieldNumber(selectors.getByLabelText('Input for Height').first())).toBe(21);
  await target.click(selectors.getByRole('button', { name: 'Reset parameters' }).first());
  await expect.poll(async () => fieldNumber(selectors.getByLabelText('Input for Width').first())).toBe(20);
  await expect.poll(async () => fieldNumber(selectors.getByLabelText('Input for Height').first())).toBe(14);
  await expect.poll(async () => fieldNumber(selectors.getByLabelText('Input for Depth').first())).toBe(4);

  const canvas = selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first();
  const geometryBeforeDisplayChange = await target.evaluateLocator(canvas, (element) =>
    (element as HTMLCanvasElement).toDataURL(),
  );
  await target.click(selectors.getByRole('button', { name: /^1 mm$/u }).first());
  await target.click(selectors.getByRole('menuitemradio', { name: /Centimeter\s+cm/u }));
  await target.keyboardPress('Escape');
  const widthInCentimeters = selectors.getByLabelText('Input for Width').first();
  await expect.poll(async () => fieldNumber(widthInCentimeters)).toBe(2);
  expect(await fieldUnit(widthInCentimeters)).toBe('cm');
  expect(await target.evaluateLocator(canvas, (element) => (element as HTMLCanvasElement).toDataURL())).toBe(
    geometryBeforeDisplayChange,
  );
  await target.expectCount(selectors.getByText('The authoritative parameter revision changed during editing.'), 0);
});

test('shows the same inferred units in the project preview', async () => {
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();
  const projectPath = await target.evaluate(() => location.pathname);
  await target.navigate(`${projectPath}/preview`);

  const width = selectors.getByLabelText('Input for Width').first();
  const angle = selectors.getByLabelText('Input for Rotation Angle').first();
  await target.expectVisible(width, 60_000);
  expect(await fieldUnit(width)).toBe('mm');
  expect(await fieldUnit(angle)).toBe('°');
  await target.expectVisible(selectors.getByRole('button', { name: 'Inferred unit for Width' }).first());
  await target.expectVisible(selectors.getByRole('button', { name: 'Inferred unit for Rotation Angle' }).first());
});

test('keeps rounded file disclosures accessible and reorderable through Paneview', async () => {
  await target.emulateColorScheme('light');
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();
  await openSecondGeometryUnit();
  await openCommand('Open parameters');

  const main = disclosure(mainPath);
  const secondary = disclosure(secondaryPath);
  await target.expectVisible(main, 60_000);
  await target.expectVisible(secondary, 60_000);
  await target.expectAttribute(main, 'aria-expanded', 'true');
  await target.expectAttribute(secondary, 'aria-expanded', 'false');

  const filter = selectors.getByRole('searchbox', { name: 'Filter parameters' });
  await target.expectVisible(filter);
  await target.expectCount(selectors.getByRole('searchbox', { name: 'Filter parameters' }), 1);
  await target.expectCount(selectors.getByRole('button', { name: /show search|hide search/iu }), 0);

  const dimensions = selectors.getByRole('button', { name: 'Group: Dimensions' }).first();
  const pattern = selectors.getByRole('button', { name: 'Group: Pattern' }).first();
  await target.expectVisible(dimensions, 60_000);
  await target.expectVisible(pattern);

  const openGroupGap = await readAdjacentGroupGap(dimensions, 'Group: Pattern');
  expect(openGroupGap).toBeCloseTo(8, 0);

  await target.click(dimensions);
  await target.click(pattern);
  await target.expectAttribute(dimensions, 'aria-expanded', 'false');
  await target.expectAttribute(pattern, 'aria-expanded', 'false');
  const closedGroupGap = await readAdjacentGroupGap(dimensions, 'Group: Pattern');
  expect(closedGroupGap).toBeCloseTo(8, 0);
  await target.click(dimensions);
  await target.click(pattern);

  const lightIdle = await readHeaderVisualState(main);
  expect(lightIdle.headerHeight).toBe(32);
  expect(lightIdle.actionSize).toBeGreaterThanOrEqual(24);
  expect(lightIdle.savedGroupHeight).toBeGreaterThanOrEqual(24);
  expect(lightIdle.borderRadius).toBeGreaterThan(0);
  expect(lightIdle.frameworkTabIndex).toBe(-1);
  expect(lightIdle.separatorColor).toBe('transparent');
  expect(lightIdle.actionsOpacity).toBe('0');
  expect(lightIdle.parameterBodyOwned).toBe(true);

  const lightSurface = await readSurfaceVisualState(main);
  expect(lightSurface.seamDelta).toBeLessThanOrEqual(1);
  expect(lightSurface.horizontalEdgeDelta).toBeLessThanOrEqual(1);
  expect(lightSurface.bodyToPaneBottomGap).toBeCloseTo(8, 0);
  expect(lightSurface.bottomRadius).toBeGreaterThan(0);
  expect(lightSurface.catalogBottomPadding).toBe(8);
  expect(lightSurface.catalogInlinePadding).toBe(8);
  expect(lightSurface.filterToHeaderGap).toBeCloseTo(8, 0);
  expect(lightSurface.filterHeight).toBe(28);
  expect(lightSurface.headerBottomBorderWidth).toBe(0);
  expect(lightSurface.headerBottomRadius).toBe(0);
  expect(lightSurface.scrollFadeEnd).toBe('transparent');
  expect(lightSurface.scrollFadeSize).toBe('28px');
  expect(lightSurface.toolbarBorderWidth).toBe(0);
  expect(lightSurface.bodyBackground).not.toBe(lightSurface.panelBackground);
  expect(lightSurface.filterBackground).not.toBe(lightSurface.panelBackground);

  await target.hover(main);
  await expect
    .poll(async () => {
      const state = await readHeaderVisualState(main);
      return state.actionsOpacity;
    })
    .toBe('1');
  await target.click(selectors.getByRole('button', { name: 'Parameter groups' }).first());
  await target.expectAttribute(main, 'aria-expanded', 'true');
  await target.keyboardPress('Escape');

  await target.focus(main);
  await target.expectFocused(main);

  const widthInput = selectors.getByLabelText('Input for Width').first();
  const inferredAngle = selectors.getByLabelText('Input for Rotation Angle').first();
  const guessedUnit = selectors.getByRole('button', { name: 'Inferred unit for Rotation Angle' }).first();
  await target.expectVisible(inferredAngle);
  await target.expectVisible(guessedUnit);
  await target.hover(guessedUnit);
  await target.expectVisible(selectors.getByRole('tooltip').filter({ hasText: 'Inferred unit' }).first());
  await target.fill(widthInput, '21');
  await target.keyboardPress('Enter');
  const reset = selectors.getByRole('button', { name: 'Reset parameters' }).first();
  await target.expectVisible(reset, 15_000);

  const close = selectors.getByRole('button', { name: `Close ${secondaryPath}` });
  await target.hover(close);
  const lightClose = await readButtonVisualState(close);
  expect(lightClose.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  for (const action of [
    selectors.getByRole('button', { name: 'Parameter groups' }).first(),
    selectors.getByRole('button', { name: 'Collapse all' }).first(),
    selectors.getByRole('button', { name: 'Compilation unit actions' }).first(),
    reset,
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- Hover styles are mutually exclusive and must be sampled sequentially.
    await expectHoverTreatment(action, lightClose);
  }
  await target.screenshot(selectors.getByCss('body'), 'parameters-pane-light.png');

  await target.click(secondary);
  await target.expectAttribute(secondary, 'aria-expanded', 'true');
  const secondaryBody = selectors.getByCss('[data-slot="parameters"]').nth(1);
  await target.expectVisible(secondaryBody);
  await target.expectVisible(selectors.getByLabelText('Parameter: Corner Radius'), 60_000);
  const stressInput = selectors.getByLabelText('Input for Stress Value 96');
  await target.expectVisible(stressInput, 60_000);
  expect(await fieldUnit(stressInput)).toBe('');
  await target.expectCount(selectors.getByRole('button', { name: 'Inferred unit for Stress Value 96' }), 0);
  const canvas = selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first();
  const lastGoodFrame = await target.evaluateLocator(canvas, (element) => (element as HTMLCanvasElement).toDataURL());
  expect(lastGoodFrame.length).toBeGreaterThan('data:image/png;base64,'.length);

  const performanceStart = await target.evaluate(() => {
    const untouchedLabel = document.querySelector<HTMLElement>('[aria-label="Parameter: Stress Value 95"]');
    const untouchedRow = untouchedLabel?.parentElement?.parentElement;
    if (!untouchedRow) {
      throw new Error('Large-form unchanged row was not rendered.');
    }
    const state = globalThis as typeof globalThis & {
      __TAU_PARAMETER_STRESS__?: {
        mutationCount: number;
        observer: MutationObserver;
      };
    };
    const observer = new MutationObserver((records) => {
      if (state.__TAU_PARAMETER_STRESS__) {
        state.__TAU_PARAMETER_STRESS__.mutationCount += records.length;
      }
    });
    state.__TAU_PARAMETER_STRESS__ = { mutationCount: 0, observer };
    observer.observe(untouchedRow, { attributes: true, characterData: true, childList: true, subtree: true });
    const memory = performance as Performance & { readonly memory?: { readonly usedJSHeapSize: number } };
    return {
      heapBytes: memory.memory?.usedJSHeapSize,
      milliseconds: performance.now(),
      rowCount: document.querySelectorAll('[aria-label^="Parameter:"]').length,
    };
  });
  expect(performanceStart.rowCount).toBeGreaterThanOrEqual(104);
  await target.fill(stressInput, '');
  await target.type(stressInput, '123456789');
  await target.keyboardPress('Enter');
  await expect
    .poll(async () => target.evaluateLocator(stressInput, (element) => (element as HTMLInputElement).value))
    .toBe('123,456,789');
  const performanceResult = await target.evaluate((start) => {
    const state = globalThis as typeof globalThis & {
      __TAU_PARAMETER_STRESS__?: {
        mutationCount: number;
        observer: MutationObserver;
      };
    };
    state.__TAU_PARAMETER_STRESS__?.observer.disconnect();
    const memory = performance as Performance & { readonly memory?: { readonly usedJSHeapSize: number } };
    return {
      editMilliseconds: performance.now() - start.milliseconds,
      heapGrowthBytes:
        start.heapBytes === undefined || memory.memory === undefined
          ? undefined
          : memory.memory.usedJSHeapSize - start.heapBytes,
      mutationCount: state.__TAU_PARAMETER_STRESS__?.mutationCount ?? Number.POSITIVE_INFINITY,
    };
  }, performanceStart);
  expect(performanceResult.editMilliseconds).toBeLessThan(5000);
  expect(performanceResult.mutationCount).toBe(0);
  if (performanceResult.heapGrowthBytes !== undefined) {
    expect(performanceResult.heapGrowthBytes).toBeLessThan(128 * 1024 * 1024);
  }
  await target.writeArtifact(
    'units-parameter-performance.json',
    JSON.stringify(
      {
        budget: { editMilliseconds: 5000, heapGrowthBytes: 128 * 1024 * 1024 },
        formRows: performanceStart.rowCount,
        ...performanceResult,
      },
      null,
      2,
    ),
  );
  await target.expectVisible(selectors.getByText(/parameter stress preview failure/iu), 60_000);
  await target.expectVisible(canvas);
  await expect
    .poll(async () => target.evaluateLocator(canvas, (element) => (element as HTMLCanvasElement).toDataURL()))
    .toBe(lastGoodFrame);
  await expect
    .poll(async () => target.evaluateLocator(stressInput, (element) => (element as HTMLInputElement).value))
    .toBe('123,456,789');

  await target.fill(filter, 'corner radius');
  await target.expectVisible(selectors.getByLabelText('Parameter: Corner Radius'), 15_000);
  await target.expectVisible(selectors.getByText('No parameters matching "corner radius"', { exact: true }));
  await target.click(selectors.getByRole('button', { name: 'Clear search' }));
  await target.expectVisible(selectors.getByLabelText('Parameter: Cell Size'));
  await target.expectVisible(selectors.getByLabelText('Parameter: Corner Radius'));

  await target.evaluate(() => {
    document.body.dataset['parametersDropTargetSeen'] = 'false';
    const observer = new MutationObserver(() => {
      if (!document.querySelector('.dv-drop-target-selection')) {
        return;
      }
      document.body.dataset['parametersDropTargetSeen'] = 'true';
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  await target.drag(main, secondaryBody);
  await expect
    .poll(async () => target.getAttribute(selectors.getByCss('body'), 'data-parameters-drop-target-seen'))
    .toBe('true');

  const secondaryAfter = await target.boundingBox(secondary);
  if (!secondaryAfter) {
    throw new Error('Reordered secondary header did not expose drag geometry.');
  }
  await expect
    .poll(async () => {
      const mainAfter = await target.boundingBox(main);
      return mainAfter?.y;
    })
    .toBeGreaterThan(secondaryAfter.y);
  const reordered = await readHeaderVisualState(main);
  expect(reordered.borderRadius).toBeGreaterThan(0);
  await target.screenshot(selectors.getByCss('body'), 'parameters-pane-reordered.png');

  const expandedSecondary = await readHeaderVisualState(secondary);
  expect(expandedSecondary.parameterBodyOwned).toBe(true);

  await target.expectVisible(selectors.getByLabelText('Parameter: Cell Size'));
  await target.expectVisible(selectors.getByLabelText('Parameter: Corner Radius'));

  await target.emulateColorScheme('dark');
  await target.expectClass(selectors.getByCss('html'), /\bdark\b/u);
  const dark = await readHeaderVisualState(main);
  expect(dark.backgroundColor).not.toBe(lightIdle.backgroundColor);
  const darkSurface = await readSurfaceVisualState(main);
  expect(darkSurface.bodyBackground).not.toBe(darkSurface.panelBackground);
  expect(darkSurface.filterBackground).not.toBe(darkSurface.panelBackground);

  await target.hover(close);
  const darkClose = await readButtonVisualState(close);
  for (const action of [
    selectors.getByRole('button', { name: 'Parameter groups' }).first(),
    selectors.getByRole('button', { name: 'Collapse all' }).first(),
    selectors.getByRole('button', { name: 'Compilation unit actions' }).first(),
    reset,
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- Hover styles are mutually exclusive and must be sampled sequentially.
    await expectHoverTreatment(action, darkClose);
  }
  await target.screenshot(selectors.getByCss('body'), 'parameters-pane-dark.png');

  await target.setViewport({ width: 960, height: 760 });
  const overflow = await target.evaluate(() => {
    const paneview = document
      .querySelector<HTMLElement>('[data-slot="paneview-header"]')
      ?.closest<HTMLElement>('.dv-pane-container');
    return paneview ? paneview.scrollWidth - paneview.clientWidth : Number.POSITIVE_INFINITY;
  });
  expect(overflow).toBeLessThanOrEqual(0);
  await target.screenshot(selectors.getByCss('body'), 'parameters-pane-dark-narrow.png');

  await target.evaluate(() => {
    document.documentElement.style.zoom = '125%';
  });
  await target.expectVisible(guessedUnit);
  expect(
    await target.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  ).toBeLessThanOrEqual(0);
  await target.evaluate(() => {
    document.documentElement.style.zoom = '';
  });

  await target.emulateForcedColors('active');
  expect(await target.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
  await target.expectVisible(guessedUnit);
  await target.screenshot(selectors.getByCss('body'), 'parameters-pane-forced-colors.png');
  await target.emulateForcedColors('none');

  await target.hover(secondary);
  await target.click(selectors.getByRole('button', { name: 'Compilation unit actions' }).first());
  await target.click(selectors.getByRole('menuitem', { name: 'Close renderer' }));
  await target.expectCount(selectors.getByLabelText('Input for Stress Value 96'), 0);
});
