/* oxlint-disable no-await-in-loop -- Each surface is visited in turn: the oracle reads what that navigation transferred. */
import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

/** Surfaces a person reaches before any project has selected a kernel, each with the landmark that shows it. */
const preSelectionSurfaces = [
  ['/', 'main'],
  ['/projects', 'main'],
  ['/projects/new', 'main'],
  ['/community', 'main'],
  ['/?settings=general', 'dialog'],
] as const;

/** The modules a replicad TypeScript project needs: its kernel build and the esbuild bundler that compiles it. */
const replicadModule = /\/replicad_(?:multi|single)-[\w-]+\.wasm$/u;
const selectedModules = [replicadModule, /\/esbuild-[\w-]+\.wasm$/u];

/** The paths of the WASM modules the target transferred since the last read. */
const readWasmPaths = async (settle?: boolean): Promise<string[]> => {
  const urls = await target.readObservedWasm(settle);
  return urls.map((url) => new URL(url).pathname);
};

/*
 * T14 (lazy selection): a kernel's WebAssembly reaches the browser only once a document selects that kernel. The
 * observer sees the page, its frames and their dedicated workers, where the runtime compiles kernel modules.
 */
describe('Kernel WASM laziness', () => {
  test('should transfer no WASM before a kernel is selected, then only the selected kernel modules', async () => {
    await target.startObservedWasm();

    for (const [path, landmark] of preSelectionSurfaces) {
      await target.navigate(path);
      await target.expectVisible(selectors.getByRole(landmark), 30_000);
      expect(await readWasmPaths(), path).toEqual([]);
    }

    await target.navigate('/__e2e/example-fixture?locator=replicad.hollow-box');
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
    const transferred: string[] = [];
    await expect
      .poll(
        async () => {
          transferred.push(...(await readWasmPaths(false)));
          return transferred.some((path) => replicadModule.test(path));
        },
        { timeout: 90_000, interval: 1000 },
      )
      .toBe(true);
    transferred.push(...(await readWasmPaths(false)));

    expect(transferred.filter((path) => !selectedModules.some((module) => module.test(path)))).toEqual([]);
  });
});
