import { serveWebWorkerRuntime } from '@taucad/runtime/worker/web';
import { runtime } from './runtime-definition';

await serveWebWorkerRuntime({ runtime });
