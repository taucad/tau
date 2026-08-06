/**
 * Origin Private File System (OPFS) filesystem provider.
 *
 * OPFS exposes the same directory-handle API as File System Access, so this
 * provider only supplies initialization, identity, and initialization guards.
 */

import type { ProviderCapabilities } from '#types.js';
import { FileSystemAccessProvider } from '#backend/fs-access-provider.js';

/** Filesystem provider backed by the origin-private filesystem. @public */
export class OPFSProvider extends FileSystemAccessProvider {
  /**
   * OPFS backend identifier.
   *
   * @returns The OPFS backend identifier.
   */
  public override get id(): string {
    return 'opfs';
  }

  public override readonly capabilities: ProviderCapabilities = {
    persistent: true,
    writable: true,
    quotaBased: true,
  };

  private _initialized = false;

  /** Create an uninitialized provider. Call {@link initialize} before use. */
  // oxlint-disable-next-line typescript/no-unsafe-argument -- Placeholder handle is replaced in initialize().
  public constructor() {
    super(undefined as unknown as FileSystemDirectoryHandle);
  }

  /** Obtain the OPFS root directory handle. */
  public async initialize(): Promise<void> {
    this._initialized = false;
    this._rootHandle = await navigator.storage.getDirectory();
    this._initialized = true;
    await super.refresh();
  }

  /** Revoke the acquired OPFS root until the next successful initialize. */
  public override dispose(): void {
    this._initialized = false;
    super.dispose();
  }

  protected override _assertReady(): void {
    if (!this._initialized) {
      throw new Error('OPFSProvider is not initialized. Call initialize() first.');
    }
  }
}
