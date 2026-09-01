/* oxlint-disable no-barrel-files/no-barrel-files -- compatibility adapter for the extracted @taucad/vm substrate */
import {
  esbuildNamespace as vmEsbuildNamespace,
  httpFetchMaxSizeBytes as vmHttpFetchMaxSizeBytes,
  httpFetchTimeout as vmHttpFetchTimeout,
  nodeExecFilePrefix as vmNodeExecFilePrefix,
  vfsNamespacePrefix as vmVfsNamespacePrefix,
} from '@taucad/vm/internal';

export const esbuildNamespace = { ...vmEsbuildNamespace };
export const vfsNamespacePrefix = `${vmVfsNamespacePrefix}`;
export const nodeExecFilePrefix = `${vmNodeExecFilePrefix}`;
export const httpFetchTimeout = Number(vmHttpFetchTimeout);
export const httpFetchMaxSizeBytes = Number(vmHttpFetchMaxSizeBytes);
