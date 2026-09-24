import { actionDigest, canonicalizeComputeAction } from '@taucad/cache-core';
import type { ActionDigest, CacheValue, ComputeAction } from '@taucad/cache-core';
import { sha256StringSync } from '@taucad/utils/hash';
import type { ComputeReuseScope, ResidentCacheBinding, ResidentExportEntry } from '@taucad/runtime/kernel';

const namespace = 'replicad.operation.v1';
const brepMediaType = 'application/vnd.opencascade.brep';
const codec: ComputeAction['codec'] = {
  id: 'replicad.brep-text',
  version: '1',
};
const supportedPrimitives = new Set(['makeBox', 'makeCylinder', 'makeSphere']);
const supportedBooleans = new Set(['fuse', 'fuseAll', 'cut', 'cutAll', 'intersect', 'intersectAll']);
const supportedTransforms = new Set(['translate', 'translateX', 'translateY', 'translateZ', 'rotate']);
const utf8 = new TextEncoder();
const text = new TextDecoder();

type ShapeLike = {
  readonly serialize: () => string;
  readonly delete: () => void;
};

type ReplicadLibraryLike = {
  readonly deserializeShape: (serialized: string) => ShapeLike;
};

type ShapeIdentity = { readonly actionDigest: ActionDigest };

/**
 *
 */
export type ReplicadComputeReuseOptions = {
  readonly library: ReplicadLibraryLike;
  readonly producer: ComputeAction['producer'];
  readonly environment: CacheValue;
  readonly enabled: boolean;
};

/**
 *
 */
export type ReplicadComputeReuseAdapter<Library extends ReplicadLibraryLike = ReplicadLibraryLike> = {
  readonly library: Library;
  /** The kernel-owned native cache this adapter binds one scope to. */
  readonly resident: ResidentCacheBinding;
  readonly run: <T>(scope: ComputeReuseScope, operation: () => Promise<T>) => Promise<T>;
  readonly unwrap: (value: unknown) => unknown;
};

const finiteNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return Object.is(value, -0) ? 0 : value;
};

const point = (value: unknown): readonly number[] | undefined => {
  if (!Array.isArray(value) || value.length !== 3) {
    return undefined;
  }
  const values = value.map((entry) => finiteNumber(entry));
  return values.every((entry) => entry !== undefined) ? values : undefined;
};

const primitiveArguments = (operation: string, values: readonly unknown[]): CacheValue | undefined => {
  if (operation === 'makeSphere') {
    const radius = finiteNumber(values[0]);
    return values.length === 1 && radius !== undefined ? { radius } : undefined;
  }
  if (operation === 'makeBox') {
    const corner1 = point(values[0]);
    const corner2 = point(values[1]);
    return values.length === 2 && corner1 && corner2 ? { corner1, corner2 } : undefined;
  }
  if (operation !== 'makeCylinder' || values.length < 2 || values.length > 4) {
    return undefined;
  }
  const radius = finiteNumber(values[0]);
  const height = finiteNumber(values[1]);
  const location = point(values[2] ?? [0, 0, 0]);
  const direction = point(values[3] ?? [0, 0, 1]);
  return radius !== undefined && height !== undefined && location && direction
    ? { radius, height, location, direction }
    : undefined;
};

const booleanOptions = (value: unknown): CacheValue | undefined => {
  if (value === undefined) {
    return { optimisation: 'none' };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => key !== 'optimisation')) {
    return undefined;
  }
  const optimisation = (value as { readonly optimisation?: unknown }).optimisation ?? 'none';
  return optimisation === 'none' || optimisation === 'commonFace' || optimisation === 'sameFace'
    ? { optimisation }
    : undefined;
};

const transformArguments = (operation: string, values: readonly unknown[]): CacheValue | undefined => {
  if (operation === 'translate') {
    const coordinates = values.map((entry) => finiteNumber(entry));
    const vector =
      values.length === 1
        ? point(values[0])
        : values.length === 3
          ? coordinates.every((entry) => entry !== undefined)
            ? coordinates
            : undefined
          : undefined;
    return vector ? { vector } : undefined;
  }
  if (operation === 'translateX' || operation === 'translateY' || operation === 'translateZ') {
    const distance = finiteNumber(values[0]);
    return values.length === 1 && distance !== undefined ? { distance } : undefined;
  }
  if (operation !== 'rotate' || values.length === 0 || values.length > 3) {
    return undefined;
  }
  const angle = finiteNumber(values[0]);
  const position = point(values[1] ?? [0, 0, 0]);
  const direction = point(values[2] ?? [0, 0, 1]);
  return angle !== undefined && position && direction ? { angle, position, direction } : undefined;
};

const booleanCall = (
  operation: string,
  values: readonly unknown[],
): { readonly operands: readonly unknown[]; readonly options: CacheValue } | undefined => {
  const batch = operation.endsWith('All');
  const operands = batch ? values[0] : [values[0]];
  if (!Array.isArray(operands)) {
    return undefined;
  }
  const options = booleanOptions(values[1]);
  const maximumArguments = 2;
  return values.length <= maximumArguments && options ? { operands, options } : undefined;
};

const isShapeLike = (value: unknown): value is ShapeLike =>
  value !== null &&
  typeof value === 'object' &&
  typeof (value as Partial<ShapeLike>).serialize === 'function' &&
  typeof (value as Partial<ShapeLike>).delete === 'function';

/** Create the version-pinned, fail-closed semantic adapter around Replicad's public library. */
export const createReplicadComputeReuse = <Library extends ReplicadLibraryLike>(
  options: ReplicadComputeReuseOptions & { readonly library: Library },
): ReplicadComputeReuseAdapter<Library> => {
  let activeScope: ComputeReuseScope | undefined;
  /** Kernel-owned residency: serialized BRep by action identity. W4 replaces it with native shapes. */
  const residentBytes = new Map<ActionDigest, Uint8Array<ArrayBuffer>>();
  const residentActions = new Map<ActionDigest, ComputeAction>();
  let omissions = 0;
  const identityByShape = new WeakMap<WeakKey, ShapeIdentity>();
  const rawByProxy = new WeakMap<WeakKey, ShapeLike>();
  const proxyByRaw = new WeakMap<WeakKey, ShapeLike>();

  const rawShape = (value: unknown): ShapeLike | undefined =>
    (typeof value === 'object' && value !== null) || typeof value === 'function' ? rawByProxy.get(value) : undefined;

  const action = (input: {
    readonly operation: string;
    readonly inputs?: ComputeAction['inputs'];
    readonly arguments: CacheValue;
  }): ComputeAction => ({
    schemaVersion: 1,
    namespace,
    producer: options.producer,
    operation: input.operation,
    inputs: input.inputs ?? [],
    arguments: input.arguments,
    environment: options.environment,
    codec,
  });

  const unwrapShape = (value: unknown): ShapeLike | undefined => {
    if (!isShapeLike(value)) {
      return undefined;
    }
    return rawByProxy.get(value) ?? value;
  };

  const restore = (bytes: Uint8Array<ArrayBuffer>): ShapeLike => options.library.deserializeShape(text.decode(bytes));

  const identify = (descriptor: ComputeAction): ActionDigest =>
    actionDigest({
      value: `sha256:${sha256StringSync(canonicalizeComputeAction(descriptor))}`,
    });

  const publish = (shape: ShapeLike, descriptor: ComputeAction, computeDuration: number): ShapeIdentity | undefined => {
    const scope = activeScope;
    if (!scope) {
      return undefined;
    }
    try {
      const digest = identify(descriptor);
      const bytes = utf8.encode(shape.serialize());
      residentBytes.set(digest, bytes);
      residentActions.set(digest, descriptor);
      const result = scope.announce({
        entries: [
          {
            kind: 'action',
            action: descriptor,
            digest,
            computeDuration,
            estimatedBytes: bytes.byteLength,
          },
        ],
      });
      return result.admitted.length === 1 ? { actionDigest: digest } : { actionDigest: digest };
    } catch {
      return undefined;
    }
  };

  const wrapShape = (shape: ShapeLike, identity?: ShapeIdentity): ShapeLike => {
    if (identity) {
      identityByShape.set(shape, identity);
    }
    const existing = proxyByRaw.get(shape);
    if (existing) {
      return existing;
    }
    const proxy = new Proxy(shape, {
      get(target, property) {
        const value = (target as unknown as Record<PropertyKey, unknown>)[property];
        if (typeof property !== 'string' || typeof value !== 'function') {
          return value;
        }
        const original = value as (...values: unknown[]) => unknown;
        if (supportedBooleans.has(property)) {
          return (...values: readonly unknown[]) =>
            invokeBoolean({
              receiver: target,
              operation: property,
              original,
              values,
            });
        }
        if (supportedTransforms.has(property)) {
          return (...values: readonly unknown[]) =>
            invokeTransform({
              receiver: target,
              operation: property,
              original,
              values,
            });
        }
        return original.bind(target);
      },
    });
    rawByProxy.set(proxy, shape);
    proxyByRaw.set(shape, proxy);
    return proxy;
  };

  const execute = (input: {
    readonly descriptor: ComputeAction;
    readonly compute: () => unknown;
    readonly consumingReceiver?: ShapeLike;
  }): unknown => {
    if (!activeScope) {
      return input.compute();
    }
    const digest = identify(input.descriptor);
    const cached = residentBytes.get(digest);
    if (cached) {
      try {
        const restored = restore(cached);
        input.consumingReceiver?.delete();
        return wrapShape(restored, { actionDigest: digest });
      } catch {
        omissions += 1;
        return input.compute();
      }
    }
    const started = performance.now();
    const result = input.compute();
    if (!isShapeLike(result)) {
      return result;
    }
    return wrapShape(result, publish(result, input.descriptor, performance.now() - started));
  };

  const invokePrimitive = (
    operation: string,
    original: (...values: unknown[]) => unknown,
    values: readonly unknown[],
  ) => {
    const normalized = primitiveArguments(operation, values);
    if (!activeScope || normalized === undefined) {
      return original(...values);
    }
    return execute({
      descriptor: action({ operation, arguments: normalized }),
      compute: () => original(...values),
    });
  };

  type ShapeInvocation = {
    readonly receiver: ShapeLike;
    readonly operation: string;
    readonly original: (...values: unknown[]) => unknown;
    readonly values: readonly unknown[];
  };

  const invokeBoolean = ({ receiver, operation, original, values }: ShapeInvocation): unknown => {
    const normalized = booleanCall(operation, values);
    const receiverIdentity = identityByShape.get(receiver);
    const operands = normalized?.operands.map(unwrapShape);
    if (!activeScope || !normalized || !receiverIdentity || !operands || operands.some((entry) => !entry)) {
      return original.apply(
        receiver,
        values.map((value) => rawShape(value) ?? value),
      );
    }
    const operandIdentities = operands.map((operand) => identityByShape.get(operand!));
    if (operandIdentities.some((identity) => !identity)) {
      return original.apply(
        receiver,
        values.map((value) => rawShape(value) ?? value),
      );
    }
    const actualValues = operation.endsWith('All') ? [operands, values[1]] : [operands[0], values[1]];
    const operandInputs: ComputeAction['inputs'] = operandIdentities.map((identity, index) => ({
      kind: 'action',
      role: `operand:${index}`,
      digest: identity!.actionDigest,
    }));
    return execute({
      descriptor: action({
        operation,
        inputs: [
          {
            kind: 'action',
            role: 'receiver',
            digest: receiverIdentity.actionDigest,
          },
          ...operandInputs,
        ],
        arguments: normalized.options,
      }),
      compute: () => original.apply(receiver, actualValues),
    });
  };

  const invokeTransform = ({ receiver, operation, original, values }: ShapeInvocation): unknown => {
    const normalized = transformArguments(operation, values);
    const receiverIdentity = identityByShape.get(receiver);
    if (!activeScope || normalized === undefined || !receiverIdentity) {
      return original.apply(receiver, [...values]);
    }
    return execute({
      descriptor: action({
        operation,
        inputs: [
          {
            kind: 'action',
            role: 'receiver',
            digest: receiverIdentity.actionDigest,
          },
        ],
        arguments: normalized,
      }),
      compute: () => original.apply(receiver, [...values]),
      consumingReceiver: receiver,
    });
  };

  const library = new Proxy(options.library, {
    get(target, property) {
      const value = (target as unknown as Record<PropertyKey, unknown>)[property];
      if (
        !options.enabled ||
        typeof property !== 'string' ||
        !supportedPrimitives.has(property) ||
        typeof value !== 'function'
      ) {
        return value;
      }
      const original = value as (...values: unknown[]) => unknown;
      return (...values: readonly unknown[]) => invokePrimitive(property, original, values);
    },
  });

  const resident: ResidentCacheBinding = {
    contains: ({ digest }) => residentBytes.has(digest),
    importEntries: async ({ entries }) => {
      const imported: ActionDigest[] = [];
      for (const entry of entries) {
        residentBytes.set(entry.actionDigest, new Uint8Array(entry.bytes));
        residentActions.set(entry.actionDigest, entry.action);
        imported.push(entry.actionDigest);
      }
      return { imported, omitted: [] };
    },
    exportEntries: async ({ digests }) => {
      const entries: ResidentExportEntry[] = [];
      const omitted: ActionDigest[] = [];
      for (const digest of digests) {
        const bytes = residentBytes.get(digest);
        const action = residentActions.get(digest);
        if (!bytes || !action) {
          omitted.push(digest);
          continue;
        }
        const exported: ResidentExportEntry = {
          action,
          bytes,
          mediaType: brepMediaType,
          determinism: 'byte-exact',
        };
        entries.push(exported);
      }
      return { entries, omitted };
    },
    stats: () => ({
      entries: residentBytes.size,
      logicalBytes: [...residentBytes.values()].reduce((total, bytes) => total + bytes.byteLength, 0),
      encodedBytes: { status: 'unsupported' },
      evictions: 0,
      omissions,
    }),
    clear: () => {
      residentBytes.clear();
      residentActions.clear();
    },
  };

  const unwrap = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      const entries: readonly unknown[] = value;
      return entries.map((shape) => unwrap(shape));
    }
    if (value !== null && typeof value === 'object' && 'shapes' in value && Array.isArray(value.shapes)) {
      return { ...value, shapes: value.shapes.map((shape) => unwrap(shape)) };
    }
    if (value !== null && typeof value === 'object' && !isShapeLike(value) && 'shape' in value) {
      const record = value as Record<string, unknown>;
      return {
        ...record,
        shape: rawShape(record['shape']) ?? record['shape'],
      };
    }
    return rawShape(value) ?? value;
  };

  return {
    library,
    resident,
    async run(scope, operation) {
      activeScope = scope;
      try {
        return await operation();
      } finally {
        activeScope = undefined;
      }
    },
    unwrap,
  };
};

export const replicadComputeNamespace = namespace;
