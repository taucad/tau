/**
 * Electron utility-process runtime host.
 *
 * The utility owns executable runtime modules and a local project
 * filesystem. Main only hands it a MessagePort.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { serveElectronRuntime } from '@taucad/runtime/electron/utility';

import { runtime } from './runtime-definition.js';

const projectRoot = process.env['TAU_PROJECT_ROOT'] ?? join(process.cwd(), '.tau-project');
mkdirSync(projectRoot, { recursive: true });

serveElectronRuntime({
  fileSystem: fromNodeFs(projectRoot),
  runtime,
});
