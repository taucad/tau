import { installedDeclarations } from '#lib/typescript-language/installed-declarations.js';
import type { DeclarationImport } from '#lib/typescript-language/declaration-graph.js';
import { declarationPath, loadDeclarationGraph } from '#lib/typescript-language/declaration-graph.js';
import { Topic } from '@taucad/events';
import { extractPackageInfoFromCdnUrl, isBareSpecifier } from '@taucad/utils/import';
import type { TypeScriptWorkerClient } from '@taucad/lsp/typescript-worker/client';
import type { EditorDocument } from '#lib/editor-document.js';
import { readStaticTypePackage } from '#lib/typescript-language/static-types.js';
import type { DependencyReader, StaticTypeDefinition } from '#lib/typescript-language/static-types.js';

// oxlint-disable eslint/no-await-in-loop -- declaration files reach the worker in order; the network gate, not a serial loop, bounds fetches.

type AcquisitionRequest = { key: string; packageName: string; subpath: string; version?: string };

/** What one request learned: the declaration header, or the body of an `ok` response. */
type Fetched = Readonly<{ ok: boolean; status: number; types?: string; text?: string }>;

type ProjectReader = (path: string) => Promise<string | undefined>;

type AcquisitionOptions = Readonly<{
  client: Pick<TypeScriptWorkerClient, 'setExtraLib' | 'request'>;
  staticTypes: readonly StaticTypeDefinition[];
  dependencyReader?: DependencyReader;
  dynamicTypes: boolean;
  readProjectFile?: ProjectReader;
  /**
   * Packages a document needs without naming them in an import, such as the JSX runtime and
   * intrinsic elements a `.tsx` file compiles against.
   */
  implicitPackages?: (uri: string) => readonly string[];
  onError?: (error: Error) => void;
}>;

const esmShBase = 'https://esm.sh';
const retryDelay = 60_000;
const scanDelay = 500;
/**
 * Most declaration requests in flight at once, per project. Independent imports no longer wait for
 * one another, and a page full of imports still cannot flood the CDN or the worker behind it.
 */
const fetchConcurrency = 6;
const declarationFile = /\.d\.(?:ts|mts|cts)$/u;

/** A counting gate. A finished task hands its slot straight to the next waiter, so the bound is exact. */
class RequestGate {
  private active = 0;
  private readonly waiting: Array<() => void> = [];
  // oxlint-disable-next-line typescript/parameter-properties -- erasableSyntaxOnly rejects constructor parameter properties.
  private readonly limit: number;

  public constructor(limit: number) {
    this.limit = limit;
  }

  public async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active < this.limit) {
      this.active += 1;
    } else {
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve);
      });
    }
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) {
        next();
      } else {
        this.active -= 1;
      }
    }
  }
}

/**
 * The module a `/// <reference types>` directive names. A bare name maps to its DefinitelyTyped
 * package (`node` to `@types/node`, `@scope/name` to `@types/scope__name`); a URL or a path is
 * already a location, and CDN declarations reference `https://esm.sh/@types/…` this way.
 */
function typesReferenceSpecifier(name: string): string {
  if (/^[a-z][\d+.a-z-]*:/iu.test(name) || name.startsWith('.') || name.startsWith('/') || name.startsWith('@types/')) {
    return name;
  }
  if (name.startsWith('@')) {
    const [scope = '', packageName, ...rest] = name.slice(1).split('/');
    return packageName ? [`@types/${scope}__${packageName}`, ...rest].join('/') : `@types/${scope}`;
  }
  return `@types/${name}`;
}

function packageNameOf(specifier: string): string | undefined {
  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/');
    return scope && name ? `${scope}/${name}` : undefined;
  }
  return specifier.split('/')[0] ?? undefined;
}

function jsonObject(text: string | undefined): Record<string, unknown> | undefined {
  if (!text) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Acquisition is project-scoped and inserts declarations into the actual TS worker. */
export class TypeAcquisitionController {
  public revision = 0;
  // oxlint-disable-next-line typescript/parameter-properties -- erasableSyntaxOnly rejects constructor parameter properties.
  private readonly options: AcquisitionOptions;
  private readonly mountedPackages = new Set<string>();
  private readonly declarationSources = new Map<string, string>();
  private readonly knownPackages = new Set<string>();
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryAttempts = 0;
  private readonly failures = new Map<string, number>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly mounting = new Map<string, Promise<void>>();
  /** One request per URL for the project's life: packages that share a declaration fetch it once. */
  private readonly fetched = new Map<string, Promise<Fetched>>();
  private readonly gate = new RequestGate(fetchConcurrency);
  private readonly timers = new Map<EditorDocument, ReturnType<typeof setTimeout>>();
  private readonly subscriptions = new Map<EditorDocument, () => void>();
  private readonly injectedUris = new Set<string>();
  private readonly changes = new Topic<number>({ name: 'TypeAcquisition.changes' });

  private readonly abort = new AbortController();
  private disposed = false;

  public constructor(options: AcquisitionOptions) {
    this.options = options;
  }

  public subscribe(listener: (revision: number) => void): () => void {
    return this.changes.subscribe(listener);
  }

  public async initialize(): Promise<void> {
    for (const definition of this.options.staticTypes) {
      const uri = definition.filePath ?? `file:///node_modules/${definition.packageName}/index.d.ts`;
      await this.inject(uri, definition.content);
      this.knownPackages.add(definition.packageName);
      this.mountedPackages.add(definition.packageName);
      this.declarationSources.set(uri, definition.content);
      const manifestUri = `file:///node_modules/${definition.packageName}/package.json`;
      if (definition.packageJsonContent && !this.injectedUris.has(manifestUri)) {
        await this.inject(manifestUri, definition.packageJsonContent);
      }
    }
    await Promise.all(this.options.staticTypes.map(async (definition) => this.scan(definition.content)));
  }

  public watch(document: EditorDocument): void {
    if (this.subscriptions.has(document) || this.disposed) {
      return;
    }
    const unsubscribe = document.subscribe(() => {
      this.schedule(document);
    });
    this.subscriptions.set(document, unsubscribe);
    this.schedule(document);
  }

  public unwatch(document: EditorDocument): void {
    this.subscriptions.get(document)?.();
    this.subscriptions.delete(document);
    const timer = this.timers.get(document);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(document);
    }
  }

  public dispose(): void {
    if (this.isDisposed()) {
      return;
    }
    this.disposed = true;
    this.abort.abort();
    clearTimeout(this.retryTimer);
    for (const document of this.subscriptions.keys()) {
      this.unwatch(document);
    }
    this.pending.clear();
    this.mounting.clear();
    this.fetched.clear();
    this.changes.dispose();
  }

  private isDisposed(): boolean {
    return this.disposed;
  }

  private async inject(uri: string, text: string): Promise<void> {
    if (this.isDisposed()) {
      return;
    }
    await this.options.client.setExtraLib(uri, text);
    if (this.isDisposed()) {
      return;
    }
    this.revision += 1;
    this.changes.emit(this.revision);
    this.injectedUris.add(uri);
  }

  private schedule(document: EditorDocument): void {
    this.retryAttempts = 0;
    const previous = this.timers.get(document);
    if (previous) {
      clearTimeout(previous);
    }
    const timer = setTimeout(() => {
      this.timers.delete(document);
      void this.runScan(document.text, document.uri);
    }, scanDelay);
    this.timers.set(document, timer);
  }

  private async runScan(text: string, uri?: string): Promise<void> {
    try {
      await this.scan(text, uri);
    } catch (error) {
      this.report(error);
    }
  }

  private async imports(text: string): Promise<DeclarationImport[]> {
    return this.options.client.request({ kind: 'declarationImports', text });
  }

  private async scan(text: string, uri?: string): Promise<void> {
    if (this.isDisposed()) {
      return;
    }
    await this.mountImplicit(uri);
    const imports = await this.imports(text);
    // Imports are independent: each starts at once, and the request gate bounds the network.
    await Promise.all(imports.map(async (entry) => this.admit(entry)));
  }

  private async admit(entry: DeclarationImport): Promise<void> {
    // A `/// <reference path>` names a sibling file (`@types/react`'s `global.d.ts`), never a package.
    if (entry.reference === 'path') {
      return;
    }
    const specifier = entry.reference === 'types' ? typesReferenceSpecifier(entry.name) : entry.name;
    if (!specifier || this.isDisposed() || this.knownPackages.has(specifier)) {
      return;
    }
    const bare = isBareSpecifier(specifier);
    const cdn = bare ? undefined : extractPackageInfoFromCdnUrl(specifier);
    const packageName = bare ? packageNameOf(specifier) : cdn?.name;
    if (!packageName) {
      return;
    }
    if (bare) {
      await this.tryMountedTypes(packageName);
    }
    if (this.options.dynamicTypes && !(bare && this.mountedPackages.has(packageName))) {
      await this.acquire({
        key: specifier,
        packageName,
        subpath: bare ? specifier.slice(packageName.length) : (cdn?.path ?? ''),
        version: cdn?.version,
      });
    }
  }

  /** Implicit packages come from the mounted bundle only: a CDN copy of an unbundled package is far larger. */
  private async mountImplicit(uri: string | undefined): Promise<void> {
    if (uri === undefined) {
      return;
    }
    for (const packageName of this.options.implicitPackages?.(uri) ?? []) {
      await this.tryMountedTypes(packageName);
    }
  }

  private async tryMountedTypes(packageName: string): Promise<void> {
    const reader = this.options.dependencyReader;
    if (!reader || this.mountedPackages.has(packageName)) {
      return;
    }
    const inFlight = this.mounting.get(packageName);
    if (inFlight) {
      return inFlight;
    }
    const promise = this.mountTypes(reader, packageName);
    this.mounting.set(packageName, promise);
    try {
      await promise;
    } finally {
      this.mounting.delete(packageName);
    }
  }

  private async mountTypes(reader: DependencyReader, packageName: string): Promise<void> {
    const definitions = await readStaticTypePackage(reader, packageName);
    if (definitions.length === 0) {
      this.scheduleRetry();
      return;
    }
    for (const definition of definitions) {
      const uri = definition.filePath ?? `file:///node_modules/${definition.packageName}/index.d.ts`;
      await this.inject(uri, definition.content);
    }
    const manifest = definitions[0]?.packageJsonContent;
    if (manifest) {
      await this.inject(`file:///node_modules/${packageName}/package.json`, manifest);
    }
    this.knownPackages.add(packageName);
    this.mountedPackages.add(packageName);
    for (const definition of definitions) {
      this.declarationSources.set(definition.filePath ?? packageName, definition.content);
    }
    await Promise.all(definitions.map(async (definition) => this.scan(definition.content)));
  }

  private async acquire(request: AcquisitionRequest): Promise<void> {
    const { key } = request;
    const inFlight = this.pending.get(key);
    if (inFlight) {
      return inFlight;
    }
    const failedAt = this.failures.get(key);
    if (failedAt !== undefined && Date.now() - failedAt < retryDelay) {
      return;
    }
    const promise = this.fetchTypes(request);
    this.pending.set(key, promise);
    try {
      await promise;
    } finally {
      this.pending.delete(key);
    }
  }

  private async register(specifier: string, uri: string, files: Map<string, string>): Promise<void> {
    if (this.isDisposed()) {
      return;
    }
    for (const [path, text] of files) {
      await this.inject(`file://${path}`, text);
    }
    if (this.isDisposed()) {
      return;
    }
    await this.options.client.request({ kind: 'setModuleAlias', specifier, uri });
    if (this.isDisposed()) {
      return;
    }
    this.knownPackages.add(specifier);
    this.failures.delete(specifier);
    this.revision += 1;
    this.changes.emit(this.revision);
    for (const [path, text] of files) {
      this.declarationSources.set(path, text);
    }
    await Promise.all([...files.values()].map(async (text) => this.scan(text)));
  }

  /**
   * Fetch through the project's request gate, once per URL. A failure, or a response without what the
   * caller needs, is forgotten so the bounded retry asks again.
   */
  private async network(url: string, want: 'types' | 'text'): Promise<Fetched> {
    const key = `${want} ${url}`;
    const known = this.fetched.get(key);
    if (known) {
      return known;
    }
    const promise = this.gate.run(async (): Promise<Fetched> => {
      this.abort.signal.throwIfAborted();
      const response = await fetch(url, { signal: this.abort.signal });
      return {
        ok: response.ok,
        status: response.status,
        types: response.headers.get('X-TypeScript-Types') ?? undefined,
        text: want === 'text' && response.ok ? await response.text() : undefined,
      };
    });
    this.fetched.set(key, promise);
    // Callers that joined this request share its outcome; only the caller that started it clears the entry.
    let usable = false;
    try {
      const result = await promise;
      usable = result.ok && result[want] !== undefined;
      return result;
    } finally {
      if (!usable && this.fetched.get(key) === promise) {
        this.fetched.delete(key);
      }
    }
  }

  /** A `/// <reference types>` URL already names a declaration file; any other module asks the CDN for one. */
  private async declarationEntry(key: string, moduleUrl: string): Promise<string> {
    if (declarationFile.test(new URL(moduleUrl).pathname)) {
      return moduleUrl;
    }
    const module = await this.network(moduleUrl, 'types');
    this.abort.signal.throwIfAborted();
    if (!module.ok || !module.types) {
      throw new Error(`No declarations for ${key}: ${module.status}`);
    }
    return new URL(module.types, moduleUrl).href;
  }

  private async fetchTypes({ key, packageName, subpath, version: explicitVersion }: AcquisitionRequest): Promise<void> {
    try {
      const reader = this.options.readProjectFile;
      const lock = reader ? jsonObject(await reader('package-lock.json')) : undefined;
      const packages = lock?.['packages'];
      const locked =
        typeof packages === 'object' && packages !== null
          ? (packages as Record<string, unknown>)[`node_modules/${packageName}`]
          : undefined;
      const row = typeof locked === 'object' && locked !== null ? (locked as Record<string, unknown>) : undefined;
      const version = explicitVersion ?? (typeof row?.['version'] === 'string' ? row['version'] : undefined);
      const realName = typeof row?.['name'] === 'string' ? row['name'] : packageName;
      const packageId = version ? `${realName}@${version}` : packageName;
      if (version && reader) {
        const manifest = jsonObject(await reader(`node_modules/${packageName}/package.json`));
        if (manifest?.['version'] === version) {
          try {
            const installed = await installedDeclarations({
              packageName,
              subpath,
              manifest,
              read: reader,
              imports: async (text) => this.imports(text),
            });
            if (installed) {
              await this.register(key, installed.uri, installed.files);
              return;
            }
          } catch (error) {
            this.report(error);
          }
        }
      }
      const moduleUrl = `${esmShBase}/${packageId}${subpath.startsWith('/') || !subpath ? subpath : `/${subpath}`}`;
      const url = await this.declarationEntry(key, moduleUrl);
      const read = async (target: string): Promise<string> => {
        this.abort.signal.throwIfAborted();
        const response = await this.network(target, 'text');
        if (!response.ok || response.text === undefined) {
          throw new Error(`Declaration fetch failed: ${target}: ${response.status}`);
        }
        return response.text;
      };
      const graph = await loadDeclarationGraph({
        entry: url,
        imports: async (text) => this.imports(text),
        read,
        resolve: async (specifier, parent, reference) => {
          if (reference === 'path' && !specifier.startsWith('/')) {
            specifier = `./${specifier}`;
          }
          if (reference === 'types') {
            specifier = typesReferenceSpecifier(specifier);
          }
          if (specifier.startsWith('.') || specifier.startsWith('/') || /^https?:\/\//u.test(specifier)) {
            const target = new URL(specifier, parent);
            if (declarationFile.test(target.pathname)) {
              return target.href;
            }
            const base = target.pathname.replace(/\.(?:m?js|cjs)$/u, '');
            const suffix = target.pathname.endsWith('.mjs')
              ? '.d.mts'
              : target.pathname.endsWith('.cjs')
                ? '.d.cts'
                : '.d.ts';
            let failure: unknown;
            for (const path of [`${base}${suffix}`, `${base}/index.d.ts`]) {
              target.pathname = path;
              try {
                await read(target.href);
                return target.href;
              } catch (error) {
                failure = error;
              }
            }
            throw failure;
          }
          // Preserve the project's locked version for bare transitive dependencies.
          const dependency = packageNameOf(specifier);
          const lockedDependency: unknown =
            typeof packages === 'object' && packages !== null
              ? Reflect.get(packages, `node_modules/${dependency}`)
              : undefined;
          const dependencyVersion =
            typeof lockedDependency === 'object' &&
            lockedDependency !== null &&
            'version' in lockedDependency &&
            typeof lockedDependency.version === 'string'
              ? lockedDependency.version
              : undefined;
          const request =
            dependency && dependencyVersion
              ? `${dependency}@${dependencyVersion}${specifier.slice(dependency.length)}`
              : specifier;
          const response = await this.network(`${esmShBase}/${request}`, 'types');
          if (!response.ok || !response.types) {
            throw new Error(`No declarations for ${specifier}`);
          }
          return new URL(response.types, esmShBase).href;
        },
      });
      await this.register(key, `file://${declarationPath(url)}`, graph);
    } catch (error) {
      if (!this.isDisposed()) {
        this.failures.set(key, Date.now());
        this.scheduleRetry();
        this.report(error);
      }
    }
  }

  private scheduleRetry(): void {
    if (this.isDisposed() || this.retryTimer !== undefined || this.retryAttempts >= 3) {
      return;
    }
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.retryAttempts += 1;
      for (const text of this.declarationSources.values()) {
        void this.runScan(text);
      }
      for (const document of this.subscriptions.keys()) {
        void this.runScan(document.text, document.uri);
      }
    }, retryDelay);
  }

  private report(error: unknown): void {
    this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}
// oxlint-enable eslint/no-await-in-loop
