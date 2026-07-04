#!/usr/bin/env node
/**
 * Regenerate the GeoSpec fixture corpus from its committed manifests.
 *
 * Usage (from the repo root):
 *   node packages/geospec/fixtures/scripts/regenerate.mjs [fixtureId ...]
 *
 * Walks every `fixtures/<family>/<name>/manifest.json`, runs its generator
 * script through the runtime CLI (STEP export, model frame / z-up default),
 * applies the manifest's postEdit script when declared, and verifies the
 * emitted text is STEP with the expected NAUO structure. Hand-authored
 * fixtures (`generator.script === 'hand-authored'`) are skipped — their STEP
 * text is committed source. Determinism rule: regeneration must be
 * geometrically identical; the acceptance harness compares loaded facts,
 * never bytes (header timestamps differ).
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixturesRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = resolve(fixturesRoot, '../../..');
const cli = join(repoRoot, 'packages/cli/dist/bin/taucad.js');
const families = ['contact', 'clearance', 'mate', 'containment', 'selector'];
const only = new Set(process.argv.slice(2));

let generated = 0;
let totalBytes = 0;
for (const family of families) {
  const familyDir = join(fixturesRoot, family);
  for (const name of readdirSync(familyDir).sort()) {
    const fixtureDir = join(familyDir, name);
    if (!statSync(fixtureDir).isDirectory()) continue;
    const manifest = JSON.parse(readFileSync(join(fixtureDir, 'manifest.json'), 'utf8'));
    if (only.size > 0 && !only.has(manifest.fixture)) continue;
    const output = join(fixtureDir, 'model.step');
    if (manifest.generator.script === 'hand-authored') {
      console.log(`· ${manifest.fixture} (hand-authored, committed as source)`);
      totalBytes += statSync(output).size;
      continue;
    }
    const script = join(fixturesRoot, manifest.generator.script);
    execFileSync(
      'node',
      [
        cli,
        'export',
        script,
        '--ext=step',
        `--output=${output}`,
        `--params=${JSON.stringify(manifest.generator.parameters ?? {})}`,
      ],
      { stdio: ['ignore', 'ignore', 'inherit'], cwd: repoRoot },
    );
    // The CLI leaves a .tau render cache beside the script; never commit it.
    rmSync(join(dirname(script), '.tau'), { recursive: true, force: true });
    if (manifest.generator.postEdit) {
      execFileSync('node', [join(fixturesRoot, manifest.generator.postEdit.script), output], { cwd: repoRoot });
    }
    const text = readFileSync(output, 'utf8');
    if (!text.startsWith('ISO-10303-21')) throw new Error(`${manifest.fixture}: output is not STEP text`);
    const nauoCount = (text.match(/NEXT_ASSEMBLY_USAGE_OCCURRENCE/g) ?? []).length;
    if (nauoCount === 0) throw new Error(`${manifest.fixture}: no NEXT_ASSEMBLY_USAGE_OCCURRENCE in output`);
    const size = statSync(output).size;
    totalBytes += size;
    generated += 1;
    console.log(`✓ ${manifest.fixture} (${nauoCount} NAUO, ${(size / 1024).toFixed(0)} KiB)`);
  }
}
console.log(`Regenerated ${generated} fixtures; corpus ${(totalBytes / (1024 * 1024)).toFixed(2)} MiB (budget 5 MiB).`);
