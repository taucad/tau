import type { UserConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

import {
  httpsCertPemFilename,
  httpsCertsSavePath,
  httpsKeyPemFilename,
  legacyHttpsCertsSavePath,
} from '#lib/certificates/https-certs-path.js';
import {
  ensureMkcertStorageWritableForRegeneration,
  migrateLegacyMkcertStorage,
} from '#lib/certificates/mkcert-storage.js';

type MkcertPluginShape = {
  config?: (userConfig: UserConfig) => Promise<unknown>;
};

const plugin = mkcert({
  apply: 'serve',
  savePath: httpsCertsSavePath,
  certFileName: httpsCertPemFilename,
  keyFileName: httpsKeyPemFilename,
}) as MkcertPluginShape;

if (typeof plugin.config !== 'function') {
  throw new TypeError('vite-plugin-mkcert: expected async `config` hook');
}

/** Headless contract: same host selection + cert files as `nx dev ui` (Vite plugin `config` hook). */
migrateLegacyMkcertStorage(legacyHttpsCertsSavePath, httpsCertsSavePath);
ensureMkcertStorageWritableForRegeneration(httpsCertsSavePath);
await plugin.config({ server: {} });
