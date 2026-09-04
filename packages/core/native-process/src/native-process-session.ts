import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createReadStream, unwatchFile, watchFile } from 'node:fs';
import type { Stats } from 'node:fs';
import { lstat, readFile, realpath, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve as resolvePath, sep } from 'node:path';
import { StringDecoder } from 'node:string_decoder';

import type { RuntimeLogger } from '@taucad/runtime/kernel';

const maxProtocolLineBytes = 1_048_576;
const maxStderrBytes = 65_536;
const maxQueueDepth = 16;
const terminationGraceMilliseconds = 500;

/** Integrity evidence for one host-owned native-process resource. @public */
export type NativeProcessResource = {
  readonly path: string;
  readonly sha256: string;
  readonly label: string;
};

/** Private artifact descriptor emitted by a native worker. @public */
export type NativeArtifact = {
  readonly artifactPath: string;
  readonly byteLength: number;
};

/** Validated response normalized by a language plugin. @public */
export type NativeProtocolResponse<Issue> =
  | { readonly requestId: string; readonly result: unknown }
  | { readonly requestId: string; readonly issues: readonly Issue[] };

/** Validation and synchronous delivery hooks for request-scoped native events. @public */
export type NativeProcessEventSubscription<Event> = {
  /** Validate and normalize one request-scoped event payload. */
  readonly parseEvent: (value: unknown) => Event;
  /** Consume a validated event synchronously, in protocol sequence order. */
  readonly onEvent: (event: Event) => void;
};

/** One typed operation sent over the serialized NDJSON lane. @public */
export type NativeProcessRequest<Result, Event = never> = {
  readonly method: string;
  readonly params: Record<string, unknown>;
  readonly parseResult: (value: unknown) => Result;
  readonly signal: AbortSignal;
  /** Optional request-scoped unsolicited event channel; terminal responses remain unchanged. */
  readonly events?: NativeProcessEventSubscription<Event>;
};

/** Configuration for one supervised native child process. @public */
export type NativeProcessSessionOptions<Issue> = {
  readonly executablePath: string;
  readonly executableSha256: string;
  readonly arguments: readonly string[];
  readonly workspacePath: string;
  readonly artifactPath: string;
  readonly trustFile: string;
  readonly resources: readonly NativeProcessResource[];
  readonly protocolVersion: number;
  readonly parseReady: (value: unknown) => void;
  readonly parseResponse: (value: unknown) => NativeProtocolResponse<Issue>;
  readonly requestTimeout: number;
  readonly maxArtifactBytes: number;
  readonly logger: RuntimeLogger;
  readonly sessionName: string;
  readonly executableName: string;
  readonly shutdown?: {
    readonly method: string;
    readonly parseResult: (value: unknown) => unknown;
  };
};

type PendingRequest = {
  readonly parseResult: (value: unknown) => unknown;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
  readonly cleanup: () => void;
  readonly events:
    | {
        readonly parseEvent: (value: unknown) => unknown;
        readonly onEvent: (event: unknown) => unknown;
      }
    | undefined;
  lastEventSequence: number;
};

type NativeProtocolEventFrame = {
  readonly requestId: string;
  readonly sequence: number;
  readonly event: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isEventFrameCandidate = (value: unknown): boolean =>
  isRecord(value) && (value['type'] === 'event' || 'sequence' in value || 'event' in value);

const isPromiseLike = (value: unknown): boolean =>
  (typeof value === 'object' || typeof value === 'function') &&
  value !== null &&
  typeof Reflect.get(value, 'then') === 'function';

const parseEventFrame = (value: unknown, protocolVersion: number): NativeProtocolEventFrame => {
  if (!isRecord(value)) {
    throw new Error('event frame must be an object');
  }
  const { protocolVersion: receivedProtocolVersion, type, requestId, sequence, event } = value;
  if (
    receivedProtocolVersion !== protocolVersion ||
    type !== 'event' ||
    typeof requestId !== 'string' ||
    requestId.length === 0 ||
    !Number.isSafeInteger(sequence) ||
    (sequence as number) <= 0 ||
    !Object.hasOwn(value, 'event')
  ) {
    throw new Error('event frame does not match the native event envelope');
  }
  return { requestId, sequence: sequence as number, event };
};

/** A structured failure emitted by a native language worker. @public */
export class NativeWorkerReportedError<Issue> extends Error {
  public readonly issues: readonly Issue[];

  public constructor(issues: readonly Issue[]) {
    super('The native worker reported one or more issues.');
    this.issues = issues;
    this.name = 'NativeWorkerReportedError';
  }
}

const fileSha256 = async (path: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => {
      hash.update(chunk);
    });
    stream.once('error', reject);
    stream.once('end', () => {
      resolve(hash.digest('hex'));
    });
  });

const abortReason = (signal: AbortSignal): Error =>
  signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError');

const isDescendant = (parent: string, candidate: string): boolean => {
  const child = relative(resolvePath(parent), resolvePath(candidate));
  return child.length > 0 && !child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child);
};

/** Produce the deliberately minimal environment inherited by a native child. @public */
export const processEnvironment = (artifactPath: string): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {};
  environment['LANG'] = 'C.UTF-8';
  environment['LC_ALL'] = 'C.UTF-8';
  environment['TMPDIR'] = artifactPath;
  environment['TEMP'] = artifactPath;
  environment['TMP'] = artifactPath;
  if (process.platform === 'win32' && process.env['SystemRoot']) {
    environment['SystemRoot'] = process.env['SystemRoot'];
  }
  return environment;
};

/** Gracefully terminate a native process group, then hard-kill it after a short bound. @public */
export const terminateProcessTree = async (child: ChildProcessWithoutNullStreams): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
    return;
  }
  if (process.platform === 'win32') {
    const systemRoot = process.env['SystemRoot'];
    if (!systemRoot) {
      child.kill('SIGKILL');
      return;
    }
    await new Promise<void>((resolve) => {
      const killer = spawn(
        resolvePath(systemRoot, 'System32', 'taskkill.exe'),
        ['/pid', String(child.pid), '/T', '/F'],
        {
          shell: false,
          windowsHide: true,
          stdio: 'ignore',
        },
      );
      killer.once('close', resolve);
      killer.once('error', () => {
        child.kill('SIGKILL');
        resolve();
      });
    });
    return;
  }

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          process.kill(-child.pid!, 'SIGKILL');
        } catch {
          // The process group exited during the grace period.
        }
      }
      resolve();
    }, terminationGraceMilliseconds);
    timer.unref();
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
};

/** One warm, serialized, generation-scoped native worker session. @public */
export class NativeProcessSession<Issue> {
  public generation = 0;
  private child: ChildProcessWithoutNullStreams | undefined;
  private ready: Promise<void> | undefined;
  private resolveReady: (() => void) | undefined;
  private rejectReady: ((reason: unknown) => void) | undefined;
  private stdout = '';
  private stderr = '';
  private decoder = new StringDecoder('utf8');
  private readonly pending = new Map<string, PendingRequest>();
  private queue = Promise.resolve();
  private queueDepth = 0;
  private requestSequence = 0;
  private verified: Promise<void> | undefined;
  private termination: Promise<void> | undefined;
  private closed = false;
  // oxlint-disable-next-line typescript/parameter-properties -- erasableSyntaxOnly forbids parameter properties.
  private readonly options: NativeProcessSessionOptions<Issue>;

  public constructor(options: NativeProcessSessionOptions<Issue>) {
    this.options = options;
    watchFile(options.trustFile, { interval: 250, persistent: false }, this.onTrustChanged);
  }

  /** Assert that the host-owned physical project trust marker remains valid. */
  public async assertTrusted(): Promise<void> {
    let marker: unknown;
    try {
      const trustRecord = await readFile(this.options.trustFile, 'utf8');
      marker = JSON.parse(trustRecord);
    } catch {
      throw new Error('This project is not trusted to run native code. Grant native-code trust in the desktop app.');
    }
    if (
      typeof marker !== 'object' ||
      marker === null ||
      Reflect.get(marker, 'version') !== 1 ||
      Reflect.get(marker, 'trusted') !== true
    ) {
      throw new Error('The native-code trust record is invalid. Revoke and grant trust again.');
    }
  }

  /** Queue one operation in the session's serialized request lane. */
  public async request<Result, Event = never>(request: NativeProcessRequest<Result, Event>): Promise<Result> {
    if (this.closed) {
      throw new Error(`${this.options.sessionName} session is closed.`);
    }
    if (this.queueDepth >= maxQueueDepth) {
      throw new Error(`${this.options.sessionName} request queue exceeds ${String(maxQueueDepth)} operations.`);
    }
    this.queueDepth += 1;
    // oxlint-disable-next-line promise/prefer-await-to-then -- Promise is the serialized admission tail.
    const operation = this.queue.then(async () => {
      if (this.closed) {
        throw new Error(`${this.options.sessionName} session is closed.`);
      }
      request.signal.throwIfAborted();
      await this.assertTrusted();
      request.signal.throwIfAborted();
      const abortStart = (): void => {
        this.requestTermination(abortReason(request.signal));
      };
      request.signal.addEventListener('abort', abortStart, { once: true });
      try {
        await this.start();
      } finally {
        request.signal.removeEventListener('abort', abortStart);
      }
      request.signal.throwIfAborted();
      return this.send(request);
    });
    // oxlint-disable-next-line promise/prefer-await-to-then -- both settlements must advance the admission tail.
    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );
    try {
      return await operation;
    } finally {
      this.queueDepth -= 1;
    }
  }

  /** Whether a retained handle belongs to the currently live worker generation. */
  public isGenerationValid(generation: number): boolean {
    return this.child !== undefined && generation === this.generation;
  }

  /** Read and delete one private artifact after physical confinement and size checks. */
  public async readArtifact(artifact: NativeArtifact): Promise<Uint8Array<ArrayBuffer>> {
    const resolved = resolvePath(artifact.artifactPath);
    if (!isDescendant(this.options.artifactPath, resolved)) {
      throw new Error(`${this.options.sessionName} returned an artifact outside its private directory.`);
    }
    const [stats, physical] = await Promise.all([lstat(resolved), realpath(resolved)]);
    if (!stats.isFile() || stats.isSymbolicLink() || !isDescendant(this.options.artifactPath, physical)) {
      throw new Error(`${this.options.sessionName} returned an invalid artifact file.`);
    }
    if (stats.size !== artifact.byteLength || stats.size > this.options.maxArtifactBytes) {
      throw new Error(`${this.options.sessionName} returned an artifact with an invalid size.`);
    }
    try {
      const bytes = await readFile(physical);
      if (bytes.byteLength !== artifact.byteLength || bytes.byteLength > this.options.maxArtifactBytes) {
        throw new Error(`${this.options.sessionName} artifact changed while it was being read.`);
      }
      return Uint8Array.from(bytes);
    } finally {
      await unlink(physical).catch(() => undefined);
    }
  }

  /** Terminate the current generation while allowing the next request to start a fresh child. */
  public async recycle(reason = new Error(`${this.options.sessionName} requested process recycling.`)): Promise<void> {
    const { child } = this;
    if (!child) {
      return;
    }
    this.fail(child, reason);
    await terminateProcessTree(child);
  }

  /** Gracefully stop the worker and force-kill any remaining descendant tree. */
  public async cleanup(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    unwatchFile(this.options.trustFile, this.onTrustChanged);
    await this.termination;
    const { child } = this;
    if (!child) {
      return;
    }
    if (this.options.shutdown) {
      try {
        await this.send({
          method: this.options.shutdown.method,
          params: {},
          parseResult: this.options.shutdown.parseResult,
          signal: new AbortController().signal,
        });
      } catch {
        // Forced termination below is the cleanup fallback.
      }
    }
    await terminateProcessTree(child);
  }

  private readonly onTrustChanged = (current: Stats): void => {
    if (current.nlink === 0) {
      this.requestTermination(new Error('Native-code trust was revoked.'));
    }
  };

  private requestTermination(error: Error): void {
    this.termination = this.recycle(error);
  }

  private async verifyResources(): Promise<void> {
    this.verified ??= this.verifyResourceDigests();
    await this.verified;
  }

  private async verifyResourceDigests(): Promise<void> {
    const resources = [
      { path: this.options.executablePath, sha256: this.options.executableSha256, label: this.options.executableName },
      ...this.options.resources,
    ];
    const verifiedResources = await Promise.all(
      resources.map(async (resource) => ({ ...resource, actual: await fileSha256(resource.path) })),
    );
    const mismatched = verifiedResources.find(({ actual, sha256 }) => actual !== sha256.toLowerCase());
    if (mismatched) {
      throw new Error(`${mismatched.label} failed its SHA-256 integrity check.`);
    }
  }

  private async start(): Promise<void> {
    if (this.child && this.ready) {
      await this.ready;
      return;
    }
    await this.verifyResources();
    this.generation += 1;
    this.stdout = '';
    this.stderr = '';
    this.decoder = new StringDecoder('utf8');
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    const child = spawn(this.options.executablePath, [...this.options.arguments], {
      cwd: this.options.workspacePath,
      detached: process.platform !== 'win32',
      env: processEnvironment(this.options.artifactPath),
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      this.onStdout(chunk);
    });
    child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      this.onStderr(chunk);
    });
    child.once('error', (error) => {
      this.fail(child, error);
    });
    child.once('exit', (code, signal) => {
      this.fail(child, new Error(`${this.options.sessionName} exited (${code === null ? signal : String(code)}).`));
    });
    const handshakeTimer = setTimeout(() => {
      this.requestTermination(new Error(`${this.options.sessionName} handshake timed out.`));
    }, this.options.requestTimeout);
    handshakeTimer.unref();
    try {
      await this.ready;
    } finally {
      clearTimeout(handshakeTimer);
    }
  }

  private async send<Result, Event = never>(request: NativeProcessRequest<Result, Event>): Promise<Result> {
    const { child } = this;
    if (!child?.stdin.writable) {
      throw new Error(`${this.options.sessionName} is not writable.`);
    }
    const requestId = `${String(this.generation)}:${String(++this.requestSequence)}`;
    return new Promise<Result>((resolve, reject) => {
      const requestTimer = setTimeout(() => {
        this.requestTermination(new Error(`${this.options.sessionName} ${request.method} request timed out.`));
      }, this.options.requestTimeout);
      requestTimer.unref();
      const abort = (): void => {
        this.requestTermination(abortReason(request.signal));
      };
      request.signal.addEventListener('abort', abort, { once: true });
      const cleanup = (): void => {
        clearTimeout(requestTimer);
        request.signal.removeEventListener('abort', abort);
      };
      this.pending.set(requestId, {
        parseResult: request.parseResult,
        resolve: resolve as (value: unknown) => void,
        reject,
        cleanup,
        events: request.events as PendingRequest['events'],
        lastEventSequence: 0,
      });
      child.stdin.write(
        `${JSON.stringify({ protocolVersion: this.options.protocolVersion, requestId, method: request.method, params: request.params })}\n`,
        'utf8',
        (error: unknown) => {
          if (error instanceof Error) {
            this.requestTermination(error);
          }
        },
      );
    });
  }

  private onStdout(chunk: Uint8Array<ArrayBuffer>): void {
    this.stdout += this.decoder.write(chunk);
    if (Buffer.byteLength(this.stdout) > maxProtocolLineBytes && !this.stdout.includes('\n')) {
      this.requestTermination(new Error(`${this.options.sessionName} emitted an oversized protocol frame.`));
      return;
    }
    let newline = this.stdout.indexOf('\n');
    while (newline >= 0) {
      const line = this.stdout.slice(0, newline);
      this.stdout = this.stdout.slice(newline + 1);
      if (Buffer.byteLength(line) > maxProtocolLineBytes) {
        this.requestTermination(new Error(`${this.options.sessionName} emitted an oversized protocol frame.`));
        return;
      }
      this.onLine(line);
      newline = this.stdout.indexOf('\n');
    }
  }

  private onStderr(chunk: Uint8Array<ArrayBuffer>): void {
    const privatePaths = [
      this.options.workspacePath,
      this.options.artifactPath,
      ...this.options.resources.map(({ path }) => dirname(path)),
      dirname(this.options.executablePath),
    ];
    let output = Buffer.from(chunk).toString('utf8');
    for (const path of privatePaths) {
      output = output.replaceAll(path, '<private>');
    }
    this.stderr = (this.stderr + output).slice(-maxStderrBytes);
    this.options.logger.debug(output.trimEnd());
  }

  private onLine(line: string): void {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      this.requestTermination(new Error(`${this.options.sessionName} emitted malformed JSON.`, { cause: error }));
      return;
    }
    if (this.resolveReady) {
      try {
        this.options.parseReady(value);
      } catch (error) {
        this.requestTermination(
          new Error(`${this.options.sessionName} emitted an invalid handshake.`, { cause: error }),
        );
        return;
      }
      const { resolveReady } = this;
      this.resolveReady = undefined;
      this.rejectReady = undefined;
      resolveReady();
      return;
    }

    if (isEventFrameCandidate(value)) {
      let eventFrame: NativeProtocolEventFrame;
      try {
        eventFrame = parseEventFrame(value, this.options.protocolVersion);
      } catch (error) {
        this.requestTermination(
          new Error(`${this.options.sessionName} emitted an invalid event frame.`, { cause: error }),
        );
        return;
      }
      const request = this.pending.get(eventFrame.requestId);
      if (!request) {
        this.requestTermination(
          new Error(`${this.options.sessionName} emitted an event for an unknown request: ${eventFrame.requestId}`),
        );
        return;
      }
      const expectedSequence = request.lastEventSequence + 1;
      if (eventFrame.sequence !== expectedSequence) {
        this.requestTermination(
          new Error(
            `${this.options.sessionName} emitted event sequence ${String(eventFrame.sequence)}; expected ${String(expectedSequence)}.`,
          ),
        );
        return;
      }
      if (!request.events) {
        this.requestTermination(
          new Error(`${this.options.sessionName} emitted an event for a request without an event subscription.`),
        );
        return;
      }
      try {
        const event = request.events.parseEvent(eventFrame.event);
        const callbackResult = request.events.onEvent(event);
        if (isPromiseLike(callbackResult)) {
          throw new Error('native process event callbacks must be synchronous');
        }
      } catch (error) {
        this.requestTermination(
          new Error(`${this.options.sessionName} event payload failed validation or delivery.`, { cause: error }),
        );
        return;
      }
      request.lastEventSequence = eventFrame.sequence;
      return;
    }

    let response: NativeProtocolResponse<Issue>;
    try {
      response = this.options.parseResponse(value);
    } catch (error) {
      this.requestTermination(
        new Error(`${this.options.sessionName} emitted an invalid response frame.`, { cause: error }),
      );
      return;
    }
    const request = this.pending.get(response.requestId);
    if (!request) {
      this.requestTermination(
        new Error(`${this.options.sessionName} emitted an unknown response id: ${response.requestId}`),
      );
      return;
    }
    this.pending.delete(response.requestId);
    request.cleanup();
    if ('issues' in response) {
      request.reject(new NativeWorkerReportedError(response.issues));
      return;
    }
    try {
      request.resolve(request.parseResult(response.result));
    } catch (error) {
      request.reject(new Error(`${this.options.sessionName} response result failed validation.`, { cause: error }));
      this.requestTermination(new Error(`${this.options.sessionName} violated its result schema.`));
    }
  }

  private fail(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.child !== child) {
      return;
    }
    this.child = undefined;
    this.ready = undefined;
    this.rejectReady?.(error);
    this.resolveReady = undefined;
    this.rejectReady = undefined;
    for (const request of this.pending.values()) {
      request.cleanup();
      request.reject(error);
    }
    this.pending.clear();
  }
}
