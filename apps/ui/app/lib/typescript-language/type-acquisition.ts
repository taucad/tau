import { parse } from 'es-module-lexer/js';
import { extractPackageFromCdnUrl, isBareSpecifier } from '@taucad/utils/import';
import type { TypeScriptWorkerClient } from '@taucad/lsp/typescript-worker/client';
import type { EditorDocument } from '#lib/editor-document.js';
import { readStaticTypePackage } from '#lib/typescript-language/static-types.js';
import type { DependencyReader, StaticTypeDefinition } from '#lib/typescript-language/static-types.js';

// oxlint-disable eslint/no-await-in-loop -- declaration registration and import acquisition are ordered to bound worker and network work.

type ProjectReader = (path: string) => Promise<string | undefined>;

type AcquisitionOptions = Readonly<{
  client: Pick<TypeScriptWorkerClient, 'setExtraLib'>;
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
  // oxlint-disable-next-line typescript/parameter-properties -- erasableSyntaxOnly rejects constructor parameter properties.
  private readonly options: AcquisitionOptions;
  private readonly knownPackages = new Set<string>();
  private readonly failures = new Map<string, number>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly cache = new Map<string, string>();
  private readonly timers = new Map<EditorDocument, ReturnType<typeof setTimeout>>();
  private readonly subscriptions = new Map<EditorDocument, () => void>();
  private readonly injectedUris = new Set<string>();
  private readonly aliases = new Map<string, Set<string>>();
  private readonly staticLookups = new Set<string>();
  private readonly abort = new AbortController();
  private disposed = false;

  public constructor(options: AcquisitionOptions) {
    this.options = options;
  }

  public async initialize(): Promise<void> {
    for (const definition of this.options.staticTypes) {
      const uri = definition.filePath ?? `file:///node_modules/${definition.packageName}/index.d.ts`;
      await this.inject(uri, definition.content);
      this.knownPackages.add(definition.packageName);
      const manifestUri = `file:///node_modules/${definition.packageName}/package.json`;
      if (definition.packageJsonContent && !this.injectedUris.has(manifestUri)) {
        await this.inject(manifestUri, definition.packageJsonContent);
      }
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
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.abort.abort();
    for (const document of this.subscriptions.keys()) {
      this.unwatch(document);
    }
    this.pending.clear();
  }

  private async inject(uri: string, text: string): Promise<void> {
    await this.options.client.setExtraLib(uri, text);
    this.injectedUris.add(uri);
  }

  private schedule(document: EditorDocument): void {
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

  private async scan(text: string): Promise<void> {
    const [imports] = parse(text);
    for (const entry of imports) {
      const specifier = entry.n;
      if (!specifier) {
        continue;
      }
      const packageName = isBareSpecifier(specifier) ? packageNameOf(specifier) : extractPackageFromCdnUrl(specifier);
      if (!packageName) {
        continue;
      }
      if (!isBareSpecifier(specifier)) {
        const aliases = this.aliases.get(packageName) ?? new Set<string>();
        aliases.add(specifier);
        this.aliases.set(packageName, aliases);
        const cached = this.cache.get(packageName);
        if (cached) {
          await this.injectModule(specifier, cached);
        }
      }
      if (!this.knownPackages.has(packageName)) {
        await this.tryMountedTypes(packageName);
      }
      if (this.options.dynamicTypes && !this.knownPackages.has(packageName)) {
        await this.acquire(packageName);
      }
    }
  }

  private async tryMountedTypes(packageName: string): Promise<void> {
    const reader = this.options.dependencyReader;
    if (!reader || this.staticLookups.has(packageName)) {
      return;
    }
    this.staticLookups.add(packageName);
    const definitions = await readStaticTypePackage(reader, packageName);
    if (definitions.length === 0) {
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
  }

  private async acquire(packageName: string): Promise<void> {
    const inFlight = this.pending.get(packageName);
    if (inFlight) {
      return inFlight;
    }
    const failedAt = this.failures.get(packageName);
    if (failedAt !== undefined && Date.now() - failedAt < retryDelay) {
      return;
    }
    const promise = this.fetchTypes(packageName);
    this.pending.set(packageName, promise);
    try {
      await promise;
    } finally {
      this.pending.delete(packageName);
    }
  }

  private async fetchTypes(packageName: string): Promise<void> {
    const reader = this.options.readProjectFile;
    const lock = reader ? jsonObject(await reader('package-lock.json')) : undefined;
    const packages = lock?.['packages'];
    const locked =
      typeof packages === 'object' && packages !== null
        ? (packages as Record<string, unknown>)[`node_modules/${packageName}`]
        : undefined;
    const lockedRow = typeof locked === 'object' && locked !== null ? (locked as Record<string, unknown>) : undefined;
    const version = typeof lockedRow?.['version'] === 'string' ? lockedRow['version'] : undefined;
    const realName = typeof lockedRow?.['name'] === 'string' ? lockedRow['name'] : packageName;
    const cacheKey = version ? `${realName}@${version}` : packageName;
    let content = this.cache.get(cacheKey);
    if (!content && version && reader) {
      const manifest = jsonObject(await reader(`node_modules/${packageName}/package.json`));
      const typesFile = manifest?.['types'] ?? manifest?.['typings'];
      if (manifest?.['version'] === version && typeof typesFile === 'string') {
        content = await reader(`node_modules/${packageName}/${typesFile.replace(/^\.\//u, '')}`);
      }
    }
    if (!content) {
      try {
        const moduleResponse = await fetch(`${esmShBase}/${cacheKey}`, { signal: this.abort.signal });
        if (!moduleResponse.ok) {
          throw new Error(`Type acquisition returned ${moduleResponse.status} for ${cacheKey}`);
        }
        const typesUrl = moduleResponse.headers.get('X-TypeScript-Types');
        if (!typesUrl) {
          // Missing declarations remain missing; never report a synthetic type as semantic success.
          this.knownPackages.add(packageName);
          return;
        }
        const url = typesUrl.startsWith('http') ? typesUrl : `${esmShBase}${typesUrl}`;
        const typesResponse = await fetch(url, { signal: this.abort.signal });
        if (!typesResponse.ok) {
          throw new Error(`Type declarations returned ${typesResponse.status} for ${cacheKey}`);
        }
        content = await typesResponse.text();
      } catch (error) {
        if (this.abort.signal.aborted) {
          return;
        }
        this.failures.set(packageName, Date.now());
        this.report(error);
        return;
      }
    }
    if (this.disposed || !content) {
      return;
    }
    this.cache.set(cacheKey, content);
    this.cache.set(packageName, content);
    await this.injectModule(packageName, content);
    this.knownPackages.add(packageName);
    await Promise.all(
      [...(this.aliases.get(packageName) ?? [])].map(async (alias) => this.injectModule(alias, content)),
    );
    this.failures.delete(packageName);
  }

  private async injectModule(name: string, content: string): Promise<void> {
    const uri = name.startsWith('http')
      ? `file:///cdn-types/${encodeURIComponent(name)}.d.ts`
      : `file:///node_modules/${name}/index.d.ts`;
    await this.inject(uri, `declare module '${name}' {\n${content}\n}`);
  }

  private report(error: unknown): void {
    this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}
// oxlint-enable eslint/no-await-in-loop
