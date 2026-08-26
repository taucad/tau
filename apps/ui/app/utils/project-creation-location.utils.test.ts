import { describe, expect, it } from 'vitest';
import {
  parseProjectCreationLocation,
  projectCreationLocationAccessibleName,
  projectCreationLocationErrorCopy,
  projectCreationLocationsEqual,
  projectLocationDescriptor,
  projectLocationFullLabel,
} from '#utils/project-creation-location.utils.js';

describe('project creation location utilities', () => {
  it('parses Home and exact workspace locations but rejects malformed metadata', () => {
    expect(parseProjectCreationLocation({ kind: 'home' })).toEqual({ kind: 'home' });
    expect(parseProjectCreationLocation({ kind: 'workspace', workspaceId: 'wsp_alpha' })).toEqual({
      kind: 'workspace',
      workspaceId: 'wsp_alpha',
    });
    expect(parseProjectCreationLocation({ kind: 'workspace', workspaceId: 'project_alpha' })).toBeUndefined();
    expect(parseProjectCreationLocation({ kind: 'home', workspaceId: 'wsp_alpha' })).toEqual({ kind: 'home' });
    expect(parseProjectCreationLocation(undefined)).toBeUndefined();
  });

  it('compares location identity without using display names', () => {
    expect(projectCreationLocationsEqual({ kind: 'home' }, { kind: 'home' })).toBe(true);
    expect(
      projectCreationLocationsEqual(
        { kind: 'workspace', workspaceId: 'wsp_alpha' },
        { kind: 'workspace', workspaceId: 'wsp_alpha' },
      ),
    ).toBe(true);
    expect(
      projectCreationLocationsEqual(
        { kind: 'workspace', workspaceId: 'wsp_alpha' },
        { kind: 'workspace', workspaceId: 'wsp_beta' },
      ),
    ).toBe(false);
  });

  it('uses one product vocabulary for creation and existing-project details', () => {
    const home = projectLocationDescriptor({ kind: 'home' });
    const disk = projectLocationDescriptor({ kind: 'workspace', workspaceName: 'Workshop' });
    const temporary = projectLocationDescriptor({ kind: 'temporary' });

    expect(projectLocationFullLabel(home)).toBe('Home in this browser');
    expect(projectLocationFullLabel(disk)).toBe('Workshop on your disk');
    expect(projectLocationFullLabel(temporary)).toBe('Temporary cleared when this session ends');
    expect(projectCreationLocationAccessibleName(disk)).toBe('Create in Workshop');
  });

  it.each([
    ['missing', 'This project location is no longer connected.', 'Manage locations'],
    ['disconnected', 'This project location is no longer connected.', 'Manage locations'],
    ['permission', 'Access to this folder is required before creating the project.', 'Grant access'],
    ['unsupported', 'Home is the only project location available in this browser.', undefined],
  ] as const)('defines canonical %s recovery copy', (code, message, actionLabel) => {
    expect(projectCreationLocationErrorCopy(code)).toEqual({ message, ...(actionLabel ? { actionLabel } : {}) });
  });
});
