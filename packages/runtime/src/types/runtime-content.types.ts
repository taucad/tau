import { z } from 'zod';

/** Canonical framework-owned content property catalog. @public */
export const runtimeContentProperties = {
  includeEdges: z.boolean().describe('Include auxiliary visible edge overlays'),
  includeTopology: z.boolean().describe('Include Tau CAD topology metadata'),
} as const;

/** Tolerant-reader request schema shared by the public API and worker protocol. @public */
export const runtimeContentSchema = z.object(runtimeContentProperties).partial().catchall(z.unknown());

/** Framework-owned content requirements shared by render and export operations. @public */
export type RuntimeContentInput = Readonly<{
  [Key in keyof typeof runtimeContentProperties]?: z.input<(typeof runtimeContentProperties)[Key]>;
}>;

/** Canonical framework-owned content property names. @public */
export type RuntimeContentKey = keyof RuntimeContentInput;

/** Operation-specific framework defaults; unsupported keys are never projected. @public */
export const runtimeContentDefaults = {
  render: { includeEdges: false, includeTopology: true },
  export: { includeEdges: false, includeTopology: false },
} as const satisfies Readonly<Record<'render' | 'export', Required<RuntimeContentInput>>>;

/** Literal declaration used by kernel, middleware, and transcoder authors. @public */
export type RuntimeContentDeclaration = readonly [RuntimeContentKey, ...RuntimeContentKey[]];

/** Consumer content request projected to the properties supported by one concrete route. @public */
export type ContentRequestFor<Keys extends RuntimeContentKey> = [Keys] extends [never]
  ? { readonly content?: never }
  : { readonly content?: Pick<RuntimeContentInput, Keys> };

/** Provider content input projected to the properties fulfilled by one concrete hook. @public */
export type ContentHookInputFor<Keys extends RuntimeContentKey> = [Keys] extends [never]
  ? // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- omission means the provider has no content property
    {}
  : { readonly content?: Pick<RuntimeContentInput, Keys> };

/** Extract the key union carried by a literal content declaration. @public */
export type ContentKeysOf<Declaration> = Declaration extends readonly RuntimeContentKey[] ? Declaration[number] : never;

/** Validate positive content declarations at a plugin authoring boundary. @internal */
export function validateRuntimeContentDeclarations(
  pluginId: string,
  declarations: ReadonlyArray<readonly [path: string, value: unknown]>,
): void {
  for (const [path, value] of declarations) {
    if (value === undefined) {
      continue;
    }
    if (!Array.isArray(value)) {
      throw new TypeError(`Plugin "${pluginId}" content declaration "${path}" must be an array.`);
    }
    if (value.length === 0) {
      throw new TypeError(`Plugin "${pluginId}" content declaration "${path}" must not be empty.`);
    }

    const seen = new Set<RuntimeContentKey>();
    for (const key of value) {
      if (typeof key !== 'string' || !Object.hasOwn(runtimeContentProperties, key)) {
        throw new TypeError(`Plugin "${pluginId}" content declaration "${path}" contains unknown key ${String(key)}.`);
      }
      const contentKey = key as RuntimeContentKey;
      if (seen.has(contentKey)) {
        throw new TypeError(`Plugin "${pluginId}" content declaration "${path}" contains duplicate key "${key}".`);
      }
      seen.add(contentKey);
    }
  }
}

/**
 * Return the framework default for one supported content property.
 * @param operation - Runtime operation receiving the content request.
 * @param key - Supported framework-owned content property.
 * @returns The default value for the property on that operation.
 * @public
 */
export function contentDefault(operation: 'render' | 'export', key: RuntimeContentKey): boolean {
  return runtimeContentDefaults[operation][key];
}

/**
 * Normalize and strictly validate content for one concrete route.
 * @param operation - Runtime operation receiving the content request.
 * @param supported - Content properties advertised by the selected route.
 * @param input - Caller-provided content values.
 * @returns Defaults projected only to the selected route's supported properties.
 * @public
 */
export function normalizeRuntimeContent(
  operation: 'render' | 'export',
  supported: readonly RuntimeContentKey[],
  input: RuntimeContentInput | undefined,
): RuntimeContentInput {
  const parsed = runtimeContentSchema.parse(input ?? {});
  const supportedKeys = new Set(supported);
  for (const key of Object.keys(parsed)) {
    if (!supportedKeys.has(key as RuntimeContentKey)) {
      throw new RuntimeContentUnsupportedError(key, supported);
    }
  }

  return Object.fromEntries(supported.map((key) => [key, parsed[key] ?? contentDefault(operation, key)]));
}

/** Raised when a dynamic caller requests content absent from the concrete route. @public */
export class RuntimeContentUnsupportedError extends Error {
  public readonly property: string;
  public readonly supported: readonly RuntimeContentKey[];

  /**
   *
   */
  public get code(): 'RUNTIME_CONTENT_UNSUPPORTED' {
    return 'RUNTIME_CONTENT_UNSUPPORTED';
  }

  /**
   * @param property - Unsupported content property requested by the caller.
   * @param supported - Properties supported by the selected route.
   */
  public constructor(property: string, supported: readonly RuntimeContentKey[]) {
    super(
      `Content property "${property}" is not supported by this route` +
        (supported.length === 0 ? '.' : `; supported properties: ${supported.join(', ')}.`),
    );
    this.name = 'RuntimeContentUnsupportedError';
    this.property = property;
    this.supported = supported;
  }
}
