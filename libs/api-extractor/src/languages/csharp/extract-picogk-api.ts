#!/usr/bin/env node
/**
 * Regenerate the committed PicoGK {@link ApiCorpus} from Roslyn.
 *
 * Purpose: drive `Tau.PicoGK.Worker --emit-api` and write `generated/picogk`.
 * Why: consumers read the committed corpus (R9); .NET is a regeneration-time
 * dependency only, so `pnpm install && nx build` stays green without an SDK.
 * Environment: a prepared PicoGK resource for the host target, from
 * `pnpm nx run desktop:prepare-picogk-dotnet`.
 * Usage: `tsx src/languages/csharp/extract-picogk-api.ts`
 * Exit codes: 0 on success; 1 when the .NET resource is absent or extraction fails.
 *
 * @module
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { parseCsharpSurface, toCsharpCorpus } from '#languages/csharp/csharp-corpus.js';
import type { ApiCorpus } from '#model/api-corpus.types.js';

const serialize = (corpus: ApiCorpus): string => `${JSON.stringify(corpus, undefined, 2)}\n`;

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const outputDirectory = resolve(import.meta.dirname, '../../generated/picogk');
const target = `${process.platform}-${process.arch}`;
const resourceRoot = join(repoRoot, 'apps/desktop/resources/picogk', target);

/** What the driver needs from the prepared resource manifest. */
type RuntimeManifest = { readonly workerPath: string; readonly picoGkCommit: string };

const missing = (reason: string): never => {
  console.error(`Cannot regenerate the PicoGK API corpus: ${reason}`);
  console.error('The committed corpus under src/generated/picogk is the shipped artifact; regeneration needs .NET.');
  console.error(`Prepare it with:\n  pnpm nx run desktop:prepare-picogk-dotnet --target ${target}`);
  return process.exit(1);
};

const locate = (): { readonly worker: string; readonly sourceRoot: string } => {
  const manifestPath = join(resourceRoot, 'tau-runtime-manifest.json');
  if (!existsSync(manifestPath)) {
    missing(`no prepared PicoGK resource at ${resourceRoot}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as RuntimeManifest;
  const worker = join(resourceRoot, manifest.workerPath);
  // The pinned upstream tree the worker was built from. PicoGK is extracted from
  // source, not from PicoGK.dll: packaging deletes every .xml, so a metadata walk
  // would carry no documentation at all.
  const sourceRoot = join(repoRoot, 'out/cache/picogk', `PicoGK-${manifest.picoGkCommit}`);
  if (!existsSync(worker)) {
    missing(`the prepared worker is missing at ${worker}`);
  }
  if (!existsSync(sourceRoot)) {
    missing(`the pinned PicoGK source is missing at ${sourceRoot}`);
  }
  return { worker, sourceRoot };
};

function main(): void {
  const { worker, sourceRoot } = locate();
  const scratch = mkdtempSync(join(tmpdir(), 'tau-picogk-api-'));
  try {
    const surfacePath = join(scratch, 'surface.json');
    execFileSync(worker, ['--emit-api', surfacePath, sourceRoot], { stdio: 'inherit' });
    const payload = parseCsharpSurface(JSON.parse(readFileSync(surfacePath, 'utf8')));
    if (payload.diagnosticErrors > 0) {
      console.warn(
        `PicoGK sources produced ${String(payload.diagnosticErrors)} compiler errors; the surface may be partial.`,
      );
    }
    mkdirSync(outputDirectory, { recursive: true });
    const outputPath = join(outputDirectory, 'picogk.corpus.json');
    // Keep the previous timestamp when nothing else moved, so the staleness gate
    // (R9) diffs the surface rather than the clock.
    const previous = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : undefined;
    const previousDate =
      previous === undefined ? undefined : (JSON.parse(previous) as ApiCorpus).metadata.extractionDate;
    const unchanged = previousDate === undefined ? undefined : serialize(toCsharpCorpus(payload, previousDate));
    if (unchanged !== undefined && unchanged === previous) {
      console.log(`PicoGK C# corpus is current: ${outputPath}`);
      return;
    }
    const corpus = toCsharpCorpus(payload, new Date().toISOString());
    writeFileSync(outputPath, serialize(corpus));
    console.log(`PicoGK C# corpus written to ${outputPath} (${String(corpus.metadata.totalEntries)} entries)`);
  } finally {
    rmSync(scratch, { force: true, recursive: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
