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
export type ShareProtection =
  | { readonly kind: 'none' }
  | { readonly kind: 'password'; readonly password: string; readonly includePassword: boolean };

/** Provider visibility independent from artifact encryption. @public */
export type ShareVisibility = 'unlisted' | 'public';

/** Short-lived OAuth access-token lease returned to a provider. @public */
export type ShareAccessTokenLease = {
  readonly accessToken: string;
  readonly grantedScopes: readonly string[];
  readonly expiresAt?: Date;
};

/** Credential authority injected by the application shell. @public */
export type ShareCredentialBroker = {
  readonly getAccessToken: (request: {
    readonly connectionId: string;
    readonly scopes: readonly string[];
    readonly audience: string;
  }) => Promise<ShareAccessTokenLease>;
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
  readonly credentialBroker?: ShareCredentialBroker;
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

/** Typed share failure categories safe for UI branching and logging. @public */
export type ShareErrorCode =
  | 'SHARE_ARTIFACT_INVALID'
  | 'SHARE_ARTIFACT_LIMIT'
  | 'SHARE_AUTH_REQUIRED'
  | 'SHARE_PERMISSION_REQUIRED'
  | 'SHARE_PROVIDER_INVALID_RESPONSE'
  | 'SHARE_PROVIDER_UNAVAILABLE'
  | 'SHARE_LOCATOR_INVALID'
  | 'SHARE_PASSWORD_REQUIRED'
  | 'SHARE_PROVIDER_UNKNOWN';

/** Error containing only a stable code and non-sensitive presentation message. @public */
export class ShareError extends Error {
  public readonly code: ShareErrorCode;

  /** Create a typed share error. @public */
  public constructor(code: ShareErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ShareError';
    this.code = code;
  }
}

/** Realm-safe guard for {@link ShareError}. @public */
export const isShareError = (error: unknown): error is ShareError =>
  error instanceof Error && error.name === 'ShareError' && 'code' in error;
