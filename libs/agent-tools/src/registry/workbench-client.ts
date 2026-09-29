import type { RpcWorkbenchClient } from '@taucad/chat/rpc';
import { sourcePathMatchesExtensions } from '@taucad/utils/file';

/** Runtime capability surface needed to classify a workbench view entry. @public */
export type WorkbenchRuntime = {
  readonly capabilities:
    | { readonly registrations: ReadonlyArray<{ readonly kind: string; readonly extensions?: readonly string[] }> }
    | undefined;
  connect(): Promise<void>;
};

/** Classify model entry paths from the connected runtime without compiling geometry. @public */
export const createRuntimeWorkbenchClient = (runtimeFor?: () => Promise<WorkbenchRuntime>): RpcWorkbenchClient => ({
  async isModelFile(path) {
    if (runtimeFor === undefined) {
      return false;
    }
    const runtime = await runtimeFor();
    await runtime.connect();
    return (
      runtime.capabilities?.registrations.some(
        (registration) =>
          registration.kind === 'kernel' &&
          registration.extensions !== undefined &&
          sourcePathMatchesExtensions(path, registration.extensions),
      ) ?? false
    );
  },
});
