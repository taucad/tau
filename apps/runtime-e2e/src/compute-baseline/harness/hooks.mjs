// Lane B loader hook registration. Usage:
//   node --import @oxc-node/core/register --import ./spikes/compute-reuse/lane-b/hooks.mjs <script.mts>
// Registered AFTER oxc-node so our `load` runs outermost and sees transpiled JS.
import { register } from 'node:module';
register('./hook-impl.mjs', import.meta.url);
