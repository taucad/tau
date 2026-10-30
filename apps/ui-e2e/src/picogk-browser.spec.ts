import { expect, inject, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import { base64ToUint8Array, uint8ArrayToHex } from 'uint8array-extras';
import * as target from '#support/external-target.js';
import { treeItem } from '#support/file-tree.js';
import { readWorkbenchTree, writeWorkbenchFile } from '#support/workbench-files.js';

/*
 * PicoGK as a clean browser consumer (T15). Every figure here comes from the built application
 * serving the staged package bundle: the kernel is advertised only because the build embedded a
 * prepared bundle, and each example's own unchanged C# is compiled in the browser against that
 * bundle's references. A research fixture driving the session directly proves none of that, which
 * is why this spec opens the shipped examples through the ordinary project route instead.
 */
const bundle = inject('picogkBundle');
const isolated = inject('crossOriginIsolation');

const openCommand = async (name: string): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), name);
  await target.click(selectors.getByRole('option', { name: new RegExp(`^${name}(?:\\s|$)`, 'u') }));
};

/** Compiling and voxelising C# in wasm is slower than a JavaScript kernel's first frame. */
const firstFrame = 240_000;

const openExample = async (name: string): Promise<void> => {
  await target.navigate(`/__e2e/example-fixture?locator=picogk.${name}`);
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), firstFrame);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
  await target.expectGeometryFramed();
};

test('serves the staged package bundle the build embedded', async () => {
  expect(bundle, 'PICOGK_BROWSER_ASSETS_ROOT must name a prepared bundle').toBeDefined();
  const staged = bundle!;
  await openExample('boolean-shell');
  // The bundle is served under its own manifest digest, so reading those exact bytes back out of
  // the running build proves the kernel just exercised is the staged package's bundle itself.
  const served = await target.evaluate(
    async (request: { readonly prefix: string; readonly paths: readonly string[] }) =>
      Object.fromEntries(
        await Promise.all(
          request.paths.map(async (path) => {
            const response = await fetch(`${request.prefix}${path}`);
            if (!response.ok) {
              return [path, `HTTP ${String(response.status)}`] as const;
            }
            const bytes = new Uint8Array(await response.arrayBuffer());
            return [
              path,
              [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
                .map((byte) => byte.toString(16).padStart(2, '0'))
                .join(''),
            ] as const;
          }),
        ),
      ),
    {
      prefix: `/picogk-browser/${staged.sha256}/`,
      paths: ['assets-manifest.json', ...staged.files.map((file) => file.path)],
    },
  );
  expect(served['assets-manifest.json']).toBe(staged.sha256);
  for (const file of staged.files) {
    expect(served[file.path], file.path).toBe(file.sha256);
  }
  // Offline after staging: everything this run fetched came from this origin, so the kernel needs
  // no package feed, no runtime download and no network of its own once the bundle is staged.
  const remote = await target.evaluate(() => {
    /* Tau's own session check reaches its API host, which the kernel never uses; everything the
     * kernel runs on must come from this origin. */
    const api = new URL((globalThis as { ENV?: { TAU_API_URL?: string } }).ENV?.TAU_API_URL ?? location.origin).origin;
    return performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter(
        (name) =>
          !name.startsWith(`${location.origin}/`) && !name.startsWith(`${api}/`) && !/^(?:blob|data):/u.test(name),
      );
  });
  expect(remote).toEqual([]);
  // The compiler and the library are the two the kernel cannot have run without.
  expect(staged.files.map((file) => file.path)).toContain('refs/PicoGK.dll');
  expect(staged.files.some((file) => /Microsoft\.CodeAnalysis\.CSharp/u.test(file.path))).toBe(true);
});

test('binds the parameters an example declares in its own C#', async () => {
  await openExample('parameterized-sphere');
  await openCommand('Open parameters');
  // The names, descriptions and ranges come from the author's DataAnnotations, analysed by the
  // same compilation service the native target uses; the browser adds no second declaration.
  for (const label of ['Voxel size', 'Radius', 'Color']) {
    // oxlint-disable-next-line no-await-in-loop -- the three fields are read one at a time
    await target.expectVisible(selectors.getByText(label, { exact: true }).first(), 60_000);
  }
  const radius = selectors.getByLabelText('Input for Radius').first();
  await target.expectVisible(radius, 60_000);
  expect(await target.getAttribute(radius, 'value')).toBe('20');
  await target.fill(radius, '28');
  await target.expectGeometryFramed();
  expect(await target.getAttribute(radius, 'value')).toBe('28');
});

test("runs the author's program on the threaded WASM build this page can hold", async () => {
  // Tau prefers the threaded build, and the page's own COOP/COEP are what make it reachable: the
  // multi variant needs shared memory, so a page that is not cross-origin isolated can only get
  // the serial one. Reading the variant out of the running build is what makes the preference a
  // fact rather than a default in a schema.
  await openExample('boolean-shell');
  expect(await target.evaluate(() => globalThis.crossOriginIsolated)).toBe(isolated);
  await openCommand('Open console');
  const panel = selectors.getByCss('[data-slot="console-panel-body"]');
  await target.expectVisible(panel, 60_000);
  await target.expectVisible(
    panel.getByText(`PicoGK browser WASM variant: ${isolated ? 'multi' : 'single'}`, { exact: false }),
    60_000,
  );
});

test('compiles an example helper and reads its asset', async () => {
  // `main.cs` calls `ShapeFactory.Create`, declared in a second author file, and that helper reads
  // `radius-scale.txt` at run time. Geometry framing at all therefore proves the browser selected
  // both sources for one compilation and served the data asset to the running program; neither a
  // missed helper nor a missing asset can reach a framed scene.
  await openExample('multifile-asset');
  await openCommand('Open files');
  for (const path of ['main.cs', 'ShapeFactory.cs', 'radius-scale.txt']) {
    // oxlint-disable-next-line no-await-in-loop -- the three rows are read one at a time
    await target.expectVisible(treeItem(path), 60_000);
  }
  await openCommand('Open console');
  // Nothing failed: a missing helper or an unreadable asset would have put a diagnostic on the
  // viewer bar's issues segment, the same one the diagnostic row below reads.
  await target.expectVisible(selectors.getByCss('[data-slot="console-panel-body"]'), 60_000);
  await target.expectCount(selectors.getByRole('button', { name: /^Build failed\. Issues: /u }), 0);
});

test("exports the kernel's own geometry, identically on repeat", async () => {
  await openExample('boolean-shell');
  await openCommand('Export');
  const panel = selectors.getByCss('[data-slot="export-panel-body"]');
  await target.expectVisible(panel, 15_000);
  const exportGlb = async (): Promise<Uint8Array<ArrayBuffer>> => {
    const picker = selectors.getByRole('button', { name: 'Export format' });
    await target.expectVisible(picker, 15_000);
    await target.click(picker);
    await target.click(selectors.getByCss('[cmdk-item][data-value="glb"]'));
    const file = await target.download(panel.getByRole('button', { name: /^Export GLB$/iu }));
    expect(file.suggestedFilename).toMatch(/\.glb$/u);
    return base64ToUint8Array(file.base64);
  };
  const first = await exportGlb();
  // A real glTF binary container, meshed from the voxel field the author's own C# built.
  expect(new TextDecoder().decode(first.subarray(0, 4))).toBe('glTF');
  const digest = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> =>
    uint8ArrayToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
  const sha256 = await digest(first);
  // Cross-target byte parity is a structured gate of its own; this records the bytes and proves
  // the same session exports them identically twice.
  await target.writeArtifact('picogk-browser-boolean-shell.glb.sha256', `${sha256}  ${String(first.byteLength)}\n`);
  const second = await exportGlb();
  expect(await digest(second)).toBe(sha256);
});

test('locates a compiler diagnostic in the author file that caused it', async () => {
  await openExample('boolean-shell');
  /*
   * Model an edit the author's file cannot compile. The bytes are changed in the project itself and
   * the page reloaded, which is the path `arrange-workbench.spec.ts` established: driving CodeMirror
   * here is not available, because this profile denies clipboard read and `ControlOrMeta+a` unmounts
   * the editor before a paste can land. What is under test is the diagnostic, not the editor.
   */
  const broken = 'using PicoGK;\n\nLibrary.Go(1.0f, () => { Missing.Helper(); });\n';
  await writeWorkbenchFile('main.cs', broken);
  expect(await readWorkbenchTree(), 'the edit reached the project').toMatchObject({ '/main.cs': broken });
  await target.reload();
  /*
   * The build fails, and the viewer bar's own issues list carries the compiler's message: the same
   * surface `apps/desktop-e2e` opens for the native target, named the same way.
   */
  const segment = selectors.getByRole('button', { name: /^Build failed\. Issues: /u }).first();
  await target.expectVisible(segment, firstFrame);
  if ((await target.getAttribute(segment, 'aria-expanded')) !== 'true') {
    await target.click(segment);
  }
  const issues = selectors.getByRole('region', { name: 'Issues', exact: true });
  await target.expectVisible(issues, 30_000);
  await target.expectVisible(issues.getByText('Missing', { exact: false }), 30_000);
  const reported = (await target.textContent(issues)) ?? '';
  // Roslyn's own message, and the position in the author's own file that caused it.
  expect(reported).toContain("The name 'Missing' does not exist in the current context");
  expect(reported).toMatch(/main\.cs:3:\d+/u);
  await target.writeArtifact('picogk-browser-diagnostic.txt', `${reported}\n`);
});
