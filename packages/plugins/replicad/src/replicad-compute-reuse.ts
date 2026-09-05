import type { ActionDigest, CacheValue, ComputeAction } from '@taucad/cache-core';
import type { KernelComputeSession } from '@taucad/runtime/kernel';

const namespace = 'replicad.operation.v1';
const brepMediaType = 'application/vnd.opencascade.brep';
const codec: ComputeAction['codec'] = { id: 'replicad.brep-text', version: '1' };
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

export type ReplicadComputeReuseOptions = {
  readonly library: ReplicadLibraryLike;
  readonly producer: ComputeAction['producer'];
  readonly environment: CacheValue;
  readonly enabled: boolean;
};

export type ReplicadComputeReuseAdapter = {
  readonly library: ReplicadLibraryLike;
  readonly run: <T>(session: KernelComputeSession, operation: () => Promise<T>) => Promise<T>;
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
export const createReplicadComputeReuse = (options: ReplicadComputeReuseOptions): ReplicadComputeReuseAdapter => {
  let activeSession: KernelComputeSession | undefined;
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

  const publish = (shape: ShapeLike, descriptor: ComputeAction): ShapeIdentity | undefined => {
    const session = activeSession;
    if (!session) {
      return undefined;
    }
    try {
      const result = session.record({
        action: descriptor,
        bytes: utf8.encode(shape.serialize()),
        mediaType: brepMediaType,
      });
      return result.status === 'staged' ? { actionDigest: result.actionDigest } : undefined;
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
            invokeBoolean({ receiver: target, operation: property, original, values });
        }
        if (supportedTransforms.has(property)) {
          return (...values: readonly unknown[]) =>
            invokeTransform({ receiver: target, operation: property, original, values });
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
    const session = activeSession;
    if (!session) {
      return input.compute();
    }
    const hit = session.lookup({ action: input.descriptor });
    if (hit.status === 'hit') {
      try {
        const restored = restore(hit.bytes);
        input.consumingReceiver?.delete();
        return wrapShape(restored, { actionDigest: hit.actionDigest });
      } catch {
        return input.compute();
      }
    }
    const result = input.compute();
    if (!isShapeLike(result)) {
      return result;
    }
    return wrapShape(result, publish(result, input.descriptor));
  };

  const invokePrimitive = (
    operation: string,
    original: (...values: unknown[]) => unknown,
    values: readonly unknown[],
  ) => {
    const normalized = primitiveArguments(operation, values);
    if (!activeSession || normalized === undefined) {
      return original(...values);
    }
    return execute({ descriptor: action({ operation, arguments: normalized }), compute: () => original(...values) });
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
    if (!activeSession || !normalized || !receiverIdentity || !operands || operands.some((entry) => !entry)) {
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
        inputs: [{ kind: 'action', role: 'receiver', digest: receiverIdentity.actionDigest }, ...operandInputs],
        arguments: normalized.options,
      }),
      compute: () => original.apply(receiver, actualValues),
    });
  };

  const invokeTransform = ({ receiver, operation, original, values }: ShapeInvocation): unknown => {
    const normalized = transformArguments(operation, values);
    const receiverIdentity = identityByShape.get(receiver);
    if (!activeSession || normalized === undefined || !receiverIdentity) {
      return original.apply(receiver, [...values]);
    }
    return execute({
      descriptor: action({
        operation,
        inputs: [{ kind: 'action', role: 'receiver', digest: receiverIdentity.actionDigest }],
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

  return {
    library,
    async run(session, operation) {
      activeSession = session;
      try {
        return await operation();
      } finally {
        activeSession = undefined;
      }
    },
    unwrap(value) {
      if (Array.isArray(value)) {
        const entries: readonly unknown[] = value;
        return entries.map((entry) => rawShape(entry) ?? entry);
      }
      if (value !== null && typeof value === 'object' && !isShapeLike(value) && 'shape' in value) {
        const record = value as Record<string, unknown>;
        return { ...record, shape: rawShape(record['shape']) ?? record['shape'] };
      }
      return rawShape(value) ?? value;
    },
  };
};

export const replicadComputeNamespace = namespace;
