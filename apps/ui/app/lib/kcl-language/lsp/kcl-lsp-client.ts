/**
 * KCL LSP Client for Monaco Editor.
 *
 * This client:
 * 1. Manages the Web Worker hosting the WASM LSP
 * 2. Provides methods for all LSP requests (hover, completion, etc.)
 * 3. Handles LSP notifications (diagnostics, etc.)
 * 4. Manages document synchronization
 */

import type * as LSP from 'vscode-languageserver-protocol';
import { JSONRPCClient, JSONRPCServer, JSONRPCServerAndClient } from 'json-rpc-2.0';
import type { JSONRPCRequest } from 'json-rpc-2.0';
import type { FileSystemClient } from '@taucad/fs-client/file-system-client';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import type { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { IntoServer } from '#lib/kcl-language/lsp/codec/into-server.js';
import { createFromServer } from '#lib/kcl-language/lsp/codec/from-server.js';
import { createKclLogger } from '#lib/kcl-language/lsp/kcl-logs.js';
import { lspWorkerEventType, kclWorkerType } from '#lib/kcl-language/lsp/kcl-lsp-types.js';
import type { KclLspWorkerOptions, LspWorkerEvent } from '#lib/kcl-language/lsp/kcl-lsp-types.js';
import { encodeMessage } from '#lib/kcl-language/lsp/codec/utils.js';
import { serveLanguageFileSystemRequests } from '@taucad/lsp/language-fs-bridge';
import type { FileManagerApi } from '#machines/file-manager.machine.types.js';

const log = createKclLogger('LSP Client');

/**
 * Client capabilities sent during initialization.
 */
const clientCapabilities: LSP.ClientCapabilities = {
  textDocument: {
    hover: { dynamicRegistration: true, contentFormat: ['plaintext', 'markdown'] },
    synchronization: { dynamicRegistration: true, willSave: false, didSave: false, willSaveWaitUntil: false },
    completion: {
      dynamicRegistration: true,
      completionItem: {
        snippetSupport: false,
        commitCharactersSupport: true,
        documentationFormat: ['plaintext', 'markdown'],
        deprecatedSupport: false,
        preselectSupport: false,
      },
      contextSupport: false,
    },
    signatureHelp: {
      dynamicRegistration: true,
      signatureInformation: { documentationFormat: ['plaintext', 'markdown'] },
    },
    declaration: { dynamicRegistration: true, linkSupport: true },
    definition: { dynamicRegistration: true, linkSupport: true },
    typeDefinition: { dynamicRegistration: true, linkSupport: true },
    implementation: { dynamicRegistration: true, linkSupport: true },
    codeAction: { dynamicRegistration: true },
    formatting: { dynamicRegistration: true },
    rename: { dynamicRegistration: true, prepareSupport: true },
    foldingRange: { dynamicRegistration: true },
    semanticTokens: {
      dynamicRegistration: true,
      tokenTypes: [
        'number',
        'variable',
        'keyword',
        'type',
        'string',
        'operator',
        'comment',
        'function',
        'parameter',
        'property',
      ],
      tokenModifiers: ['declaration', 'definition', 'defaultLibrary', 'readonly', 'static'],
      formats: ['relative'],
      requests: { full: true },
    },
    publishDiagnostics: { relatedInformation: true },
  },
  workspace: { didChangeConfiguration: { dynamicRegistration: true } },
};

export type NotificationHandler = (notification: LSP.NotificationMessage) => void;

export type KclLspFsBridgeOptions = Readonly<{
  fileManager: Pick<FileManagerApi, 'readFile'>;
  treeService: FileTreeService;
  proxy: Pick<FileSystemClient, 'searchFiles'>;
  paths: WorkspacePathResolver;
  filePoolBuffer?: SharedArrayBuffer;
}>;

export type KclLspClientOptions = Readonly<{
  /** Workspace filesystem bridge (required for WASM import resolution). */
  fs: KclLspFsBridgeOptions;
  /** Callback when the client is initialized */
  onInitialized?: () => void;
  /** Callback for handling notifications (e.g., diagnostics) */
  onNotification?: NotificationHandler;
}>;

/** Narrow read API used by the symbol service for import resolution. */
export type LspFileManager = Pick<FileManagerApi, 'readFile'>;

export class KclLspClient {
  // Private fields
  private worker: Worker | undefined;
  private jsonRpcClient: JSONRPCServerAndClient | undefined;
  private intoServer: IntoServer | undefined;
  private fromServer: ReturnType<typeof createFromServer> | undefined;
  private languageFsServer: JSONRPCServer | undefined;
  private languageFsDisposable: { dispose(): void } | undefined;
  private serverCapabilities: LSP.ServerCapabilities = {};
  private readonly notificationHandler: NotificationHandler | undefined;
  private isReady = false;
  private readonly readyPromise: Promise<void>;
  private resolveReady: () => void;
  // oxlint-disable-next-line typescript-eslint(parameter-properties) -- TS erasableSyntaxOnly forbids constructor parameter properties
  private readonly options: KclLspClientOptions;

  public constructor(options: KclLspClientOptions) {
    this.options = options;
    this.notificationHandler = options.onNotification;
    this.resolveReady = (): void => {
      // Placeholder
    };

    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  public get ready(): boolean {
    return this.isReady;
  }

  public async waitForReady(): Promise<void> {
    return this.readyPromise;
  }

  /**
   * Workspace-relative file reads for client-side symbol augmentation (imports).
   */
  public getFileManager(): LspFileManager {
    return this.options.fs.fileManager;
  }

  public getServerCapabilities(): LSP.ServerCapabilities {
    return this.serverCapabilities;
  }

  /**
   * Push the active document URI to the worker so relative WASM paths resolve
   * against the correct directory.
   */
  public setCurrentDocumentUri(documentUri: string): void {
    this.worker?.postMessage({
      worker: kclWorkerType,
      eventType: lspWorkerEventType.setDocumentContext,
      eventData: { documentUri },
    });
  }

  public textDocumentDidOpen(parameters: LSP.DidOpenTextDocumentParams): void {
    log.debug(
      'textDocumentDidOpen called for:',
      parameters.textDocument.uri,
      'text length:',
      parameters.textDocument.text.length,
    );
    this.notify('textDocument/didOpen', parameters);
    log.debug('textDocumentDidOpen notification sent');
  }

  public textDocumentDidChange(parameters: LSP.DidChangeTextDocumentParams): void {
    this.notify('textDocument/didChange', parameters);
  }

  public textDocumentDidClose(parameters: LSP.DidCloseTextDocumentParams): void {
    this.notify('textDocument/didClose', parameters);
  }

  public async textDocumentHover(parameters: LSP.HoverParams): Promise<LSP.Hover | undefined> {
    if (!this.serverCapabilities.hoverProvider) {
      return undefined;
    }

    return this.request('textDocument/hover', parameters);
  }

  public async textDocumentCompletion(
    parameters: LSP.CompletionParams,
  ): Promise<LSP.CompletionItem[] | LSP.CompletionList | undefined> {
    log.debug('textDocumentCompletion called for uri:', parameters.textDocument.uri);
    log.debug('textDocumentCompletion position:', JSON.stringify(parameters.position));
    log.debug('textDocumentCompletion capabilities:', this.serverCapabilities.completionProvider);
    if (!this.serverCapabilities.completionProvider) {
      log.debug('No completion provider capability - returning undefined');
      return undefined;
    }

    // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- LSP can return null
    const result = await this.request<LSP.CompletionItem[] | LSP.CompletionList | null>(
      'textDocument/completion',
      parameters,
    );

    log.debug(
      'textDocumentCompletion result type:',
      result === null ? 'null' : Array.isArray(result) ? 'array' : 'object',
    );
    if (result && 'items' in result) {
      log.debug('textDocumentCompletion items count:', result.items.length);
    } else if (Array.isArray(result)) {
      log.debug('textDocumentCompletion array length:', result.length);
    }

    return result ?? undefined;
  }

  public async completionItemResolve(parameters: LSP.CompletionItem): Promise<LSP.CompletionItem> {
    return this.request('completionItem/resolve', parameters);
  }

  public async textDocumentSignatureHelp(parameters: LSP.SignatureHelpParams): Promise<LSP.SignatureHelp | undefined> {
    if (!this.serverCapabilities.signatureHelpProvider) {
      return undefined;
    }

    return this.request('textDocument/signatureHelp', parameters);
  }

  public async textDocumentFormatting(parameters: LSP.DocumentFormattingParams): Promise<LSP.TextEdit[] | undefined> {
    if (!this.serverCapabilities.documentFormattingProvider) {
      return undefined;
    }

    return this.request('textDocument/formatting', parameters);
  }

  public async textDocumentSemanticTokensFull(
    parameters: LSP.SemanticTokensParams,
  ): Promise<LSP.SemanticTokens | undefined> {
    if (!this.serverCapabilities.semanticTokensProvider) {
      return undefined;
    }

    return this.request('textDocument/semanticTokens/full', parameters);
  }

  public async textDocumentFoldingRange(parameters: LSP.FoldingRangeParams): Promise<LSP.FoldingRange[] | undefined> {
    if (!this.serverCapabilities.foldingRangeProvider) {
      return undefined;
    }

    return this.request('textDocument/foldingRange', parameters);
  }

  public async textDocumentRename(parameters: LSP.RenameParams): Promise<LSP.WorkspaceEdit | undefined> {
    if (!this.serverCapabilities.renameProvider) {
      return undefined;
    }

    return this.request('textDocument/rename', parameters);
  }

  public async textDocumentPrepareRename(
    parameters: LSP.PrepareRenameParams,
  ): Promise<LSP.Range | LSP.PrepareRenameResult | undefined> {
    if (!this.serverCapabilities.renameProvider) {
      return undefined;
    }

    return this.request('textDocument/prepareRename', parameters);
  }

  public async textDocumentDefinition(
    parameters: LSP.DefinitionParams,
  ): Promise<LSP.Definition | LSP.DefinitionLink[] | undefined> {
    if (!this.serverCapabilities.definitionProvider) {
      return undefined;
    }

    return this.request('textDocument/definition', parameters);
  }

  public async textDocumentCodeAction(
    parameters: LSP.CodeActionParams,
  ): Promise<Array<LSP.Command | LSP.CodeAction> | undefined> {
    if (!this.serverCapabilities.codeActionProvider) {
      return undefined;
    }

    return this.request('textDocument/codeAction', parameters);
  }

  public async initialize(): Promise<void> {
    log.debug('Creating worker...');
    this.languageFsServer = new JSONRPCServer();
    this.languageFsDisposable = serveLanguageFileSystemRequests(this.languageFsServer, {
      fileManager: this.options.fs.fileManager,
      treeService: this.options.fs.treeService,
      proxy: this.options.fs.proxy,
      paths: this.options.fs.paths,
      filePoolBuffer: this.options.fs.filePoolBuffer,
    });

    this.worker = new Worker(new URL('kcl-lsp-worker.ts', import.meta.url), { type: 'module', name: 'kcl-lsp' });
    this.fromServer = createFromServer();
    this.intoServer = new IntoServer(kclWorkerType, this.worker);

    const handleWorkerMessage = (event: MessageEvent): void => {
      if (event.data?.eventType !== undefined) {
        const workerEvent = event.data as LspWorkerEvent;
        if (workerEvent.eventType === lspWorkerEventType.languageFsJsonRpc) {
          void this.handleLanguageFsWorkerMessage(workerEvent);
          return;
        }

        log.debug('Received non-fs worker message:', workerEvent.eventType);
        return;
      }

      log.debug('Received LSP message from worker:', event.data);
      this.fromServer?.add(event.data as Uint8Array<ArrayBuffer>);
    };

    this.worker.addEventListener('message', handleWorkerMessage);
    this.worker.addEventListener('error', (error) => {
      log.error('Worker error:', error);
    });

    const sendRequest = async (request: JSONRPCRequest): Promise<void> => {
      log.debug('Sending request:', request.method, 'id:', request.id);
      const encoded = encodeMessage(request);
      this.intoServer?.enqueue(encoded);

      if (request.id !== null && request.id !== undefined) {
        log.debug('Waiting for response to id:', request.id);

        const response = await this.fromServer?.responses.get(request.id);
        log.debug('Got response for id:', request.id, response);
        if (response) {
          // Cast to match json-rpc-2.0 expected type
          this.jsonRpcClient?.client.receive(response as Parameters<typeof this.jsonRpcClient.client.receive>[0]);
        }
      }
    };

    this.jsonRpcClient = new JSONRPCServerAndClient(new JSONRPCServer(), new JSONRPCClient(sendRequest));

    this.jsonRpcClient.addMethod('client/registerCapability', (requestParameters: unknown) => {
      const { registrations } = requestParameters as { registrations: LSP.Registration[] };
      log.debug('Server registering capabilities:', registrations);
      for (const registration of registrations) {
        this.registerServerCapability(registration);
      }
    });

    this.jsonRpcClient.addMethod('client/unregisterCapability', (requestParameters: unknown) => {
      const { unregisterations } = requestParameters as { unregisterations: LSP.Unregistration[] };
      log.debug('Server unregistering capabilities:', unregisterations);
      for (const unregistration of unregisterations) {
        this.unregisterServerCapability(unregistration);
      }
    });

    this.jsonRpcClient.addMethod('window/logMessage', (requestParameters: unknown) => {
      const { type, message } = requestParameters as { type: LSP.MessageType; message: string };
      const prefix = ['', '[error]', '[warn]', '[info]', '[log]'][type] ?? '[log]';
      log.debug(`[LSP Server] ${prefix} ${message}`);
    });

    const initOptions: KclLspWorkerOptions = {
      wasmUrl: '',
      token: '',
      apiBaseUrl: '',
      workspaceRootPath: this.options.fs.paths.root,
      filePoolBuffer: this.options.fs.filePoolBuffer,
    };
    log.debug('Posting Init event to worker');
    this.worker.postMessage({ worker: kclWorkerType, eventType: lspWorkerEventType.init, eventData: initOptions });

    void this.processNotifications();
    void this.processRequests();

    log.debug('Starting LSP initialization...');
    await this.initializeLsp();
    log.debug('LSP initialization complete');
  }

  public dispose(): void {
    this.languageFsDisposable?.dispose();
    this.languageFsDisposable = undefined;
    this.languageFsServer = undefined;
    this.worker?.terminate();
    this.worker = undefined;
    this.jsonRpcClient = undefined;
    this.isReady = false;
  }

  private async handleLanguageFsWorkerMessage(workerEvent: LspWorkerEvent): Promise<void> {
    const request = workerEvent.eventData as JSONRPCRequest;
    if (!this.languageFsServer) {
      return;
    }

    log.debug('lsp-fs JSON-RPC from worker:', request.method, 'id:', request.id);
    const response = await this.languageFsServer.receive(request);
    if (response) {
      this.worker?.postMessage({
        worker: kclWorkerType,
        eventType: lspWorkerEventType.languageFsJsonRpc,
        eventData: response,
      });
    }
  }

  private async request<T>(method: string, parameters: unknown): Promise<T> {
    if (!this.jsonRpcClient) {
      throw new Error('LSP client not initialized');
    }

    return this.jsonRpcClient.request(method, parameters) as Promise<T>;
  }

  private notify(method: string, parameters: unknown): void {
    if (!this.jsonRpcClient) {
      throw new Error('LSP client not initialized');
    }

    this.jsonRpcClient.notify(method, parameters);
  }

  private async initializeLsp(): Promise<void> {
    const initializeParameters: LSP.InitializeParams = {
      processId: null,
      clientInfo: { name: 'monaco-kcl-lsp', version: '1.0.0' },
      capabilities: clientCapabilities,
      rootUri: null,
      workspaceFolders: null,
    };

    log.debug('Sending initialize request...');
    const result = await this.request<LSP.InitializeResult>('initialize', initializeParameters);
    log.debug('Initialize response received:', result);
    this.serverCapabilities = result.capabilities;
    log.debug('Server capabilities:', this.serverCapabilities);
    this.notify('initialized', {});
    this.isReady = true;
    this.resolveReady();
    this.options.onInitialized?.();
    log.debug('Client fully initialized');
  }

  private async processNotifications(): Promise<void> {
    if (!this.fromServer) {
      return;
    }

    for await (const notification of this.fromServer.notifications) {
      this.notificationHandler?.(notification);
    }
  }

  private async processRequests(): Promise<void> {
    if (!this.fromServer || !this.jsonRpcClient) {
      return;
    }

    for await (const request of this.fromServer.requests) {
      await this.jsonRpcClient.receiveAndSend(request);
    }
  }

  private registerServerCapability(registration: LSP.Registration): void {
    log.debug('Registered capability:', registration.method);
  }

  private unregisterServerCapability(unregistration: LSP.Unregistration): void {
    log.debug('Unregistered capability:', unregistration.method);
  }
}
