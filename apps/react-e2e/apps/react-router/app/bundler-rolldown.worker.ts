import { serveWebWorkerRuntime } from '@taucad/runtime/worker/web';

import { runtime } from './bundler-rolldown.runtime.js';

await serveWebWorkerRuntime({ runtime });
