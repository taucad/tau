/* oxlint-disable jsdoc-js/no-types -- This standalone SDK bootstrap is JavaScript; JSDoc supplies its checked types. */
import { z } from 'zod';
import { defaultPicogkRecycleHeapBytes, withPicogkBrowserMemory } from '#picogk-browser-memory.js';
import { validatePicogkBrowserImage } from '#picogk-browser-images.js';
import { preparePicogkBrowserRuntime } from '#picogk-browser-runtime.js';

// Isolated .NET host. Only the owner supplies runtime URLs and authorized project bytes.
/**
 * @typedef {Object} BrowserRuntime
 * @property {{HEAPU8: Uint8Array, FS: {mkdirTree(path: string): void, chdir(path: string): void, writeFile(path: string, bytes: Uint8Array | string): void, stat(path: string): {size: number}, lstat(path: string): {mode: number}, isDir(mode: number): boolean, readdir(path: string): string[], rmdir(path: string): void, open(path: string, flags: string): unknown, read(stream: unknown, bytes: Uint8Array, offset: number, length: number, position: number): number, close(stream: unknown): void, unlink(path: string): void}}} Module
 * @property {(name: string, imports: {nextRequest(): Promise<string>, respond(json: string): void, validateImages(artifactPath: string, json: string): Promise<void>}) => void} setModuleImports
 * @property {() => {mainAssemblyName: string}} getConfig
 * @property {(assembly: string, args: string[]) => Promise<number>} runMain
 */
/**
 * @typedef {Object} Incoming
 * @property {string} kind
 * @property {number} generation
 * @property {number | undefined} recycleHeapBytes
 * @property {import('./picogk-browser-session.ts').PicogkBrowserAssets | undefined} assets
 * @property {import('./picogk-browser-session.ts').PicogkBrowserSnapshot | undefined} snapshot
 * @property {{method: string, requestId: string, protocolVersion: number, params: unknown}} frame
 */
let generation = 0;
let state = 'new';
let recycleHeapBytes = defaultPicogkRecycleHeapBytes;
/** @type {BrowserRuntime} */
let runtime;
/** @type {import('./picogk-browser-runtime.ts').PicogkBrowserRuntimeLoader | undefined} */
let runtimeLoader;
/** @type {string | undefined} */
let queued;
/** @type {((frame: string) => void) | undefined} */
let waiting;
/** @type {string | undefined} */
let activeMethod;
/** @type {(() => void) | undefined} */
let resetProject;
const artifactReceipt = z.object({
  artifactPath: z.string(),
  byteLength: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f\d]{64}$/iu),
});
/** @type {Map<string, z.infer<typeof artifactReceipt>>} */
const artifacts = new Map();

/** @param {unknown} result - Managed build output. */
const registerAuthoredArtifacts = (result) => {
  const authored = z.object({ authoredOutputs: z.array(artifactReceipt).optional() }).parse(result);
  for (const output of authored.authoredOutputs ?? []) {
    if (!output.artifactPath.startsWith('/artifacts/authored/')) {
      throw new Error('Invalid authored artifact path.');
    }
    relativePath(output.artifactPath.slice('/artifacts/'.length));
    if (artifacts.has(output.artifactPath)) {
      throw new Error('Duplicate authored artifact path.');
    }
    artifacts.set(output.artifactPath, output);
  }
};

/** @param {unknown} error - Runtime failure. */
const fail = (error) => {
  state = 'failed';
  runtimeLoader?.dispose();
  globalThis.postMessage({
    kind: 'failed',
    generation,
    message: error instanceof Error ? error.message : String(error),
  });
};

/** @param {string} value - Project-relative path. */
const relativePath = (value) => {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error('PicoGK worker files must have confined relative paths.');
  }
  return value;
};

/** @param {string} path - MEMFS path.
 * @param {Uint8Array | string} bytes - File contents.
 */
const writeFile = (path, bytes) => {
  runtime.Module.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
  runtime.Module.FS.writeFile(path, bytes);
};

/** Remove only the disposable worker mirror, without following authored links.
 * @param {string} root - Worker-owned absolute directory.
 */
const clearDirectory = (root) => {
  runtime.Module.FS.mkdirTree(root);
  for (const name of runtime.Module.FS.readdir(root)) {
    if (name === '.' || name === '..') {
      continue;
    }
    relativePath(name);
    const path = `${root}/${name}`;
    if (runtime.Module.FS.isDir(runtime.Module.FS.lstat(path).mode)) {
      clearDirectory(path);
      runtime.Module.FS.rmdir(path);
    } else {
      runtime.Module.FS.unlink(path);
    }
  }
};

/** @param {Incoming} message - Validated owner initialization. */
const initialize = async (message) => {
  if (state !== 'new' || !Number.isSafeInteger(message.generation) || message.generation < 1) {
    throw new Error('PicoGK worker initialization is not repeatable.');
  }
  generation = message.generation;
  state = 'initializing';
  const { assets, snapshot } = message;
  recycleHeapBytes = z
    .number()
    .int()
    .positive()
    .parse(message.recycleHeapBytes ?? defaultPicogkRecycleHeapBytes);
  if (
    !assets ||
    !/^[a-f\d]{64}$/iu.test(assets.compilerIdentity) ||
    !Array.isArray(assets.references) ||
    !snapshot ||
    typeof snapshot.revision !== 'string' ||
    !snapshot.revision ||
    !Array.isArray(snapshot.files)
  ) {
    throw new Error('Invalid PicoGK worker initialization.');
  }
  runtimeLoader = await preparePicogkBrowserRuntime({ bootstrapUrl: assets.bootstrapUrl, files: assets.runtimeFiles });
  // The pinned Mono loader otherwise treats every worker as a pthread waiting for parent configuration.
  // This worker owns the runtime; Mono's separately spawned pthreads do not receive the sidecar marker.
  Object.defineProperty(globalThis, 'dotnetSidecar', { value: true, writable: true, configurable: true });
  const module =
    /** @type {{dotnet: {withResourceLoader(load: import('./picogk-browser-runtime.ts').PicogkBrowserRuntimeLoader['loadResource']): {create(): Promise<BrowserRuntime>}}}} */ (
      await import(runtimeLoader.bootstrapUrl)
    );
  runtime = await module.dotnet.withResourceLoader(runtimeLoader.loadResource).create();
  const references = [];
  const paths = new Set();
  for (const reference of /** @type {import('./picogk-browser-session.ts').PicogkBrowserAssets['references']} */ (
    assets.references
  )) {
    const path = `/refs/${relativePath(reference.path)}`;
    if (paths.has(path) || !/^[a-f\d]{64}$/iu.test(reference.sha256)) {
      throw new Error('Invalid PicoGK compiler reference.');
    }
    paths.add(path);
    // oxlint-disable-next-line no-await-in-loop -- Bound peak reference memory while staging the compiler.
    const response = await fetch(reference.url);
    if (!response.ok) {
      throw new Error(`PicoGK reference download failed: ${response.status}.`);
    }
    // oxlint-disable-next-line no-await-in-loop -- Consume each download before requesting the next.
    const bytes = new Uint8Array(await response.arrayBuffer());
    // oxlint-disable-next-line no-await-in-loop -- Verify each reference before admitting it to MEMFS.
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    if (digest !== reference.sha256.toLowerCase()) {
      throw new Error(`PicoGK reference integrity mismatch: ${reference.path}.`);
    }
    writeFile(path, bytes);
    references.push(path);
  }
  for (const file of /** @type {import('./picogk-browser-session.ts').PicogkBrowserSnapshot['files']} */ (
    snapshot.files
  )) {
    const path = `/project/${relativePath(file.path)}`;
    if (paths.has(path) || !(file.contents instanceof Uint8Array)) {
      throw new Error('Invalid PicoGK source snapshot.');
    }
    paths.add(path);
    writeFile(path, file.contents);
  }
  resetProject = () => {
    runtime.Module.FS.chdir('/project');
    clearDirectory('/project');
    clearDirectory('/artifacts');
    artifacts.clear();
    for (const file of snapshot.files) {
      writeFile(`/project/${relativePath(file.path)}`, file.contents);
    }
  };
  writeFile('/compiler-refs.json', JSON.stringify(references));
  runtime.setModuleImports('tau-picogk-host', {
    validateImages: async (artifactPath, json) => {
      if (!artifactPath.startsWith('/artifacts/')) {
        throw new Error('Invalid PicoGK image artifact path.');
      }
      relativePath(artifactPath.slice('/artifacts/'.length));
      const ranges = z
        .array(
          z.object({
            offset: z.number().int().nonnegative(),
            byteLength: z.number().int().positive(),
            mimeType: z.string(),
          }),
        )
        .parse(JSON.parse(json));
      if (ranges.length === 0) {
        return;
      }
      const { size } = runtime.Module.FS.stat(artifactPath);
      const stream = runtime.Module.FS.open(artifactPath, 'r');
      try {
        for (const range of ranges) {
          if (range.offset + range.byteLength > size) {
            throw new Error('Invalid PicoGK image artifact range.');
          }
          const bytes = new Uint8Array(range.byteLength);
          if (runtime.Module.FS.read(stream, bytes, 0, bytes.length, range.offset) !== bytes.length) {
            throw new Error('Incomplete PicoGK image artifact.');
          }
          // oxlint-disable-next-line no-await-in-loop -- Release one decoded image before reading the next.
          await validatePicogkBrowserImage({ bytes, mimeType: range.mimeType });
        }
      } finally {
        runtime.Module.FS.close(stream);
      }
    },
    nextRequest: async () => {
      if (queued !== undefined) {
        const frame = queued;
        queued = undefined;
        return frame;
      }
      return new Promise((resolve) => {
        waiting = resolve;
      });
    },
    respond: (json) => {
      const frame = /** @type {unknown} */ (JSON.parse(json));
      if (!frame || typeof frame !== 'object') {
        throw new Error('Invalid managed response.');
      }
      if (activeMethod === 'build' && 'result' in frame) {
        frame.result = withPicogkBrowserMemory(frame.result, runtime.Module.HEAPU8.byteLength, recycleHeapBytes);
        const receipt = artifactReceipt.parse(frame.result);
        artifacts.set(receipt.artifactPath, receipt);
        registerAuthoredArtifacts(frame.result);
      }
      const kind = 'type' in frame && frame.type === 'ready' ? 'ready' : 'response';
      state = 'ready';
      // Observation only: the session reports the heap of its last reply; recycling still reads the build metric.
      globalThis.postMessage({ generation, kind, frame, heapBytes: runtime.Module.HEAPU8.byteLength });
    },
  });
  const code = await runtime.runMain(runtime.getConfig().mainAssemblyName, [
    '/compiler-refs.json',
    assets.compilerIdentity,
  ]);
  if (code !== 0 || activeMethod !== 'shutdown') {
    throw new Error(`PicoGK worker exited unexpectedly (${code}).`);
  }
  state = 'closed';
};

globalThis.addEventListener('message', async (/** @type {MessageEvent<Incoming | null>} */ { data }) => {
  try {
    if (data === null) {
      throw new Error('Invalid worker message.');
    }
    if (data.kind === 'initialize') {
      await initialize(data);
      return;
    }
    if (data.generation !== generation) {
      return;
    }
    if (state !== 'ready' || data.kind !== 'request' || queued !== undefined) {
      throw new Error('Overlapping or invalid PicoGK browser request.');
    }
    if (data.frame.method === '$readArtifact') {
      const input = artifactReceipt
        .extend({
          offset: z.number().int().nonnegative(),
          length: z
            .number()
            .int()
            .nonnegative()
            .max(8 * 1024 * 1024),
        })
        .parse(data.frame.params);
      const receipt = artifacts.get(input.artifactPath);
      if (
        !receipt ||
        receipt.byteLength !== input.byteLength ||
        receipt.sha256 !== input.sha256 ||
        !input.artifactPath.startsWith('/artifacts/') ||
        input.offset + input.length > receipt.byteLength ||
        (input.length === 0 && receipt.byteLength !== 0)
      ) {
        throw new Error('Unknown or invalid PicoGK artifact range.');
      }
      relativePath(input.artifactPath.slice('/artifacts/'.length));
      const bytes = new Uint8Array(input.length);
      const stream = runtime.Module.FS.open(input.artifactPath, 'r');
      try {
        if (
          runtime.Module.FS.stat(input.artifactPath).size !== receipt.byteLength ||
          runtime.Module.FS.read(stream, bytes, 0, bytes.length, input.offset) !== bytes.length
        ) {
          throw new Error('PicoGK artifact changed after delivery.');
        }
      } finally {
        runtime.Module.FS.close(stream);
      }
      if (input.offset + input.length === receipt.byteLength) {
        runtime.Module.FS.unlink(input.artifactPath);
        artifacts.delete(input.artifactPath);
      }
      globalThis.postMessage(
        {
          generation,
          kind: 'response',
          frame: {
            protocolVersion: data.frame.protocolVersion,
            requestId: data.frame.requestId,
            result: bytes,
          },
          heapBytes: runtime.Module.HEAPU8.byteLength,
        },
        { transfer: [bytes.buffer] },
      );
      return;
    }
    if (data.frame.method === 'build') {
      resetProject?.();
    }
    state = 'running';
    activeMethod = data.frame.method;
    const frame = JSON.stringify(data.frame);
    if (typeof frame !== 'string') {
      throw new TypeError('Invalid PicoGK request frame.');
    }
    if (waiting) {
      const resolve = waiting;
      waiting = undefined;
      resolve(frame);
    } else {
      queued = frame;
    }
  } catch (error) {
    fail(error);
  }
});
