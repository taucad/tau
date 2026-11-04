/* eslint-disable @typescript-eslint/naming-convention -- kitchen-sink's parameter keys are its OpenSCAD Customizer groups. */
/**
 * T28: the evaluate observation's `parameters` facts on the real kitchen-sink and hinged-box examples. Each example's
 * kernel describes its own parameters, `@taucad/parameters` compiles the manifest and the worker walks it, so the counts
 * come from the examples themselves rather than from a transcribed schema.
 *
 * `runtime:test` repeats these facts from `packages/runtime/src/client/fixtures/<example>.parameters.json`, copies of the
 * declarations these examples describe; the last block here fails when a copy no longer equals the live description.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RuntimeOperationObservation } from '@taucad/runtime/types';
import { createExampleRuntimeClient } from '#scripts/runtime.js';

const examplePath = (kernel: string, name: string): string =>
  fileURLToPath(new URL(`kernels/${kernel}/${name}/`, import.meta.url));

/**
 * Evaluate one example once with observation on and return its evaluate observation.
 *
 * @param example - The example's kernel directory, name and entry file.
 * @param parameters - Values to open the document with; the defaults when omitted.
 * @returns The joined evaluate observation.
 */
const observeEvaluate = async (
  example: Readonly<{ kernel: string; name: string; entry: string }>,
  parameters?: Record<string, unknown>,
): Promise<RuntimeOperationObservation | undefined> => {
  const client = await createExampleRuntimeClient(examplePath(example.kernel, example.name));
  const seen: RuntimeOperationObservation[] = [];
  client.on('operation', (observation) => seen.push(observation));
  client.observe('facts');
  try {
    const document = client.open({
      source: { path: example.entry },
      ...(parameters === undefined ? {} : { parameters }),
      watch: false,
    });
    try {
      const outcome = await document.evaluation();
      expect(outcome).toMatchObject({ superseded: false, evaluation: { success: true } });
      await expect
        .poll(() => seen.find(({ operation }) => operation === 'evaluate')?.facts, { timeout: 5000 })
        .toBe('joined');
      return seen.find(({ operation }) => operation === 'evaluate');
    } finally {
      document.close();
    }
  } finally {
    client.terminate();
  }
};

const kitchenSink = { kernel: 'openscad', name: 'kitchen-sink', entry: 'main.scad' } as const;
const hingedBox = { kernel: 'smlib', name: 'hinged-box', entry: 'main.ts' } as const;

describe('parameter facts on the compiled example manifests (T28)', { timeout: 120_000 }, () => {
  it.each([
    { label: 'kitchen-sink', example: kitchenSink, declared: 20 },
    { label: 'hinged-box', example: hingedBox, declared: 7 },
  ])('should declare $declared leaves and modify none on the $label defaults', async ({ example, declared }) => {
    const observation = await observeEvaluate(example);
    expect(observation?.worker?.parameters).toMatchObject({ declared, modified: 0 });
    expect(observation?.worker?.parameters).not.toHaveProperty('truncated');
  });

  it('should count the overridden numeric and vector leaves of kitchen-sink, and not its unbound string', async () => {
    const observation = await observeEvaluate(kitchenSink, {
      Dimensions: { height: 60, count: 7 },
      // `material` is a string dropdown: the manifest binds no leaf for it, so changing it modifies nothing counted.
      Options: { material: 'metal' },
      Vectors: { rotation: [0, 30, 90] },
    });
    expect(observation?.worker?.parameters).toMatchObject({ declared: 20, modified: 3 });
    expect(new Set(observation?.worker?.parameters?.features)).toEqual(new Set(['units', 'array']));
  });

  it('should count the two overridden hinged-box lengths and angle as modified', async () => {
    const observation = await observeEvaluate(hingedBox, { wall: 3, maxOpening: 95 });
    expect(observation?.worker?.parameters).toEqual({ declared: 7, modified: 2, features: ['units'] });
  });
});

/** The runtime's copy of an example's described declaration, read as data: the runtime package is not imported. */
const runtimeFixturePath = (name: string): URL =>
  new URL(`../../../packages/runtime/src/client/fixtures/${name}.parameters.json`, import.meta.url);

describe('runtime parameter fixtures match the examples (T28)', { timeout: 120_000 }, () => {
  it.each([
    { label: 'kitchen-sink', example: kitchenSink },
    { label: 'hinged-box', example: hingedBox },
  ])('should describe the $label declaration the runtime fixture copies', async ({ example }) => {
    const client = await createExampleRuntimeClient(examplePath(example.kernel, example.name));
    try {
      const description = await client.describe({ source: { path: example.entry } });
      if (!description.success) {
        expect.fail(`${example.name} did not describe: ${JSON.stringify(description.issues)}`);
      }
      const { parameters } = description;
      const fixture: unknown = JSON.parse(readFileSync(runtimeFixturePath(example.name), 'utf8'));
      // On failure, regenerate the fixture from this description: `{ schema, resources, defaults, bindings }`, with
      // `bindings` taken from the manifest's `bindingDeclarations`.
      expect(fixture).toEqual({
        schema: parameters.schema,
        resources: parameters.resources,
        defaults: parameters.defaults,
        bindings: parameters.bindingDeclarations,
      });
    } finally {
      client.terminate();
    }
  });
});
