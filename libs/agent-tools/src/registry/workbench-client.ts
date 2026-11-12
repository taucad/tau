import type { RpcWorkbenchClient } from '@taucad/chat/rpc';
import { sourcePathMatchesExtensions } from '@taucad/utils/file';

/** Runtime capability surface needed to classify a workbench view entry. @public */
export type WorkbenchRuntime = {
  readonly capabilities:
    | { readonly registrations: ReadonlyArray<{ readonly kind: string; readonly extensions?: readonly string[] }> }
    | undefined;
  connect(): Promise<void>;
};

/** What a host with a person adds to the workbench client. @public */
export type WorkbenchClientOptions = Readonly<{
  /** The device's record of the leaves a written view sets (BD7); absent on a host with no person. */
  markViewFieldsSet?: RpcWorkbenchClient['markViewFieldsSet'];
}>;

/**
 * Classify model entry paths from the connected runtime without compiling geometry.
 *
 * @param runtimeFor - The connected runtime, if any.
 * @param options - `markViewFieldsSet` on a host with a person.
 * @returns The workbench client.
 * @public
 */
export const createRuntimeWorkbenchClient = (
  runtimeFor?: () => Promise<WorkbenchRuntime>,
  options: WorkbenchClientOptions = {},
): RpcWorkbenchClient => ({
  ...(options.markViewFieldsSet === undefined ? {} : { markViewFieldsSet: options.markViewFieldsSet }),
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
