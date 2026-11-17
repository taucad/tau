import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

const seedRoute = '/__e2e/project-file-tree';
const seedProjectName = 'sgenoud/models file-tree e2e';

const openCommand = async (name: string): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  const commandSearch = selectors.getByPlaceholder('Search projects, chats, and actions…');
  await target.fill(commandSearch, name);
  await target.click(selectors.getByRole('option', { name: new RegExp(`^${name}(?:\\s|$)`, 'u') }));
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

/** Pick the export format, through "More formats" when it is not one of the common formats. */
const selectFormat = async (format: string, { isMore = false }: { readonly isMore?: boolean } = {}): Promise<void> => {
  const picker = selectors.getByRole('button', { name: 'Export format' });
  await target.expectVisible(picker, 15_000);
  await target.click(picker);
  if (isMore) {
    await target.click(selectors.getByRole('button', { name: /^More formats/u }));
  }
  await target.click(selectors.getByCss(`[cmdk-item][data-value="${format.toLowerCase()}"]`));
};

const optionsDisclosure = (): Locator =>
  selectors.getByRole('button', { name: /^Export options (Defaults|Modified)$/u });

const openOptions = async (): Promise<Locator> => {
  const disclosure = optionsDisclosure();
  await target.expectVisible(disclosure, 15_000);
  if ((await target.getAttribute(disclosure, 'aria-expanded')) !== 'true') {
    await target.click(disclosure);
  }
  await target.expectAttribute(disclosure, 'aria-expanded', 'true');
  return disclosure;
};

/** A set number shows its unit on the slider input; an unset one, such as a fresh explicit tolerance, on its input group. */
/**
 * Scroll the Format options rows from the top until `row` is mounted, as a person scrolls to it. A form with more than
 * 20 rows is a virtual list since 7f2e4042b (2026-09-30), so a row below the fold is not in the page until then.
 *
 * @param panel - The export panel body.
 * @param row - The row's control.
 */
const revealOption = async (panel: Locator, row: Locator): Promise<void> => {
  const rows = panel.getByCss('section[aria-label="Format options"] [data-virtuoso-scroller]');
  await target.expectVisible(rows);
  for (let step = 0; step < 40; step += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each step scrolls, then looks for the row it mounted.
    if (await target.isVisible(row)) {
      return;
    }
    // oxlint-disable-next-line no-await-in-loop -- one scroll step at a time, as a person scrolls.
    await target.evaluateLocator(
      rows,
      (list, isFirst) => {
        let scroller = list instanceof HTMLElement ? list : undefined;
        while (scroller && scroller.scrollHeight <= scroller.clientHeight + 1) {
          scroller = scroller.parentElement ?? undefined;
        }
        if (!scroller) {
          throw new Error('The Format options rows had no scroll container.');
        }
        scroller.scrollTop = isFirst ? 0 : scroller.scrollTop + Math.max(48, scroller.clientHeight * 0.5);
      },
      step === 0,
    );
  }
  await target.expectVisible(row);
};

const fieldUnit = async (input: Locator): Promise<string> =>
  target.evaluateLocator(input, (element) => {
    const adornment = element
      .closest<HTMLElement>('[data-slot="slider-input"], [data-slot="input-group"]')
      ?.querySelector<HTMLElement>('[data-slot="slider-input-adornment"], [data-slot="input-group-addon"]');
    return adornment?.textContent.trim() ?? '';
  });

test('keeps export option roots flat, collapsed per format, and the action reachable', async () => {
  await target.emulateColorScheme('light');
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();
  await openCommand('Export');

  const panel = selectors.getByCss('[data-slot="export-panel-body"]');
  await target.expectVisible(panel, 15_000);
  await selectFormat('STL');

  await openOptions();
  // Tessellation is a preset or explicit tolerances, so it is a root select rather than a group.
  await target.expectVisible(panel.getByRole('combobox', { name: 'Select for Tessellation' }), 15_000);
  await target.expectCount(panel.getByCss('[data-slot="parameter-catalog"]'), 0);
  await target.expectCount(panel.getByCss('[data-slot="embedded-form-root"]'), 1);

  await selectFormat('STEP');
  await target.expectAttribute(optionsDisclosure(), 'aria-expanded', 'false');
  const stepOptions = await openOptions();
  await target.expectCount(panel.getByCss('[data-slot="embedded-form-root"]'), 1);

  const surfaceState = await target.evaluateLocator(panel, (element) => {
    const scrollBody = element.querySelector<HTMLElement>('[data-slot="export-scroll-body"]');
    const footer = element.querySelector<HTMLElement>('[data-slot="export-action-footer"]');
    const destination = element.querySelector<HTMLElement>('section[aria-label="Destination"]');
    const embeddedRoot = element.querySelector<HTMLElement>('[data-slot="embedded-form-root"]');
    const optionsSection = element.querySelector<HTMLElement>('section[aria-label="Format options"]');
    const firstField = embeddedRoot?.querySelector<HTMLElement>('[data-slot="parameter-field"]');
    const ids = [...element.querySelectorAll<HTMLElement>('[id]')].map(({ id }) => id);
    if (!scrollBody || !footer || !destination || !embeddedRoot || !optionsSection || !firstField) {
      throw new Error('Export scroll surface, destination, embedded form, its fields, or action footer was missing.');
    }
    const embeddedRootStyle = getComputedStyle(embeddedRoot);
    return {
      footerInsideScroll: scrollBody.contains(footer),
      footerInsideDestination: destination.contains(footer),
      embeddedRootPaddingInline: [embeddedRootStyle.paddingLeft, embeddedRootStyle.paddingRight],
      /* The fields sit flush with their section: the inset is each field's own, as in the Parameters pane. */
      rootInsetFromSection: Math.round(
        embeddedRoot.getBoundingClientRect().left - optionsSection.getBoundingClientRect().left,
      ),
      fieldInsetFromRoot: Math.round(
        firstField.getBoundingClientRect().left - embeddedRoot.getBoundingClientRect().left,
      ),
      idsAreUnique: ids.length === new Set(ids).size,
    };
  });
  expect(surfaceState).toEqual({
    footerInsideScroll: true,
    footerInsideDestination: true,
    /* The embedded root adds no inset of its own: it has had no padding since the history baseline (#995), and its
     * fields carry the pane's field inset (`px-2.5`), so a second inset here would double it (#2291, ruling S13). */
    embeddedRootPaddingInline: ['0px', '0px'],
    rootInsetFromSection: 0,
    fieldInsetFromRoot: 0,
    idsAreUnique: true,
  });
  const exportAction = panel.getByRole('button', { name: 'Export STEP' });
  await target.expectCount(exportAction, 1);
  await target.screenshot(panel, 'export-pane-light-wide.png');

  await target.emulateColorScheme('dark');
  await target.setViewport({ width: 960, height: 760 });
  await target.expectVisible(stepOptions);
  await target.scrollIntoView(exportAction);
  await target.expectVisible(exportAction);
  await target.screenshot(panel, 'export-pane-dark-narrow.png');
});

test('keeps PNG composite options semantic, valid, and independently editable', async () => {
  await target.emulateColorScheme('light');
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();
  await openCommand('Export');

  const panel = selectors.getByCss('[data-slot="export-panel-body"]');
  await target.expectVisible(panel, 15_000);
  await selectFormat('PNG', { isMore: true });
  await openOptions();
  await target.expectCount(panel.getByText(/must be|is a required property/iu), 0);
  await target.expectCount(panel.getByText(/^Option \d+$/u), 0);

  const declaredWidth = panel.getByLabelText('Input for Width').first();
  await revealOption(panel, declaredWidth);
  expect(await fieldUnit(declaredWidth)).toBe('px');
  await target.expectCount(panel.getByRole('button', { name: 'Inferred unit for Width' }), 0);

  const camera = panel.getByRole('button', { name: 'Group: Camera' });
  await revealOption(panel, camera);
  await target.click(camera);
  const framing = panel.getByRole('combobox', { name: 'Select for Framing' });
  await target.expectVisible(framing);
  await target.click(framing);
  await target.click(selectors.getByRole('option', { name: 'Fixed' }));
  await target.expectCount(panel.getByText(/must be|is a required property/iu), 0);

  const visiblePrimitives = panel.getByRole('button', { name: 'Group: Visible Primitives' });
  await revealOption(panel, visiblePrimitives);
  await target.click(visiblePrimitives);
  await target.click(panel.getByRole('button', { name: 'Add item (Visible Primitives)' }));
  const remove = panel.getByRole('button', { name: 'Remove Visible Primitives 1' });
  await target.expectVisible(remove);
  await target.expectCount(panel.getByText(/must be|is a required property/iu), 0);
  await target.click(remove);
  await target.expectCount(remove, 0);

  await target.screenshot(panel, 'export-pane-png-composite-options.png');
});

test('mounts and exports a transcoded mesh route with its options in declared units', async () => {
  await target.emulateColorScheme('light');
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();
  await openCommand('Export');

  const panel = selectors.getByCss('[data-slot="export-panel-body"]');
  await target.expectVisible(panel, 15_000);
  // Replicad has no native 3MF writer, so 3MF is the assimp route whose edge pins the glTF source options.
  await selectFormat('3MF');
  await openOptions();
  // Tessellation is a preset or explicit tolerances; the tolerance inputs belong to the explicit form.
  const tessellation = panel.getByRole('combobox', { name: 'Select for Tessellation' });
  await target.expectVisible(tessellation, 15_000);
  await target.click(tessellation);
  await target.click(selectors.getByRole('option', { name: 'Explicit' }));
  const explicitGroup = panel.getByRole('button', { name: 'Group: Explicit' });
  await target.expectVisible(explicitGroup, 15_000);
  if ((await target.getAttribute(explicitGroup, 'aria-expanded')) !== 'true') {
    await target.click(explicitGroup);
  }

  const linearTolerance = panel.getByLabelText('Input for Linear Tolerance').first();
  await target.expectVisible(linearTolerance, 15_000);
  await target.expectCount(panel.getByText('Loading checked settings…'), 0);
  await target.expectCount(selectors.getByText(/could not be prepared|INVALID_SCHEMA/u), 0);
  expect(await fieldUnit(linearTolerance)).toBe('mm');
  expect(await fieldUnit(panel.getByLabelText('Input for Angular Tolerance').first())).toBe('°');

  const file = await target.download(panel.getByRole('button', { name: /^Export 3MF$/iu }));
  expect(file.suggestedFilename).toMatch(/\.3mf$/u);
  expect(file.base64.length).toBeGreaterThan(0);
  await target.screenshot(panel, 'export-pane-3mf-transcoded-units.png');
});
