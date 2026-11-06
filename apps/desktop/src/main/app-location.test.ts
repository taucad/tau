import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MoveToApplicationsHost } from '#main/app-location.js';
import {
  appBundlePath,
  assessAppLocation,
  locationBlocksUpdates,
  moveOfferDeclined,
  offerMoveToApplications,
} from '#main/app-location.js';

const executable = (bundle: string): string => `${bundle}/Contents/MacOS/Tau`;
const translocated = '/private/var/folders/xy/T/AppTranslocation/0C8E-41A2/d/Tau.app';

describe('assessAppLocation', () => {
  it('should find the bundle the executable belongs to', () => {
    expect(appBundlePath(executable('/Applications/Tau.app'))).toBe('/Applications/Tau.app');
    expect(appBundlePath('/usr/local/bin/electron')).toBeUndefined();
  });

  it('should block updates from a translocated copy or a read-only place, and not from a writable one', () => {
    const everywhere = (): boolean => true;
    expect(locationBlocksUpdates(assessAppLocation(executable('/Applications/Tau.app'), everywhere))).toBe(false);
    expect(assessAppLocation(executable(translocated), everywhere)).toMatchObject({ translocated: true });
    expect(locationBlocksUpdates(assessAppLocation(executable(translocated), everywhere))).toBe(true);
    /* A mounted disk image: nothing on the volume can be written. */
    const image = assessAppLocation(executable('/Volumes/Tau/Tau.app'), () => false);
    expect(image).toMatchObject({ translocated: false, writable: false });
    expect(locationBlocksUpdates(image)).toBe(true);
    expect(locationBlocksUpdates(undefined)).toBe(false);
  });
});

describe('offerMoveToApplications', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  const userData = (): string => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-app-location-'));
    directories.push(directory);
    return directory;
  };
  const host = (answers: number[], moved = true): MoveToApplicationsHost & { ask: ReturnType<typeof vi.fn> } => ({
    ask: vi.fn(() => answers.shift() ?? 1),
    move: vi.fn((options: Parameters<MoveToApplicationsHost['move']>[0]) => {
      options.conflictHandler('exists');
      return moved;
    }),
    log: vi.fn(),
  });
  const blocked = assessAppLocation(executable(translocated), () => true);

  it('should never ask when Tau can update where it is', () => {
    const questions = host([0]);
    const where = assessAppLocation(executable('/Applications/Tau.app'), () => true);
    expect(offerMoveToApplications(where, userData(), questions)).toBe(false);
    expect(questions.ask).not.toHaveBeenCalled();
    expect(questions.move).not.toHaveBeenCalled();
  });

  it('should move Tau and stop this launch when the person agrees, asking before it replaces a copy', () => {
    const questions = host([0, 0]);
    expect(offerMoveToApplications(blocked, userData(), questions)).toBe(true);
    expect(questions.ask.mock.calls[0]?.[0]).toMatchObject({
      message: 'Move Tau to your Applications folder?',
      buttons: ['Move to Applications', 'Not now'],
    });
    expect(questions.ask.mock.calls[1]?.[0]).toMatchObject({ buttons: ['Replace', 'Cancel'] });
    expect(questions.move).toHaveBeenCalledOnce();
  });

  it('should ask only once: Not now is remembered', () => {
    const directory = userData();
    const first = host([1]);
    expect(offerMoveToApplications(blocked, directory, first)).toBe(false);
    expect(first.move).not.toHaveBeenCalled();
    expect(moveOfferDeclined(directory)).toBe(true);
    expect(JSON.parse(readFileSync(join(directory, 'app-location.json'), 'utf8'))).toEqual({ moveDeclined: true });

    const second = host([0]);
    expect(offerMoveToApplications(blocked, directory, second)).toBe(false);
    expect(second.ask).not.toHaveBeenCalled();
  });

  it('should keep this launch going when the move fails', () => {
    const questions = host([0]);
    questions.move = vi.fn(() => {
      throw new Error('permission denied');
    });
    expect(offerMoveToApplications(blocked, userData(), questions)).toBe(false);
    expect(questions.log).toHaveBeenCalledWith('warn', 'app-location.move-failed', expect.anything());
  });
});
