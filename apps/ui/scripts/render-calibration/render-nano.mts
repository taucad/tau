#!/usr/bin/env node
/**
 * Capture material-preserving catalog fixtures with the installed nanoraster backend.
 *
 * Required: generated out/render-calibration/catalog.json (or --catalog PATH).
 * Optional: --fixtures IDs --profile JSON --name LABEL --camera WebGL-metadata.json,
 * --span METERS --distance METERS --width PIXELS --height PIXELS --line-width PIXELS --output DIR.
 * Usage: node apps/ui/scripts/render-calibration/render-nano.mts --fixtures f5-onshape-reference,f6-authored-planetary
 * Outputs: white-background PNG, independent transparent geometry-mask PNG, exact options and timing JSON.
 * Exit codes: 0 success; 1 invalid input, hash mismatch, missing adapter or native render failure.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
/* oxlint-disable no-restricted-imports -- The offline capture exercises the installed dependency through its existing package owner; no new dependency is introduced. */
/* eslint-disable @nx/enforce-module-boundaries -- Installed dependency runtime and wire types for an offline diagnostic, owned by the image plugin. */
import {
  describeAdapter,
  renderImages,
} from '../../../../packages/plugins/image/node_modules/nanoraster/dist/index.node.mjs';
import type {
  RenderCamera,
  RenderLighting,
} from '../../../../packages/plugins/image/node_modules/nanoraster/dist/index.node.mjs';
/* eslint-enable @nx/enforce-module-boundaries -- Restore normal workspace import enforcement after the two installed-dependency imports. */
/* oxlint-enable no-restricted-imports */

type Vector = [number, number, number];
type FixedCamera = Extract<RenderCamera, { framing: 'fixed' }>;
type Fixture = {
  id: string;
  file: string;
  sha256: string;
  bounds: { min: Vector; max: Vector };
  materials: unknown[];
  stats: Record<string, number>;
};
type CaptureMetadata = {
  camera: Omit<FixedCamera, 'framing'>;
};

const rootDirectory = resolve(import.meta.dirname, '../../../..');
const hash = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
const positive = (value: string | undefined, fallback: number, label: string): number => {
  const number = value === undefined ? fallback : Number(value);
  assert.ok(Number.isFinite(number) && number > 0, `${label} must be positive and finite`);
  return number;
};

const makeCamera = ({
  fixture,
  metadata,
  span,
  distance,
}: {
  fixture: Fixture;
  metadata?: CaptureMetadata;
  span?: string;
  distance?: string;
}): FixedCamera => {
  const center = fixture.bounds.min.map((value, axis) => (value + fixture.bounds.max[axis]!) / 2);
  // Canonical GLB [x,y,z] maps to Tau [x,-z,y]. GLB bytes remain unchanged.
  const target: Vector = [center[0]!, -center[2]!, center[1]!];
  const component = 0.21672292906413684;
  let selected: FixedCamera = metadata
    ? {
        framing: 'fixed',
        position: metadata.camera.position,
        target: metadata.camera.target,
        up: metadata.camera.up,
        projection: metadata.camera.projection,
        clipping: metadata.camera.clipping,
      }
    : {
        framing: 'fixed',
        target,
        position: [target[0] + component, target[1] - component, target[2] + component],
        up: [-1 / Math.sqrt(6), 1 / Math.sqrt(6), 2 / Math.sqrt(6)],
        projection: { kind: 'orthographic', verticalSpan: 0.1985, zoom: 1 },
      };
  if (span !== undefined) {
    assert.equal(selected.projection?.kind, 'orthographic', '--span requires an orthographic camera');
    selected = {
      ...selected,
      projection: { kind: 'orthographic', verticalSpan: positive(span, 0.1985, 'span'), zoom: 1 },
    };
  }
  if (distance !== undefined) {
    const delta = selected.position.map((value, axis) => value - selected.target[axis]!);
    const length = Math.hypot(...delta);
    assert.ok(length > 0, 'Camera position must differ from target');
    const desired = positive(distance, length, 'distance');
    const factor = desired / length;
    // Let nanoraster derive equivalent clipping coverage for the translated camera.
    const { clipping: _, ...withoutClipping } = selected;
    selected = {
      ...withoutClipping,
      position: selected.target.map((value, axis) => value + delta[axis]! * factor) as Vector,
    };
  }
  return selected;
};

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      catalog: { type: 'string', default: 'out/render-calibration/catalog.json' },
      fixtures: { type: 'string', default: 'f5-onshape-reference,f6-authored-planetary' },
      profile: { type: 'string' },
      name: { type: 'string', default: 'studio' },
      camera: { type: 'string' },
      span: { type: 'string' },
      distance: { type: 'string' },
      width: { type: 'string', default: '1276' },
      height: { type: 'string', default: '798' },
      'line-width': { type: 'string', default: '1' },
      output: { type: 'string', default: 'out/render-calibration/captures/nano' },
    },
  });
  assert.match(values.name, /^[a-z\d][a-z\d-]*$/u, '--name must be a safe lowercase label');
  const catalogPath = resolve(rootDirectory, values.catalog);
  const catalogBytes = await readFile(catalogPath);
  const catalog = JSON.parse(catalogBytes.toString()) as { fixtures: Fixture[] };
  assert.ok(Array.isArray(catalog.fixtures), 'Catalog must contain fixtures');
  const requested = values.fixtures.split(',');
  const fixtures = requested.map((id) => {
    const fixture = catalog.fixtures.find((entry) => entry.id === id);
    assert.ok(fixture, `Missing catalog fixture ${id}`);
    return fixture;
  });
  const profileBytes = values.profile ? await readFile(resolve(rootDirectory, values.profile)) : undefined;
  // The public nanoraster API validates every supplied lighting/camera field strictly.
  const lighting: RenderLighting = profileBytes ? (JSON.parse(profileBytes.toString()) as RenderLighting) : 'studio';
  const metadata: CaptureMetadata | undefined = values.camera
    ? (JSON.parse(await readFile(resolve(rootDirectory, values.camera), 'utf8')) as CaptureMetadata)
    : undefined;
  const output = resolve(rootDirectory, values.output);
  await mkdir(output, { recursive: true });
  const adapter = await describeAdapter();
  assert.ok(adapter, 'No nanoraster GPU adapter is available');
  const packageInfo = JSON.parse(
    await readFile(
      new URL('../../../../packages/plugins/image/node_modules/nanoraster/package.json', import.meta.url),
      'utf8',
    ),
  ) as { version: string };
  const scriptSha256 = hash(new Uint8Array(await readFile(import.meta.filename)));
  for (const fixture of fixtures) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Capture order makes cold/warm timings explicit and shares one native renderer.
    const glb = new Uint8Array(await readFile(resolve(dirname(catalogPath), fixture.file)));
    assert.equal(hash(glb), fixture.sha256, `Catalog hash mismatch for ${fixture.id}`);
    const camera = makeCamera({ fixture, metadata, span: values.span, distance: values.distance });
    const options = {
      format: 'png',
      width: positive(values.width, 1276, 'width'),
      height: positive(values.height, 798, 'height'),
      world: { up: '+z', forward: '-y', unit: 'meter' },
      lineWidth: positive(values['line-width'], 1, 'line-width'),
      surfaces: true,
      lines: true,
      lighting,
      axes: false,
      scaleBar: false,
      views: [{ id: 'iso', camera }],
      timings: true,
    } as const;
    const captureStart = performance.now();
    // oxlint-disable-next-line eslint/no-await-in-loop -- GPU captures intentionally serialize through the native facade.
    const opaque = await renderImages(glb, { ...options, background: '#FFFFFF' });
    // oxlint-disable-next-line eslint/no-await-in-loop -- The mask uses identical geometry/camera with only the clear alpha changed.
    const masked = await renderImages(glb, { ...options, background: '#00000000' });
    const totalDuration = performance.now() - captureStart;
    const basename = `${fixture.id}-${values.name}`;
    const imagePath = resolve(output, `${basename}.png`);
    const maskPath = resolve(output, `${basename}-mask.png`);
    const record = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      renderer: { name: 'nanoraster', version: packageInfo.version, adapter, node: process.version },
      catalogSha256: hash(new Uint8Array(catalogBytes)),
      scriptSha256,
      fixture: { id: fixture.id, sha256: fixture.sha256, stats: fixture.stats, materials: fixture.materials },
      profile: {
        name: values.name,
        source: values.profile ?? 'installed studio preset',
        sha256: profileBytes && hash(new Uint8Array(profileBytes)),
      },
      options,
      cameraSource: values.camera ?? 'canonical isometric, catalog bounds center',
      transform: 'GLB meters/Y-up to Tau meters/Z-up: [x,y,z] -> [x,-z,y]; GLB bytes unmodified',
      color: { output: 'sRGB RGBA8', toneMapping: 'fixed ACES Filmic', msaaSamples: 4, ao: false },
      images: {
        opaque: { path: imagePath, sha256: hash(opaque[0].file.bytes), background: '#FFFFFF' },
        mask: { path: maskPath, sha256: hash(masked[0].file.bytes), background: '#00000000' },
      },
      timings: { opaque: opaque.timings, mask: masked.timings, totalWallMilliseconds: totalDuration },
      limitation:
        'Pixel and timing diagnostics; no parity or human preference claim. Orthographic shading currently depends on camera distance.',
    };
    // oxlint-disable-next-line eslint/no-await-in-loop -- Persist each completed fixture before starting the next native render.
    await Promise.all([
      writeFile(imagePath, opaque[0].file.bytes),
      writeFile(maskPath, masked[0].file.bytes),
      writeFile(resolve(output, `${basename}.json`), `${JSON.stringify(record, null, 2)}\n`),
    ]);
    console.log(
      `${fixture.id} ${values.name}: ${options.width}x${options.height}, ${totalDuration.toFixed(1)} ms; ${imagePath}`,
    );
  }
};

try {
  await main();
} catch (error) {
  console.error('Nanoraster calibration capture failed:', error);
  process.exitCode = 1;
}
