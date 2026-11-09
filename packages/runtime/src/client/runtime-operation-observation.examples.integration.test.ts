// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- kitchen-sink's parameter keys are its OpenSCAD Customizer groups. */
/**
 * T28: the evaluate observation's `parameters` facts on the kitchen-sink and hinged-box examples, run in the runtime.
 * The runtime cannot depend on `@taucad/tau-examples` or on the kernels that describe those examples, so
 * `fixtures/<example>.parameters.json` holds each example's described parameter declaration: the schema, defaults and
 * binding declarations its kernel and the `parameterUnits` middleware produce. A fixture kernel describes that
 * declaration, the worker compiles the manifest and the observer walks it, as for the real kernels.
 * `libs/tau-examples/src/operation-observation.test.ts` checks that these copies still equal what the examples describe.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ParameterDeclaration } from '@taucad/parameters';
import { createRuntimeClient } from '#client/runtime-document-client-core.js';
import { createKernelSuccess } from '#kernels/kernel-helpers.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { defineKernelV2 } from '#types/runtime-kernel-v2.types.js';
import type { RuntimeOperationObservation } from '#types/runtime-observation.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';

/**
 * Read one example's described parameter declaration from the runtime fixtures.
 *
 * @param fixture - The fixture file.
 * @returns The declaration its kernel describes.
 */
const readDeclaration = (fixture: URL): ParameterDeclaration =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the fixture is a captured kernel description; tau-examples checks it against the live one.
  JSON.parse(readFileSync(fixture, 'utf8')) as ParameterDeclaration;

type Example = Readonly<{ name: string; entry: string; extension: string; fixture: URL }>;

const kitchenSink: Example = {
  name: 'kitchen-sink',
  entry: 'main.scad',
  extension: 'scad',
  fixture: new URL('fixtures/kitchen-sink.parameters.json', import.meta.url),
};
const hingedBox: Example = {
  name: 'hinged-box',
  entry: 'main.ts',
  extension: 'ts',
  fixture: new URL('fixtures/hinged-box.parameters.json', import.meta.url),
};

/**
 * Create a client whose one kernel describes the example's declaration and evaluates to an empty view.
 *
 * @param example - The example.
 * @returns The client.
 */
const createExampleClient = (example: Example) => {
  const declaration = readDeclaration(example.fixture);
  const kernel = defineKernelV2({
    id: `${example.name}-fixture`,
    extensions: [example.extension],
    name: `${example.name} fixture`,
    version: '1.0.0',
    views: { primary: { title: 'Primary', mimeType: 'image/svg+xml' } },
    exports: {},
    async initialize() {
      return {};
    },
    async resolve({ entryPath }) {
      return { resolved: [entryPath], unresolved: [] };
    },
    async describe() {
      return createKernelSuccess({ parameters: declaration });
    },
    async evaluate() {
      return { handle: {}, views: ['primary'] as const, exports: [] as const };
    },
    async render() {
      return { content: '<svg xmlns="http://www.w3.org/2000/svg"/>' };
    },
  })();
  const runtime = defineRuntime({ kernels: [kernel], middleware: [] });
  return createRuntimeClient({
    transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs({ [example.entry]: '' }) }),
  });
};

/**
 * Evaluate one example once with observation on and return its evaluate observation.
 *
 * @param example - The example.
 * @param parameters - Values to open the document with; the defaults when omitted.
 * @returns The joined evaluate observation.
 */
const observeEvaluate = async (
  example: Example,
  parameters?: Record<string, unknown>,
): Promise<RuntimeOperationObservation | undefined> => {
  const client = createExampleClient(example);
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
    await client.shutdown();
  }
};

describe('parameter facts on the example parameter declarations (T28)', () => {
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
