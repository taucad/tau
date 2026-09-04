import { ENV } from '#environment.config.js';
import { debugKernelOptions } from '#constants/kernel-options.presets.js';
import { desktopBridge, isDesktopTarget, nodeHomeRoot } from '#filesystem/desktop-bridge.js';
import { getProjectFileSystemConfig } from '#filesystem/handle-store.js';
import { createUiRuntimeConfig } from '#runtime/ui-runtime.config.js';
import type { runtime } from '#runtime/ui-runtime.definition.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';

const desktopProjectRoot = async (projectId: string): Promise<string> => {
  const config = await getProjectFileSystemConfig(projectId);
  if (config?.backend !== 'node') {
    throw new Error(`Project ${projectId} is not on disk, so no host path can root the desktop kernel.`);
  }
  return `${config.path ?? nodeHomeRoot()}/${config.providerBasePath}`;
};

/** Revoke this project's native-code grant; the desktop terminates its native worker immediately. */
export const revokeDesktopNativeCodeTrust = async (projectId: string): Promise<void> => {
  const bridge = desktopBridge();
  if (!bridge) {
    return;
  }
  await bridge.nativeCode.revoke(await desktopProjectRoot(projectId));
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
  (projectId: string, nativeKernelId?: string): LazyKernelOptionsFactory =>
  async () => {
    const projectRoot = await desktopProjectRoot(projectId);
    if (nativeKernelId) {
      const bridge = desktopBridge();
      if (!bridge?.runtimeKernelIds.includes(nativeKernelId)) {
        throw new Error(`${nativeKernelId} is not available in this desktop runtime.`);
      }
      if (!(await bridge.nativeCode.isTrusted(projectRoot)) && !(await bridge.nativeCode.grant(projectRoot))) {
        throw new Error('Native-code trust was not granted for this project.');
      }
    }
    // Dynamic so the electron renderer module never enters the web bundle's
    // eager graph, the way every other preset defers its heavy import.
    const { createElectronClientOptions } = await import('@taucad/runtime/electron/renderer');
    const provideClientOptions = createElectronClientOptions<typeof runtime>({
      config: createUiRuntimeConfig(ENV),
      context: { projectRoot, definition: 'default' },
    });
    const clientOptions = await provideClientOptions();
    return () => clientOptions;
  };

/**
 * The preset backing a **local** kernel on this host.
 *
 * The one selection point between the browser's debug web worker and the
 * desktop utility process, gated on the `TAU_TARGET` build define so the web
 * bundle never reaches the Electron renderer module.
 *
 * @param projectId - Project the kernel renders.
 * @returns The host's local kernel options factory.
 */
export const localKernelOptions = (projectId: string, nativeKernelId?: string): LazyKernelOptionsFactory =>
  isDesktopTarget ? desktopKernelOptions(projectId, nativeKernelId) : debugKernelOptions;
