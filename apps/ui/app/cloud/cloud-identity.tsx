import { createContext, useContext } from 'react';
import { cloudIdentityKey } from '#cloud/cloud-port.js';
import type { CloudIdentity } from '#cloud/cloud-port.js';

/**
 * The financial identity the page is bound to (adaptive app deployment mode charter D6, D17): defined only while the
 * mode is `funded` and someone is signed in. Every port read and every lazy surface keys on it, so an identity change
 * remounts those and nothing else. Part of Core.
 */
export type CloudIdentityValue = Readonly<{ identity: CloudIdentity | undefined; key: string | undefined }>;

const unbound: CloudIdentityValue = { identity: undefined, key: undefined };

const CloudIdentityContext = createContext<CloudIdentityValue>(unbound);

/** Provides the bound identity. @public */
export const CloudIdentityProvider = CloudIdentityContext.Provider;

/**
 * The identity value for an identity.
 *
 * @param identity - The bound identity, or `undefined`.
 * @returns The value with its key.
 * @public
 */
export const cloudIdentityValue = (identity: CloudIdentity | undefined): CloudIdentityValue =>
  identity === undefined ? unbound : { identity, key: cloudIdentityKey(identity) };

/**
 * The bound financial identity and its key; unbound outside the adaptive root boundary.
 *
 * @returns The value.
 * @public
 */
export const useCloudIdentity = (): CloudIdentityValue => useContext(CloudIdentityContext);
