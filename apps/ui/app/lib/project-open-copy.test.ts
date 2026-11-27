import { describe, expect, it } from 'vitest';
import { announcementOf, projectFilesCopy, projectOpenCopy, projectSessionFailedCopy } from '#lib/project-open-copy.js';

describe('projectOpenCopy', () => {
  it('should say one label for the whole open, and the slow words only for a stalled one', () => {
    expect(projectOpenCopy).toEqual({
      label: 'Opening project',
      slowLabel: 'Still opening project',
      slowHelper: 'Check your connection, then try again.',
    });
  });
});

describe('projectFilesCopy', () => {
  it('should say the one label, and no sentence, at every running step', () => {
    for (const step of ['connecting', 'downloading', 'preparing'] as const) {
      expect(projectFilesCopy(step, undefined), step).toEqual(['Opening project…', '']);
    }
  });

  it('should name the device only in the offline message', () => {
    expect(projectFilesCopy('offline', undefined)[1]).toContain('this device');
    for (const state of ['connecting', 'downloading', 'preparing', 'failed', 'account'] as const) {
      expect(projectFilesCopy(state, undefined).join(' '), state).not.toContain('device');
    }
  });
});

describe('projectSessionFailedCopy', () => {
  it('should say a session that did not come up failed to open, naming no download or transport', () => {
    expect(projectSessionFailedCopy[0]).toBe(projectFilesCopy('failed', undefined)[0]);
    expect(projectSessionFailedCopy.join(' ')).not.toMatch(/download|device|network|connection|sync/iu);
    expect(announcementOf(projectSessionFailedCopy)).toBe('Couldn’t open this project. Try again.');
  });
});

describe('announcementOf', () => {
  it('should say a running open by its label alone', () => {
    expect(announcementOf(projectFilesCopy('downloading', undefined))).toBe('Opening project…');
  });

  it('should end a title with no stop of its own before the helper', () => {
    expect(announcementOf(["You're offline", 'Go online, then try again.'])).toBe(
      "You're offline. Go online, then try again.",
    );
  });
});
