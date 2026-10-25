/**
 * Whether this page may offer the desktop Terminal (blueprint Terminal pane, I8, A13): one predicate behind the
 * launcher, the command palette, open requests, layout restoration and capability-loss cleanup.
 *
 * - `omitted`: a browser build or a shared/public view. No surface lists the Terminal, opening it does nothing and a
 *   saved layout's Terminal tab is dropped before anything can mount.
 * - `checking`: the project's folder is still being looked up. The pane may sit in a layout but cannot start.
 * - `unavailable`: a desktop editor whose prerequisites fail; the pane shows the reason and what to do about it.
 * - `available`: the pane may start a session on the person's action (D21).
 *
 * The host's shell probe stays the authority on whether a shell can run here: a refusal at start (Windows
 * `sandbox-unavailable` until its provider lands, a macOS `pty-unavailable`) arrives typed from the host and the pane
 * shows it. This predicate never claims a capability the host has not confirmed; it only rules the pane out early.
 */

import { useQuery } from '@tanstack/react-query';
import type { DesktopTerminalBridge } from '@taucad/types/desktop-terminal';
import { isDesktopTarget } from '#lib/build-target.js';
import { desktopWorkspaceRoot } from '#lib/agent-host-placement.js';

/** @public */
export type TerminalAvailability =
  | Readonly<{ status: 'omitted' }>
  | Readonly<{ status: 'checking' }>
  | Readonly<{ status: 'unavailable'; message: string; recovery: string }>
  | Readonly<{ status: 'available'; projectRoot: string; bridge: DesktopTerminalBridge }>;

/** Where the project lives, as far as the Terminal is concerned. @public */
export type TerminalProjectFolder =
  | Readonly<{ status: 'pending' }>
  | Readonly<{ status: 'on-disk'; root: string }>
  | Readonly<{ status: 'not-on-disk' }>;

/**
 * The predicate's first rule, which needs no project: only a desktop build's editor offers the Terminal. Launchers
 * and saved-layout pruning that run before a project's folder is known call this; {@link terminalAvailability}
 * starts from it.
 *
 * @param input - Whether this is the desktop build, and the workbench profile.
 * @returns Whether any surface may list the Terminal.
 * @public
 */
export const isTerminalSurfaceOffered = (
  input: Readonly<{ desktop: boolean; profile: 'editor' | 'shared' }>,
): boolean => input.desktop && input.profile === 'editor';

/**
 * The Terminal predicate.
 *
 * @param input - The build, the workbench profile, the preload's terminal bridge and the project's folder.
 * @returns The availability every surface acts on.
 * @public
 */
export const terminalAvailability = (
  input: Readonly<{
    desktop: boolean;
    profile: 'editor' | 'shared';
    bridge: DesktopTerminalBridge | undefined;
    folder: TerminalProjectFolder;
  }>,
): TerminalAvailability => {
  if (!isTerminalSurfaceOffered(input)) {
    return { status: 'omitted' };
  }
  if (input.bridge === undefined) {
    return {
      status: 'unavailable',
      message: 'This version of the Tau app has no Terminal.',
      recovery: 'Update Tau, then open the Terminal again.',
    };
  }
  switch (input.folder.status) {
    case 'pending': {
      return { status: 'checking' };
    }
    case 'not-on-disk': {
      return {
        status: 'unavailable',
        message: 'This project is stored in Tau, not in a folder on this computer, so the Terminal has nowhere to run.',
        recovery: 'Open a project from a folder on this computer to use the Terminal.',
      };
    }
    case 'on-disk': {
      return { status: 'available', projectRoot: input.folder.root, bridge: input.bridge };
    }
  }
};

/**
 * Whether a surface may list, open or keep the Terminal.
 *
 * @param availability - The predicate's answer.
 * @returns `false` only where the surface is omitted.
 * @public
 */
export const isTerminalOffered = (availability: TerminalAvailability): boolean => availability.status !== 'omitted';

/**
 * The preload's terminal bridge, on a desktop build whose shell has one.
 *
 * @returns The bridge, or `undefined` in the browser and on an older shell.
 * @public
 */
export const desktopTerminalBridge = (): DesktopTerminalBridge | undefined =>
  isDesktopTarget() ? (globalThis as { tau?: { terminal?: DesktopTerminalBridge } }).tau?.terminal : undefined;

/**
 * The Terminal predicate for one project on this page.
 *
 * @param projectId - The project; `undefined` outside a project.
 * @param profile - The workbench profile; shared and public views omit the Terminal.
 * @returns The availability.
 * @public
 */
export function useTerminalAvailability(
  projectId: string | undefined,
  profile: 'editor' | 'shared' = 'editor',
): TerminalAvailability {
  const desktop = isDesktopTarget();
  const bridge = desktopTerminalBridge();
  const enabled = desktop && profile === 'editor' && bridge !== undefined && projectId !== undefined;
  const { data, isError } = useQuery({
    queryKey: ['terminal-project-folder', projectId],
    enabled,
    queryFn: async () => desktopWorkspaceRoot(projectId!),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const folder: TerminalProjectFolder =
    projectId === undefined || isError
      ? { status: 'not-on-disk' }
      : data === undefined
        ? { status: 'pending' }
        : { status: 'on-disk', root: data };
  return terminalAvailability({ desktop, profile, bridge, folder });
}
