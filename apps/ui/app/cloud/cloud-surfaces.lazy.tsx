import { useEffect } from 'react';
import { cloudPort } from '#cloud/cloud-port.js';

/**
 * The Cloud chunk (adaptive app deployment mode charter D6): loaded only while the mode is `funded`, through the one
 * loader (`cloud-entries.ts`), and mounted through the one surface helper. Never part of Core.
 */

/**
 * The bridge: mounted inside the financial providers for one identity, it publishes that identity's plan facts into
 * the port as data, and forgets them when it unmounts. The W3 skeleton publishes no fact yet; W4 fills it from the
 * real hooks.
 *
 * @param props - The identity's key.
 * @returns Nothing visible.
 */
export function CloudBridge({ identityKey }: { readonly identityKey: string }): undefined {
  useEffect(() => {
    cloudPort.publish(identityKey, {});
    return () => {
      cloudPort.clear(identityKey);
    };
  }, [identityKey]);
  return undefined;
}
