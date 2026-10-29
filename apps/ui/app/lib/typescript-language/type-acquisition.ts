import { installedDeclarations } from '#lib/typescript-language/installed-declarations.js';
import type { DeclarationImport } from '#lib/typescript-language/declaration-graph.js';
import { declarationPath, loadDeclarationGraph } from '#lib/typescript-language/declaration-graph.js';
import { Topic } from '@taucad/events';
import { extractPackageInfoFromCdnUrl, isBareSpecifier } from '@taucad/utils/import';
import type { TypeScriptWorkerClient } from '@taucad/lsp/typescript-worker/client';
import type { EditorDocument } from '#lib/editor-document.js';
import { readStaticTypePackage } from '#lib/typescript-language/static-types.js';
import type { DependencyReader, StaticTypeDefinition } from '#lib/typescript-language/static-types.js';

// oxlint-disable eslint/no-await-in-loop -- declaration registration and import acquisition are ordered to bound worker and network work.

type AcquisitionRequest = { key: string; packageName: string; subpath: string; version?: string };

type ProjectReader = (path: string) => Promise<string | undefined>;

type AcquisitionOptions = Readonly<{
  client: Pick<TypeScriptWorkerClient, 'setExtraLib' | 'request'>;
  staticTypes: readonly StaticTypeDefinition[];
  dependencyReader?: DependencyReader;
  dynamicTypes: boolean;
  readProjectFile?: ProjectReader;
  onError?: (error: Error) => void;
}>;

const esmShBase = 'https://esm.sh';
const retryDelay = 60_000;
const scanDelay = 500;

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
    for (const definition of this.options.staticTypes) {
      await this.scan(definition.content);
    }
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
      void this.runScan(document.text);
    }, scanDelay);
    this.timers.set(document, timer);
  }

  private async runScan(text: string): Promise<void> {
    try {
      await this.scan(text);
    } catch (error) {
      this.report(error);
    }
  }

  private async imports(text: string): Promise<DeclarationImport[]> {
    return this.options.client.request({ kind: 'declarationImports', text });
  }

  private async scan(text: string): Promise<void> {
    if (this.isDisposed()) {
      return;
    }
    const imports = await this.imports(text);
    for (const entry of imports) {
      const specifier =
        entry.reference === 'types' ? `@types/${entry.name.replace('@', '').replace('/', '__')}` : entry.name;
      if (!specifier) {
        continue;
      }
      if (this.isDisposed() || this.knownPackages.has(specifier)) {
        continue;
      }
      const bare = isBareSpecifier(specifier);
      const cdn = bare ? undefined : extractPackageInfoFromCdnUrl(specifier);
      const packageName = bare ? packageNameOf(specifier) : cdn?.name;
      if (!packageName) {
        continue;
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
  }

  private async tryMountedTypes(packageName: string): Promise<void> {
    const reader = this.options.dependencyReader;
    if (!reader || this.mountedPackages.has(packageName)) {
      return;
    }
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
      await this.scan(definition.content);
    }
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
      await this.scan(text);
    }
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
      const moduleResponse = await fetch(moduleUrl, { signal: this.abort.signal });
      this.abort.signal.throwIfAborted();
      const header = moduleResponse.headers.get('X-TypeScript-Types');
      if (!moduleResponse.ok || !header) {
        throw new Error(`No declarations for ${key}: ${moduleResponse.status}`);
      }
      const url = new URL(header, moduleUrl).href;
      const texts = new Map<string, string>();
      const read = async (target: string): Promise<string> => {
        this.abort.signal.throwIfAborted();
        const cached = texts.get(target);
        if (cached !== undefined) {
          return cached;
        }
        const response = await fetch(target, { signal: this.abort.signal });
        if (!response.ok) {
          throw new Error(`Declaration fetch failed: ${target}: ${response.status}`);
        }
        const text = await response.text();
        texts.set(target, text);
        return text;
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
            specifier = `@types/${specifier.replace('@', '').replace('/', '__')}`;
          }
          if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('https://')) {
            const target = new URL(specifier, parent);
            if (/\.d\.(?:ts|mts|cts)$/u.test(target.pathname)) {
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
          const response = await fetch(`${esmShBase}/${request}`, { signal: this.abort.signal });
          const target = response.headers.get('X-TypeScript-Types');
          if (!response.ok || !target) {
            throw new Error(`No declarations for ${specifier}`);
          }
          return new URL(target, esmShBase).href;
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
        void this.runScan(document.text);
      }
    }, retryDelay);
  }

  private report(error: unknown): void {
    this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}
// oxlint-enable eslint/no-await-in-loop
