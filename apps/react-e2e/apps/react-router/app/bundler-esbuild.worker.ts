import { serveWebWorkerRuntime } from '@taucad/runtime/worker/web';

import { runtime } from './bundler-esbuild.runtime.js';

await serveWebWorkerRuntime({ runtime });
