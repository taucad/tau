import type { BundlerPlugin, KernelPlugin, MiddlewarePlugin, TranscoderPlugin } from '#plugins/plugin-types.js';
import {
  expandedPluginCapabilitiesSymbol,
  pluginFactorySymbol,
  pluginInstanceSymbol,
  runtimePluginAbiVersion,
  runtimePluginFactoryAcceptsOptions,
} from '#plugins/plugin-runtime-definition.js';

type AnyKernelPlugin = KernelPlugin<Record<string, unknown>, unknown>;
type AnyTranscoderPlugin = TranscoderPlugin<Record<string, unknown>>;

type KernelCapabilityFactory = (...args: never[]) => AnyKernelPlugin;
type MiddlewareCapabilityFactory = (...args: never[]) => MiddlewarePlugin;
type BundlerCapabilityFactory = (...args: never[]) => BundlerPlugin;
type TranscoderCapabilityFactory = (...args: never[]) => AnyTranscoderPlugin;
type AnyCapabilityFactory = (...args: never[]) => unknown;

type CapabilityFactoryMap<Factory extends AnyCapabilityFactory> = Readonly<Record<string, Factory>>;
type EmptyCapabilityFactoryMap = Readonly<Record<never, never>>;

/* oxlint-disable typescript/no-restricted-types -- empty tuples encode a proven absence of selected capabilities */
type EmptyTuple = readonly [];
/* oxlint-enable typescript/no-restricted-types */

type PluginCapabilityPath<
  Kernels extends CapabilityFactoryMap<KernelCapabilityFactory>,
  Middleware extends CapabilityFactoryMap<MiddlewareCapabilityFactory>,
  Bundlers extends CapabilityFactoryMap<BundlerCapabilityFactory>,
  Transcoders extends CapabilityFactoryMap<TranscoderCapabilityFactory>,
> =
  | `kernels.${Extract<keyof Kernels, string>}`
  | `middleware.${Extract<keyof Middleware, string>}`
  | `bundlers.${Extract<keyof Bundlers, string>}`
  | `transcoders.${Extract<keyof Transcoders, string>}`;

type ValidatedPresets<Presets extends Readonly<Record<string, readonly string[]>>, Path extends string> = {
  readonly [Name in keyof Presets]: readonly Path[];
} & {
  readonly default: readonly Path[];
};

type CapabilityNameForKind<Entry, Kind extends string> = Entry extends `${Kind}.${infer Name}` ? Name : never;

type SelectedCapabilityNames<
  Entries extends readonly string[],
  Kind extends string,
  Factories extends Readonly<Record<string, AnyCapabilityFactory>>,
> = Extract<CapabilityNameForKind<Entries[number], Kind>, Extract<keyof Factories, string>>;

type ConfigurableCapabilityNames<
  Factories extends Readonly<Record<string, AnyCapabilityFactory>>,
  Names extends Extract<keyof Factories, string>,
> = {
  [Name in Names]: Parameters<Factories[Name]>['length'] extends 0 ? never : Name;
}[Names];

type RequiredCapabilityNames<
  Factories extends Readonly<Record<string, AnyCapabilityFactory>>,
  Names extends Extract<keyof Factories, string>,
> = {
  [Name in ConfigurableCapabilityNames<Factories, Names>]: 0 extends Parameters<Factories[Name]>['length']
    ? never
    : Name;
}[ConfigurableCapabilityNames<Factories, Names>];

type CapabilityFactoryOptions<Factory extends AnyCapabilityFactory> = Exclude<Parameters<Factory>[0], undefined>;

type SelectedCapabilityOptions<
  Factories extends Readonly<Record<string, AnyCapabilityFactory>>,
  Names extends Extract<keyof Factories, string>,
> = {
  readonly [Name in RequiredCapabilityNames<Factories, Names>]: CapabilityFactoryOptions<Factories[Name]>;
} & {
  readonly [Name in Exclude<
    ConfigurableCapabilityNames<Factories, Names>,
    RequiredCapabilityNames<Factories, Names>
  >]?: CapabilityFactoryOptions<Factories[Name]>;
};

type RoleInvocationOptions<
  Role extends string,
  Factories extends Readonly<Record<string, AnyCapabilityFactory>>,
  Names extends Extract<keyof Factories, string>,
> = [ConfigurableCapabilityNames<Factories, Names>] extends [never]
  ? Record<never, never>
  : [RequiredCapabilityNames<Factories, Names>] extends [never]
    ? Readonly<Partial<Record<Role, SelectedCapabilityOptions<Factories, Names>>>>
    : Readonly<Record<Role, SelectedCapabilityOptions<Factories, Names>>>;

type CapabilityInvocationOptions<
  Kernels extends CapabilityFactoryMap<KernelCapabilityFactory>,
  Middleware extends CapabilityFactoryMap<MiddlewareCapabilityFactory>,
  Bundlers extends CapabilityFactoryMap<BundlerCapabilityFactory>,
  Transcoders extends CapabilityFactoryMap<TranscoderCapabilityFactory>,
  Entries extends readonly string[],
> = RoleInvocationOptions<'kernels', Kernels, SelectedCapabilityNames<Entries, 'kernels', Kernels>> &
  RoleInvocationOptions<'middleware', Middleware, SelectedCapabilityNames<Entries, 'middleware', Middleware>> &
  RoleInvocationOptions<'bundlers', Bundlers, SelectedCapabilityNames<Entries, 'bundlers', Bundlers>> &
  RoleInvocationOptions<'transcoders', Transcoders, SelectedCapabilityNames<Entries, 'transcoders', Transcoders>>;

type RequiredCapabilityOptionNames<
  Kernels extends CapabilityFactoryMap<KernelCapabilityFactory>,
  Middleware extends CapabilityFactoryMap<MiddlewareCapabilityFactory>,
  Bundlers extends CapabilityFactoryMap<BundlerCapabilityFactory>,
  Transcoders extends CapabilityFactoryMap<TranscoderCapabilityFactory>,
  Entries extends readonly string[],
> =
  | RequiredCapabilityNames<Kernels, SelectedCapabilityNames<Entries, 'kernels', Kernels>>
  | RequiredCapabilityNames<Middleware, SelectedCapabilityNames<Entries, 'middleware', Middleware>>
  | RequiredCapabilityNames<Bundlers, SelectedCapabilityNames<Entries, 'bundlers', Bundlers>>
  | RequiredCapabilityNames<Transcoders, SelectedCapabilityNames<Entries, 'transcoders', Transcoders>>;

type ExpandPresetEntries<
  Entries extends readonly string[],
  Kind extends string,
  Factories extends Readonly<Record<string, AnyCapabilityFactory>>,
  Result extends readonly unknown[] = EmptyTuple,
> = number extends Entries['length']
  ? readonly never[]
  : Entries extends readonly [infer Entry extends string, ...infer Rest extends readonly string[]]
    ? Entry extends `${Kind}.${infer Name}`
      ? Name extends keyof Factories
        ? ExpandPresetEntries<Rest, Kind, Factories, readonly [...Result, ReturnType<Factories[Name]>]>
        : ExpandPresetEntries<Rest, Kind, Factories, Result>
      : ExpandPresetEntries<Rest, Kind, Factories, Result>
    : Result;

type CapabilitiesAcrossPresets<
  Presets extends Readonly<Record<string, readonly string[]>>,
  Kind extends string,
  Factories extends Readonly<Record<string, AnyCapabilityFactory>>,
> = ReadonlyArray<ReturnType<Factories[SelectedCapabilityNames<Presets[keyof Presets], Kind, Factories>]>>;

type CapabilitiesForPreset<
  Kernels extends CapabilityFactoryMap<KernelCapabilityFactory>,
  Middleware extends CapabilityFactoryMap<MiddlewareCapabilityFactory>,
  Bundlers extends CapabilityFactoryMap<BundlerCapabilityFactory>,
  Transcoders extends CapabilityFactoryMap<TranscoderCapabilityFactory>,
  Presets extends Readonly<Record<string, readonly string[]>>,
  Preset extends string,
> = string extends Preset
  ? {
      readonly kernels: CapabilitiesAcrossPresets<Presets, 'kernels', Kernels>;
      readonly middleware: CapabilitiesAcrossPresets<Presets, 'middleware', Middleware>;
      readonly bundlers: CapabilitiesAcrossPresets<Presets, 'bundlers', Bundlers>;
      readonly transcoders: CapabilitiesAcrossPresets<Presets, 'transcoders', Transcoders>;
    }
  : Preset extends keyof Presets
    ? {
        readonly kernels: ExpandPresetEntries<Presets[Preset], 'kernels', Kernels>;
        readonly middleware: ExpandPresetEntries<Presets[Preset], 'middleware', Middleware>;
        readonly bundlers: ExpandPresetEntries<Presets[Preset], 'bundlers', Bundlers>;
        readonly transcoders: ExpandPresetEntries<Presets[Preset], 'transcoders', Transcoders>;
      }
    : EmptyPluginCapabilities;

type SelectablePreset<
  Preset extends string,
  Presets extends Readonly<Record<string, readonly string[]>>,
> = string extends Preset ? Preset : Preset extends keyof Presets ? Preset : never;

type PresetInvocationOptions<
  Preset extends string,
  Presets extends Readonly<Record<string, readonly string[]>>,
> = string extends Preset
  ? { readonly preset: Preset }
  : Preset extends 'default'
    ? { readonly preset?: SelectablePreset<Preset, Presets> }
    : { readonly preset: SelectablePreset<Preset, Presets> };

type PluginInvocationOptions<
  Kernels extends CapabilityFactoryMap<KernelCapabilityFactory>,
  Middleware extends CapabilityFactoryMap<MiddlewareCapabilityFactory>,
  Bundlers extends CapabilityFactoryMap<BundlerCapabilityFactory>,
  Transcoders extends CapabilityFactoryMap<TranscoderCapabilityFactory>,
  Presets extends Readonly<Record<string, readonly string[]>>,
  Preset extends string,
> = PresetInvocationOptions<Preset, Presets> &
  (string extends Preset
    ? Record<never, never>
    : Preset extends keyof Presets
      ? CapabilityInvocationOptions<Kernels, Middleware, Bundlers, Transcoders, Presets[Preset]>
      : Record<never, never>);

type PluginInvocationArguments<
  Kernels extends CapabilityFactoryMap<KernelCapabilityFactory>,
  Middleware extends CapabilityFactoryMap<MiddlewareCapabilityFactory>,
  Bundlers extends CapabilityFactoryMap<BundlerCapabilityFactory>,
  Transcoders extends CapabilityFactoryMap<TranscoderCapabilityFactory>,
  Presets extends Readonly<Record<string, readonly string[]>>,
  Preset extends string,
> = string extends Preset
  ? [options: PluginInvocationOptions<Kernels, Middleware, Bundlers, Transcoders, Presets, Preset>]
  : Preset extends 'default'
    ? Preset extends keyof Presets
      ? [RequiredCapabilityOptionNames<Kernels, Middleware, Bundlers, Transcoders, Presets[Preset]>] extends [never]
        ? [options?: PluginInvocationOptions<Kernels, Middleware, Bundlers, Transcoders, Presets, Preset>]
        : [options: PluginInvocationOptions<Kernels, Middleware, Bundlers, Transcoders, Presets, Preset>]
      : never
    : [options: PluginInvocationOptions<Kernels, Middleware, Bundlers, Transcoders, Presets, Preset>];

type EmptyPluginCapabilities = {
  readonly kernels: EmptyTuple;
  readonly middleware: EmptyTuple;
  readonly bundlers: EmptyTuple;
  readonly transcoders: EmptyTuple;
};

/** Package identity for a Tau plugin toolkit. @public */
export type PluginMeta = {
  readonly name: string;
};

/** Capabilities selected from one invoked Tau plugin factory. @public */
export type PluginCapabilities = {
  readonly kernels: readonly AnyKernelPlugin[];
  readonly middleware: readonly MiddlewarePlugin[];
  readonly bundlers: readonly BundlerPlugin[];
  readonly transcoders: readonly AnyTranscoderPlugin[];
};

/** An invoked plugin toolkit ready for expansion by {@link defineRuntime}. @public */
export type PluginInstance<Capabilities extends PluginCapabilities = PluginCapabilities> = {
  readonly meta: PluginMeta;
  readonly preset: string;
  readonly capabilities: Capabilities;
};

/** Callable package-root contract returned by {@link definePlugin}. @public */
export type PluginFactory<
  Meta extends PluginMeta = PluginMeta,
  Kernels extends CapabilityFactoryMap<KernelCapabilityFactory> = CapabilityFactoryMap<KernelCapabilityFactory>,
  Middleware extends CapabilityFactoryMap<MiddlewareCapabilityFactory> =
    CapabilityFactoryMap<MiddlewareCapabilityFactory>,
  Bundlers extends CapabilityFactoryMap<BundlerCapabilityFactory> = CapabilityFactoryMap<BundlerCapabilityFactory>,
  Transcoders extends CapabilityFactoryMap<TranscoderCapabilityFactory> =
    CapabilityFactoryMap<TranscoderCapabilityFactory>,
  Presets extends Readonly<Record<string, readonly string[]>> = Readonly<Record<string, readonly string[]>>,
> = {
  <const Preset extends string = 'default'>(
    ...options: PluginInvocationArguments<Kernels, Middleware, Bundlers, Transcoders, Presets, Preset>
  ): PluginInstance<CapabilitiesForPreset<Kernels, Middleware, Bundlers, Transcoders, Presets, Preset>>;
  readonly meta: Meta;
};

/** Widened invoked-plugin type used by runtime composition helpers. @public */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- preserves concrete capability tuples during conditional inference
export type AnyPluginInstance = PluginInstance<any>;

type PluginCapabilitiesOf<Plugin> = Plugin extends PluginInstance<infer Capabilities> ? Capabilities : never;

type ExpandPluginCapabilityTuples<
  Plugins extends readonly AnyPluginInstance[],
  Kind extends keyof PluginCapabilities,
  Result extends readonly unknown[] = EmptyTuple,
> = number extends Plugins['length']
  ? [Plugins[number]] extends [never]
    ? EmptyTuple
    : PluginCapabilitiesOf<Plugins[number]>[Kind]
  : Plugins extends readonly [
        infer Plugin extends AnyPluginInstance,
        ...infer Rest extends readonly AnyPluginInstance[],
      ]
    ? ExpandPluginCapabilityTuples<Rest, Kind, readonly [...Result, ...PluginCapabilitiesOf<Plugin>[Kind]]>
    : Result;

/** Ordered kernel tuple selected by invoked plugins. @public */
export type ExpandPluginKernels<Plugins extends readonly AnyPluginInstance[]> = ExpandPluginCapabilityTuples<
  Plugins,
  'kernels'
>;

/** Ordered middleware tuple selected by invoked plugins. @public */
export type ExpandPluginMiddleware<Plugins extends readonly AnyPluginInstance[]> = ExpandPluginCapabilityTuples<
  Plugins,
  'middleware'
>;

/** Ordered bundler tuple selected by invoked plugins. @public */
export type ExpandPluginBundlers<Plugins extends readonly AnyPluginInstance[]> = ExpandPluginCapabilityTuples<
  Plugins,
  'bundlers'
>;

/** Ordered transcoder tuple selected by invoked plugins. @public */
export type ExpandPluginTranscoders<Plugins extends readonly AnyPluginInstance[]> = ExpandPluginCapabilityTuples<
  Plugins,
  'transcoders'
>;

type RuntimePluginKind = keyof PluginCapabilities;

/** Expanded capability plus its package-owned diagnostic origin. @public */
export type ExpandedPluginCapability = {
  [Kind in RuntimePluginKind]: {
    readonly capability: PluginCapabilities[Kind][number];
    readonly kind: Kind;
    readonly path: string;
    readonly packageName: string;
  };
}[RuntimePluginKind];

type PluginInstanceInternals = {
  readonly [pluginInstanceSymbol]: typeof runtimePluginAbiVersion;
  readonly [expandedPluginCapabilitiesSymbol]: readonly ExpandedPluginCapability[];
};

type PluginDefinition = {
  readonly meta: PluginMeta;
  readonly kernels?: CapabilityFactoryMap<KernelCapabilityFactory>;
  readonly middleware?: CapabilityFactoryMap<MiddlewareCapabilityFactory>;
  readonly bundlers?: CapabilityFactoryMap<BundlerCapabilityFactory>;
  readonly transcoders?: CapabilityFactoryMap<TranscoderCapabilityFactory>;
  readonly presets: Readonly<Record<string, readonly string[]>>;
};

type RuntimeCapabilityOptions = Readonly<Partial<Record<RuntimePluginKind, Readonly<Record<string, unknown>>>>>;

const runtimePluginKinds = ['kernels', 'middleware', 'bundlers', 'transcoders'] as const;
const pluginInvocationOptionKeys = ['preset', ...runtimePluginKinds] as const;

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOwnCallableProperty = <Key extends PropertyKey>(
  value: unknown,
  key: Key,
): value is ((...args: never[]) => unknown) & Record<Key, unknown> =>
  typeof value === 'function' && Object.hasOwn(value, key);

const parseCapabilityPath = (
  definition: PluginDefinition,
  preset: string,
  path: string,
): { readonly kind: RuntimePluginKind; readonly name: string } => {
  const separator = path.indexOf('.');
  const kind = path.slice(0, separator) as RuntimePluginKind;
  const name = path.slice(separator + 1);
  const label = `${definition.meta.name} preset "${preset}"`;

  if (separator < 1 || !runtimePluginKinds.includes(kind)) {
    throw new Error(`${label} contains unknown capability kind in "${path}".`);
  }
  if (!name || !Object.hasOwn(definition[kind] ?? {}, name)) {
    throw new Error(`${label} references missing capability "${path}".`);
  }

  return { kind, name };
};

const requireCapabilityFactory = <Factory extends AnyCapabilityFactory>(
  factory: Factory | undefined,
  options: { readonly definition: PluginDefinition; readonly path: string },
): Factory => {
  if (typeof factory !== 'function') {
    throw new TypeError(`${options.definition.meta.name} capability "${options.path}" must be a factory.`);
  }
  return factory;
};

const parsePluginInvocation = (
  definition: PluginDefinition,
  options: unknown,
): { readonly preset: string; readonly capabilityOptions: RuntimeCapabilityOptions } => {
  if (options !== undefined && !isRecordObject(options)) {
    throw new TypeError(`${definition.meta.name} plugin options must be an object.`);
  }
  const input = options ?? {};
  for (const key of Object.keys(input)) {
    if (!pluginInvocationOptionKeys.includes(key as (typeof pluginInvocationOptionKeys)[number])) {
      throw new Error(`${definition.meta.name} received unknown plugin option "${key}".`);
    }
  }
  const presetValue = input['preset'];
  if (presetValue !== undefined && typeof presetValue !== 'string') {
    throw new TypeError(`${definition.meta.name} plugin preset must be a string.`);
  }
  const preset = presetValue ?? 'default';
  const selectedPaths = definition.presets[preset];
  if (!selectedPaths) {
    throw new Error(`${definition.meta.name} does not declare plugin preset "${preset}".`);
  }
  const selected = new Set(selectedPaths);
  const capabilityOptions: Partial<Record<RuntimePluginKind, Readonly<Record<string, unknown>>>> = {};
  for (const kind of runtimePluginKinds) {
    const roleOptions = input[kind];
    if (roleOptions === undefined) {
      continue;
    }
    if (!isRecordObject(roleOptions)) {
      throw new TypeError(`${definition.meta.name} preset "${preset}" options for "${kind}" must be an object.`);
    }
    for (const name of Object.keys(roleOptions)) {
      const path = `${kind}.${name}`;
      if (!Object.hasOwn(definition[kind] ?? {}, name)) {
        throw new Error(
          `${definition.meta.name} preset "${preset}" received options for missing capability "${path}".`,
        );
      }
      if (!selected.has(path)) {
        throw new Error(
          `${definition.meta.name} preset "${preset}" received options for unselected capability "${path}".`,
        );
      }
      const capabilityFactory = definition[kind]?.[name];
      if (capabilityFactory && runtimePluginFactoryAcceptsOptions(capabilityFactory) === false) {
        throw new Error(`${definition.meta.name} preset "${preset}" capability "${path}" does not accept options.`);
      }
    }
    capabilityOptions[kind] = roleOptions;
  }
  return { preset, capabilityOptions };
};

const invokeCapabilityFactory = <Factory extends AnyCapabilityFactory>(
  factory: Factory,
  configured: boolean,
  options: unknown,
): ReturnType<Factory> => Reflect.apply(factory, undefined, configured ? [options] : []) as ReturnType<Factory>;

const expandPreset = (
  definition: PluginDefinition,
  preset: string,
  capabilityOptions: RuntimeCapabilityOptions,
): readonly ExpandedPluginCapability[] => {
  const paths = definition.presets[preset];
  if (!paths) {
    throw new Error(`${definition.meta.name} does not declare plugin preset "${preset}".`);
  }

  return paths.map((path) => {
    const { kind, name } = parseCapabilityPath(definition, preset, path);
    const roleOptions = capabilityOptions[kind];
    const configured = roleOptions !== undefined && Object.hasOwn(roleOptions, name);
    const options = roleOptions?.[name];
    const origin = {
      path: `${definition.meta.name}/${path}`,
      packageName: definition.meta.name,
    };
    switch (kind) {
      case 'kernels': {
        return {
          // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- generic factory ReturnType is materialised at this single invocation boundary
          capability: invokeCapabilityFactory(
            requireCapabilityFactory(definition.kernels?.[name], { definition, path }),
            configured,
            options,
          ),
          kind,
          ...origin,
        };
      }
      case 'middleware': {
        return {
          // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- generic factory ReturnType is materialised at this single invocation boundary
          capability: invokeCapabilityFactory(
            requireCapabilityFactory(definition.middleware?.[name], { definition, path }),
            configured,
            options,
          ),
          kind,
          ...origin,
        };
      }
      case 'bundlers': {
        return {
          // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- generic factory ReturnType is materialised at this single invocation boundary
          capability: invokeCapabilityFactory(
            requireCapabilityFactory(definition.bundlers?.[name], { definition, path }),
            configured,
            options,
          ),
          kind,
          ...origin,
        };
      }
      case 'transcoders': {
        return {
          // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- generic factory ReturnType is materialised at this single invocation boundary
          capability: invokeCapabilityFactory(
            requireCapabilityFactory(definition.transcoders?.[name], { definition, path }),
            configured,
            options,
          ),
          kind,
          ...origin,
        };
      }
      default: {
        throw new TypeError(`Unsupported plugin capability kind: ${String(kind)}`);
      }
    }
  });
};

/**
 * Define one package-owned toolkit whose callable instances select a preset and configure its selected factories.
 *
 * @public
 */
export function definePlugin<
  const Meta extends PluginMeta,
  const Kernels extends CapabilityFactoryMap<KernelCapabilityFactory> = EmptyCapabilityFactoryMap,
  const Middleware extends CapabilityFactoryMap<MiddlewareCapabilityFactory> = EmptyCapabilityFactoryMap,
  const Bundlers extends CapabilityFactoryMap<BundlerCapabilityFactory> = EmptyCapabilityFactoryMap,
  const Transcoders extends CapabilityFactoryMap<TranscoderCapabilityFactory> = EmptyCapabilityFactoryMap,
  const Presets extends Readonly<Record<string, readonly string[]>> = Readonly<Record<string, readonly string[]>>,
>(definition: {
  readonly meta: Meta;
  readonly kernels?: Kernels;
  readonly middleware?: Middleware;
  readonly bundlers?: Bundlers;
  readonly transcoders?: Transcoders;
  readonly presets: Presets &
    ValidatedPresets<Presets, PluginCapabilityPath<Kernels, Middleware, Bundlers, Transcoders>>;
}): PluginFactory<Meta, Kernels, Middleware, Bundlers, Transcoders, Presets> {
  const factory = ((options?: unknown) => {
    const { preset, capabilityOptions } = parsePluginInvocation(definition, options);
    const expanded = expandPreset(definition, preset, capabilityOptions);
    const capabilities: {
      kernels: AnyKernelPlugin[];
      middleware: MiddlewarePlugin[];
      bundlers: BundlerPlugin[];
      transcoders: AnyTranscoderPlugin[];
    } = {
      kernels: [],
      middleware: [],
      bundlers: [],
      transcoders: [],
    };
    for (const entry of expanded) {
      switch (entry.kind) {
        case 'kernels': {
          capabilities.kernels.push(entry.capability);
          break;
        }
        case 'middleware': {
          capabilities.middleware.push(entry.capability);
          break;
        }
        case 'bundlers': {
          capabilities.bundlers.push(entry.capability);
          break;
        }
        case 'transcoders': {
          capabilities.transcoders.push(entry.capability);
          break;
        }
      }
    }
    const instance = { meta: definition.meta, preset, capabilities };
    Object.defineProperties(instance, {
      [pluginInstanceSymbol]: { value: runtimePluginAbiVersion },
      [expandedPluginCapabilitiesSymbol]: { value: expanded },
    });
    return instance;
  }) as unknown as PluginFactory<Meta, Kernels, Middleware, Bundlers, Transcoders, Presets>;

  Object.defineProperties(factory, {
    meta: { value: definition.meta, enumerable: true },
    [pluginFactorySymbol]: { value: runtimePluginAbiVersion },
  });
  return factory;
}

/** Test whether an unknown value is an invoked Tau plugin instance for the current ABI. @public */
export const isPluginInstance = (value: unknown): value is PluginInstance & PluginInstanceInternals =>
  typeof value === 'object' &&
  value !== null &&
  (value as Partial<Record<PropertyKey, unknown>>)[pluginInstanceSymbol] === runtimePluginAbiVersion;

/** Read a factory or instance construction ABI without validating the rest of its shape. @public */
export const runtimePluginAbiVersionOf = (value: unknown): number | undefined => {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
    return undefined;
  }
  const branded = value as Partial<Record<PropertyKey, unknown>>;
  const version = branded[pluginFactorySymbol] ?? branded[pluginInstanceSymbol];
  return typeof version === 'number' ? version : undefined;
};

/** Test whether an unknown dynamic export is a Tau plugin factory. @public */
export const isPluginFactory = (value: unknown): value is PluginFactory => {
  if (
    !hasOwnCallableProperty(value, 'meta') ||
    (value as unknown as Partial<Record<PropertyKey, unknown>>)[pluginFactorySymbol] !== runtimePluginAbiVersion
  ) {
    return false;
  }
  const { meta } = value;
  return isRecordObject(meta) && typeof meta['name'] === 'string';
};

export const expandedPluginCapabilities = (
  plugin: PluginInstance & PluginInstanceInternals,
): readonly ExpandedPluginCapability[] => plugin[expandedPluginCapabilitiesSymbol];
