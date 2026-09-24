import type { ElectronUtilityTransportOptions } from '@taucad/runtime/electron/renderer';
import { ENV } from '#environment.config.js';
import { desktopBridge, nodeHomeRoot } from '#filesystem/desktop-bridge.js';
import type { DesktopBridge } from '#filesystem/desktop-bridge.js';
import { getProjectFileSystemConfig } from '#filesystem/handle-store.js';
import { createUiRuntimeConfig } from '#runtime/ui-runtime.config.js';
import type { runtime } from '#runtime/ui-runtime.definition.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';
import type { ComputeReuseMode } from '#lib/compute-reuse-preference.js';

export const desktopProjectRoot = async (projectId: string): Promise<string> => {
  const config = await getProjectFileSystemConfig(projectId);
  if (config?.backend !== 'node') {
    throw new Error(`Project ${projectId} is not on disk, so no host path can root the desktop kernel.`);
  }
  return `${config.path ?? nodeHomeRoot()}/${config.providerBasePath}`;
};

/**
 * The machines facet the desktop transport carries beside the kernel port (D9).
 *
 * The port is brokered up front because the transport's `connect` is
 * synchronous; the channel itself is dialled on first use. A refused or failed
 * broker leaves the CAD kernel untouched: the client then negotiates
 * `machines: { available: false, reason: 'unsupported' }`, which is the truth.
 *
 * @param bridge - The desktop seam.
 * @param projectRoot - Host path the machines session is scoped to.
 * @returns The transport option, or `undefined` when the shell refused.
 */
const desktopMachinesOption = async (
  bridge: DesktopBridge,
  projectRoot: string,
): Promise<ElectronUtilityTransportOptions['machines']> => {
  try {
    const port = await bridge.machines.connect(projectRoot);
    const { connectMachineChannel } = await import('@taucad/runtime/machine');
    return { available: true, connect: () => connectMachineChannel(port) };
  } catch {
    return undefined;
  }
};

/**
 * Desktop kernel options: the runtime runs in an Electron utility process.
 *
 * Pure dependency injection — no handler changes. The utility owns the bytes
 * (`fileSystem: 'host-local'` on the transport descriptor), which is why the
 * returned factory ignores the renderer's `fileSystem` dep: the shell forks the
 * utility against `projectRoot` and it reads disk itself.
 *
 * `context` is the shell's own vocabulary, sanitized by the main-process broker
 * and handed to the app's fork resolver; the runtime assigns the keys no
 * meaning. `definition` names the desktop runtime definition to fork —
 * `default` carries the native kernel, so there is no debug entry to select
 * (the browser preset's debug/default split is about replicad stack traces in a
 * web worker, which the utility does not run).
 *
 * @param projectId - Project whose node root the utility is forked against.
 * @returns The lazy options factory for this project's desktop kernel.
 */
export const desktopKernelOptions =
  (projectId: string, nativeKernelId: string | undefined, computeMode: ComputeReuseMode): LazyKernelOptionsFactory =>
  async () => {
    const projectRoot = await desktopProjectRoot(projectId);
    const bridge = desktopBridge();
    if (nativeKernelId && !bridge?.runtimeKernelIds.includes(nativeKernelId)) {
      throw new Error(`${nativeKernelId} is not available in this desktop runtime.`);
    }
    const machines = bridge === undefined ? undefined : await desktopMachinesOption(bridge, projectRoot);
    // Dynamic so the electron renderer module never enters the web bundle's
    // eager graph, the way every other preset defers its heavy import.
    const { createElectronClientOptions } = await import('@taucad/runtime/electron/renderer');
    const provideClientOptions = createElectronClientOptions<typeof runtime>({
      config: createUiRuntimeConfig(ENV),
      context: { projectRoot, definition: 'default', computeMode },
      ...(machines === undefined ? {} : { machines }),
    });
    const clientOptions = await provideClientOptions();
    return () => clientOptions;
  };
