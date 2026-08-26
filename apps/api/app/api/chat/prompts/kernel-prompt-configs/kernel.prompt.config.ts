import type { KernelProvider } from '@taucad/runtime';
import type { KernelConfig } from '#api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.types.js';
import { jscadConfig } from '#api/chat/prompts/kernel-prompt-configs/jscad.prompt.config.js';
import { manifoldConfig } from '#api/chat/prompts/kernel-prompt-configs/manifold.prompt.config.js';
import { opencascadejsConfig } from '#api/chat/prompts/kernel-prompt-configs/opencascadejs.prompt.config.js';
import { openscadConfig } from '#api/chat/prompts/kernel-prompt-configs/openscad.prompt.config.js';
import { replicadConfig } from '#api/chat/prompts/kernel-prompt-configs/replicad.prompt.config.js';
import { zooConfig } from '#api/chat/prompts/kernel-prompt-configs/zoo.prompt.config.js';

const kernelConfigs: Record<KernelProvider, KernelConfig> = {
  openscad: openscadConfig,
  replicad: replicadConfig,
  manifold: manifoldConfig,
  zoo: zooConfig,
  jscad: jscadConfig,
  opencascadejs: opencascadejsConfig,
};

export function getKernelConfig(kernel: KernelProvider): KernelConfig {
  return kernelConfigs[kernel];
}
