// @vitest-environment node
import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Application-owned runtime plugin guard: the application roots that compose
 * the runtime keep no legacy sidecar files. It lists only its own folders and
 * `libs/telemetry`, a dependency, so a change to any of them selects this test.
 * The per-file plugin surface checks are tau-lint rules each project's
 * own lint runs (`no-plugin-default-export`, `no-plugin-default-import`,
 * `require-plugin-package-binding`, `no-kernel-type-assertion`), and each
 * plugin's `src/index.test.ts` pins its entry with
 * `assertPluginContractSurface` from `@taucad/runtime-testing`.
 */
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const sourceRoots = ['libs/telemetry/src', 'apps/ui/app/middleware', 'apps/ui/app/runtime'] as const;

describe('application runtime plugin surface', () => {
  it('should not keep legacy runtime sidecar source files in application source roots', () => {
    const legacySidecarPattern =
      /(?:^|\/)[^/]+\.(?:kernel|middleware|bundler|transcoder)\.js$|(?:^|\/)[^/]+\.(?:module|plugin)\.ts$/;
    const sidecars = sourceRoots
      .flatMap((root) => {
        const files: string[] = [];
        const visit = (absolutePath: string): void => {
          for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
            const child = join(absolutePath, entry.name);
            if (entry.isDirectory()) {
              visit(child);
              continue;
            }
            files.push(relative(repositoryRoot, child));
          }
        };
        visit(resolve(repositoryRoot, root));
        return files;
      })
      .filter((path) => legacySidecarPattern.test(path));

    expect(sidecars).toEqual([]);
  });
});
