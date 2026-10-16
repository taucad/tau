import type { DirectShareProtection } from '@taucad/project-core/share-direct';
import type { ShareArtifactCodec, ShareOpenedArtifact } from '#artifact.js';
import type { ShareLocator, ShareLocatorSecrets } from '#locator.js';
import type { ShareProjectSnapshot } from '#snapshot.js';

/** Independent operations a share provider may implement. @public */
export type ShareProviderCapability = 'project.publish' | 'project.resolve' | 'project.republish' | 'project.unpublish';

/** Optional account connection required by a share provider. @public */
export type ShareProviderConnection = {
  readonly id: string;
  readonly scopes: readonly string[];
};

/** Static first-party provider metadata used by the Share dialog and registry. @public */
export type ShareProviderDescriptor = {
  readonly id: string;
  readonly label: string;
  readonly capabilities: readonly ShareProviderCapability[];
  readonly connection?: ShareProviderConnection;
  readonly maxArtifactCharacters?: number;
};

/** Successful publication locator and optional external management URL. @public */
export type SharePublication = {
  readonly locator: ShareLocator;
  readonly secrets: ShareLocatorSecrets;
  readonly revision?: string;
  readonly externalUrl?: string;
};

/** Portable artifact protection selected by the person sharing. @public */
export type ShareProtection = DirectShareProtection;

/** Provider visibility independent from artifact encryption. @public */
export type ShareVisibility = 'unlisted' | 'public';

/** Narrow server-side Gist mutation port; OAuth credentials never cross this boundary. @public */
export type GithubGistTransport = {
  readonly mutate: (input: {
    readonly action: 'create' | 'update' | 'delete';
    readonly id?: string;
    readonly revision?: string;
    readonly payload?: {
      readonly public?: boolean;
      readonly files: Readonly<Record<string, { readonly content: string }>>;
    };
    readonly signal?: AbortSignal;
  }) => Promise<Record<string, unknown>>;
};

/** Existing Tau publication transport injected without coupling providers to app APIs. @public */
export type TauShareTransport = {
  readonly publish: (input: {
    readonly snapshot: ShareProjectSnapshot;
    readonly signal?: AbortSignal;
  }) => Promise<{ readonly publicationId: string; readonly externalUrl?: string }>;
  readonly resolve: (input: {
    readonly publicationId: string;
    readonly signal?: AbortSignal;
  }) => Promise<ShareOpenedArtifact>;
};

/** Operation dependencies supplied by the application at the provider boundary. @public */
export type ShareProviderContext = {
  readonly origin: string;
  readonly artifactCodec: ShareArtifactCodec;
  readonly fetch: typeof globalThis.fetch;
  readonly githubGist?: GithubGistTransport;
  readonly tau?: TauShareTransport;
};

/** Input for a provider publication. @public */
export type SharePublishInput = {
  readonly snapshot: ShareProjectSnapshot;
  readonly protection?: ShareProtection;
  readonly visibility?: ShareVisibility;
  readonly signal?: AbortSignal;
};

/** Input for resolving a provider locator. @public */
export type ShareResolveInput = {
  readonly locator: ShareLocator;
  readonly secrets: ShareLocatorSecrets;
  readonly signal?: AbortSignal;
};

/** Input for replacing one provider-owned publication with a new snapshot revision. @public */
export type ShareRepublishInput = Omit<SharePublishInput, 'visibility'> & {
  readonly locator: ShareLocator;
};

/** Input for removing one provider-owned publication. @public */
export type ShareUnpublishInput = {
  readonly locator: ShareLocator;
  readonly signal?: AbortSignal;
};

/** First-party share-provider implementation contract. @public */
export type ShareProvider = {
  readonly descriptor: ShareProviderDescriptor;
  readonly publish?: (input: SharePublishInput, context: ShareProviderContext) => Promise<SharePublication>;
  readonly resolve?: (input: ShareResolveInput, context: ShareProviderContext) => Promise<ShareOpenedArtifact>;
  readonly republish?: (input: ShareRepublishInput, context: ShareProviderContext) => Promise<SharePublication>;
  readonly unpublish?: (input: ShareUnpublishInput, context: ShareProviderContext) => Promise<void>;
};

/** Lazy immutable provider registration. @public */
export type ShareProviderDefinition = {
  readonly descriptor: ShareProviderDescriptor;
  readonly load: () => Promise<ShareProvider>;
};

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- the moved error keeps its app subpath
export { ShareError, isShareError } from '@taucad/project-core/share-error';
// oxlint-disable-next-line no-barrel-files/no-barrel-files -- ditto
export type { ShareErrorCode } from '@taucad/project-core/share-error';
