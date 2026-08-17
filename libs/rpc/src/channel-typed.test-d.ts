// eslint-disable-next-line import-x/no-extraneous-dependencies -- this is a test file.
import { describe, expectTypeOf, it, assertType } from 'vitest';
import type {
  Channel,
  ChannelServer,
  ChannelServerOptions,
  EmptyRpcProtocol,
  Port,
  RpcProtocol,
  WireProtocolSchemas,
  WireValidator,
} from '#index.js';

/**
 * Type-level conformance tests for {@link Channel} / {@link ChannelServer} generics (R2).
 *
 * Validates that a typed protocol declared via {@link RpcProtocol} flows through `Channel<P>`
 * and `ChannelServer<P>` so consumers see typed args/result/notify/listen signatures, and that
 * {@link EmptyRpcProtocol} keeps unparameterised (legacy) callers ergonomic.
 */

type SampleProtocol = {
  readonly hello: { readonly protocol: 1; readonly label: string };
  readonly calls: {
    readonly add: { args: { a: number; b: number }; result: number };
    readonly render: { args: { source: string }; result: Uint8Array<ArrayBuffer> };
  };
  readonly notifies: {
    readonly openFile: { args: { path: string } };
  };
  readonly listens: {
    readonly progress: { args: { since: number }; event: number };
  };
};

declare const port: Port<unknown>;
declare const impl: ChannelServer<SampleProtocol>;
declare const helloValidator: WireValidator<SampleProtocol['hello']>;
declare const addArgsValidator: WireValidator<SampleProtocol['calls']['add']['args']>;
declare const addResultValidator: WireValidator<SampleProtocol['calls']['add']['result']>;
declare const renderArgsValidator: WireValidator<SampleProtocol['calls']['render']['args']>;
declare const renderResultValidator: WireValidator<SampleProtocol['calls']['render']['result']>;
declare const notifyValidator: WireValidator<SampleProtocol['notifies']['openFile']['args']>;
declare const listenArgsValidator: WireValidator<SampleProtocol['listens']['progress']['args']>;
declare const listenEventValidator: WireValidator<SampleProtocol['listens']['progress']['event']>;
declare const stringValidator: WireValidator<string>;

const validSchemas = {
  hello: helloValidator,
  calls: {
    add: { args: addArgsValidator, result: addResultValidator },
    render: { args: renderArgsValidator, result: renderResultValidator },
  },
  notifies: { openFile: notifyValidator },
  listens: { progress: { args: listenArgsValidator, event: listenEventValidator } },
} as const;

describe('Channel<P> typed surface (R2)', () => {
  it('infers ready and closed promises', () => {
    /* These are pure type-level assignability checks, not actual promise chains. */
    // oxlint-disable promise/prefer-await-to-then -- type-level Promise.resolve() seeds, no .then() chain
    const ready: Channel<SampleProtocol>['ready'] = Promise.resolve();
    assertType<Promise<void>>(ready);
    const closed: Channel<SampleProtocol>['closed'] = Promise.resolve();
    assertType<Promise<void>>(closed);
    // oxlint-enable promise/prefer-await-to-then
  });

  it('exposes the protocol hello payload', () => {
    expectTypeOf<Channel<SampleProtocol>['hello']['payload']>().toEqualTypeOf<SampleProtocol['hello']>();
  });

  it('admits the empty protocol so legacy untyped consumers keep compiling', () => {
    type EmptyAssignableToBase = EmptyRpcProtocol extends RpcProtocol ? true : false;
    const value: EmptyAssignableToBase = true;
    assertType<true>(value);
  });
});

describe('ChannelServer<P> typed surface (R2)', () => {
  it('exposes a typed call/listen impl that consumers must implement', () => {
    type Keys = keyof ChannelServer<SampleProtocol>;
    const callKey: Extract<Keys, 'call'> = 'call';
    const listenKey: Extract<Keys, 'listen'> = 'listen';
    assertType<'call'>(callKey);
    assertType<'listen'>(listenKey);
  });

  it('requires the declared hello payload', () => {
    // @ts-expect-error Strict protocols require a server hello.
    const missingHello: ChannelServerOptions<SampleProtocol> = { port, sessionKey: 'typed', impl };
    expectTypeOf(missingHello).toExtend<ChannelServerOptions<SampleProtocol>>();

    const wrongHello: ChannelServerOptions<SampleProtocol> = {
      port,
      sessionKey: 'typed',
      impl,
      // @ts-expect-error Strict protocol hello fields are checked.
      hello: { label: 'missing protocol' },
    };
    expectTypeOf(wrongHello).toExtend<ChannelServerOptions<SampleProtocol>>();
  });
});

describe('WireProtocolSchemas<P> exact surface', () => {
  it('accepts the complete matching schema map', () => {
    expectTypeOf(validSchemas).toExtend<WireProtocolSchemas<SampleProtocol>>();
  });

  it('rejects missing schema entries', () => {
    const missingHello = {
      calls: validSchemas.calls,
      notifies: validSchemas.notifies,
      listens: validSchemas.listens,
    };
    // @ts-expect-error Strict protocols require a hello validator.
    expectTypeOf(missingHello).toExtend<WireProtocolSchemas<SampleProtocol>>();

    const missingCall = {
      hello: helloValidator,
      calls: { add: validSchemas.calls.add },
      notifies: validSchemas.notifies,
      listens: validSchemas.listens,
    };
    // @ts-expect-error Every declared call requires args and result validators.
    expectTypeOf(missingCall).toExtend<WireProtocolSchemas<SampleProtocol>>();

    const missingNotify = {
      hello: helloValidator,
      calls: validSchemas.calls,
      notifies: {},
      listens: validSchemas.listens,
    };
    // @ts-expect-error Every declared notification requires an args validator.
    expectTypeOf(missingNotify).toExtend<WireProtocolSchemas<SampleProtocol>>();

    const missingListen = {
      hello: helloValidator,
      calls: validSchemas.calls,
      notifies: validSchemas.notifies,
      listens: {},
    };
    // @ts-expect-error Every declared listen requires args and event validators.
    expectTypeOf(missingListen).toExtend<WireProtocolSchemas<SampleProtocol>>();
  });

  it('rejects extra schema entries', () => {
    const extraHello: WireProtocolSchemas<SampleProtocol> = {
      ...validSchemas,
      // @ts-expect-error The outer schema inventory is exact.
      futureHello: helloValidator,
    };
    const extraCall: WireProtocolSchemas<SampleProtocol> = {
      ...validSchemas,
      calls: {
        ...validSchemas.calls,
        // @ts-expect-error Undeclared calls cannot have validators.
        futureCall: { args: addArgsValidator, result: addResultValidator },
      },
    };
    const extraNotify: WireProtocolSchemas<SampleProtocol> = {
      ...validSchemas,
      notifies: {
        ...validSchemas.notifies,
        // @ts-expect-error Undeclared notifications cannot have validators.
        futureNotify: notifyValidator,
      },
    };
    const extraListen: WireProtocolSchemas<SampleProtocol> = {
      ...validSchemas,
      listens: {
        ...validSchemas.listens,
        // @ts-expect-error Undeclared listens cannot have validators.
        futureListen: { args: listenArgsValidator, event: listenEventValidator },
      },
    };
    expectTypeOf(extraHello).toExtend<WireProtocolSchemas<SampleProtocol>>();
    expectTypeOf(extraCall).toExtend<WireProtocolSchemas<SampleProtocol>>();
    expectTypeOf(extraNotify).toExtend<WireProtocolSchemas<SampleProtocol>>();
    expectTypeOf(extraListen).toExtend<WireProtocolSchemas<SampleProtocol>>();
  });

  it('rejects validators with incompatible successful outputs', () => {
    const schemas: WireProtocolSchemas<SampleProtocol> = {
      ...validSchemas,
      calls: {
        ...validSchemas.calls,
        add: {
          // @ts-expect-error The validator must yield the declared call args.
          args: stringValidator,
          result: addResultValidator,
        },
      },
      listens: {
        progress: {
          args: listenArgsValidator,
          // @ts-expect-error The validator must yield the declared listen event.
          event: stringValidator,
        },
      },
    };
    expectTypeOf(schemas).toExtend<WireProtocolSchemas<SampleProtocol>>();
  });
});
