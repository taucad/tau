import type { RpcProtocol } from '#channel.js';
import type { WireProtocolSchemas, WireValidationResult, WireValidator } from '#wire-validation-error.js';
import { isBridgeErrorWire, isBridgeWatchReadyFrame } from '#bridge/bridge-internal.js';
import type { BridgeProtocolSchemas } from '#bridge/bridge-protocol.js';

const nullListenArguments = null;

type BridgeRpcProtocol<Hello = unknown> = {
  readonly hello: Hello;
  readonly calls: Readonly<Record<string, { readonly args: unknown[]; readonly result: unknown }>>;
  readonly notifies: Readonly<Record<never, never>>;
  readonly listens: {
    readonly broadcast: {
      readonly args: typeof nullListenArguments;
      readonly event: { readonly event: string; readonly data: unknown };
    };
    readonly watch: {
      readonly args: { readonly request: unknown };
      readonly event: unknown;
    };
  };
};

type EnsureRpcProtocol = BridgeRpcProtocol extends RpcProtocol ? true : never;
const bridgeProtocolIsRpcProtocol: EnsureRpcProtocol = true;
void bridgeProtocolIsRpcProtocol;

const failure = (message: string, path: readonly PropertyKey[] = []): WireValidationResult<never> => ({
  success: false,
  error: { issues: [{ path, message }] },
});

const nullValidator: WireValidator<typeof nullListenArguments> = {
  safeParse: (value) =>
    value === nullListenArguments ? { success: true, data: nullListenArguments } : failure('Expected null'),
};

const watchArgsValidator = (request: WireValidator): WireValidator<{ readonly request: unknown }> => ({
  safeParse(value) {
    if (value === null || typeof value !== 'object' || !('request' in value)) {
      return failure('Expected a watch request envelope');
    }
    const parsed = request.safeParse(value.request);
    if (!parsed.success) {
      return {
        success: false,
        error: {
          issues: parsed.error.issues.map((issue) => ({ ...issue, path: ['request', ...issue.path] })),
        },
      };
    }
    return { success: true, data: { request: parsed.data } };
  },
});

const watchEventValidator = (event: WireValidator): WireValidator => ({
  safeParse: (value) => (isBridgeWatchReadyFrame(value) ? { success: true, data: value } : event.safeParse(value)),
});

const callSchemas = (
  schemas: BridgeProtocolSchemas['calls'],
): Readonly<Record<string, { readonly args: WireValidator<unknown[]>; readonly result: WireValidator }>> =>
  Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [
      name,
      {
        args: schema.args,
        result: {
          safeParse: (value: unknown) =>
            isBridgeErrorWire(value) ? { success: true, data: value } : schema.result.safeParse(value),
        },
      },
    ]),
  );

/** Convert domain bridge validators into the existing channel schema lattice. */
export const createBridgeChannelSchemas = <Hello, WatchRequest, WatchEvent>(
  schemas: BridgeProtocolSchemas<Hello, WatchRequest, WatchEvent> | undefined,
): WireProtocolSchemas<BridgeRpcProtocol<Hello>> | undefined =>
  schemas === undefined
    ? undefined
    : {
        hello: schemas.hello,
        calls: callSchemas(schemas.calls),
        notifies: {},
        listens: {
          broadcast: { args: nullValidator, event: schemas.listens.broadcast.event },
          watch: {
            args: watchArgsValidator(schemas.listens.watch.args),
            event: watchEventValidator(schemas.listens.watch.event),
          },
        },
      };

export type { BridgeRpcProtocol };
