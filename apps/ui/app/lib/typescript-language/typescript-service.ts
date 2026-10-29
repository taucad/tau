import { TypeScriptWorkerClient } from '@taucad/lsp/typescript-worker/client';
import type { TauLanguageHostInit } from '@taucad/lsp/language-fs-sync-host';
import type { DocumentChange, EditorDocument } from '#lib/editor-document.js';
import { loadKernelStaticTypes } from '#lib/typescript-language/static-types.js';
import type { DependencyReader } from '#lib/typescript-language/static-types.js';
import { TypeAcquisitionController } from '#lib/typescript-language/type-acquisition.js';

export type CreateTypeScriptServiceOptions = Readonly<{
  openLanguageHostPort?: () => TauLanguageHostInit | undefined;
  dependencyReader?: DependencyReader;
  /** Package names from the selected kernel; imports load additional mounted types on demand. */
  staticPackageNames?: readonly string[];
  readProjectFile?: (path: string) => Promise<string | undefined>;
  dynamicTypes?: boolean;
  onError?: (error: Error) => void;
  onWorkerFailure?: (error: Error) => void;
}>;

async function projectStaticPackageNames(
  readProjectFile: CreateTypeScriptServiceOptions['readProjectFile'],
): Promise<string[]> {
  try {
    const text = await readProjectFile?.('package.json');
    if (!text) {
      return [];
    }
    const manifest: unknown = JSON.parse(text);
    if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
      return [];
    }
    const dependencies: unknown = (manifest as Record<string, unknown>)['dependencies'];
    if (typeof dependencies !== 'object' || dependencies === null || Array.isArray(dependencies)) {
      return [];
    }
    return Object.entries(dependencies).flatMap(([name, version]) => (typeof version === 'string' ? [name] : []));
  } catch {
    // A missing or malformed package manifest must not prevent plain editing.
    return [];
  }
}

export type TypeScriptWorkerPort = Pick<
  TypeScriptWorkerClient,
  'open' | 'change' | 'close' | 'setExtraLib' | 'removeExtraLib' | 'request' | 'dispose'
>;

type AttachedDocument = {
  count: number;
  workerUri: string;
  ready: Promise<void>;
  queue: Promise<void>;
  unsubscribe?: () => void;
};

async function observeBackgroundChange(queue: Promise<void>): Promise<void> {
  try {
    await queue;
  } catch {
    // Semantic callers observe the same rejection through flush.
  }
}

/** Project-scoped service with one worker and one declaration-acquisition owner. */
export class TypeScriptService {
  // oxlint-disable typescript/parameter-properties -- tsgo erasableSyntaxOnly forbids constructor parameter properties.
  public readonly client: TypeScriptWorkerPort;
  private readonly acquisition: TypeAcquisitionController;
  private readonly documents = new Map<EditorDocument, AttachedDocument>();
  private disposed = false;

  public constructor(client: TypeScriptWorkerPort, acquisition: TypeAcquisitionController) {
    this.client = client;
    this.acquisition = acquisition;
  }
  // oxlint-enable typescript/parameter-properties

  public get environmentRevision(): number {
    return this.acquisition.revision;
  }

  public subscribeEnvironment(listener: (revision: number) => void): () => void {
    return this.acquisition.subscribe(listener);
  }

  /** Mirror a neutral document into the worker exactly once across split views. */
  public async attach(document: EditorDocument): Promise<void> {
    if (this.disposed) {
      throw new Error('TypeScript service disposed');
    }
    const existing = this.documents.get(document);
    if (existing) {
      existing.count += 1;
      await existing.ready;
      return;
    }
    const entry: AttachedDocument = {
      count: 1,
      workerUri: document.uri,
      ready: Promise.resolve(),
      queue: Promise.resolve(),
    };
    this.documents.set(document, entry);
    entry.ready = this.openAndSubscribe(document, entry);
    await entry.ready;
  }

  public async detach(document: EditorDocument): Promise<void> {
    const entry = this.documents.get(document);
    if (!entry) {
      return;
    }
    entry.count -= 1;
    if (entry.count > 0) {
      return;
    }
    this.documents.delete(document);
    entry.unsubscribe?.();
    this.acquisition.unwatch(document);
    try {
      await entry.ready;
      await entry.queue;
    } catch {
      // A terminal worker failure already evicts the service. The neutral document remains live.
      return;
    }
    if (this.documents.get(document) === undefined && !this.disposed) {
      await this.client.close(entry.workerUri);
    }
  }

  /** Wait until every document change queued before this call reaches the worker. */
  public async flush(document: EditorDocument): Promise<void> {
    const entry = this.documents.get(document);
    if (!entry) {
      throw new Error(`TypeScript document is not attached: ${document.uri}`);
    }
    await entry.ready;
    await entry.queue;
  }

  /** Mirror a filesystem rename after the worker has computed import rewrites from the old graph. */
  public async relocate(document: EditorDocument): Promise<void> {
    const entry = this.documents.get(document);
    if (!entry) {
      return;
    }
    await entry.ready;
    await entry.queue;
    if (this.documents.get(document) !== entry || entry.workerUri === document.uri) {
      return;
    }
    await this.client.close(entry.workerUri);
    await this.client.open(document.uri, document.text, document.version);
    entry.workerUri = document.uri;
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const [document, entry] of this.documents) {
      entry.unsubscribe?.();
      this.acquisition.unwatch(document);
    }
    this.documents.clear();
    this.acquisition.dispose();
    this.client.dispose();
  }

  private async openAndSubscribe(document: EditorDocument, entry: AttachedDocument): Promise<void> {
    const snapshot = { uri: document.uri, text: document.text, version: document.version };
    const pending: DocumentChange[] = [];
    let ready = false;
    entry.unsubscribe = document.subscribe((event) => {
      if (!ready) {
        pending.push(event);
        return;
      }
      entry.queue = this.queueChange(entry.queue, { document, event, entry });
      // Semantic callers observe this rejection through flush; attaching a handler also prevents a
      // background edit during worker failure from surfacing as an unhandled promise rejection.
      void observeBackgroundChange(entry.queue);
    });
    try {
      await this.client.open(snapshot.uri, snapshot.text, snapshot.version);
      while (pending.length > 0) {
        const event = pending.shift();
        if (event) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- changes must reach TS in version order.
          await this.forwardChange(document, event, entry);
        }
      }
      ready = true;
      if (this.disposed || entry.count === 0) {
        return;
      }
      this.acquisition.watch(document);
    } catch (error) {
      entry.unsubscribe();
      if (this.documents.get(document) === entry) {
        this.documents.delete(document);
      }
      throw error;
    }
  }

  private async queueChange(
    prior: Promise<void>,
    change: Readonly<{ document: EditorDocument; event: DocumentChange; entry: AttachedDocument }>,
  ): Promise<void> {
    // A failed mirror update must not prevent a later full-text reopen from the neutral document.
    await prior.catch(() => undefined);
    await this.forwardChange(change.document, change.event, change.entry);
  }

  private async forwardChange(document: EditorDocument, event: DocumentChange, entry: AttachedDocument): Promise<void> {
    if (this.disposed || this.documents.get(document) !== entry) {
      return;
    }
    try {
      if (entry.workerUri !== event.uri) {
        await this.client.close(entry.workerUri);
        await this.client.open(event.uri, document.text, document.version);
        entry.workerUri = event.uri;
        return;
      }
      await this.client.change(event);
    } catch {
      if (this.documents.get(document) === entry) {
        await this.client.open(document.uri, document.text, document.version);
        entry.workerUri = document.uri;
      }
    }
  }
}

/** Start the worker only after a TS/JS code pane is admitted. */
export async function createTypeScriptService(options: CreateTypeScriptServiceOptions): Promise<TypeScriptService> {
  const client = new TypeScriptWorkerClient({
    openLanguageHostPort: options.openLanguageHostPort,
    onFatal: options.onWorkerFailure,
  });
  try {
    const packageNames = options.staticPackageNames ?? (await projectStaticPackageNames(options.readProjectFile));
    const staticTypes = await loadKernelStaticTypes(options.dependencyReader, packageNames);
    const acquisition = new TypeAcquisitionController({
      client,
      staticTypes,
      dependencyReader: options.dependencyReader,
      dynamicTypes: options.dynamicTypes !== false,
      readProjectFile: options.readProjectFile,
      onError: options.onError,
    });
    await acquisition.initialize();
    return new TypeScriptService(client, acquisition);
  } catch (error) {
    client.dispose();
    throw error;
  }
}
