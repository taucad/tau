import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it, vi } from 'vitest';
import { ensureWithRetries, valePaths } from '#ensure-vale.js';

const root = resolve(import.meta.dirname, '../..');

describe('ensure-vale', () => {
  it('should keep the vale postinstall off and fetch the binary only for prose linting', () => {
    const workspace = load(readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8')) as {
      allowBuilds?: Record<string, boolean>;
    };
    expect(workspace.allowBuilds?.['@vvago/vale']).toBe(false);
    const project = JSON.parse(readFileSync(resolve(root, 'scripts/project.json'), 'utf8')) as {
      targets: Record<string, { options?: { command?: string } }>;
    };
    expect(project.targets['validate-prose']?.options?.command).toMatch(
      /^node scripts\/src\/ensure-vale\.ts && node_modules\/@vvago\/vale\/bin\/vale /,
    );
  });

  it('should point at the package binary', () => {
    expect(valePaths('/w').binary).toMatch(/^\/w\/node_modules\/@vvago\/vale\/bin\/vale(\.exe)?$/);
  });

  it('should not download when the binary already exists', async () => {
    const download = vi.fn();
    await expect(ensureWithRetries(() => true, download)).resolves.toBe(true);
    expect(download).not.toHaveBeenCalled();
  });

  it('should retry a failed download and stop once the binary exists', async () => {
    let present = false;
    const download = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('HTTP 504');
      })
      .mockImplementationOnce(() => {
        present = true;
      });
    const wait = vi.fn(async () => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(ensureWithRetries(() => present, download, { wait, retryDelay: 5 })).resolves.toBe(true);
    expect(download).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(5);
  });

  it('should give up after the bounded attempts', async () => {
    const download = vi.fn(() => {
      throw new Error('HTTP 504');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(ensureWithRetries(() => false, download, { wait: async () => undefined })).resolves.toBe(false);
    expect(download).toHaveBeenCalledTimes(3);
  });
});
