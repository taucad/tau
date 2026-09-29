/**
 * Typed RPC protocol contract carried as a phantom type parameter on `Channel` and
 * `ChannelServer`. Each member describes the args/return/event shape for one operation.
 *
 * @public
 */
export type RpcProtocol = {
  readonly hello?: unknown;
  readonly calls: Readonly<Record<string, { args: unknown; result: unknown }>>;
  readonly notifies: Readonly<Record<string, { args: unknown }>>;
  readonly listens: Readonly<Record<string, { args: unknown; event: unknown }>>;
};
