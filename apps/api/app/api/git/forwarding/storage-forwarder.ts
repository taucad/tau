import { Agent, request as httpRequest } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { Readable } from 'node:stream';
import { HttpException, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { GitForwardErrorReason, MetricsService } from '#telemetry/metrics.js';
import {
  framingHeader,
  outcomeHeader,
  readReceiptPrefix,
  receiptPrefixed,
  refusedOutcome,
} from '#api/git/forwarding/contract/framing.js';
import {
  forwardFreeSocketTimeoutMilliseconds,
  forwardIdleTimeoutMilliseconds,
} from '#api/git/forwarding/contract/hop.js';
import { dialectPath, grantHeader, mintGrant, storagePath } from '#api/git/forwarding/contract/grant.js';
import type { StorageOperation } from '#api/git/forwarding/contract/grant.js';
import type { SigningKey } from '#api/git/forwarding/contract/keys.js';
import type { AdvertisementDialect } from '#api/git/advertisement.js';
import type {
  GitExecutor,
  GitReadRequest,
  GrantFacts,
  RpcBody,
  StorageTombstone,
} from '#api/git/forwarding/git-executor.js';
import { commitDeadlineMilliseconds, gitRpcTimeoutMilliseconds } from '#api/git/store/limits.js';

/**
 * The tau-api side of the hop (DC1): every git RPC is forwarded to tau-storage
 * as a streamed proxy, with a grant minted for exactly that request. The API
 * holds no lease, no `git` child and no lease disk.
 *
 * `TAU_STORAGE_URL` is the storage app's Flycast address in a deployment; a
 * local stack may list several, comma-separated, and a refused connection
 * tries the next before a byte of the body is sent. Every failure between the
 * two apps answers `503 GIT_SERVICE_RESTARTING`, which the client retries
 * after `Retry-After`; a refusal tau-storage decided is relayed as its own
 * answer.
 */

/**
 * The most one forwarded request may take, end to end (review S2): the worker's
 * git child (10 min) plus a push's commit deadline (5 min), plus a minute for
 * admission, the hydrate and the receipt walk. Longer than anything the worker
 * itself allows, so the API never answers `503` for a push tau-storage then
 * commits. A connection quiet for {@link forwardIdleTimeoutMilliseconds} (Fly's
 * `idle_timeout`) is cut sooner.
 */
export const forwardTimeoutMilliseconds = gitRpcTimeoutMilliseconds + commitDeadlineMilliseconds + 60_000;

/**
 * Operations a second delivery cannot change the outcome of: a repair, a
 * read, and the tombstone, which answers its existing tombstone. A push, a
 * ref removal or a preview write is retried only if none of it was sent.
 */
const idempotentOperations: ReadonlySet<StorageOperation> = new Set(['derive', 'git-read', 'tombstone']);

/** Socket errors that mean a pooled connection had been closed by the other side before this request used it. */
const staleSocketCodes: ReadonlySet<string | undefined> = new Set(['ECONNRESET', 'EPIPE']);

/** Refusal bodies and JSON answers are small; anything larger is not one. */
const jsonResponseLimitBytes = 1024 * 1024;

/** Room for `cat-file --batch` of a 50 MB publication. */
const gitReadResponseLimitBytes = 72 * 1024 * 1024;

const restarting = (): ServiceUnavailableException =>
  new ServiceUnavailableException({
    code: 'GIT_SERVICE_RESTARTING',
    message: 'The repository service is restarting; retry shortly.',
  });

/** Thrown inside one attempt when the next address may be tried. */
class RefusedConnection extends Error {}

/**
 * Thrown inside one attempt when a reused pooled connection was already dead
 * and nothing of the request body was consumed: the request is sent once more
 * on a fresh connection (review S6).
 */
class StaleConnection extends Error {
  public constructor(public readonly original: Error) {
    super(original.message);
  }
}

const readAll = async (stream: Readable, limit: number): Promise<Uint8Array<ArrayBuffer>> => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let total = 0;
  for await (const chunk of stream) {
    const bytes = chunk as Uint8Array<ArrayBuffer>;
    total += bytes.byteLength;
    if (total > limit) {
      stream.destroy();
      throw new Error('The storage response was larger than its bound');
    }
    chunks.push(bytes);
  }
  return new Uint8Array(Buffer.concat(chunks));
};

/** A response body read whole and parsed as JSON. */
const readJson = async (stream: Readable): Promise<unknown> => {
  const bytes = await readAll(stream, jsonResponseLimitBytes);
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
};

/** A small request body sent whole, with its content type. */
type WholeBody = {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly contentType: string;
  readonly abort?: AbortSignal;
};

/** What one attempt sends: where, which operation, under which facts, with which body. */
type Attempt = {
  readonly base: string;
  readonly path: string;
  readonly operation: StorageOperation;
  readonly facts: GrantFacts;
  readonly body: RpcBody | WholeBody;
};

/** The forwarder's settings. */
export type StorageForwarderOptions = {
  /** One or more base URLs (`http://host:port`); the first is preferred. */
  readonly urls: readonly string[];
  /** The API's grant signing key (`TAU_STORAGE_GRANT_SIGNING_KEY`). */
  readonly key: SigningKey;
  readonly metrics: MetricsService;
  /** The grant contract version this build signs; defaults to the current one. */
  readonly grantVersion?: number;
  readonly timeoutMilliseconds?: number;
};

export class StorageForwarder implements GitExecutor {
  readonly #logger = new Logger('StorageForwarder');
  /* `timeout` here is the pool's free-socket timeout: an idle connection is
     dropped after 30 s, well before tau-storage's 65 s keep-alive (review S6). */
  readonly #agent = new Agent({ keepAlive: true, maxSockets: 256, timeout: forwardFreeSocketTimeoutMilliseconds });
  readonly #options: StorageForwarderOptions;

  public constructor(options: StorageForwarderOptions) {
    if (options.urls.length === 0) {
      throw new Error('TAU_STORAGE_URL names no address');
    }
    this.#options = options;
  }

  public async uploadPack(
    facts: GrantFacts,
    request: RpcBody,
  ): Promise<{ readonly output: Readable; readonly receipt: string | undefined }> {
    const response = await this.#forward('git-upload-pack', facts, request);
    const receipt = await this.#receiptOf(response);
    return { output: response, receipt };
  }

  public async receivePack(
    facts: GrantFacts,
    request: RpcBody,
  ): Promise<{
    readonly report: Uint8Array<ArrayBuffer>;
    readonly receipt: string | undefined;
    readonly bodyBytes: number;
  }> {
    const response = await this.#forward('git-receive-pack', facts, request);
    const receipt = await this.#receiptOf(response);
    const report = await readAll(response, jsonResponseLimitBytes);
    const bodyBytes = Number(response.headers['tau-storage-body-bytes'] ?? 0);
    return { report, receipt, bodyBytes: Number.isFinite(bodyBytes) ? bodyBytes : 0 };
  }

  public async removeRef(facts: GrantFacts): Promise<{
    readonly ref: string;
    readonly tip: string;
    readonly generation: number;
    readonly receipt: string | undefined;
  }> {
    return (await this.#json('remove-ref', facts)) as {
      ref: string;
      tip: string;
      generation: number;
      receipt: string | undefined;
    };
  }

  public async derive(facts: GrantFacts): Promise<{ readonly receipt: string | undefined }> {
    return (await this.#json('derive', facts)) as { receipt: string | undefined };
  }

  public async gitRead(facts: GrantFacts, request: GitReadRequest): Promise<Uint8Array<ArrayBuffer>> {
    const response = await this.#forward('git-read', facts, {
      bytes: new TextEncoder().encode(JSON.stringify(request)),
      contentType: 'application/json',
    });
    return readAll(response, gitReadResponseLimitBytes);
  }

  /**
   * Ends a read session on the worker that holds it. Fly may route this to
   * another worker, where it is a no-op; the holder's idle timer then closes
   * the lease.
   */
  public async endRead(facts: GrantFacts, session: string): Promise<void> {
    const response = await this.#forward('git-read', facts, {
      bytes: new TextEncoder().encode(JSON.stringify({ session, end: true })),
      contentType: 'application/json',
    });
    response.resume();
  }

  public async tombstone(facts: GrantFacts, request?: { readonly abort?: AbortSignal }): Promise<StorageTombstone> {
    return (await this.#json('tombstone', facts, request?.abort)) as StorageTombstone;
  }

  public async putPreview(facts: GrantFacts, bytes: Uint8Array<ArrayBuffer>): Promise<{ readonly lost: boolean }> {
    const response = await this.#forward('preview', facts, { bytes, contentType: 'image/webp' });
    try {
      const body = (await readJson(response)) as { lost?: unknown };
      return { lost: body.lost === true };
    } catch {
      this.#failed('malformed_response');
      throw restarting();
    }
  }

  public async dialect(): Promise<AdvertisementDialect> {
    for (const url of this.#options.urls) {
      // oxlint-disable-next-line no-await-in-loop -- the next address is tried only once this one failed
      const dialect = await this.#dialectAt(url);
      if (dialect !== undefined) {
        return dialect;
      }
    }
    this.#failed('unreachable');
    throw restarting();
  }

  /** Closes the hop's idle connections; for a stopping process and the suites. */
  public close(): void {
    this.#agent.destroy();
  }

  async #dialectAt(url: string): Promise<AdvertisementDialect | undefined> {
    try {
      const response = await fetch(new URL(dialectPath, url), { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) {
        return undefined;
      }
      const body = (await response.json()) as Partial<AdvertisementDialect>;
      return typeof body.agent === 'string' && typeof body.capabilitiesWhenEmpty === 'boolean'
        ? { agent: body.agent, capabilitiesWhenEmpty: body.capabilitiesWhenEmpty }
        : undefined;
    } catch (error) {
      this.#logger.warn({ err: error }, 'tau-storage did not answer its git dialect');
      return undefined;
    }
  }

  async #json(operation: StorageOperation, facts: GrantFacts, abort?: AbortSignal): Promise<unknown> {
    const response = await this.#forward(operation, facts, {
      bytes: new Uint8Array(0),
      contentType: 'application/json',
      ...(abort === undefined ? {} : { abort }),
    });
    try {
      return await readJson(response);
    } catch {
      this.#failed('malformed_response');
      throw restarting();
    }
  }

  async #receiptOf(response: IncomingMessage): Promise<string | undefined> {
    if (response.headers[framingHeader] !== receiptPrefixed) {
      response.destroy();
      this.#failed('malformed_response');
      throw restarting();
    }
    try {
      return await readReceiptPrefix(response);
    } catch (error) {
      response.destroy();
      this.#logger.warn({ err: error }, 'tau-storage answered with a malformed receipt prefix');
      this.#failed('malformed_response');
      throw restarting();
    }
  }

  #failed(reason: GitForwardErrorReason): void {
    this.#options.metrics.gitForwardErrors.add(1, { reason });
  }

  /**
   * Sends one request to the first address that accepts the connection, and
   * returns a `200` response with its body unread. A grant the worker refused
   * (`401`) is this side's fault and answers `503`; a refusal the worker
   * decided is relayed as the exception it was.
   */
  async #forward(
    operation: StorageOperation,
    facts: GrantFacts,
    request: RpcBody | WholeBody,
  ): Promise<IncomingMessage> {
    const path = storagePath(facts.project, operation);
    let response: IncomingMessage | undefined;
    for (const url of this.#options.urls) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- the next address is tried only once this one refused the connection
        response = await this.#attempt({ base: url, path, operation, facts, body: request });
        break;
      } catch (error) {
        if (error instanceof RefusedConnection) {
          continue;
        }
        if (error instanceof HttpException) {
          throw error;
        }
        const aborted = 'abort' in request && request.abort?.aborted === true;
        this.#failed(aborted ? 'aborted' : (error as Error).message === 'timeout' ? 'timeout' : 'unreachable');
        if (!aborted) {
          this.#logger.warn({ err: error, operation }, 'A git request could not reach tau-storage');
        }
        throw restarting();
      }
    }
    if (response === undefined) {
      this.#failed('unreachable');
      this.#logger.warn({ operation }, 'No tau-storage address accepted the connection');
      throw restarting();
    }
    if (response.statusCode === 200) {
      return response;
    }
    if (response.statusCode === 401) {
      response.destroy();
      this.#failed('grant_rejected');
      this.#logger.error({ operation }, 'tau-storage refused a grant this API signed; check the grant keys');
      throw restarting();
    }
    if (response.headers[outcomeHeader] === refusedOutcome) {
      let body: unknown;
      try {
        body = await readJson(response);
      } catch {
        body = undefined;
      } finally {
        response.destroy();
      }
      if (typeof body === 'object' && body !== null) {
        /* A 503 is rebuilt as the class the controller attaches `Retry-After` to. */
        throw response.statusCode === 503
          ? new ServiceUnavailableException(body)
          : new HttpException(body as Record<string, unknown>, response.statusCode ?? 500);
      }
    }
    response.destroy();
    this.#failed('malformed_response');
    throw restarting();
  }

  /** {@link #send}, sent once more when a pooled connection turned out to be dead (review S6). */
  async #attempt(attempt: Attempt): Promise<IncomingMessage> {
    try {
      return await this.#send(attempt, true);
    } catch (error) {
      if (!(error instanceof StaleConnection)) {
        throw error;
      }
      this.#logger.warn(
        { err: error.original, operation: attempt.operation },
        'A pooled connection to tau-storage was closed; retrying once',
      );
      return this.#send(attempt, false);
    }
  }

  async #send({ base, path, operation, facts, body }: Attempt, retryable: boolean): Promise<IncomingMessage> {
    const { token } = mintGrant(
      { ...facts, method: 'POST', path },
      {
        key: this.#options.key,
        ...(this.#options.grantVersion === undefined ? {} : { version: this.#options.grantVersion }),
      },
    );
    const streamed = 'body' in body;
    return new Promise<IncomingMessage>((resolve, reject) => {
      let started = false;
      let responded = false;
      /* What the connection had written before this request: a reused socket's count is cumulative. */
      let writtenBefore = 0;
      const outgoing = httpRequest(
        new URL(path, base),
        {
          method: 'POST',
          agent: this.#agent,
          /* An idle timer, not a deadline: bytes moving either way reset it. */
          timeout: forwardIdleTimeoutMilliseconds,
          headers: {
            [grantHeader]: token,
            'content-type': streamed ? `application/x-${operation}-request` : body.contentType,
            ...(streamed && body.gzipped ? { 'content-encoding': 'gzip' } : {}),
            ...(streamed ? { 'transfer-encoding': 'chunked' } : { 'content-length': String(body.bytes.byteLength) }),
          },
          ...(body.abort === undefined ? {} : { signal: body.abort }),
        },
        (response) => {
          responded = true;
          if (streamed && response.statusCode !== 200) {
            /* A refusal: stop sending the client's body to a worker that will not
               read it, and close the half-sent request once the refusal is read (review S7). */
            body.body.unpipe(outgoing);
            response.once('close', () => {
              outgoing.destroy();
            });
          }
          resolve(response);
        },
      );
      outgoing.once('timeout', () => {
        outgoing.destroy(new Error('timeout'));
      });
      const timer = setTimeout(() => {
        outgoing.destroy(new Error('timeout'));
      }, this.#options.timeoutMilliseconds ?? forwardTimeoutMilliseconds);
      timer.unref();
      const onSourceError = (error: Error): void => {
        outgoing.destroy(error);
      };
      outgoing.once('close', () => {
        clearTimeout(timer);
        if (streamed) {
          body.body.off('error', onSourceError);
        }
      });
      outgoing.once('error', (error: NodeJS.ErrnoException) => {
        if (!started && error.code === 'ECONNREFUSED') {
          reject(new RefusedConnection(error.message));
          return;
        }
        /* Safe to send again only when nothing of this request reached the
           connection, or when a second delivery cannot change the outcome
           (review (b): a replayed remove-ref would answer GIT_REF_NOT_FOUND). */
        const nothingSent =
          (outgoing.socket?.bytesWritten ?? writtenBefore) === writtenBefore &&
          (!streamed || !body.body.readableDidRead);
        const replayable = nothingSent || (!streamed && idempotentOperations.has(operation));
        if (retryable && !responded && outgoing.reusedSocket && staleSocketCodes.has(error.code) && replayable) {
          if (streamed) {
            body.body.unpipe(outgoing);
          }
          reject(new StaleConnection(error));
          return;
        }
        if (streamed && !responded) {
          /* As before: a hop that failed mid-body ends the client's upload too. */
          body.body.destroy(error);
        }
        reject(error);
      });
      const send = (): void => {
        started = true;
        if (streamed) {
          body.body.once('error', onSourceError);
          body.body.pipe(outgoing);
        } else {
          outgoing.end(body.bytes);
        }
      };
      outgoing.once('socket', (socket) => {
        writtenBefore = socket.bytesWritten;
        if (socket.connecting) {
          socket.once('connect', send);
        } else {
          send();
        }
      });
    });
  }
}
