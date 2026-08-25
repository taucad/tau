import { describe, expect, it } from 'vitest';
import { definePlugin, isPluginFactory, isPluginInstance, runtimePluginAbiVersionOf } from '#plugins/plugin.js';
import {
  expandedPluginCapabilitiesSymbol,
  pluginFactorySymbol,
  pluginInstanceSymbol,
  runtimePluginAbiVersion,
  runtimePluginDefinitionSymbol,
  runtimePluginFactoryAcceptsOptionsSymbol,
} from '#plugins/plugin-runtime-definition.js';
import { defineRuntime } from '#worker/runtime-definition.js';

const factory = definePlugin({ meta: { name: '@test/abi' }, presets: { default: [] } });
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
  const value = Object.assign(() => undefined, { meta: { name: '@test/fake' } });
  return stamp(value, pluginFactorySymbol, abi);
};

const fakeInstance = (abi: unknown) =>
  stamp(
    {
      meta: { name: '@test/fake' },
      preset: 'default',
      capabilities: { kernels: [], middleware: [], bundlers: [], transcoders: [] },
    },
    pluginInstanceSymbol,
    abi,
  );

describe('runtime plugin ABI', () => {
  it('pins every registry key and the current ABI', () => {
    expect(runtimePluginAbiVersion).toBe(1);
    expect(Symbol.keyFor(runtimePluginDefinitionSymbol)).toBe('@taucad/runtime/plugin-definition');
    expect(Symbol.keyFor(runtimePluginFactoryAcceptsOptionsSymbol)).toBe(
      '@taucad/runtime/plugin-factory-accepts-options',
    );
    expect(Symbol.keyFor(pluginInstanceSymbol)).toBe('@taucad/runtime/plugin-instance');
    expect(Symbol.keyFor(expandedPluginCapabilitiesSymbol)).toBe('@taucad/runtime/plugin-capabilities');
    expect(Symbol.keyFor(pluginFactorySymbol)).toBe('@taucad/runtime/plugin-factory');
  });

  it('accepts current factories and instances and rejects missing, incompatible, or non-numeric brands', () => {
    expect(isPluginFactory(factory)).toBe(true);
    expect(isPluginInstance(instance)).toBe(true);
    expect(isPluginFactory(Object.assign(() => undefined, { meta: factory.meta }))).toBe(false);
    expect(isPluginInstance({ meta: instance.meta })).toBe(false);
    expect(isPluginFactory(fakeFactory(2))).toBe(false);
    expect(isPluginInstance(fakeInstance(2))).toBe(false);
    expect(isPluginFactory(fakeFactory('1'))).toBe(false);
    expect(isPluginInstance(fakeInstance(true))).toBe(false);
  });

  it('recognizes correctly hand-stamped values from another runtime copy', () => {
    const duplicateFactory = fakeFactory(runtimePluginAbiVersion);
    const duplicateInstance = fakeInstance(runtimePluginAbiVersion);

    expect(isPluginFactory(duplicateFactory)).toBe(true);
    expect(isPluginInstance(duplicateInstance)).toBe(true);
    expect(runtimePluginAbiVersionOf(duplicateFactory)).toBe(runtimePluginAbiVersion);
    expect(runtimePluginAbiVersionOf(duplicateInstance)).toBe(runtimePluginAbiVersion);
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
    const defineUncheckedRuntime = defineRuntime as unknown as (options: {
      readonly plugins: readonly unknown[];
    }) => unknown;

    expect(() => defineUncheckedRuntime({ plugins: [fakeInstance(2)] })).toThrow(
      'Tau plugin ABI mismatch: received 2, but this runtime requires 1. Align @taucad/runtime versions.',
    );
  });
});
