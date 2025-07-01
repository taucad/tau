declare module 'xstate' {
  /** Generic event object */
  export interface AnyEventObject {
    type: string;
    [key: string]: unknown;
  }

  /** Generic context */
  export type AnyContext = Record<string, unknown>;

  /** Minimal ActorRef surface we consume */
  export interface ActorRef<TEvent extends AnyEventObject = AnyEventObject> {
    send: (event: TEvent | AnyEventObject) => void;
    id?: string;
  }

  /** Derive ActorRef from spawn result */
  export type ActorRefFrom<T> = T extends ActorRef ? T : ActorRef;

  /** XState setup helper (we forward any)  */
  export function setup<T>(defs: T): any;

  /** Assign helper (light signature) */
  export function assign<Context, Event extends AnyEventObject>(
    assignment: Partial<{
      [K in keyof Context]: (
        args: { context: Context; event: Event }
      ) => Context[K];
    }>
  ): any;

  /** fromPromise helper stub */
  export function fromPromise<TReturn, TInput = unknown>(
    exec: (args: { input: TInput }) => Promise<TReturn>
  ): any;

  /** sendTo helper stub */
  export function sendTo<Context>(
    actor: (args: { context: Context }) => ActorRef,
    event: (args: { context: Context; event: AnyEventObject }) => AnyEventObject
  ): any;

  /** not guard */
  export function not(guard: string): any;

  /** enqueueActions helper */
  export function enqueueActions(cb: any): any;

  /** Snapshot stub */
  export interface Snapshot<T> {
    context: T;
    value: unknown;
  }

  /** assertEvent utility we poly-fill */
  export function assertEvent<E extends AnyEventObject>(
    event: AnyEventObject,
    type: E['type']
  ): asserts event is E;
}

declare module '@xstate/fsm' {
  export * from 'xstate';
}