import { describe, expect, it } from 'vitest';
import { announcementOf } from '#lib/project-open-copy.js';

describe('announcementOf', () => {
  it('should not add a second stop after a title that ends in an ellipsis', () => {
    expect(announcementOf(['Downloading files…', 'Bringing this project to this device.'])).toBe(
      'Downloading files… Bringing this project to this device.',
    );
  });

  it('should end a title with no stop of its own before the helper', () => {
    expect(announcementOf(["You're offline", 'Go online, then try again.'])).toBe(
      "You're offline. Go online, then try again.",
    );
  });
});
