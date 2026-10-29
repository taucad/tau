import { csharpLanguageManifestSchema } from '#protocol.js';
import type { CSharpLanguageAssets, CSharpLanguageManifest } from '#protocol.js';

/** The JSExport surface of Tau.CSharp.LanguageServer.Browser. */
export type CSharpServerExports = Readonly<{
  initialize(referenceBundle: Uint8Array): void;
  handle(message: string): Promise<string | null>;
  warmUp(): Promise<void>;
}>;

type DotnetRuntime = Readonly<{
  getAssemblyExports(assemblyName: string): Promise<unknown>;
  getConfig(): { mainAssemblyName?: string };
}>;

type DotnetModule = Readonly<{
  dotnet: Readonly<{ create(): Promise<DotnetRuntime> }>;
}>;

type ProgramExports = {
  Tau: {
    CSharp: {
      LanguageServer: {
        Browser: {
          Program: {
            Initialize(bundle: Uint8Array): void;
            Handle(message: string): Promise<string | null>;
            WarmUp(): Promise<void>;
          };
        };
      };
    };
  };
};

export type LoadCSharpServerOptions = Readonly<{
  assets: CSharpLanguageAssets;
  fetch?: typeof globalThis.fetch;
  /** Import the runtime's ES module bootstrap; workers and Node use their own dynamic import. */
  importBootstrap?: (url: string) => Promise<unknown>;
  signal?: AbortSignal;
}>;

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

export const sha256Hex = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> =>
  hex(await crypto.subtle.digest('SHA-256', bytes));

const download = async (
  fetcher: typeof globalThis.fetch,
  url: URL,
  signal: AbortSignal | undefined,
): Promise<Uint8Array<ArrayBuffer>> => {
  const response = await fetcher(url.href, { signal, redirect: 'error' });
  if (!response.ok) {
    throw new Error(`C# language asset download failed (${String(response.status)}): ${url.pathname}`);
  }
  return new Uint8Array(await response.arrayBuffer());
};

const gunzip = async (bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(
    await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(),
  );

/** Admit the content-identified manifest: its bytes must match the identity the build recorded. */
export const loadCSharpManifest = async (
  options: Pick<LoadCSharpServerOptions, 'assets' | 'fetch' | 'signal'>,
): Promise<{ manifest: CSharpLanguageManifest; base: URL }> => {
  const url = new URL(options.assets.url, globalThis.location?.href);
  if (!['http:', 'https:', 'file:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('Invalid C# language manifest URL.');
  }
  const bytes = await download(options.fetch ?? globalThis.fetch, url, options.signal);
  if ((await sha256Hex(bytes)) !== options.assets.sha256) {
    throw new Error('C# language manifest integrity mismatch.');
  }
  const manifest = csharpLanguageManifestSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  return { manifest, base: new URL('.', url) };
};

/**
 * Boot the .NET WebAssembly runtime and create the server from the verified reference bundle. The bootstrap resolves
 * its own runtime files beside itself; every file is immutable under the content-addressed manifest path.
 */
export const loadCSharpServer = async (options: LoadCSharpServerOptions): Promise<CSharpServerExports> => {
  const fetcher = options.fetch ?? globalThis.fetch;
  const { manifest, base } = await loadCSharpManifest(options);
  const referencesEntry = manifest.files.find((file) => file.path === manifest.references);
  if (!referencesEntry) {
    throw new Error('The C# language manifest does not list its reference bundle.');
  }
  const referencesUrl = new URL(manifest.references, base);
  const [compressed, module] = await Promise.all([
    download(fetcher, referencesUrl, options.signal),
    (options.importBootstrap ?? (async (url: string) => import(/* @vite-ignore */ url)))(
      new URL(manifest.bootstrap, base).href,
    ),
  ]);
  if (compressed.length !== referencesEntry.byteLength || (await sha256Hex(compressed)) !== referencesEntry.sha256) {
    throw new Error('C# reference bundle integrity mismatch.');
  }
  const runtime = await (module as DotnetModule).dotnet.create();
  const config = runtime.getConfig();
  const exported = (await runtime.getAssemblyExports(
    config.mainAssemblyName ?? 'Tau.CSharp.LanguageServer.Browser.dll',
  )) as ProgramExports;
  const program = exported.Tau.CSharp.LanguageServer.Browser.Program;
  program.Initialize(await gunzip(compressed));
  return {
    initialize: (bundle) => {
      program.Initialize(bundle);
    },
    handle: async (message) => program.Handle(message),
    warmUp: async () => program.WarmUp(),
  };
};
