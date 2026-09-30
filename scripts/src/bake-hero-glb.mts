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
import { esbuild } from '@taucad/esbuild';
import { jscad } from '@taucad/jscad';
import { createNodeClient } from '@taucad/runtime/node';
import { defineRuntime } from '@taucad/runtime/worker';

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

  const client = await createNodeClient({ runtime: defineRuntime({ plugins: [esbuild(), jscad()] }) });

  try {
    for (const bake of bakes) {
      const document = client.open({
        source: { files: { 'main.js': gearSource }, entry: 'main.js' },
        parameters: bake.parameters,
        watch: false,
      });
      try {
        // oxlint-disable-next-line no-await-in-loop -- Sequential bakes share one kernel client.
        const result = await document.export('glb');
        if (!result.success) {
          throw new Error(`Failed to bake ${bake.name}: ${result.issues.map((issue) => issue.message).join('; ')}`);
        }
        if (result.files.length !== 1 || result.files[0].mimeType !== 'model/gltf-binary') {
          throw new Error(
            `Expected one GLB artifact for ${bake.name}, received ${result.files.length}: ${result.files.map((file) => file.name).join(', ')}`,
          );
        }

        const [file] = result.files;
        const outputPath = join(outputDirectory, bake.name);
        // oxlint-disable-next-line no-await-in-loop -- Sequential one-shot asset writes are intentional.
        await writeFile(outputPath, file.bytes);
        console.log(`Baked ${bake.name} (${file.bytes.byteLength} bytes) → ${outputPath}`);
      } finally {
        document.close();
      }
    }
  } finally {
    await client.shutdown();
  }
}

await main();
