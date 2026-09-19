import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeEach, expect, it, vi } from 'vitest';

type ManifoldInitializer = (config?: { locateFile(): string }) => Promise<{ setup(): void }>;

const { initManifold } = vi.hoisted(() => ({ initManifold: vi.fn<ManifoldInitializer>() }));

vi.mock('manifold-3d', () => ({ default: initManifold }));

beforeEach(() => {
  vi.resetModules();
  initManifold.mockReset();
});

it('should locate Manifold WASM explicitly when initializing the engine module', async () => {
  const setup = vi.fn();
  initManifold.mockResolvedValue({ setup });

  const { ensureManifoldModule } = await import('#mesh/manifold-module.js');
  await ensureManifoldModule();

  const locateFile = initManifold.mock.calls[0]?.[0]?.locateFile;
  expect(locateFile).toBeTypeOf('function');
  const wasmUrl = locateFile();
  expect(wasmUrl).toMatch(/manifold\.wasm$/u);
  expect(existsSync(fileURLToPath(wasmUrl))).toBe(true);
  expect(setup).toHaveBeenCalledOnce();
});
