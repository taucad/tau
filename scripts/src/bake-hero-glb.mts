/**
 * Bake the marketing hero gear point-cloud source models to GLB.
 *
 * The landing hero (R5) displays a pre-baked gear, sampled to a point cloud at
 * runtime. Baking here (rather than generating live) keeps `@taucad/runtime`,
 * the JSCAD kernel, and the bundler off the landing page's critical path
 * (OQ6). The gear geometry is deterministic, so a committed GLB is safe; this
 * script regenerates it whenever `gear.jscad.js` changes.
 *
 * Usage: `node scripts/src/bake-hero-glb.mts`  (or `nx run scripts:bake-hero-glb`)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNodeClient } from '@taucad/runtime/node';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const gearSourcePath = join(repoRoot, 'apps/ui/app/components/geometry/splash/gear.jscad.js');
const outputDirectory = join(repoRoot, 'apps/ui/app/routes/_index/assets');

const bakes = [
  { name: 'gear-12.glb', parameters: { numberTeeth: 12 } },
  { name: 'gear-8.glb', parameters: { numberTeeth: 8 } },
] as const;

async function main(): Promise<void> {
  const gearSource = await readFile(gearSourcePath, 'utf8');
  await mkdir(outputDirectory, { recursive: true });

  const client = await createNodeClient();

  for (const bake of bakes) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential: the bakes share one runtime client; concurrency risks kernel state and saves nothing for two models
    const result = await client.export('glb', {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- allowed filename.
      source: { files: { 'main.js': gearSource } },
      parameters: bake.parameters,
    });

    if (!result.success) {
      throw new Error(`Failed to bake ${bake.name}: ${result.issues.map((issue) => issue.message).join('; ')}`);
    }
    if (result.data.length !== 1 || result.data[0]?.mimeType !== 'model/gltf-binary') {
      throw new Error(
        `Expected one GLB artifact for ${bake.name}, received ${result.data.length}: ${result.data.map((file) => file.name).join(', ')}`,
      );
    }

    const [file] = result.data;
    const outputPath = join(outputDirectory, bake.name);
    // oxlint-disable-next-line eslint/no-await-in-loop -- see above; one-shot build script, sequential is intentional
    await writeFile(outputPath, file.bytes);
    console.log(`Baked ${bake.name} (${file.bytes.byteLength} bytes) → ${outputPath}`);
  }
}

await main();
