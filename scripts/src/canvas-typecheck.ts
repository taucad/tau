/**
 * Typecheck one canvas's sources with the same module map the canvas Vite runner uses.
 *
 * Usage: TAU_CANVAS_PATH=docs/research/artifacts/<subject>/canvas node scripts/src/canvas-typecheck.ts
 * Writes a generated tsconfig under out/research/canvas-typecheck/ and runs tsgo --noEmit.
 * Only diagnostics inside the canvas directory fail the check; app and package files keep their own typecheck.
 * Exit codes: 0 clean, 1 canvas diagnostics or setup error.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import process from 'node:process';

import { resolveCanvasRoot } from '#canvas-vite.config.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const canvasRoot = resolveCanvasRoot();
const subject = basename(dirname(canvasRoot));

// Mirrors the aliases in canvas-vite.config.ts; `paths` in an extending tsconfig replaces the base map, so the app's entries are restated.
const paths: Record<string, string[]> = {
  '@taucad/ui/*': [resolve(repoRoot, 'packages/ui/src/*')],
  '@taucad/grammars': [resolve(repoRoot, 'libs/grammars/src/index.ts')],
  '@tau/api-guide': [resolve(repoRoot, 'scripts/canvas/api-guide.tsx')],
  '#index.js': [resolve(repoRoot, 'packages/runtime/src/index.ts')],
  '#*': [resolve(repoRoot, 'packages/ui/src/*'), resolve(repoRoot, 'apps/ui/app/*')],
};
const aliasesPath = resolve(canvasRoot, 'canvas.aliases.json');
if (existsSync(aliasesPath)) {
  const entries = JSON.parse(readFileSync(aliasesPath, 'utf8')) as Record<string, string>;
  for (const [specifier, target] of Object.entries(entries)) {
    paths[specifier] = [resolve(repoRoot, target)];
  }
}

const outputDirectory = resolve(repoRoot, 'out/research/canvas-typecheck', subject);
mkdirSync(outputDirectory, { recursive: true });
const tsconfigPath = resolve(outputDirectory, 'tsconfig.json');
writeFileSync(
  tsconfigPath,
  JSON.stringify(
    {
      extends: resolve(repoRoot, 'apps/ui/tsconfig.app.json'),
      compilerOptions: { noEmit: true, composite: false, incremental: false, rootDirs: [], paths },
      include: [`${canvasRoot}/**/*.ts`, `${canvasRoot}/**/*.tsx`],
      exclude: [`${canvasRoot}/node_modules`],
    },
    undefined,
    2,
  ),
);

const result = spawnSync('pnpm', ['exec', 'tsgo', '--noEmit', '--pretty', 'false', '-p', tsconfigPath], {
  cwd: repoRoot,
  encoding: 'utf8',
});
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
// ponytail: filters by path prefix; a diagnostic line wrapped without a file prefix is dropped.
const canvasPrefix = relative(repoRoot, canvasRoot);
const own = result.stdout
  .split('\n')
  .filter(
    (line) => line.startsWith(canvasPrefix) || line.startsWith(canvasRoot) || line.includes(`${subject}/canvas/`),
  );
if (own.length > 0) {
  console.error(own.join('\n'));
  process.exit(1);
}
console.log(`canvas typecheck clean: ${canvasPrefix}`);
