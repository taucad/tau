import type { RpcProtocol } from '#channel.js';
import type { WireProtocolSchemas, WireValidator } from '#wire-validation-error.js';
import { bridgeErrorWireSchema, bridgeWatchReadyFrameSchema } from '#bridge/bridge-internal.js';
import type { BridgeProtocolSchemas } from '#bridge/bridge-protocol.js';
import { z } from 'zod';

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

const wireValidatorSchema = <T>(validator: WireValidator<T>): z.ZodType<T> =>
  z.unknown().transform((value, context) => {
    const parsed = validator.safeParse(value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        context.addIssue({ code: 'custom', path: [...issue.path], message: issue.message });
      }
      return z.NEVER;
    }
    return parsed.data;
  });

const bridgeErrorMarkerSchema = z.object({ __bridgeError: z.unknown() });
const bridgeCallResultSchema = (domain: WireValidator): WireValidator =>
  z.unknown().transform((value, context) => {
    const validator = bridgeErrorMarkerSchema.safeParse(value).success ? bridgeErrorWireSchema : domain;
    const parsed = validator.safeParse(value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        context.addIssue({ code: 'custom', path: [...issue.path], message: issue.message });
      }
      return z.NEVER;
    }
    return parsed.data;
  });

const nullValidator = z.null();

const watchArgsValidator = (request: WireValidator) => z.object({ request: wireValidatorSchema(request) });

const watchEventValidator = (event: WireValidator) =>
  z.union([bridgeWatchReadyFrameSchema, wireValidatorSchema(event)]);

const callSchemas = (
  schemas: BridgeProtocolSchemas['calls'],
): Readonly<Record<string, { readonly args: WireValidator<unknown[]>; readonly result: WireValidator }>> =>
  Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [
      name,
      {
        args: schema.args,
        result: bridgeCallResultSchema(schema.result),
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
