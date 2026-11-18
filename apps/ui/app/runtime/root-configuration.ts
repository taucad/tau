/**
 * The root configuration the file worker gets (desktop resilient startup blueprint D0, D1).
 *
 * Every caller that sends `configureProjectRoots` reads the configuration here, so safe mode narrows all of them the
 * same way: a page load in safe mode admits, lists and polls Home alone. Whether a page load is in safe mode is the root
 * file manager's own input (`safeMode` in its context), set from the runtime's option on the web (`?safe=1`) and from
 * the shell's `tau.safeMode` on the desktop.
 */
import { readProjectRootConfigs } from '@taucad/files-ui/filesystem/handle-store';
import type { ProjectRootConfigurationRead, WorkspaceRootSkip } from '@taucad/files-ui/filesystem/handle-store';
import type { ProjectRootConfiguration } from '@taucad/filesystem';
import { homeOnlyConfiguration } from '#lib/boot-signals.js';

/** How to read the configuration. @public */
export type RootConfigurationOptions = Readonly<{
  /** This page load is in safe mode: Home alone. */
  safeMode: boolean;
  /** Telemetry sink for workspaces left out of the topology (R13). */
  onRootSkipped?: (skip: WorkspaceRootSkip) => void;
}>;

/**
 * Read the configuration, degraded to Home alone when an input cannot be read, and narrowed to Home in safe mode.
 *
 * @param options - Safe mode and the skip sink.
 * @returns The configuration and the input that could not be read, if any.
 * @public
 */
export async function readRootConfiguration({
  safeMode,
  onRootSkipped,
}: RootConfigurationOptions): Promise<ProjectRootConfigurationRead> {
  const read = await readProjectRootConfigs(onRootSkipped);
  return safeMode ? { ...read, configuration: homeOnlyConfiguration(read.configuration) } : read;
}

/**
 * The configuration alone, for a caller that re-issues it after a change.
 *
 * @param safeMode - This page load is in safe mode.
 * @returns The configuration.
 * @public
 */
export async function readRootConfigurationOnly(safeMode: boolean): Promise<ProjectRootConfiguration> {
  const { configuration } = await readRootConfiguration({ safeMode });
  return configuration;
}

/**
 * Whether the desktop shell started this launch in safe mode (`tau.safeMode`, present only then).
 *
 * @returns Whether the shell is in safe mode.
 * @public
 */
export const isDesktopSafeMode = (): boolean =>
  (globalThis as { tau?: { safeMode?: unknown } }).tau?.safeMode !== undefined;
