import { describe, expect, it } from 'vitest';
import type { DesktopTerminalBridge } from '@taucad/types/desktop-terminal';
import {
  isTerminalOffered,
  isTerminalSurfaceOffered,
  terminalAvailability,
} from '#components/terminal/terminal-availability.js';

const bridge: DesktopTerminalBridge = {
  open: () => {
    throw new Error('not opened in this test');
  },
};
const onDisk = { status: 'on-disk', root: '/home/me/Tau/project-1' } as const;

describe('terminalAvailability', () => {
  it('omits the Terminal from the browser build and from shared views (I8)', () => {
    expect(terminalAvailability({ desktop: false, profile: 'editor', bridge, folder: onDisk })).toEqual({
      status: 'omitted',
    });
    expect(terminalAvailability({ desktop: true, profile: 'shared', bridge, folder: onDisk })).toEqual({
      status: 'omitted',
    });
    expect(isTerminalSurfaceOffered({ desktop: false, profile: 'editor' })).toBe(false);
    expect(isTerminalSurfaceOffered({ desktop: true, profile: 'shared' })).toBe(false);
  });

  it('offers it on the desktop editor, available once the project has a folder on this computer', () => {
    expect(isTerminalSurfaceOffered({ desktop: true, profile: 'editor' })).toBe(true);
    expect(terminalAvailability({ desktop: true, profile: 'editor', bridge, folder: onDisk })).toEqual({
      status: 'available',
      projectRoot: '/home/me/Tau/project-1',
      bridge,
    });
    const checking = terminalAvailability({ desktop: true, profile: 'editor', bridge, folder: { status: 'pending' } });
    expect(checking).toEqual({ status: 'checking' });
    expect(isTerminalOffered(checking)).toBe(true);
  });

  it('gives an actionable reason on desktop when a prerequisite fails', () => {
    const browserStored = terminalAvailability({
      desktop: true,
      profile: 'editor',
      bridge,
      folder: { status: 'not-on-disk' },
    });
    expect(browserStored).toEqual({
      status: 'unavailable',
      message: 'This project is stored in Tau, not in a folder on this computer, so the Terminal has nowhere to run.',
      recovery: 'Open a project from a folder on this computer to use the Terminal.',
    });
    expect(isTerminalOffered(browserStored)).toBe(true);

    const olderShell = terminalAvailability({ desktop: true, profile: 'editor', bridge: undefined, folder: onDisk });
    expect(olderShell).toEqual({
      status: 'unavailable',
      message: 'This version of the Tau app has no Terminal.',
      recovery: 'Update Tau, then open the Terminal again.',
    });
  });
});
