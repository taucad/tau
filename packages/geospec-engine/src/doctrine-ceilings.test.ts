import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { Engine } from 'geospec-engine/node';

/** The engine's `initialize` request, as `@taucad/host` sends it to read the admission limits. */
const configurationRequest =
  '{"canonicalProfile":"geospec-jcs-v1","method":"initialize","protocolVersion":3,"registryVersion":5,"requestId":"configuration"}';

type AdmissionLimits = Readonly<
  Record<'maxSubjectBytes' | 'maxResourceBytes' | 'maxTotalBinaryBytes' | 'maxTriangles' | 'maxVertices', number>
>;

const engineLimits = (): AdmissionLimits => {
  const engine = new Engine(undefined, undefined, undefined);
  try {
    const answer = JSON.parse(
      new TextDecoder().decode(engine.processRequest(new TextEncoder().encode(configurationRequest))),
    ) as { result: { configuration: { binaryAdmissionLimits: AdmissionLimits } } };
    return answer.result.configuration.binaryAdmissionLimits;
  } finally {
    engine.close();
  }
};

/** The value cell of the Ceilings row whose first cell names `name`. */
const ceiling = (doctrine: string, name: string): string => {
  const row = doctrine.split('\n').find((line) => line.startsWith(`| \`${name}\``));
  const value = row?.split('|')[2]?.trim();
  if (value === undefined) {
    throw new Error(`doctrine.md has no Ceilings row for ${name}`);
  }
  return value;
};

const mebibytes = (bytes: number): string => `${String(bytes / 1024 / 1024)} MiB`;

// The geospec-authoring skill tells agents these limits; they must be the ones the installed engine enforces.
describe('GeoSpec doctrine ceilings', () => {
  it('should state the admission limits the engine reports', async () => {
    const doctrine = await readFile(resolve(import.meta.dirname, '../../geospec/agent/doctrine.md'), 'utf8');
    const limits = engineLimits();

    expect(limits.maxResourceBytes).toBe(limits.maxSubjectBytes);
    expect(ceiling(doctrine, 'maxSubjectBytes')).toBe(`${mebibytes(limits.maxSubjectBytes)} each`);
    expect(ceiling(doctrine, 'maxTotalBinaryBytes')).toBe(mebibytes(limits.maxTotalBinaryBytes));
    expect(ceiling(doctrine, 'maxTriangles')).toBe(
      `${limits.maxTriangles.toLocaleString('en-US')}, ${limits.maxVertices.toLocaleString('en-US')}`,
    );
    // A mesh load exports 72 bytes per triangle, so the subject limit admits about this many.
    expect(doctrine).toContain(
      `near ${(Math.floor(limits.maxSubjectBytes / 72 / 10_000) * 10_000).toLocaleString('en-US')} triangles`,
    );
  });
});
