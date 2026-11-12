import { describe, expect, it } from 'vitest';
import { isDesktopFirstRun } from '#components/onboarding/desktop-first-run.js';

describe('isDesktopFirstRun', () => {
  it('is the first run when main says so and the workspace has no project', () => {
    expect(isDesktopFirstRun({ isFirstLaunch: true, isLoading: false, isListingFailed: false, projectCount: 0 })).toBe(
      true,
    );
  });

  it('waits for the project listing', () => {
    expect(isDesktopFirstRun({ isFirstLaunch: true, isLoading: true, isListingFailed: false, projectCount: 0 })).toBe(
      false,
    );
  });

  it('is not the first run when the project listing failed', () => {
    expect(isDesktopFirstRun({ isFirstLaunch: true, isLoading: false, isListingFailed: true, projectCount: 0 })).toBe(
      false,
    );
  });

  it('is not the first run when the workspace has a project, trashed ones included', () => {
    expect(isDesktopFirstRun({ isFirstLaunch: true, isLoading: false, isListingFailed: false, projectCount: 1 })).toBe(
      false,
    );
  });

  it('is not the first run when main found a window-state file or a launch link', () => {
    expect(isDesktopFirstRun({ isFirstLaunch: false, isLoading: false, isListingFailed: false, projectCount: 0 })).toBe(
      false,
    );
  });
});
