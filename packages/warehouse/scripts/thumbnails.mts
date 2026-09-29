/* oxlint-disable eslint/no-await-in-loop -- Process one project at a time to bound native memory and preserve deterministic corpus ordering. */
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { replicad } from '@taucad/replicad';
import { esbuild } from '@taucad/esbuild';
import { image } from '@taucad/image';
import { gltfEdgeDetection } from '@taucad/middleware';
import { createNodeClient } from '@taucad/runtime/node';
import { defineRuntime } from '@taucad/runtime/worker';
import { packageRoot, readDefinitions } from '#scripts/definitions.js';

const runtime = defineRuntime({ plugins: [replicad(), esbuild(), image()], middleware: [gltfEdgeDetection()] });
const only = process.argv.find((argument) => argument.startsWith('--only='))?.slice(7);
const check = process.argv.includes('--check');
const sourceDigestsPath = join(packageRoot, 'thumbnail-sources.json');
// oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- This script owns the generated digest map; entries only control reproducible image cache hits.
const sourceDigests: Record<string, string> = JSON.parse(await readFile(sourceDigestsPath, 'utf8').catch(() => '{}'));
const producer = await readFile(new URL(import.meta.url), 'utf8');
const definitions = await readDefinitions();
if (only?.split(',').some((id) => !definitions.some(({ part }) => part.id === id))) {
  throw new Error(`Unknown part: ${only}`);
}
for (const { part } of definitions) {
  if (only && !only.split(',').includes(part.id)) {
    continue;
  }
  const root = join(packageRoot, 'parts', part.id);
  const sourceHash = createHash('sha256').update(producer);
  const files = await readdir(root);
  for (const name of files.filter((file) => file.endsWith('.ts') && !file.endsWith('.geospec.ts')).sort()) {
    sourceHash.update(name).update(await readFile(join(root, name)));
  }
  const digest = sourceHash.digest('hex');
  const bytes = await readFile(join(root, 'thumbnail.webp')).catch(() => undefined);
  const current = bytes !== undefined && sourceDigests[part.id] === digest;
  if (check && !current) {
    throw new Error(`Missing or stale thumbnail: ${part.id}`);
  }
  if (current) {
    if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
      throw new Error(`Invalid thumbnail: ${part.id}`);
    }
    continue;
  }
  const client = await createNodeClient({ runtime, projectPath: root });
  try {
    const rendered = await client.render({ source: { path: 'main.ts' }, content: { includeEdges: true } });
    if (rendered.superseded || !rendered.geometry.success) {
      throw new Error(`Render failed: ${part.id}: ${JSON.stringify(rendered)}`);
    }
    const result = await client.export('webp', {
      content: { includeEdges: true },
      exportOptions: {
        mode: 'single',
        width: 768,
        height: 576,
        lineWidth: 3,
        camera: {
          framing: 'bounds',
          direction: ['keyed-shaft', 'd-shaft', 'split-bushing', 'split-collar', 'slotted-spring-pin'].includes(part.id)
            ? [-0.6123724357, 0.6123724357, 0.5]
            : [0.6123724357, -0.6123724357, 0.5],
          up: [0, 0, 1],
          margin: 0.1,
          projection: { kind: 'perspective', verticalFieldOfView: 45 },
        },
        quality: 0.9,
        ao: {},
      },
    });
    if (!result.success || result.data.length !== 1 || !result.data[0]) {
      throw new Error(`Thumbnail failed: ${part.id}: ${JSON.stringify(result)}`);
    }
    await writeFile(join(root, 'thumbnail.webp'), result.data[0].bytes);
    sourceDigests[part.id] = digest;
    await writeFile(sourceDigestsPath, JSON.stringify(sourceDigests, undefined, 2) + '\n');
    console.log(`Rendered ${part.id}`);
  } finally {
    await client.shutdown({ drain: true });
  }
}

/* oxlint-enable eslint/no-await-in-loop */
