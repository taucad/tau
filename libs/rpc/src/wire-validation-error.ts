/**
 * Error thrown when an inbound RPC frame fails its
 * {@link WireProtocolSchemas} validator at the wire boundary.
 *
 * Carries the underlying validator's issue list so consumers can surface
 * a precise per-field message instead of the generic "channel call
 * failed" UX. The runtime channel server propagates this error over the
 * wire as a typed `rs/se` error frame so the originating call rejects
 * with the same `name` / `kind` / `field` triples on the client side.
 *
 * @public
 */

import type { RpcProtocol } from '#channel.js';

/**
 * Per-field validation issue extracted from the underlying validator
 * (typically Zod).
 *
 * Structural shape so consumers can light up issue listings without
 * pulling Zod into `@taucad/rpc`.
 *
 * @public
 */
export type WireValidationIssue = {
  /**
   * Path through the value tree to the offending field, root-most first.
   *
   * Typed as `PropertyKey[]` for structural compatibility with Zod's
   * `$ZodIssue.path` (which permits `symbol` segments). In practice the
   * runtime protocol only ever produces string / number segments.
   */
  readonly path: readonly PropertyKey[];
  /** Human-readable message describing the violation. */
  readonly message: string;
  /** Optional discriminator/code from the validator (e.g. Zod's `code`). */
  readonly code?: string;
};

/**
 * Outcome a validator may produce when invoked at the wire boundary.
 *
 * Validators that follow Zod's `.safeParse(value)` shape automatically
 * conform.
 *
 * @public
 */
export type WireValidationResult<T = unknown> =
  | { readonly success: true; readonly data: T }
  | {
      readonly success: false;
      readonly error: { readonly issues: readonly WireValidationIssue[]; readonly message?: string };
    };

/**
 * Minimal structural shape required of a wire-validation validator.
 *
 * Zod schemas (`ZodType<T>`) satisfy this interface naturally via
 * `.safeParse(value)`. Consumers may also supply hand-rolled validators
 * for non-Zod environments.
 *
 * @public
 */
export type WireValidator<T = unknown> = {
  readonly safeParse: (value: unknown) => WireValidationResult<T>;
};

type WireHelloSchema<P extends RpcProtocol> = P extends { readonly hello: infer Hello }
  ? { readonly hello: WireValidator<Hello> }
  : { readonly hello?: WireValidator };

type CallWireArgs<P extends RpcProtocol, Name extends keyof P['calls']> = P['calls'][Name] extends {
  readonly wireArgs: infer WireArgs;
}
  ? WireArgs
  : P['calls'][Name]['args'];

type CallWireResult<P extends RpcProtocol, Name extends keyof P['calls']> = P['calls'][Name] extends {
  readonly wireResult: infer WireResult;
}
  ? WireResult
  : P['calls'][Name]['result'];

type NotifyWireArgs<P extends RpcProtocol, Name extends keyof P['notifies']> = P['notifies'][Name] extends {
  readonly wireArgs: infer WireArgs;
}
  ? WireArgs
  : P['notifies'][Name]['args'];

type ListenWireArgs<P extends RpcProtocol, Name extends keyof P['listens']> = P['listens'][Name] extends {
  readonly wireArgs: infer WireArgs;
}
  ? WireArgs
  : P['listens'][Name]['args'];

type ListenWireEvent<P extends RpcProtocol, Name extends keyof P['listens']> = P['listens'][Name] extends {
  readonly wireEvent: infer WireEvent;
}
  ? WireEvent
  : P['listens'][Name]['event'];

/**
 * Wire-protocol schema map paired with an `RpcProtocol` contract.
 *
 * Pass to `createChannelServer` / `createChannelClient` via the
 * `protocolSchemas` option to enforce shape at the wire boundary.
 *
 * @public
 */
export type WireProtocolSchemas<P extends RpcProtocol = RpcProtocol> = WireHelloSchema<P> & {
  readonly calls: {
    readonly [Name in keyof P['calls']]: {
      readonly args: WireValidator<CallWireArgs<P, Name>>;
      readonly result: WireValidator<CallWireResult<P, Name>>;
    };
  };
  readonly notifies: {
    readonly [Name in keyof P['notifies']]: WireValidator<NotifyWireArgs<P, Name>>;
  };
  readonly listens: {
    readonly [Name in keyof P['listens']]: {
      readonly args: WireValidator<ListenWireArgs<P, Name>>;
      readonly event: WireValidator<ListenWireEvent<P, Name>>;
    };
  };
};

/**
 * Site at which the validation failure occurred. Distinguishes
 * client/server, args/result, and call/notify so consumers can route
 * the failure to the appropriate UI path.
 *
 * @public
 */
export type WireValidationSite =
  | 'client-hello'
  | 'server-call-args'
  | 'server-listen-args'
  | 'server-notify-args'
  | 'client-call-result'
  | 'client-listen-event'
  | 'client-notify-args';

/**
 * Error thrown when an inbound frame fails its
 * {@link WireProtocolSchemas} validator.
 *
 * @public
 */
export class WireValidationError extends Error {
  public override readonly name = 'WireValidationError';
  /** Site at which validation failed. */
  public readonly site: WireValidationSite;
  /** Protocol entry name (call name or notify name). */
  public readonly entry: string;
  /** Per-field validation issues. */
  public readonly issues: readonly WireValidationIssue[];

  public constructor(site: WireValidationSite, entry: string, issues: readonly WireValidationIssue[]) {
    const summary =
      issues.length === 0
        ? `wire validation failed for ${site} '${entry}'`
        : `wire validation failed for ${site} '${entry}': ${issues
            .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
            .join('; ')}`;
    super(summary);
    this.site = site;
    this.entry = entry;
    this.issues = issues;
  }
}

/**
 * Type guard for {@link WireValidationError}.
 *
 * @param value - Arbitrary value to test.
 * @returns `true` when `value` is a {@link WireValidationError} instance.
 * @public
 */
export const isWireValidationError = (value: unknown): value is WireValidationError =>
  value instanceof WireValidationError;
