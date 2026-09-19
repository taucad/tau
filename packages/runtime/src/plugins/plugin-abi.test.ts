import { describe, expect, it } from 'vitest';
import { definePlugin, isPluginFactory, isPluginInstance, runtimePluginAbiVersionOf } from '#plugins/plugin.js';
import {
  attachRuntimePluginDefinition,
  expandedPluginCapabilitiesSymbol,
  pluginFactorySymbol,
  pluginInstanceSymbol,
  runtimePluginAbiVersion,
  runtimePluginDefinitionSymbol,
  runtimePluginFactoryAcceptsOptionsSymbol,
} from '#plugins/plugin-runtime-definition.js';
import { runtimeCapabilityKinds } from '#plugins/plugin-types.js';
import { defineRuntime } from '#worker/runtime-definition.js';

const defineUncheckedRuntime = defineRuntime as unknown as (options: {
  readonly plugins: readonly unknown[];
}) => unknown;

const factory = definePlugin({
  meta: { name: '@test/abi' },
  presets: { default: [] },
});
const instance = factory();

const stamp = <Value extends Record<PropertyKey, unknown> | ((...args: never[]) => unknown)>(
  value: Value,
  brand: symbol,
  abi: unknown,
): Value => {
  Object.defineProperty(value, brand, { value: abi });
  return value;
};

const fakeFactory = (abi: unknown): (() => undefined) & { readonly meta: { readonly name: string } } => {
  const value = Object.assign(() => undefined, {
    meta: { name: '@test/fake' },
  });
  return stamp(value, pluginFactorySymbol, abi);
};

const fakeInstance = (abi: unknown) =>
  Object.defineProperty(
    stamp(
      {
        meta: { name: '@test/fake' },
        preset: 'default',
        capabilities: {
          kernels: [],
          middleware: [],
          bundlers: [],
          transcoders: [],
          jobs: [],
          machines: [],
        },
      },
      pluginInstanceSymbol,
      abi,
    ),
    expandedPluginCapabilitiesSymbol,
    { value: [] },
  );

const crossCopyInstance = () => {
  const kernel = { id: 'kernel', extensions: ['ts'] };
  const middleware = { id: 'middleware' };
  const bundler = { id: 'bundler', extensions: ['ts'] };
  const transcoder = { id: 'transcoder' };
  const job = attachRuntimePluginDefinition(
    {
      id: 'job',
      kind: 'simulation.test',
      version: '1.0.0',
      kindVersion: 1,
      configuration: {
        version: 1,
        source: { id: 'simulation.test.configuration', version: '1.0.0' },
        dialect: 'draft-07',
        inputSchema: {},
        outputSchema: {},
        ui: { version: 1, rjsf: {} },
      },
      resultSchema: {},
      recovery: { type: 'restart-from-input' },
      requirements: [],
      artifacts: [],
      queries: [],
      commands: [],
    },
    () => ({ execute: async () => ({}) }),
  );
  const machine = attachRuntimePluginDefinition(
    { id: 'machine', name: 'Machine', version: '1.0.0', protocolVersion: 1 },
    () => ({ connect: async () => ({}) }),
  );
  const expanded = [
    { kind: 'kernels', capability: kernel, path: '@test/cross/kernels.kernel', packageName: '@test/cross' },
    {
      kind: 'middleware',
      capability: middleware,
      path: '@test/cross/middleware.middleware',
      packageName: '@test/cross',
    },
    { kind: 'bundlers', capability: bundler, path: '@test/cross/bundlers.bundler', packageName: '@test/cross' },
    {
      kind: 'transcoders',
      capability: transcoder,
      path: '@test/cross/transcoders.transcoder',
      packageName: '@test/cross',
    },
    { kind: 'jobs', capability: job, path: '@test/cross/jobs.job', packageName: '@test/cross' },
    { kind: 'machines', capability: machine, path: '@test/cross/machines.machine', packageName: '@test/cross' },
  ];
  return Object.defineProperty(
    stamp(
      {
        meta: { name: '@test/cross' },
        preset: 'default',
        capabilities: {
          kernels: [kernel],
          middleware: [middleware],
          bundlers: [bundler],
          transcoders: [transcoder],
          jobs: [job],
          machines: [machine],
        },
      },
      pluginInstanceSymbol,
      runtimePluginAbiVersion,
    ),
    expandedPluginCapabilitiesSymbol,
    { value: expanded },
  );
};

describe('runtime plugin ABI', () => {
  it('pins every registry key and the current ABI', () => {
    expect(runtimePluginAbiVersion).toBe(2);
    expect(Symbol.keyFor(runtimePluginDefinitionSymbol)).toBe('@taucad/runtime/plugin-definition');
    expect(Symbol.keyFor(runtimePluginFactoryAcceptsOptionsSymbol)).toBe(
      '@taucad/runtime/plugin-factory-accepts-options',
    );
    expect(Symbol.keyFor(pluginInstanceSymbol)).toBe('@taucad/runtime/plugin-instance');
    expect(Symbol.keyFor(expandedPluginCapabilitiesSymbol)).toBe('@taucad/runtime/plugin-capabilities');
    expect(Symbol.keyFor(pluginFactorySymbol)).toBe('@taucad/runtime/plugin-factory');
    expect(runtimeCapabilityKinds).toEqual(['kernel', 'middleware', 'bundler', 'transcoder']);
  });

  it('accepts current factories and instances and rejects missing, incompatible, or non-numeric brands', () => {
    expect(isPluginFactory(factory)).toBe(true);
    expect(isPluginInstance(instance)).toBe(true);
    expect(isPluginFactory(Object.assign(() => undefined, { meta: factory.meta }))).toBe(false);
    expect(isPluginInstance({ meta: instance.meta })).toBe(false);
    expect(isPluginFactory(fakeFactory(1))).toBe(false);
    expect(isPluginInstance(fakeInstance(1))).toBe(false);
    expect(isPluginFactory(fakeFactory('1'))).toBe(false);
    expect(isPluginInstance(fakeInstance(true))).toBe(false);
  });

  it('rejects incomplete ABI 2 instances without reading accessors', () => {
    const missingExpanded = stamp(
      {
        meta: { name: '@test/incomplete' },
        preset: 'default',
        capabilities: {
          kernels: [],
          middleware: [],
          bundlers: [],
          transcoders: [],
          jobs: [],
          machines: [],
        },
      },
      pluginInstanceSymbol,
      runtimePluginAbiVersion,
    );
    const accessorExpanded = stamp(
      {
        meta: { name: '@test/accessor' },
        preset: 'default',
        capabilities: {
          kernels: [],
          middleware: [],
          bundlers: [],
          transcoders: [],
          jobs: [],
          machines: [],
        },
      },
      pluginInstanceSymbol,
      runtimePluginAbiVersion,
    );
    Object.defineProperty(accessorExpanded, expandedPluginCapabilitiesSymbol, {
      get: () => {
        throw new Error('must not execute');
      },
    });

    const accessorCapability = Object.defineProperty({}, 'id', {
      get: () => {
        throw new Error('must not execute');
      },
    });
    const malformedBucket = Object.defineProperty(
      stamp(
        {
          meta: { name: '@test/malformed-bucket' },
          preset: 'default',
          capabilities: {
            kernels: [{ id: 'kernel' }],
            middleware: [],
            bundlers: [],
            transcoders: [],
            jobs: [accessorCapability],
            machines: [],
          },
        },
        pluginInstanceSymbol,
        runtimePluginAbiVersion,
      ),
      expandedPluginCapabilitiesSymbol,
      { value: [] },
    );

    expect(isPluginInstance(missingExpanded)).toBe(false);
    expect(isPluginInstance(accessorExpanded)).toBe(false);
    expect(isPluginInstance(malformedBucket)).toBe(false);
    expect(() => defineUncheckedRuntime({ plugins: [missingExpanded] })).toThrow(
      'defineRuntime({ plugins }) accepts invoked Tau plugin factories',
    );
  });

  it('does not execute accessors while probing ABI brands or factory metadata', () => {
    let reads = 0;
    const accessorInstance = Object.defineProperty({}, pluginInstanceSymbol, {
      get() {
        reads += 1;
        return runtimePluginAbiVersion;
      },
    });
    const accessorFactory = Object.defineProperties(() => undefined, {
      [pluginFactorySymbol]: {
        get() {
          reads += 1;
          return runtimePluginAbiVersion;
        },
      },
      meta: {
        get() {
          reads += 1;
          return { name: '@test/accessor' };
        },
      },
    });

    expect(runtimePluginAbiVersionOf(accessorInstance)).toBeUndefined();
    expect(runtimePluginAbiVersionOf(accessorFactory)).toBeUndefined();
    expect(isPluginFactory(accessorFactory)).toBe(false);
    expect(() => defineUncheckedRuntime({ plugins: [accessorInstance] })).toThrow(
      'defineRuntime({ plugins }) accepts invoked Tau plugin factories',
    );
    expect(reads).toBe(0);
  });

  it('rejects bucket and expanded-entry disagreement before CAD normalization', () => {
    const hiddenJob = fakeInstance(runtimePluginAbiVersion);
    Object.defineProperty(hiddenJob.capabilities, 'jobs', {
      value: [{ id: 'hidden' }],
    });

    expect(isPluginInstance(hiddenJob)).toBe(false);
    expect(() => defineUncheckedRuntime({ plugins: [hiddenJob] })).toThrow(
      'defineRuntime({ plugins }) accepts invoked Tau plugin factories',
    );
  });

  it('recognizes correctly hand-stamped values from another runtime copy', () => {
    const duplicateFactory = fakeFactory(runtimePluginAbiVersion);
    const duplicateInstance = crossCopyInstance();

    expect(isPluginFactory(duplicateFactory)).toBe(true);
    expect(isPluginInstance(duplicateInstance)).toBe(true);
    expect(runtimePluginAbiVersionOf(duplicateFactory)).toBe(runtimePluginAbiVersion);
    expect(runtimePluginAbiVersionOf(duplicateInstance)).toBe(runtimePluginAbiVersion);
    expect(() => defineUncheckedRuntime({ plugins: [duplicateInstance] })).toThrow(
      'CAD runtime cannot consume host-owned plugin capabilities',
    );
  });

  it('keeps factory and instance brands non-enumerable', () => {
    expect(Object.getOwnPropertyDescriptor(factory, pluginFactorySymbol)?.enumerable).toBe(false);
    expect(Object.getOwnPropertyDescriptor(instance, pluginInstanceSymbol)?.enumerable).toBe(false);
    expect(Object.keys(factory)).toEqual(['meta']);
    expect(Object.keys(instance)).toEqual(['meta', 'preset', 'capabilities']);

    const iterated: string[] = [];
    for (const key in instance) {
      if (Object.hasOwn(instance, key)) {
        iterated.push(key);
      }
    }
    expect(iterated).toEqual(['meta', 'preset', 'capabilities']);
    expect(JSON.stringify(instance)).toBe(
      JSON.stringify({
        meta: instance.meta,
        preset: instance.preset,
        capabilities: instance.capabilities,
      }),
    );
  });

  it('drops the instance brand across structured clone', () => {
    const clone: unknown = structuredClone(instance);

    expect(runtimePluginAbiVersionOf(clone)).toBeUndefined();
    expect(isPluginInstance(clone)).toBe(false);
  });

  it('reports an incompatible instance ABI separately in defineRuntime', () => {
    expect(() => defineUncheckedRuntime({ plugins: [fakeInstance(1)] })).toThrow(
      'Tau plugin ABI mismatch: received 1, but this runtime requires 2. Align @taucad/runtime versions.',
    );
  });
});
