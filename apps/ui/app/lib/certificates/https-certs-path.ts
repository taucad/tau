import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const tauWorkspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

const platformDataDirectory = (): string => {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }
  if (process.platform === 'win32') {
    return process.env['LOCALAPPDATA'] ?? process.env['APPDATA'] ?? path.join(os.homedir(), 'AppData', 'Local');
  }
  return process.env['XDG_DATA_HOME'] ?? path.join(os.homedir(), '.local', 'share');
};

/** Persistent CA identity shared by `vite-plugin-mkcert` and `pnpm nx serve ui --https`. */
export const httpsCertsSavePath = process.env['TAU_DEV_CERTS_DIR']
  ? path.resolve(process.env['TAU_DEV_CERTS_DIR'])
  : path.join(platformDataDirectory(), process.platform === 'linux' ? 'tau' : 'Tau', 'mkcert');

/** Pre-policy location used only for one-time identity-preserving migration. */
export const legacyHttpsCertsSavePath = path.join(tauWorkspaceRoot, 'node_modules', '.cache', 'vite-plugin-mkcert');

export const httpsCaPemFilename = 'rootCA.pem';

export const httpsCaPemPath = path.join(httpsCertsSavePath, httpsCaPemFilename);

export const httpsCertPemFilename = 'dev.pem';

export const httpsKeyPemFilename = 'dev.key';

export const httpsCertPemPath = path.join(httpsCertsSavePath, httpsCertPemFilename);

export const httpsKeyPemPath = path.join(httpsCertsSavePath, httpsKeyPemFilename);
