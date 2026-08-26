import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { serveElectronRuntime } from '@taucad/runtime/electron/utility';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { runtime } from './runtime-definition.js';

const projectRoot = process.env['TAU_PROJECT_ROOT'] ?? join(process.cwd(), 'workspace');
mkdirSync(projectRoot, { recursive: true });

serveElectronRuntime({
  fileSystem: fromNodeFs(projectRoot),
  runtime,
});
