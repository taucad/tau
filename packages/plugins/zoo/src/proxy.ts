/**
 * Helpers for hosts that run the Zoo kernel behind Tau's Zoo proxy: put a
 * Zoo-scoped token on the WebSocket upgrade, never in kernel options.
 *
 * Light on purpose: importing it does not load the kernel or its WASM.
 */

/* oxlint-disable no-barrel-files/no-barrel-files -- public package subpath */

export { withZooProxyHeaders } from '#proxy/zoo-proxy-headers.js';
export {
  installZooProxyCredential,
  zooProxyCredentialFrameType,
  zooProxyTokenHeader,
} from '#proxy/zoo-proxy-credential.js';
export type { ZooProxyCredentialFrame } from '#proxy/zoo-proxy-credential.js';
export { createZooProxyTokenSource } from '#proxy/zoo-proxy-token.js';
export type { ZooProxyTokenSource, ZooProxyTokenSourceOptions } from '#proxy/zoo-proxy-token.js';
