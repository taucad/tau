import { createServer, request } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

/**
 * A pass-through HTTP proxy in front of MinIO that can answer, drop or watch
 * one object-store call (charter W10, success criteria S1 and S2).
 *
 * Two of the three faults W10 must show are reachable without it — a lost
 * conditional write is produced by racing two real pushes, and a store outage
 * is produced by stopping MinIO — but `429` is not: MinIO does not bound
 * concurrent writes to one key the way R2 does (D5, W0b). Rather than one seam
 * for `429` and three mechanisms for the rest, everything the store sees goes
 * through here, which also makes the five fault points of
 * `apps/api/app/api/git/store/fault-points.ts` observable from outside the
 * process: they bracket exactly these calls.
 *
 * | Fault point | The store call this proxy sees |
 * | --- | --- |
 * | `after-pack-upload` | the last non-manifest `PUT` before the manifest `PUT` |
 * | `before-manifest-commit` | the manifest `PUT`, before it is forwarded |
 * | `after-manifest-commit` | the manifest `PUT`, after MinIO answered `200` |
 * | `mid-compaction` | a pack `PUT` in a commit that also retires packs |
 * | `mid-sweep` | the first `DELETE` after a manifest `PUT` |
 *
 * SigV4 signs the `Host` header, so every header is forwarded verbatim and
 * MinIO verifies the signature the client actually produced. Nothing here
 * rewrites a request.
 */

/** What the proxy does with a matching call. */
export type FaultAction =
  /** Answer it without forwarding. */
  | {
      readonly kind: 'status';
      readonly status: number;
      /** The S3 error code in the body. The SDK classifies on it, not only on the status. */
      readonly code: string;
      readonly message: string;
      readonly headers?: Readonly<Record<string, string>>;
    }
  /** Destroy the socket without forwarding: an unreachable store. */
  | { readonly kind: 'drop' }
  /** Run `onFault`, then destroy the socket: the worker died before this call. */
  | { readonly kind: 'kill-before' }
  /** Forward it, wait for MinIO, then run `onFault` and destroy the socket: the worker died after it. */
  | { readonly kind: 'kill-after' };

/** One rule, consumed `times` times. */
export type FaultRule = {
  readonly method: string;
  /** Substring the request path must contain, or `undefined` for any. */
  readonly keyIncludes?: string;
  /** Substring the request path must NOT contain. */
  readonly keyExcludes?: string;
  readonly times: number;
  readonly action: FaultAction;
};

/** One observed call. */
export type ProxyCall = {
  readonly method: string;
  readonly path: string;
  readonly status: number | 'faulted' | 'dropped';
  readonly at: number;
};

export type FaultProxy = {
  readonly port: number;
  readonly calls: readonly ProxyCall[];
  /** Install rules, replacing whatever was there, and clear the call log. */
  arm: (rules: readonly FaultRule[]) => void;
  /** What `onFault` runs. Set per case; killing a child is the usual one. */
  onFault: (() => void | Promise<void>) | undefined;
  /** How many rule slots are still unconsumed. */
  pending: () => number;
  close: () => Promise<void>;
};

const errorBody = (code: string, message: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`;

/**
 * Start the proxy.
 *
 * @param port - The port the API's `TAU_S3_ENDPOINT` names.
 * @param upstream - MinIO's own origin.
 * @returns The running proxy.
 */
export const startFaultProxy = async (port: number, upstream: string): Promise<FaultProxy> => {
  const upstreamUrl = new URL(upstream);
  const calls: ProxyCall[] = [];
  let rules: FaultRule[] = [];
  const proxy: { onFault: (() => void | Promise<void>) | undefined } = { onFault: undefined };

  const take = (incoming: IncomingMessage): FaultAction | undefined => {
    const path = incoming.url ?? '';
    const index = rules.findIndex(
      (rule) =>
        rule.times > 0 &&
        rule.method === incoming.method &&
        (rule.keyIncludes === undefined || path.includes(rule.keyIncludes)) &&
        (rule.keyExcludes === undefined || !path.includes(rule.keyExcludes)),
    );
    if (index === -1) {
      return undefined;
    }
    const rule = rules[index];
    if (rule === undefined) {
      return undefined;
    }
    rules[index] = { ...rule, times: rule.times - 1 };
    return rule.action;
  };

  const forward = (incoming: IncomingMessage, response: ServerResponse, after?: () => void | Promise<void>): void => {
    const upstreamRequest = request(
      {
        hostname: upstreamUrl.hostname,
        port: upstreamUrl.port,
        method: incoming.method,
        path: incoming.url,
        headers: incoming.headers,
      },
      (upstreamResponse) => {
        calls.push({
          method: incoming.method ?? '',
          path: incoming.url ?? '',
          status: after === undefined ? (upstreamResponse.statusCode ?? 0) : 'faulted',
          at: Date.now(),
        });
        if (after === undefined) {
          response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
          upstreamResponse.pipe(response);
          return;
        }
        /* The store call succeeded and the client will never learn: this is
         * `after-manifest-commit` and `mid-sweep`. */
        upstreamResponse.resume();
        // async-iife: bootstrap — a node `http` callback cannot be awaited, and
        // the whole point of this branch is that the socket dies unobserved.
        void (async (): Promise<void> => {
          try {
            await after();
          } finally {
            response.destroy();
          }
        })();
      },
    );
    upstreamRequest.on('error', () => {
      if (!response.headersSent) {
        response.writeHead(502, { 'content-type': 'application/xml' });
      }
      response.end(errorBody('ProxyError', 'upstream failed'));
    });
    incoming.pipe(upstreamRequest);
  };

  const server: Server = createServer((incoming, response) => {
    const action = take(incoming);
    if (action === undefined) {
      forward(incoming, response);
      return;
    }
    if (action.kind === 'status') {
      incoming.resume();
      calls.push({ method: incoming.method ?? '', path: incoming.url ?? '', status: action.status, at: Date.now() });
      response.writeHead(action.status, { 'content-type': 'application/xml', ...action.headers });
      response.end(errorBody(action.code, action.message));
      return;
    }
    if (action.kind === 'drop') {
      incoming.resume();
      calls.push({ method: incoming.method ?? '', path: incoming.url ?? '', status: 'dropped', at: Date.now() });
      response.destroy();
      return;
    }
    if (action.kind === 'kill-before') {
      incoming.resume();
      calls.push({ method: incoming.method ?? '', path: incoming.url ?? '', status: 'faulted', at: Date.now() });
      // async-iife: bootstrap — same reason as `forward`'s.
      void (async (): Promise<void> => {
        try {
          await proxy.onFault?.();
        } finally {
          response.destroy();
        }
      })();
      return;
    }
    forward(incoming, response, async () => proxy.onFault?.());
  });

  await new Promise<void>((resolve) => {
    server.listen(port, '127.0.0.1', resolve);
  });

  return {
    port,
    calls,
    arm: (next) => {
      rules = [...next];
      calls.length = 0;
    },
    get onFault() {
      return proxy.onFault;
    },
    set onFault(value) {
      proxy.onFault = value;
    },
    pending: () => rules.reduce((total, rule) => total + rule.times, 0),
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  };
};
