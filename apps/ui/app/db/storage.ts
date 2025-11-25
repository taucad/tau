import FS from '@isomorphic-git/lightning-fs';
import { IndexedDbStorageProvider } from '#db/indexeddb-storage.js';
import { isBrowser } from '#constants/browser.constants.js';
import { metaConfig } from '#constants/meta.constants.js';

// LightningFS singleton for filesystem operations
export const lightningFs = isBrowser
  ? new FS(`${metaConfig.databasePrefix}git`, {
      // FS options
    })
  : undefined;

// IndexedDB storage for build metadata and domain data
export const storage = new IndexedDbStorageProvider();
