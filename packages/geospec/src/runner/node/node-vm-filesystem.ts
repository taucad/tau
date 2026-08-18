/**
 * Node `VmFileSystem` contract (engine-backed: it touches the real disk).
 *
 * @module
 */

import type { VmFileSystem } from '@taucad/runtime/vm';
import { requireRegisteredGeoSpecHostBinding } from '#engine/registry.js';

/**
 * Create a Node `VmFileSystem` rooted at `root`.
 *
 * @param root - Absolute project root path.
 * @returns A VM filesystem reading and writing under `root`.
 * @public
 */
export const createNodeVmFileSystem = (root: string): VmFileSystem =>
  requireRegisteredGeoSpecHostBinding<(root: string) => VmFileSystem>('createNodeVmFileSystem')(root);
