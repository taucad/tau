// @vitest-environment node
/**
 * T07: a view whose artifact never reaches the viewer intact is a `discarded` attempt, end to end.
 *
 * A real runtime client renders a GLB view over the in-process transport, wired the way the editor wires its clients:
 * `reportRuntimeFailures` on the client's `operation` stream. The worker renders successfully every time; what fails is
 * the client's materialisation of the artifact for the viewer, either because the delivered bytes are gone from the
 * shared pool (a missing artifact) or because they arrive truncated to nothing (a corrupt GLB). Each must be observed
 * as `discarded` with a stable code, reported as a runtime failure, and must never be handed to the viewer as a
 * rendering.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeClient, SharedPoolEntryNotFoundError } from '@taucad/runtime';
import type { RuntimeOperationObservation } from '@taucad/runtime';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { createKernelSuccess, defineKernel } from '@taucad/runtime/kernel';
import type { BinaryContentDelivery } from '@taucad/runtime/types';
import { defineRuntime } from '@taucad/runtime/worker';
import type { ErrorDetails } from '#lib/error-details.js';
import { reportRuntimeFailures } from '#lib/runtime-failure-reporting.js';

const reportUiError = vi.hoisted(() =>
  vi.fn<(error: Error, details: ErrorDetails) => Promise<void>>(async () => undefined),
);
vi.mock('#lib/error-reporting.js', () => ({ reportUiError }));

/** A minimal, well-formed GLB header: magic `glTF`, version 2, total length 12. */
const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]);

const parameters = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:discarded-view',
    $uses: ['JSONSchemaUnits'],
    name: 'DiscardedViewParameters',
    type: 'object',
  },
  defaults: {},
} as const;

const kernel = defineKernel({
  id: 'glb-kernel',
  extensions: ['part'] as const,
  name: 'GLB kernel',
  version: '1.0.0',
  views: { model: { title: 'Model', mimeType: 'model/gltf-binary' } },
  exports: {},
  async initialize() {
    return {};
  },
  async resolve({ entryPath }) {
    return { resolved: [entryPath], unresolved: [] };
  },
  async describe() {
    return createKernelSuccess({ parameters });
  },
  async evaluate() {
    return { handle: {}, views: ['model'] as const, exports: [] as const };
  },
  async render() {
    // The worker's product is intact every time: the failure under test is the delivery to the viewer.
    return { content: new Uint8Array(glb) };
  },
});

/** What the client's delivery of the view's bytes does instead of handing over what the worker sent. */
type Delivery = (
  content: BinaryContentDelivery,
  intact: (content: BinaryContentDelivery) => Promise<Uint8Array<ArrayBuffer>>,
) => Promise<Uint8Array<ArrayBuffer>>;

const shutdowns: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(shutdowns.splice(0).map(async (shutdown) => shutdown()));
  reportUiError.mockClear();
});

/**
 * A client whose binary delivery is `deliver`, observed and reported as the editor wires it.
 *
 * @param deliver - Replaces the transport's binary delivery.
 * @returns The client and its observations.
 */
const connect = (deliver: Delivery) => {
  const base = inProcessTransport({ runtime: defineRuntime({ kernels: [kernel()] }), fileSystem: fromMemoryFs({}) });
  const client = createRuntimeClient({
    transport: {
      ...base,
      materialize() {
        const owned = base.materialize();
        return {
          ...owned,
          resolveBinary: async (content) => deliver(content, async (each) => owned.resolveBinary(each)),
        };
      },
    },
  });
  shutdowns.push(async () => client.shutdown());
  const observations: RuntimeOperationObservation[] = [];
  client.on('operation', (observation) => observations.push(observation));
  reportRuntimeFailures(client);
  return { client, observations };
};

/**
 * Render the view once and collect what the viewer would have received.
 *
 * @param connection - The connected client.
 * @returns The rendering's rejection, the view's statuses, every rendering the view emitted and the render observation.
 */
const renderOnce = async (connection: ReturnType<typeof connect>) => {
  const document = connection.client.open({ source: { files: { 'main.part': 'x' } }, watch: false });
  await expect(document.evaluation()).resolves.toMatchObject({ evaluation: { success: true } });
  const view = document.view('model');
  const statuses: string[] = [];
  const delivered: unknown[] = [];
  view.on('status', (status) => statuses.push(status));
  view.on('rendered', (rendering) => delivered.push(rendering));
  let rejection: unknown;
  try {
    await view.rendering();
  } catch (error) {
    rejection = error;
  }
  await vi.waitFor(() => {
    expect(connection.observations.filter(({ operation }) => operation === 'render')).toHaveLength(1);
  });
  return {
    rejection,
    statuses,
    delivered,
    rendered: connection.observations.find(({ operation }) => operation === 'render'),
    close: () => {
      document.close();
    },
  };
};

describe('T07: a view artifact the viewer cannot receive is a discarded attempt', () => {
  it('T07: should observe and report a missing view artifact as discarded, and hand the viewer nothing', async () => {
    const connection = connect(async (content) => {
      throw new SharedPoolEntryNotFoundError(content.delivery === 'pooled' ? content.key : 'inline');
    });

    const { rejection, statuses, delivered, rendered, close } = await renderOnce(connection);

    expect(rejection).toBeInstanceOf(SharedPoolEntryNotFoundError);
    expect(statuses.at(-1)).toBe('error');
    expect(delivered).toEqual([]);
    expect(rendered).toMatchObject({
      operation: 'render',
      kernel: 'glb-kernel',
      outcome: { type: 'discarded', code: 'RUNTIME_SHARED_POOL_KEY_MISSING' },
      issues: [],
    });
    // The evaluation the view rendered from is untouched: only the delivery failed.
    expect(connection.observations.find(({ operation }) => operation === 'evaluate')?.outcome).toEqual({
      type: 'succeeded',
    });
    expect(reportUiError).toHaveBeenCalledOnce();
    const [error, details] = reportUiError.mock.calls[0]!;
    expect(error.message).toBe('Kernel render discarded (RUNTIME_SHARED_POOL_KEY_MISSING)');
    expect(details).toMatchObject({
      tags: { kernel: 'glb-kernel', 'runtime.operation': 'render', 'runtime.outcome': 'discarded' },
      contexts: { 'tau.runtime': { code: 'RUNTIME_SHARED_POOL_KEY_MISSING' } },
    });
    close();
  });

  it('T07: should observe and report a GLB delivered corrupt as discarded with the GLB integrity code', async () => {
    // The bytes arrive truncated to nothing: not a GLB the viewer could parse.
    const connection = connect(async () => new Uint8Array(new ArrayBuffer(0)));

    const { rejection, statuses, delivered, rendered, close } = await renderOnce(connection);

    expect(rejection).toBeInstanceOf(TypeError);
    expect(statuses.at(-1)).toBe('error');
    expect(delivered).toEqual([]);
    // The same code the worker gives the same integrity rule, so both sides of the wire name the failure alike.
    expect(rendered?.outcome).toEqual({ type: 'discarded', code: 'GLTF_BYTES_INVALID' });
    expect(reportUiError).toHaveBeenCalledOnce();
    const [error, details] = reportUiError.mock.calls[0]!;
    expect(error.message).toBe('Kernel render discarded (GLTF_BYTES_INVALID)');
    expect(details).toMatchObject({ contexts: { 'tau.runtime': { code: 'GLTF_BYTES_INVALID' } } });
    close();
  });

  it('T07: should report nothing for the same view when its artifact arrives intact', async () => {
    const connection = connect(async (content, intact) => intact(content));

    const { rejection, statuses, rendered, close } = await renderOnce(connection);

    expect(rejection).toBeUndefined();
    expect(statuses.at(-1)).toBe('ready');
    expect(rendered?.outcome).toEqual({ type: 'succeeded' });
    expect(reportUiError).not.toHaveBeenCalled();
    close();
  });
});
